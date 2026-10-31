'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ActionState } from '@/server/admin/actions';
import { matchPhoto } from '@/lib/photo-match';

/**
 * All the dish photos at once.
 *
 * The owner selects a folder's worth of photos; each one is matched to its
 * dish by file name (the dish code, or the dish name in Arabic or English)
 * and shown for a check before anything is saved. Each photo is made smaller
 * and turned into WebP in the browser first, so a phone on mobile data sends
 * a few hundred kilobytes instead of a 5MB camera file; the server converts
 * and resizes it again either way.
 */

export interface BulkDish {
  code: string;
  nameAr: string;
  nameEn: string | null;
  hasPhoto: boolean;
}

type Status = 'ready' | 'sending' | 'done' | 'failed';

interface Row {
  id: string;
  file: File;
  preview: string;
  code: string;
  status: Status;
  error?: string;
}

const MAX_SIDE = 2000;
const PARALLEL = 2;

/** A smaller WebP (JPEG where the browser cannot write WebP), or the original if it cannot be read. */
async function shrink(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const encode = (type: string) =>
      new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.85));
    let blob = await encode('image/webp');
    // A browser that cannot write WebP hands back PNG, which is larger.
    if (!blob || blob.type !== 'image/webp') blob = await encode('image/jpeg');
    if (!blob || blob.size >= file.size) return file;
    const extension = blob.type === 'image/webp' ? 'webp' : 'jpg';
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + `.${extension}`, { type: blob.type });
  } catch {
    return file;
  }
}

export function BulkPhotos({
  dishes,
  action,
}: {
  dishes: BulkDish[];
  action: (previous: ActionState, formData: FormData) => Promise<ActionState>;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [running, setRunning] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const targets = dishes.map((dish) => ({
    code: dish.code,
    names: [dish.nameAr, dish.nameEn ?? ''].filter(Boolean),
  }));

  // Object URLs hold the file in memory until released: when a new set is
  // chosen, cleared, or the page is left.
  const previews = useRef<string[]>([]);
  const release = () => {
    previews.current.forEach((url) => URL.revokeObjectURL(url));
    previews.current = [];
  };
  useEffect(() => release, []);

  const choose = (files: FileList | null) => {
    if (!files) return;
    release();
    const taken = new Set<string>();
    const next = Array.from(files)
      .filter((file) => file.type.startsWith('image/') || /\.(jpe?g|png|webp|heic)$/i.test(file.name))
      .map((file, index) => {
        let code = matchPhoto(file.name, targets) ?? '';
        // Two photos for one dish: the first keeps it, the second is left to pick.
        if (code && taken.has(code)) code = '';
        if (code) taken.add(code);
        return {
          id: `${index}-${file.name}-${file.size}`,
          file,
          preview: track(URL.createObjectURL(file)),
          code,
          status: 'ready' as Status,
        };
      });
    setRows(next);
  };

  function track(url: string) {
    previews.current.push(url);
    return url;
  }

  const setRow = (id: string, patch: Partial<Row>) =>
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));

  const send = async () => {
    setRunning(true);
    const queue = rows.filter((row) => row.status !== 'done');
    const worker = async () => {
      for (let row = queue.shift(); row; row = queue.shift()) {
        setRow(row.id, { status: 'sending', error: undefined });
        try {
          const small = await shrink(row.file);
          const data = new FormData();
          data.set('file', small);
          if (row.code) data.set('itemCode', row.code);
          const dish = dishes.find((entry) => entry.code === row.code);
          if (dish) data.set('altAr', dish.nameAr);
          const result = await action({}, data);
          setRow(row.id, result.error ? { status: 'failed', error: result.error } : { status: 'done' });
        } catch {
          setRow(row.id, { status: 'failed', error: 'لم يُرفع — تحقق من الاتصال وحاول مرة أخرى' });
        }
      }
    };
    await Promise.all(Array.from({ length: PARALLEL }, worker));
    setRunning(false);
    router.refresh();
  };

  const matched = rows.filter((row) => row.code).length;
  const done = rows.filter((row) => row.status === 'done').length;
  const failed = rows.filter((row) => row.status === 'failed').length;

  return (
    <section className="build__card bulk-photos" data-bulk-photos>
      <h2 className="build__step-title">رفع كل الصور مرة واحدة · All photos at once</h2>
      <p className="admin__hint">
        اختر كل صور الأطباق معاً. سمِّ كل صورة باسم الطبق (مثل «كرواسون زبدة.jpg») أو برقمه (مثل
        BK-010.jpg) وسنضعها على طبقها تلقائياً. تُصغَّر الصور وتتحول إلى WebP قبل الرفع.
      </p>

      <input
        ref={input}
        type="file"
        multiple
        accept="image/*"
        className="admin__input"
        aria-label="اختر الصور · Choose photos"
        onChange={(event) => choose(event.target.files)}
        disabled={running}
      />

      {rows.length > 0 ? (
        <>
          <p className="admin__hint" role="status" data-bulk-summary>
            {rows.length} صورة · {matched} عُرف طبقها
            {rows.length - matched > 0 ? ` · ${rows.length - matched} اختر طبقها أو تُحفظ في المكتبة` : ''}
            {done > 0 ? ` · رُفع ${done}` : ''}
            {failed > 0 ? ` · فشل ${failed}` : ''}
          </p>

          <ul className="bulk-photos__list">
            {rows.map((row) => (
              <li key={row.id} className="bulk-photos__row" data-bulk-row={row.file.name} data-status={row.status}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={row.preview} alt="" className="bulk-photos__thumb" />
                <div className="bulk-photos__meta">
                  <span className="bulk-photos__name" dir="auto">
                    {row.file.name}
                  </span>
                  <span className="admin__hint">{Math.max(1, Math.round(row.file.size / 1024))} KB</span>
                </div>
                <select
                  className="admin__select"
                  value={row.code}
                  disabled={running || row.status === 'done'}
                  onChange={(event) => setRow(row.id, { code: event.target.value })}
                  aria-label={`${row.file.name} — الطبق`}
                >
                  <option value="">— المكتبة فقط · library only —</option>
                  {dishes.map((dish) => (
                    <option key={dish.code} value={dish.code}>
                      {dish.nameAr}
                      {dish.hasPhoto ? ' (له صورة — ستُستبدل)' : ''}
                    </option>
                  ))}
                </select>
                <span className="bulk-photos__status" aria-live="polite">
                  {row.status === 'done'
                    ? '✓ تم'
                    : row.status === 'sending'
                      ? 'جارٍ الرفع…'
                      : row.status === 'failed'
                        ? `✕ ${row.error ?? 'فشل'}`
                        : ''}
                </span>
              </li>
            ))}
          </ul>

          <div className="bulk-photos__actions">
            <button type="button" className="admin__button" onClick={send} disabled={running || done === rows.length}>
              {running
                ? `جارٍ الرفع ${done + failed} / ${rows.length}…`
                : failed > 0
                  ? `أعد محاولة ${failed}`
                  : `ارفع ${rows.length - done} صورة · Upload`}
            </button>
            <button
              type="button"
              className="admin__button admin__button--secondary"
              disabled={running}
              onClick={() => {
                release();
                setRows([]);
                if (input.current) input.current.value = '';
              }}
            >
              مسح القائمة · Clear
            </button>
          </div>
        </>
      ) : null}
    </section>
  );
}
