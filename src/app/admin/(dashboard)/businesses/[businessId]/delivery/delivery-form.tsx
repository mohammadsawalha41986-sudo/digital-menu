'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { saveDeliveryAction } from '@/server/admin/delivery-actions';
import { mapLink, parseLatLng, type LatLng } from '@/lib/delivery';
import './delivery.css';

interface Row {
  maxKm: string;
  fee: string;
}

const MAX_ROWS = 10;

/**
 * The restaurant's location and its distance bands. Distance is a straight
 * line, so the help text asks for a margin: roads are longer.
 */
export function DeliveryForm({
  businessId,
  currency,
  canEdit,
  origin,
  zones,
}: {
  businessId: string;
  currency: string;
  canEdit: boolean;
  origin: LatLng | null;
  zones: Row[];
}) {
  const router = useRouter();
  const [lat, setLat] = useState(origin ? String(origin.lat) : '');
  const [lng, setLng] = useState(origin ? String(origin.lng) : '');
  const [mapsText, setMapsText] = useState('');
  const [rows, setRows] = useState<Row[]>(zones.length > 0 ? zones : [{ maxKm: '', fee: '' }]);
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const point = parseLatLng(`${lat},${lng}`);
  const filled = rows.filter((row) => row.maxKm.trim() !== '');
  const limit = filled.length > 0 ? Math.max(...filled.map((row) => Number(row.maxKm.replace(/[٫،,]/g, '.')) || 0)) : null;

  function readLink() {
    const found = parseLatLng(mapsText);
    if (!found) {
      setNotice({
        kind: 'error',
        text: 'لم نجد إحداثيات في الرابط. الروابط المختصرة (maps.app.goo.gl) لا تحتوي الموقع: افتحها في المتصفح ثم انسخ العنوان الكامل. · No coordinates found in that link. Open a short link in the browser and copy the full address.',
      });
      return;
    }
    setLat(found.lat.toFixed(6));
    setLng(found.lng.toFixed(6));
    setNotice(null);
  }

  function useMyLocation() {
    if (!navigator.geolocation) {
      setNotice({ kind: 'error', text: 'هذا المتصفح لا يحدد الموقع. · This browser cannot share a location.' });
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLat(position.coords.latitude.toFixed(6));
        setLng(position.coords.longitude.toFixed(6));
        setLocating(false);
        setNotice(null);
      },
      () => {
        setLocating(false);
        setNotice({ kind: 'error', text: 'تعذّر تحديد الموقع. اسمح للمتصفح بالوصول إلى الموقع، أو الصق رابط خرائط Google. · Could not get the location.' });
      },
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  }

  function updateRow(index: number, patch: Partial<Row>) {
    setRows((current) => current.map((row, at) => (at === index ? { ...row, ...patch } : row)));
  }

  async function save() {
    setBusy(true);
    setNotice(null);
    const result = await saveDeliveryAction(businessId, { lat, lng, zones: rows });
    setBusy(false);
    if (result.ok) {
      setNotice({ kind: 'ok', text: result.message });
      router.refresh();
    } else {
      setNotice({ kind: 'error', text: result.error });
    }
  }

  return (
    <div className="dl">
      {!canEdit ? (
        <p className="admin__message" role="note">
          تعديل التوصيل متاح للمدير والمالك فقط. · Only a manager or the owner can change delivery.
        </p>
      ) : null}

      <fieldset className="admin__panel dl__panel" disabled={!canEdit || busy}>
        <legend className="admin__panel-title">١. موقع المطعم · Restaurant location</legend>
        <p className="admin__hint">
          تُحسب مسافة التوصيل من هذه النقطة إلى موقع العميل. · Delivery distance is measured from this point.
        </p>

        <label className="admin__field">
          <span className="admin__label">رابط خرائط Google · Google Maps link</span>
          <span className="dl__inline">
            <input
              className="admin__input"
              dir="ltr"
              value={mapsText}
              onChange={(event) => setMapsText(event.target.value)}
              placeholder="https://www.google.com/maps/place/…/@24.7136,46.6753,17z"
            />
            <button type="button" className="admin__button admin__button--secondary" onClick={readLink} disabled={!mapsText.trim()}>
              استخراج · Read
            </button>
          </span>
        </label>

        <div className="dl__two">
          <label className="admin__field">
            <span className="admin__label">خط العرض · Latitude</span>
            <input className="admin__input" dir="ltr" inputMode="decimal" value={lat} onChange={(event) => setLat(event.target.value)} placeholder="24.713600" />
          </label>
          <label className="admin__field">
            <span className="admin__label">خط الطول · Longitude</span>
            <input className="admin__input" dir="ltr" inputMode="decimal" value={lng} onChange={(event) => setLng(event.target.value)} placeholder="46.675300" />
          </label>
        </div>

        <div className="admin__actions">
          <button type="button" className="admin__button admin__button--secondary" onClick={useMyLocation} disabled={locating}>
            {locating ? 'جاري التحديد… · Locating…' : 'استخدم موقعي الحالي · Use my current location'}
          </button>
          {point ? (
            <a className="admin__button admin__button--secondary" href={mapLink(point)} target="_blank" rel="noreferrer">
              تحقق على الخريطة · Check on the map
            </a>
          ) : null}
        </div>
      </fieldset>

      <fieldset className="admin__panel dl__panel" disabled={!canEdit || busy}>
        <legend className="admin__panel-title">٢. مسافات التوصيل والرسوم · Distances and fees</legend>
        <p className="admin__hint">
          كل سطر: إلى أي مسافة، وكم رسوم التوصيل. أبعد مسافة هي حد التوصيل، وما بعدها لا يُقبل للتوصيل. المسافة بخط
          مستقيم، والطريق الفعلي أطول عادة بنحو 20 إلى 40٪، فاترك هامشاً. · Each row: up to what distance, and the fee.
          The farthest row is the delivery limit. Distance is a straight line; roads are usually 20–40% longer.
        </p>

        <div className="admin__table-scroll">
          <table className="admin__table dl__table">
            <thead>
              <tr>
                <th scope="col">حتى (كم) · Up to (km)</th>
                <th scope="col">الرسوم ({currency}) · Fee</th>
                <th scope="col" aria-label="حذف · Remove" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={index} data-delivery-band={index}>
                  <td>
                    <input
                      className="admin__input"
                      dir="ltr"
                      inputMode="decimal"
                      aria-label={`حتى (كم) ${index + 1} · Up to km, band ${index + 1}`}
                      value={row.maxKm}
                      onChange={(event) => updateRow(index, { maxKm: event.target.value })}
                      placeholder="3"
                    />
                  </td>
                  <td>
                    <input
                      className="admin__input"
                      dir="ltr"
                      inputMode="decimal"
                      aria-label={`الرسوم ${index + 1} · Fee, band ${index + 1}`}
                      value={row.fee}
                      onChange={(event) => updateRow(index, { fee: event.target.value })}
                      placeholder="0"
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      className="admin__button admin__button--secondary"
                      aria-label={`حذف السطر ${index + 1} · Remove band ${index + 1}`}
                      onClick={() => setRows((current) => current.filter((_, at) => at !== index))}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="admin__actions">
          <button
            type="button"
            className="admin__button admin__button--secondary"
            onClick={() => setRows((current) => [...current, { maxKm: '', fee: '' }])}
            disabled={rows.length >= MAX_ROWS}
          >
            + إضافة مسافة · Add a distance
          </button>
        </div>

        <p className="admin__hint" aria-live="polite">
          {limit
            ? `يغطي التوصيل حتى ${limit} كم من المطعم. · Delivery covers up to ${limit} km.`
            : 'بدون مسافات: يبقى التوصيل متاحاً، ويحدد المطعم الرسوم عند التأكيد. · No distances: delivery stays available and the restaurant confirms the fee.'}
        </p>
      </fieldset>

      {canEdit ? (
        <div className="admin__actions dl__save">
          <button type="button" className="admin__button" onClick={() => void save()} disabled={busy}>
            {busy ? 'جاري الحفظ… · Saving…' : 'حفظ إعدادات التوصيل · Save delivery settings'}
          </button>
          {notice ? (
            <span className={`admin__message admin__message--${notice.kind === 'ok' ? 'ok' : 'error'}`} role={notice.kind === 'ok' ? 'status' : 'alert'}>
              {notice.text}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
