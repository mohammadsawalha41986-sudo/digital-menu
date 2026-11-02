'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { saveDishAction, type SaveDishResult } from '@/server/admin/manage-actions';
import type { ItemPatch, ItemView } from '@/server/menu-manage/service';

/**
 * Saves a restaurant's dish edits as the owner makes them.
 *
 * - Text fields wait a moment after the last keystroke, so a word is one save,
 *   not one save per letter. Choices (availability, section) save at once.
 * - One request per dish at a time. An edit made while a save is in flight is
 *   sent right after it, never alongside it.
 * - A failed save keeps the edit on screen and offers a retry; an edit is not
 *   dropped because the network dropped. Offline, it waits for the connection.
 * - Each save carries the version the screen was showing. If someone else
 *   changed the dish first, nothing is written: the screen is told what is
 *   there now, and the owner chooses to take it or to keep their own edit.
 */

export type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error' | 'conflict';

interface Entry {
  patch: ItemPatch;
  expected: string | null;
  status: SaveStatus;
  error: string | null;
  current: ItemView | null;
  timer: ReturnType<typeof setTimeout> | null;
  inFlight: boolean;
  rerun: boolean;
}

export interface DishSaves {
  seed: (itemId: string, updatedAt: string) => void;
  queue: (itemId: string, patch: ItemPatch, delayMs?: number) => void;
  retry: (itemId: string) => void;
  takeTheirs: (itemId: string) => ItemView | null;
  keepMine: (itemId: string) => void;
  statusOf: (itemId: string) => SaveStatus;
  errorOf: (itemId: string) => string | null;
  currentOf: (itemId: string) => ItemView | null;
  hasUnsaved: () => boolean;
}

export function useDishSaves(businessId: string, onSaved: (item: ItemView) => void): DishSaves {
  const entries = useRef(new Map<string, Entry>());
  const [, setVersion] = useState(0);
  const onSavedRef = useRef(onSaved);

  useEffect(() => {
    onSavedRef.current = onSaved;
  }, [onSaved]);

  return useMemo(() => {
    const bump = () => setVersion((value) => value + 1);

    const entry = (itemId: string): Entry => {
      let found = entries.current.get(itemId);
      if (!found) {
        found = { patch: {}, expected: null, status: 'idle', error: null, current: null, timer: null, inFlight: false, rerun: false };
        entries.current.set(itemId, found);
      }
      return found;
    };

    const flush = async (itemId: string): Promise<void> => {
      const e = entry(itemId);
      if (e.timer) {
        clearTimeout(e.timer);
        e.timer = null;
      }
      if (e.inFlight) {
        e.rerun = true;
        return;
      }
      if (Object.keys(e.patch).length === 0) {
        if (e.status === 'pending') e.status = 'saved';
        bump();
        return;
      }
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        e.status = 'error';
        e.error = 'You are offline. The change is kept here and will be saved when the connection returns.';
        bump();
        return;
      }

      const sending = e.patch;
      e.patch = {};
      e.inFlight = true;
      e.status = 'saving';
      e.error = null;
      bump();

      let result: SaveDishResult;
      try {
        result = await saveDishAction(businessId, itemId, sending, e.expected);
      } catch {
        result = { ok: false, error: 'Could not reach the server. Your change is kept on this screen.' };
      }
      e.inFlight = false;

      if ('ok' in result && result.ok) {
        e.expected = result.item.updatedAt;
        e.current = null;
        e.status = Object.keys(e.patch).length > 0 ? 'pending' : 'saved';
        onSavedRef.current(result.item);
      } else if ('conflict' in result) {
        e.patch = { ...sending, ...e.patch };
        e.status = 'conflict';
        e.current = result.current;
        e.error = null;
      } else {
        e.patch = { ...sending, ...e.patch };
        e.status = 'error';
        e.error = result.error;
      }
      bump();

      if (e.rerun) {
        e.rerun = false;
        if (e.status === 'pending') await flush(itemId);
      }
    };

    return {
      seed(itemId, updatedAt) {
        const e = entry(itemId);
        if (e.expected === null) e.expected = updatedAt;
      },

      queue(itemId, patch, delayMs = 0) {
        const e = entry(itemId);
        e.patch = { ...e.patch, ...patch };
        e.status = 'pending';
        e.error = null;
        if (e.timer) clearTimeout(e.timer);
        e.timer = null;
        if (delayMs > 0) {
          e.timer = setTimeout(() => void flush(itemId), delayMs);
          bump();
        } else {
          void flush(itemId);
        }
      },

      retry(itemId) {
        // A conflict is settled by the owner (take theirs or keep mine). A retry would send the same stale
        // version again; the conflict box would then vanish under the owner's click, which is lost.
        if (entry(itemId).status === 'conflict') return;
        void flush(itemId);
      },

      takeTheirs(itemId) {
        const e = entry(itemId);
        const current = e.current;
        if (!current) return null;
        e.patch = {};
        e.expected = current.updatedAt;
        e.current = null;
        e.status = 'saved';
        e.error = null;
        bump();
        return current;
      },

      keepMine(itemId) {
        const e = entry(itemId);
        if (!e.current) return;
        e.expected = e.current.updatedAt;
        e.current = null;
        e.status = 'pending';
        void flush(itemId);
      },

      statusOf: (itemId) => entries.current.get(itemId)?.status ?? 'idle',
      errorOf: (itemId) => entries.current.get(itemId)?.error ?? null,
      currentOf: (itemId) => entries.current.get(itemId)?.current ?? null,

      hasUnsaved() {
        for (const e of entries.current.values()) {
          if (e.inFlight || e.status === 'pending' || e.status === 'saving' || e.status === 'error' || e.status === 'conflict') {
            return true;
          }
        }
        return false;
      },
    };
    // The entries live in a ref; only the business changes what a save means.
  }, [businessId]);
}
