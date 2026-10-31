'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ActionState } from '@/server/admin/actions';
import { ACCEPTED_IMAGES, MAX_UPLOAD_BYTES, shrink } from '@/lib/shrink-image';

/**
 * The dish's photo, inside the dish editor: upload or drop a new one, pick
 * one already in the restaurant's library, replace, remove, preview it in
 * every frame shape, and set where it is cropped. Nothing here alters the
 * stored photo — the position is a point the frames crop around.
 */

export interface LibraryPhoto {
  id: string;
  /** Small copy for the grid. */
  thumb: string;
  url: string;
  name: string;
  /** Dishes using it, by Arabic name. */
  usedBy: string[];
}

export interface CurrentPhoto {
  id: string;
  url: string;
  focalX: number | null;
  focalY: number | null;
}

type Action = (previous: ActionState, formData: FormData) => Promise<ActionState>;

const SHAPES = [
  { label: 'أفقي · 4:3', ratio: '4 / 3' },
  { label: 'مربع · 1:1', ratio: '1 / 1' },
  { label: 'طولي · 4:5', ratio: '4 / 5' },
  { label: 'واجهة · 16:9', ratio: '16 / 9' },
];

export function DishImagePicker({
  itemCode,
  dishName,
  current,
  library,
  actions,
}: {
  /** Null for a dish not saved yet. */
  itemCode: string | null;
  dishName: string;
  current: CurrentPhoto | null;
  library: LibraryPhoto[];
  actions: { upload: Action; assign: Action; focal: Action };
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [browsing, setBrowsing] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [positioning, setPositioning] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'unused' | 'used'>('all');
  // The point being set, for the photo it was set on; a different photo
  // (just uploaded or picked) starts from its own saved point.
  const [draft, setDraft] = useState<{ photo: string; x: number; y: number } | null>(null);
  const focal =
    draft && draft.photo === current?.id ? draft : { x: current?.focalX ?? 0.5, y: current?.focalY ?? 0.5 };
  const setFocal = (point: { x: number; y: number }) => setDraft({ photo: current?.id ?? '', ...point });

  const position = `${Math.round(focal.x * 100)}% ${Math.round(focal.y * 100)}%`;
  const shown = useMemo(() => {
    const words = query.trim().toLowerCase();
    return library.filter((photo) => {
      if (filter === 'unused' && photo.usedBy.length > 0) return false;
      if (filter === 'used' && photo.usedBy.length === 0) return false;
      if (!words) return true;
      return [photo.name, ...photo.usedBy].some((text) => text.toLowerCase().includes(words));
    });
  }, [library, query, filter]);

  const run = async (label: string, work: () => Promise<ActionState>, success: string) => {
    setBusy(label);
    setMessage(null);
    try {
      const result = await work();
      if (result.error) setMessage({ kind: 'error', text: result.error });
      else {
        setMessage({ kind: 'ok', text: success });
        router.refresh();
      }
    } catch {
      setMessage({ kind: 'error', text: 'لم يكتمل — تحقق من الاتصال وحاول مرة أخرى · Not saved, try again' });
    } finally {
      setBusy(null);
    }
  };

  const upload = async (file: File | undefined) => {
    if (!file || !itemCode) return;
    if (!/^image\//.test(file.type) && !/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name)) {
      setMessage({ kind: 'error', text: 'هذا ليس ملف صورة · Choose a JPG, PNG or WebP photo' });
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setMessage({ kind: 'error', text: 'الصورة أكبر من 24MB · The photo is larger than 24MB' });
      return;
    }
    await run('upload', async () => {
      setBusy('shrink');
      const small = await shrink(file);
      setBusy('upload');
      const data = new FormData();
      data.set('file', small);
      data.set('itemCode', itemCode);
      data.set('altAr', dishName);
      return actions.upload({}, data);
    }, 'تم رفع الصورة وتعيينها للطبق · Photo uploaded');
    if (input.current) input.current.value = '';
  };

  const assign = (mediaId: string | null) =>
    run(
      mediaId ? 'assign' : 'remove',
      () => {
        const data = new FormData();
        data.set('mediaId', mediaId ?? '');
        data.set('targetType', 'item');
        data.set('targetKey', itemCode ?? '');
        return actions.assign({}, data);
      },
      mediaId ? 'تم اختيار الصورة · Photo set' : 'أُزيلت الصورة من الطبق · Photo removed (still in the library)',
    ).then(() => setBrowsing(false));

  const saveFocal = () =>
    run(
      'focal',
      () => {
        const data = new FormData();
        data.set('mediaId', current?.id ?? '');
        data.set('focalX', String(focal.x));
        data.set('focalY', String(focal.y));
        return actions.focal({}, data);
      },
      'حُفظ موضع الصورة · Position saved',
    ).then(() => setPositioning(false));

  if (!itemCode) {
    return (
      <section className="dish-photo" aria-label="Dish image" data-dish-photo="">
        <h3 className="dish-photo__title">صورة الطبق · Dish image</h3>
        <p className="admin__hint">احفظ الطبق أولاً، ثم أضف صورته هنا. · Save the dish first, then add its photo here.</p>
      </section>
    );
  }

  return (
    <section className="dish-photo" aria-label="Dish image" data-dish-photo={itemCode}>
      <h3 className="dish-photo__title">صورة الطبق · Dish image</h3>

      <div
        className={`dish-photo__frame${dragging ? ' dish-photo__frame--drop' : ''}`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          void upload(event.dataTransfer.files[0]);
        }}
        onClick={(event) => {
          if (!positioning) return;
          const box = event.currentTarget.getBoundingClientRect();
          setFocal({
            x: Math.min(1, Math.max(0, (event.clientX - box.left) / box.width)),
            y: Math.min(1, Math.max(0, (event.clientY - box.top) / box.height)),
          });
        }}
      >
        {current ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={current.url} alt={dishName} style={{ objectPosition: position }} data-dish-photo-current="" />
            {positioning ? (
              <span className="dish-photo__dot" style={{ left: `${focal.x * 100}%`, top: `${focal.y * 100}%` }} />
            ) : null}
          </>
        ) : (
          <button type="button" className="dish-photo__empty" onClick={() => input.current?.click()}>
            اسحب صورة هنا أو اضغط للرفع
            <br />
            Drop a photo here or click to upload
          </button>
        )}
        {busy ? (
          <span className="dish-photo__busy" role="status">
            {busy === 'shrink' ? 'تجهيز الصورة…' : busy === 'upload' ? 'جارٍ الرفع…' : 'جارٍ الحفظ…'}
            <progress />
          </span>
        ) : null}
      </div>

      <input
        ref={input}
        type="file"
        accept={ACCEPTED_IMAGES}
        className="admin__visually-hidden"
        aria-label="رفع صورة · Upload photo"
        onChange={(event) => void upload(event.target.files?.[0])}
      />

      <div className="dish-photo__actions">
        <button type="button" className="admin__button admin__button--small" disabled={Boolean(busy)} onClick={() => input.current?.click()}>
          {current ? 'استبدال الصورة · Replace' : 'رفع صورة · Upload'}
        </button>
        <button
          type="button"
          className="admin__button admin__button--small admin__button--secondary"
          aria-expanded={browsing}
          disabled={Boolean(busy)}
          onClick={() => setBrowsing((value) => !value)}
        >
          اختيار من المعرض · From library ({library.length})
        </button>
        {current ? (
          <>
            <button
              type="button"
              className="admin__button admin__button--small admin__button--secondary"
              onClick={() => setPreviewing((value) => !value)}
              aria-expanded={previewing}
            >
              معاينة · Preview
            </button>
            <button
              type="button"
              className="admin__button admin__button--small admin__button--secondary"
              aria-pressed={positioning}
              onClick={() => setPositioning((value) => !value)}
            >
              موضع الصورة · Position
            </button>
            <button
              type="button"
              className="admin__button admin__button--small admin__button--danger"
              disabled={Boolean(busy)}
              onClick={() => {
                if (window.confirm('إزالة الصورة من هذا الطبق؟ تبقى في المعرض.')) void assign(null);
              }}
            >
              إزالة · Remove
            </button>
          </>
        ) : null}
      </div>

      {positioning && current ? (
        <div className="dish-photo__panel">
          <p className="admin__hint">
            اضغط على الجزء الأهم من الصورة؛ كل الأشكال تُقص حوله. الصورة الأصلية لا تتغير. · Click the part that must
            stay visible; every frame crops around it. The original is not changed.
          </p>
          <div className="dish-photo__actions">
            <button type="button" className="admin__button admin__button--small" onClick={() => void saveFocal()} disabled={Boolean(busy)}>
              حفظ الموضع · Save position
            </button>
            <button type="button" className="admin__button admin__button--small admin__button--secondary" onClick={() => setFocal({ x: 0.5, y: 0.5 })}>
              توسيط · Centre
            </button>
          </div>
        </div>
      ) : null}

      {previewing && current ? (
        <div className="dish-photo__shapes" aria-label="Frame preview">
          {SHAPES.map((shape) => (
            <figure key={shape.ratio}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={current.url} alt="" style={{ aspectRatio: shape.ratio, objectPosition: position }} />
              <figcaption>{shape.label}</figcaption>
            </figure>
          ))}
        </div>
      ) : null}

      {browsing ? (
        <div className="dish-photo__library" aria-label="Photo library">
          <div className="dish-photo__search">
            <input
              type="search"
              className="admin__input"
              placeholder="ابحث باسم الملف أو الطبق · Search by file or dish"
              aria-label="Search photos"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <select className="admin__select" value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)} aria-label="Filter photos">
              <option value="all">الكل · All</option>
              <option value="unused">غير مستخدمة · Unused</option>
              <option value="used">مستخدمة · In use</option>
            </select>
          </div>
          {shown.length === 0 ? (
            <p className="admin__empty">لا توجد صور مطابقة · No matching photos</p>
          ) : (
            <ul className="dish-photo__grid">
              {shown.map((photo) => (
                <li key={photo.id}>
                  <button
                    type="button"
                    className="dish-photo__pick"
                    aria-pressed={photo.id === current?.id}
                    disabled={Boolean(busy)}
                    onClick={() => void assign(photo.id)}
                    data-library-photo={photo.name}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photo.thumb} alt="" loading="lazy" />
                    <span className="dish-photo__name">{photo.name}</span>
                    <span className="dish-photo__use">
                      {photo.usedBy.length === 0 ? 'غير مستخدمة' : `في: ${photo.usedBy.slice(0, 2).join('، ')}${photo.usedBy.length > 2 ? '…' : ''}`}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {message ? (
        <p className={`admin__message admin__message--${message.kind}`} role={message.kind === 'error' ? 'alert' : 'status'} data-dish-photo-message="">
          {message.text}
        </p>
      ) : null}
    </section>
  );
}
