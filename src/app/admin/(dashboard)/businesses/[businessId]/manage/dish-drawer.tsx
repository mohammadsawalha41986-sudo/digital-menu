'use client';

import { useEffect, useRef, useState } from 'react';
import { DishImagePicker, type LibraryPhoto } from '@/app/admin/(dashboard)/build/[businessId]/[step]/steps/dish-image-picker';
import { duplicateDishAction } from '@/server/admin/actions';
import { deleteDishesAction, moveDishesAction } from '@/server/admin/manage-actions';
import type { DishRowView, ManageView } from '@/server/menu-manage/view';
import { parsePriceToMinor, formatMinorAsDecimal } from '@/lib/money';
import type { useDishSaves, SaveStatus } from './use-dish-saves';

type Saves = ReturnType<typeof useDishSaves>;
type Action = (previous: { ok?: boolean; error?: string; message?: string }, formData: FormData) => Promise<{ ok?: boolean; error?: string; message?: string }>;

export interface DrawerActions {
  upload: Action;
  assign: Action;
  focal: Action;
}

const STATUS_TEXT: Record<SaveStatus, string> = {
  idle: '',
  pending: 'بانتظار الحفظ · Waiting to save',
  saving: 'جاري الحفظ · Saving…',
  saved: 'تم الحفظ · Saved',
  error: 'فشل الحفظ · Not saved',
  conflict: 'تغيّر في مكان آخر · Changed elsewhere',
};

const TEXT_DELAY = 700;

/**
 * The dish editor, beside the list rather than under it. Text saves a moment
 * after the owner stops typing; choices save at once. Closing it saves what is
 * left, and says so if something could not be saved.
 */
export function DishDrawer({
  businessId,
  publicId,
  dish,
  sectionId,
  sections,
  canEdit,
  canManage,
  currency,
  media,
  picker,
  saves,
  onClose,
  onMoved,
  onDeleted,
  onDuplicated,
  onNotice,
  revision,
  onTakeTheirs,
}: {
  businessId: string;
  publicId: string;
  dish: DishRowView;
  sectionId: string;
  sections: { id: string; label: string; menuTitle: string }[];
  canEdit: boolean;
  canManage: boolean;
  currency: string;
  media: ManageView['media'];
  picker: DrawerActions;
  saves: Saves;
  onClose: () => void;
  onMoved: () => void;
  onDeleted: () => void;
  onDuplicated: (item: { id: string }) => void;
  onNotice: (kind: 'ok' | 'error', text: string) => void;
  /** Changes whenever the fields must show the saved values again, after a takeover. */
  revision: number;
  onTakeTheirs: (id: string) => void;
}) {
  const status = saves.statusOf(dish.id);
  const error = saves.errorOf(dish.id);
  const current = saves.currentOf(dish.id);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const firstField = useRef<HTMLInputElement>(null);

  useEffect(() => {
    firstField.current?.focus();
  }, []);

  function field(name: 'nameAr' | 'nameEn' | 'descriptionAr' | 'descriptionEn', value: string) {
    saves.queue(dish.id, { [name]: value }, TEXT_DELAY);
  }

  async function close() {
    // Anything still waiting goes now, so closing never leaves an edit behind.
    saves.retry(dish.id);
    onClose();
  }

  async function move(target: string) {
    if (target === sectionId) return;
    setBusy(true);
    const result = await moveDishesAction(businessId, [dish.id], target);
    setBusy(false);
    if (result.ok) {
      onNotice('ok', 'Moved to the new section.');
      onMoved();
    } else {
      onNotice('error', result.error);
    }
  }

  async function duplicate() {
    setBusy(true);
    const form = new FormData();
    form.set('itemCode', dish.itemCode);
    const result = await duplicateDishAction(businessId, publicId, {}, form);
    setBusy(false);
    if (result.ok) {
      onNotice('ok', 'Copied. The copy is in the same section, with its own code.');
      onDuplicated({ id: dish.id });
    } else {
      onNotice('error', result.error ?? 'Could not copy the dish.');
    }
  }

  async function remove() {
    setBusy(true);
    const result = await deleteDishesAction(businessId, [dish.id]);
    setBusy(false);
    if (result.ok) {
      onNotice('ok', result.message);
      onDeleted();
    } else {
      onNotice('error', result.error);
      setConfirmDelete(false);
    }
  }

  const library: LibraryPhoto[] = media.map((image) => ({
    id: image.id,
    url: image.url,
    thumb: image.thumb,
    name: image.name,
    usedBy: image.usedBy,
  }));
  const currentPhoto = dish.imageMediaId && dish.imageUrl
    ? {
        id: dish.imageMediaId,
        url: dish.imageUrl,
        focalX: media.find((image) => image.id === dish.imageMediaId)?.focalX ?? null,
        focalY: media.find((image) => image.id === dish.imageMediaId)?.focalY ?? null,
      }
    : null;

  return (
    <aside className="mg__drawer" role="dialog" aria-modal="false" aria-label={`Edit ${dish.nameEn ?? dish.nameAr}`} onKeyDown={(event) => { if (event.key === 'Escape') void close(); }}>
      <header className="mg__drawer-head">
        <div>
          <p className="admin__hint">{dish.itemCode}</p>
          <h3>{dish.nameAr}{dish.nameEn ? <span className="mg__en"> · {dish.nameEn}</span> : null}</h3>
        </div>
        <button type="button" className="mg__icon" onClick={() => void close()} aria-label="Close">×</button>
      </header>

      <div className="mg__drawer-status" aria-live="polite">
        {status !== 'idle' ? <span className={`mg__status mg__status--${status}`}>{STATUS_TEXT[status]}{error ? ` — ${error}` : ''}</span> : <span className="admin__hint">كل التعديلات تُحفظ تلقائياً · Changes save automatically</span>}
        {status === 'error' ? <button type="button" className="mg__retry" onClick={() => saves.retry(dish.id)}>إعادة المحاولة · Retry</button> : null}
      </div>

      {status === 'conflict' && current ? (
        <div className="mg__conflict-box" role="alert">
          <p>تغيّر هذا الصنف في مكان آخر، ولم نحفظ تعديلك. · This dish was changed elsewhere, and your edit was not saved.</p>
          <p className="admin__hint">الآن: {current.nameAr} · {current.priceMinor === null ? 'no price' : formatMinorAsDecimal(current.priceMinor, currency)} {currency} · {current.availability}</p>
          <div className="admin__actions">
            <button type="button" className="admin__button admin__button--secondary" onClick={() => onTakeTheirs(dish.id)}>أخذ النسخة الحالية · Use theirs</button>
            <button type="button" className="admin__button" onClick={() => saves.keepMine(dish.id)}>الإبقاء على تعديلي · Keep mine</button>
          </div>
        </div>
      ) : null}

      <div className="mg__drawer-body">
        <section className="mg__drawer-section" aria-label="Photo">
          <DishImagePicker
            key={dish.id}
            itemCode={dish.itemCode}
            dishName={dish.nameAr}
            current={currentPhoto}
            library={library}
            actions={{ upload: picker.upload, assign: picker.assign, focal: picker.focal }}
          />
        </section>

        <fieldset key={revision} className="mg__fields" disabled={!canEdit}>
          <label className="admin__field">
            <span className="admin__label">الاسم بالعربي · Name (Arabic)</span>
            <input ref={firstField} className="admin__input" dir="rtl" defaultValue={dish.nameAr} maxLength={120} onChange={(event) => field('nameAr', event.target.value)} onBlur={() => saves.retry(dish.id)} />
          </label>
          <label className="admin__field">
            <span className="admin__label">الاسم بالإنجليزي · Name (English)</span>
            <input className="admin__input" defaultValue={dish.nameEn ?? ''} maxLength={120} onChange={(event) => field('nameEn', event.target.value)} onBlur={() => saves.retry(dish.id)} />
          </label>
          <label className="admin__field">
            <span className="admin__label">الوصف بالعربي · Description (Arabic)</span>
            <textarea className="admin__input" dir="rtl" rows={3} defaultValue={dish.descriptionAr ?? ''} maxLength={500} onChange={(event) => field('descriptionAr', event.target.value)} onBlur={() => saves.retry(dish.id)} />
          </label>
          <label className="admin__field">
            <span className="admin__label">الوصف بالإنجليزي · Description (English)</span>
            <textarea className="admin__input" rows={3} defaultValue={dish.descriptionEn ?? ''} maxLength={500} onChange={(event) => field('descriptionEn', event.target.value)} onBlur={() => saves.retry(dish.id)} />
          </label>
          <div className="mg__two">
            <PriceInput dish={dish} currency={currency} saves={saves} />
            <label className="admin__field">
              <span className="admin__label">التوفر · Availability</span>
              <select className="admin__select" value={dish.availability} onChange={(event) => saves.queue(dish.id, { availability: event.target.value as 'AVAILABLE' })}>
                <option value="AVAILABLE">متوفر · Available</option>
                <option value="UNAVAILABLE">غير متوفر الآن · Out right now</option>
                <option value="HIDDEN">مخفي من المنيو · Hidden from menu</option>
                <option value="SEASONAL">موسمي · Seasonal</option>
              </select>
            </label>
          </div>
          <label className="admin__field">
            <span className="admin__label">القسم · Section</span>
            <select className="admin__select" value={sectionId} onChange={(event) => void move(event.target.value)} disabled={busy}>
              {sections.map((section) => (
                <option key={section.id} value={section.id}>{section.label} · {section.menuTitle}</option>
              ))}
            </select>
          </label>
          {dish.choices > 0 ? (
            <p className="admin__hint">لهذا الصنف {dish.choices} خيارات، تُدار من صفحة الخيارات · {dish.choices} option group(s), managed on the Options page.</p>
          ) : null}
        </fieldset>
      </div>

      <footer className="mg__drawer-foot">
        {canEdit ? (
          <button type="button" className="admin__button admin__button--secondary" onClick={() => void duplicate()} disabled={busy}>
            نسخ · Duplicate
          </button>
        ) : null}
        {canManage && !confirmDelete ? (
          <button type="button" className="admin__button admin__button--danger" onClick={() => setConfirmDelete(true)} disabled={busy}>
            حذف · Delete
          </button>
        ) : null}
        {confirmDelete ? (
          <span className="mg__confirm-inline" role="alert">
            <span>حذف هذا الصنف؟ يمكن استعادته لاحقاً. · Delete this dish? It can be restored later.</span>
            <button type="button" className="admin__button admin__button--secondary" onClick={() => setConfirmDelete(false)}>إلغاء · Cancel</button>
            <button type="button" className="admin__button admin__button--danger" onClick={() => void remove()} disabled={busy}>حذف · Delete</button>
          </span>
        ) : null}
      </footer>
    </aside>
  );
}

function PriceInput({ dish, currency, saves }: { dish: DishRowView; currency: string; saves: Saves }) {
  const initial = dish.priceMinor === null ? '' : formatMinorAsDecimal(dish.priceMinor, currency);
  const [text, setText] = useState(initial);
  const [seen, setSeen] = useState(initial);
  if (initial !== seen) {
    setSeen(initial);
    setText(initial);
  }
  function commit() {
    const next = text.trim();
    if (next === initial.trim()) return;
    if (next !== '' && parsePriceToMinor(next, currency) === null) {
      setText(initial);
      return;
    }
    saves.queue(dish.id, { price: next });
  }
  return (
    <label className="admin__field">
      <span className="admin__label">السعر · Price ({currency})</span>
      <input
        className="admin__input"
        inputMode="decimal"
        value={text}
        placeholder="—"
        onChange={(event) => setText(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => { if (event.key === 'Enter') (event.target as HTMLInputElement).blur(); }}
      />
    </label>
  );
}
