'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { SearchHit, SearchKind } from '@/server/admin/search';

/**
 * Command palette (master spec §43).
 *
 * At agency scale the sidebar stops being navigation and starts being a list
 * of places a business might be: finding one dish means remembering which of
 * fifty profiles owns it, then four clicks. The palette collapses that to
 * typing the dish's name.
 *
 * Two things are deliberate.
 *
 * It is a native `<dialog>`. Modal focus trapping, Escape, inertness of the
 * page behind and the top layer are all behaviour a hand-rolled overlay gets
 * subtly wrong — and gets wrong specifically for keyboard and screen-reader
 * users, who are the ones a command palette is *for*.
 *
 * It is additive. Everything reachable from it is reachable without it: the
 * palette needs JavaScript, and no workflow may depend on it. `/admin/search`
 * remains the no-JavaScript path to the same results.
 */

interface Command {
  id: string;
  label: string;
  hint: string;
  href: string;
  keywords: string;
}

/**
 * Destination commands, available with an empty query.
 *
 * Actions that need a business (publish, generate a QR, open the studio) are
 * deliberately absent: without a business chosen they would have to guess one,
 * and a palette that guesses is worse than a palette that navigates. Pick the
 * business first — the entity results below do that in one keystroke.
 */
const COMMANDS: readonly Command[] = [
  { id: 'businesses', label: 'Open businesses', hint: 'All profiles', href: '/admin/businesses', keywords: 'business profile list clients' },
  { id: 'create', label: 'Create a business', hint: 'Guided setup', href: '/admin/create', keywords: 'new add create onboard business' },
  { id: 'dashboard', label: 'Open the dashboard', hint: 'Needs attention', href: '/admin', keywords: 'home dashboard attention overview' },
  { id: 'search', label: 'Open full search', hint: 'Works without JavaScript', href: '/admin/search', keywords: 'search find everything' },
  { id: 'staff', label: 'Open staff', hint: 'Accounts and roles', href: '/admin/staff', keywords: 'staff users roles permissions team' },
  { id: 'keys', label: 'Open API keys', hint: 'Integrations', href: '/admin/api-keys', keywords: 'api keys tokens integration' },
  { id: 'account', label: 'Open my account', hint: 'Password and profile', href: '/admin/account', keywords: 'account me password profile' },
];

const KIND_LABEL: Record<SearchKind, string> = {
  business: 'Business',
  branch: 'Branch',
  menu: 'Menu',
  category: 'Category',
  item: 'Item',
  offer: 'Offer',
  file: 'File',
};

interface Row {
  key: string;
  label: string;
  hint: string;
  badge: string;
  href: string;
}

export function CommandPalette() {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);

  const close = useCallback(() => {
    dialogRef.current?.close();
    setOpen(false);
  }, []);

  const openPalette = useCallback(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (!dialog.open) dialog.showModal();
    inputRef.current?.focus();
    setOpen(true);
  }, []);

  /**
   * Toggles against the dialog element, not against React state.
   *
   * `dialog.open` is updated synchronously by `showModal()` and `close()`.
   * `open` is not: Escape closes the dialog immediately and the `close`
   * listener below sets state on React's schedule. A Cmd+K arriving inside
   * that window read `open` as still true and toggled it back to false, so
   * dismissing the palette and reaching straight for the shortcut again left
   * it shut.
   */
  const toggle = useCallback(() => {
    if (dialogRef.current?.open) close();
    else openPalette();
  }, [close, openPalette]);

  // --- opening ------------------------------------------------------------
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // Cmd on macOS, Ctrl elsewhere. `event.key` is 'k' regardless of layout
      // shifting, and the check is case-insensitive so Caps Lock still opens it.
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        toggle();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [toggle]);

  // Nothing opens or closes the dialog from an effect on `open`.
  //
  // That effect used to, and it could act on an intention that was already
  // stale: Escape fires `close`, which queues `setOpen(false)`; a Cmd+K in the
  // same tick opens the dialog and queues `setOpen(true)`. Whichever order
  // React settled those in, an effect seeing `open: false` next to an open
  // dialog would shut it again — the palette snapping closed on its own.
  //
  // So the two imperative paths above own the element, and `open` is only a
  // mirror: it drives rendering and the search effect, and the listener below
  // keeps it true to whatever the dialog actually did.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const onClose = () => setOpen(false);
    dialog.addEventListener('close', onClose);
    return () => dialog.removeEventListener('close', onClose);
  }, []);

  // --- searching ----------------------------------------------------------
  useEffect(() => {
    if (!open) return;

    const trimmed = query.trim();

    // Below the threshold there is nothing to fetch. Stale hits are not
    // cleared here — they are filtered out below, where the same condition can
    // be *derived* rather than written back into state from an effect.
    if (trimmed.length < 2) return;

    // Debounced, and the in-flight request is abandoned when the query moves
    // on: without that, a slow response for "bu" can land after "burger" and
    // replace the right answer with a stale one.
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);

      try {
        const response = await fetch(`/api/admin/palette?q=${encodeURIComponent(trimmed)}`, {
          signal: controller.signal,
        });

        if (!response.ok) throw new Error(String(response.status));

        const body = (await response.json()) as { hits: SearchHit[] };
        setHits(body.hits);
      } catch (error) {
        if ((error as Error).name !== 'AbortError') setHits([]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 140);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query, open]);

  const searchable = query.trim().length >= 2;

  const busy = loading && searchable;

  const rows: Row[] = useMemo(() => {
    const needle = query.trim().toLowerCase();

    const commands = COMMANDS.filter(
      (command) =>
        needle.length === 0 ||
        command.label.toLowerCase().includes(needle) ||
        command.keywords.includes(needle),
    ).map((command) => ({
      key: `command:${command.id}`,
      label: command.label,
      hint: command.hint,
      badge: 'Go',
      href: command.href,
    }));

    // Derived, not stored: a `hits` array emptied by an effect is one render
    // behind the query that emptied it, and for that frame the palette shows
    // the previous search's results under the new text.
    const entities = (searchable ? hits : []).map((hit, index) => ({
      key: `hit:${hit.kind}:${hit.href}:${index}`,
      label: hit.title,
      hint: hit.businessName ? `${hit.businessName} · ${hit.subtitle}` : hit.subtitle,
      badge: KIND_LABEL[hit.kind],
      href: hit.href,
    }));

    return [...commands, ...entities];
  }, [query, hits, searchable]);

  // A shrinking list must not leave the highlight past its end. Clamped at the
  // point of use rather than corrected by an effect: the effect would render
  // once with an out-of-range index before fixing it, and that render is the
  // one where `aria-activedescendant` points at an element that is not there.
  const activeIndex = rows.length === 0 ? 0 : Math.min(active, rows.length - 1);

  const go = useCallback(
    (href: string) => {
      close();
      setQuery('');
      router.push(href);
    },
    [close, router],
  );

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (rows.length === 0) return;

      const delta = event.key === 'ArrowDown' ? 1 : -1;
      // Wraps: at the bottom of a short list, the next press should reach the
      // top rather than do nothing.
      setActive((current) => {
        const from = Math.min(current, rows.length - 1);
        return (from + delta + rows.length) % rows.length;
      });
      return;
    }

    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      setActive(event.key === 'Home' ? 0 : Math.max(0, rows.length - 1));
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      const row = rows[activeIndex];
      if (row) go(row.href);
    }
  };

  // Keep the highlighted row in view when arrowing past the fold.
  useEffect(() => {
    listRef.current
      ?.querySelector('[data-active="true"]')
      ?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const listId = 'command-palette-results';
  const activeId = rows[activeIndex] ? `palette-row-${activeIndex}` : undefined;

  return (
    <>
      <button
        type="button"
        className="admin__palette-trigger"
        onClick={openPalette}
        aria-haspopup="dialog"
      >
        <span>Search or jump to…</span>
        {/* Rendered, not detected: guessing the platform from the user agent is
            wrong often enough to be worse than one label that means both. */}
        <kbd className="admin__kbd">Ctrl/⌘ K</kbd>
      </button>

      <dialog
        ref={dialogRef}
        className="admin__palette"
        aria-label="Command palette"
        onCancel={() => setOpen(false)}
        onClick={(event) => {
          // Clicking the backdrop closes. The backdrop is the dialog itself:
          // any click landing on the element rather than its panel is outside.
          if (event.target === dialogRef.current) close();
        }}
      >
        <div className="admin__palette-panel">
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            className="admin__palette-input"
            placeholder="Search businesses, menus, items…"
            aria-label="Search businesses, menus, items"
            aria-expanded
            aria-controls={listId}
            aria-activedescendant={activeId}
            autoComplete="off"
            spellCheck={false}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
          />

          <ul ref={listRef} id={listId} role="listbox" className="admin__palette-list">
            {rows.map((row, index) => (
              <li key={row.key}>
                <button
                  type="button"
                  id={`palette-row-${index}`}
                  role="option"
                  aria-selected={index === activeIndex}
                  data-active={index === activeIndex}
                  className="admin__palette-row"
                  // Pointer focus follows the pointer, so clicking never
                  // activates a different row than the one under the cursor.
                  onMouseMove={() => setActive(index)}
                  onClick={() => go(row.href)}
                >
                  <span className="admin__palette-badge">{row.badge}</span>
                  <span className="admin__palette-label">{row.label}</span>
                  <span className="admin__palette-hint">{row.hint}</span>
                </button>
              </li>
            ))}
          </ul>

          {/* One live region for every state, so a screen reader hears the
              result count change rather than nothing. */}
          <p className="admin__palette-status" role="status" aria-live="polite">
            {busy
              ? 'Searching…'
              : query.trim().length === 0
                ? `${rows.length} commands. Type to search.`
                : query.trim().length < 2
                  ? 'Keep typing — two characters minimum.'
                  : `${rows.length} result${rows.length === 1 ? '' : 's'}.`}
          </p>
        </div>
      </dialog>
    </>
  );
}
