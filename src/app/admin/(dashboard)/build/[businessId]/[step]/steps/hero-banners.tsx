'use client';

import { startTransition, useActionState, useRef, useState } from 'react';
import type { ActionState } from '@/server/admin/actions';
import { ACCEPTED_IMAGES, shrink } from '@/lib/shrink-image';

/**
 * Hero banners (Step 6): the pictures at the top of the menu, separate from
 * dish photos. Each banner is one stored photo with two crop points (wide
 * screens and phones), optional text and button, and an optional overlay.
 */

type Action = (previous: ActionState, formData: FormData) => Promise<ActionState>;

export interface BannerView {
  id: string;
  url: string;
  isVisible: boolean;
  headingAr: string;
  headingEn: string;
  subheadingAr: string;
  subheadingEn: string;
  ctaLabelAr: string;
  ctaLabelEn: string;
  ctaUrl: string;
  overlay: number;
  focalX: number | null;
  focalY: number | null;
  mobileFocalX: number | null;
  mobileFocalY: number | null;
}

export interface BannerActions {
  add: Action;
  upload: Action;
  save: Action;
  move: Action;
  remove: Action;
  interval: Action;
}

const submit = (action: (data: FormData) => void) => (event: React.FormEvent<HTMLFormElement>) => {
  event.preventDefault();
  const data = new FormData(event.currentTarget, (event.nativeEvent as SubmitEvent).submitter);
  startTransition(() => action(data));
};

function Message({ state }: { state: ActionState }) {
  if (state.error) {
    return (
      <p className="admin__message admin__message--error" role="alert">
        {state.error}
      </p>
    );
  }
  return state.ok && state.message ? (
    <p className="admin__hint" role="status">
      {state.message}
    </p>
  ) : null;
}

export function HeroBanners({
  banners,
  library,
  intervalSec,
  max,
  actions,
}: {
  banners: BannerView[];
  library: { id: string; thumb: string; name: string }[];
  intervalSec: number;
  max: number;
  actions: BannerActions;
}) {
  const [addState, add, adding] = useActionState(actions.add, {});
  const [uploadState, upload, uploading] = useActionState(actions.upload, {});
  const [moveState, move] = useActionState(actions.move, {});
  const [removeState, remove] = useActionState(actions.remove, {});
  const [intervalState, setInterval] = useActionState(actions.interval, {});
  const [picking, setPicking] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const full = banners.length >= max;

  const uploadFile = async (chosen: File | undefined) => {
    if (!chosen) return;
    const data = new FormData();
    data.set('file', await shrink(chosen));
    startTransition(() => upload(data));
    if (file.current) file.current.value = '';
  };

  return (
    <section className="build__card hero-banners" aria-label="Hero banners" data-hero-banners="">
      <h2 className="build__step-title">صور الواجهة الرئيسية · Hero banners</h2>
      <p className="admin__hint">
        الصور الكبيرة أعلى المنيو، منفصلة عن صور الأطباق. إن لم تضف أي صورة، تُعرض العروض والأطباق المصوّرة تلقائياً. ·
        The big pictures at the top of the menu. With none, the hero shows your offers and photographed dishes.
      </p>

      <div className="hero-banners__add">
        <input
          ref={file}
          type="file"
          accept={ACCEPTED_IMAGES}
          className="admin__visually-hidden"
          aria-label="رفع صورة واجهة · Upload hero banner"
          onChange={(event) => void uploadFile(event.target.files?.[0])}
        />
        <button type="button" className="admin__button" disabled={full || uploading} onClick={() => file.current?.click()}>
          {uploading ? 'جارٍ الرفع…' : 'رفع صورة واجهة · Upload banner'}
        </button>
        <button
          type="button"
          className="admin__button admin__button--secondary"
          disabled={full}
          aria-expanded={picking}
          onClick={() => setPicking((value) => !value)}
        >
          اختيار من المعرض · From library
        </button>
        <form className="hero-banners__interval" onSubmit={submit(setInterval)}>
          <label>
            مدة كل صورة · Each slide
            <select name="seconds" defaultValue={intervalSec} className="admin__select" aria-label="Seconds per slide">
              {[3, 4, 5, 6, 8, 10, 12, 15].map((seconds) => (
                <option key={seconds} value={seconds}>
                  {seconds}s
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="admin__button admin__button--small admin__button--secondary">
            حفظ · Save
          </button>
        </form>
      </div>
      {full ? <p className="admin__hint">الحد الأقصى {max} صور · At most {max} banners</p> : null}
      <Message state={uploadState} />
      <Message state={addState} />
      <Message state={intervalState} />

      {picking ? (
        <ul className="hero-banners__library" aria-label="Pick a banner photo">
          {library.map((photo) => (
            <li key={photo.id}>
              <form onSubmit={submit(add)}>
                <input type="hidden" name="mediaId" value={photo.id} />
                <button type="submit" className="hero-banners__pick" disabled={adding} data-library-banner={photo.name}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo.thumb} alt="" loading="lazy" />
                  <span>{photo.name}</span>
                </button>
              </form>
            </li>
          ))}
        </ul>
      ) : null}

      <Message state={moveState} />
      <Message state={removeState} />

      {banners.length === 0 ? (
        <p className="admin__empty">لا توجد صور واجهة بعد · No banners yet</p>
      ) : (
        <ol className="hero-banners__list">
          {banners.map((banner, index) => (
            <BannerEditor
              key={banner.id}
              banner={banner}
              index={index}
              count={banners.length}
              save={actions.save}
              move={move}
              remove={remove}
            />
          ))}
        </ol>
      )}
    </section>
  );
}

function BannerEditor({
  banner,
  index,
  count,
  save,
  move,
  remove,
}: {
  banner: BannerView;
  index: number;
  count: number;
  save: Action;
  move: (data: FormData) => void;
  remove: (data: FormData) => void;
}) {
  const [state, submitSave, saving] = useActionState(save, {});
  const [wide, setWide] = useState({ x: banner.focalX ?? 0.5, y: banner.focalY ?? 0.5 });
  const [phone, setPhone] = useState({ x: banner.mobileFocalX ?? wide.x, y: banner.mobileFocalY ?? wide.y });
  const [overlay, setOverlay] = useState(banner.overlay);
  const [heading, setHeading] = useState(banner.headingAr);
  const at = (point: { x: number; y: number }) => `${Math.round(point.x * 100)}% ${Math.round(point.y * 100)}%`;
  const pick = (set: (point: { x: number; y: number }) => void) => (event: React.MouseEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    set({
      x: Math.min(1, Math.max(0, (event.clientX - box.left) / box.width)),
      y: Math.min(1, Math.max(0, (event.clientY - box.top) / box.height)),
    });
  };

  const frame = (ratio: string, point: { x: number; y: number }, set: (point: { x: number; y: number }) => void, label: string) => (
    <figure className="hero-banners__frame">
      <div className="hero-banners__canvas" style={{ aspectRatio: ratio }} onClick={pick(set)} role="presentation">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={banner.url} alt="" style={{ objectPosition: at(point) }} />
        {overlay ? <span className="hero-banners__shade" style={{ opacity: overlay / 100 }} /> : null}
        {heading ? <span className="hero-banners__heading">{heading}</span> : null}
        <span className="hero-banners__dot" style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }} />
      </div>
      <figcaption>{label}</figcaption>
    </figure>
  );

  return (
    <li className="hero-banners__item" data-banner={banner.id} data-banner-visible={banner.isVisible ? '' : undefined}>
      <div className="hero-banners__head">
        <strong>{index === 0 ? 'الرئيسية · Main' : `#${index + 1}`}</strong>
        {!banner.isVisible ? <span className="admin__hint">مخفية · hidden</span> : null}
        <span className="hero-banners__tools">
          {index > 0 ? (
            <form onSubmit={submit(move)}>
              <input type="hidden" name="id" value={banner.id} />
              <button name="to" value="first" className="admin__button admin__button--small admin__button--secondary">
                اجعلها الرئيسية · Make main
              </button>
            </form>
          ) : null}
          <form onSubmit={submit(move)}>
            <input type="hidden" name="id" value={banner.id} />
            <button name="to" value="up" className="build__icon-button" disabled={index === 0} aria-label="Move up">
              ▲
            </button>
            <button name="to" value="down" className="build__icon-button" disabled={index === count - 1} aria-label="Move down">
              ▼
            </button>
          </form>
          <form
            onSubmit={(event) => {
              if (!window.confirm('إزالة هذه الصورة من الواجهة؟ تبقى في المعرض.')) {
                event.preventDefault();
                return;
              }
              submit(remove)(event);
            }}
          >
            <input type="hidden" name="id" value={banner.id} />
            <button className="build__icon-button" aria-label="Delete banner">
              🗑
            </button>
          </form>
        </span>
      </div>

      <div className="hero-banners__previews">
        {frame('16 / 9', wide, setWide, 'كمبيوتر · Desktop — اضغط لتحديد الموضع')}
        {frame('4 / 5', phone, setPhone, 'جوال · Mobile — اضغط لتحديد الموضع')}
      </div>

      <form className="hero-banners__form" onSubmit={submit(submitSave)}>
        <input type="hidden" name="id" value={banner.id} />
        <input type="hidden" name="focalX" value={wide.x} />
        <input type="hidden" name="focalY" value={wide.y} />
        <input type="hidden" name="mobileFocalX" value={phone.x} />
        <input type="hidden" name="mobileFocalY" value={phone.y} />
        <div className="hero-banners__fields">
          <label className="admin__field">
            <span>العنوان · Heading (AR)</span>
            <input className="admin__input" name="headingAr" dir="rtl" defaultValue={banner.headingAr} onChange={(event) => setHeading(event.target.value)} />
          </label>
          <label className="admin__field">
            <span>Heading (EN)</span>
            <input className="admin__input" name="headingEn" dir="ltr" defaultValue={banner.headingEn} />
          </label>
          <label className="admin__field">
            <span>العنوان الفرعي · Subheading (AR)</span>
            <input className="admin__input" name="subheadingAr" dir="rtl" defaultValue={banner.subheadingAr} />
          </label>
          <label className="admin__field">
            <span>Subheading (EN)</span>
            <input className="admin__input" name="subheadingEn" dir="ltr" defaultValue={banner.subheadingEn} />
          </label>
          <label className="admin__field">
            <span>نص الزر · Button (AR)</span>
            <input className="admin__input" name="ctaLabelAr" dir="rtl" defaultValue={banner.ctaLabelAr} />
          </label>
          <label className="admin__field">
            <span>Button (EN)</span>
            <input className="admin__input" name="ctaLabelEn" dir="ltr" defaultValue={banner.ctaLabelEn} />
          </label>
          <label className="admin__field">
            <span>رابط الزر · Button link</span>
            <input className="admin__input" name="ctaUrl" dir="ltr" placeholder="https://… / tel:… / #menu-section" defaultValue={banner.ctaUrl} />
          </label>
          <label className="admin__field">
            <span>
              تعتيم خلف النص · Overlay {overlay}%
            </span>
            <input type="range" name="overlay" min={0} max={60} step={5} value={overlay} onChange={(event) => setOverlay(Number(event.target.value))} />
          </label>
        </div>
        <label className="options__check">
          <input type="checkbox" name="isVisible" defaultChecked={banner.isVisible} />
          ظاهرة في المنيو · Visible on the menu
        </label>
        <div className="build__actions">
          <button type="submit" className="admin__button" disabled={saving}>
            {saving ? '…' : 'حفظ الصورة · Save banner'}
          </button>
          <Message state={state} />
        </div>
      </form>
    </li>
  );
}
