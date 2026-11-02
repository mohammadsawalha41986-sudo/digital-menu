'use client';

import { useState } from 'react';
import { deleteMenuAction, menuImpactAction, restoreDeletedAction } from '@/server/admin/manage-actions';
import type { MenuImpact } from '@/server/menu-manage/service';
import type { DeletedRecordView } from '@/server/menu-manage/service';
import type { MenuView } from '@/server/menu-manage/view';

/**
 * Whole menus: what each contains, what deleting one would take with it, and
 * the list of deletions that can still be restored.
 */
export function MenuManager({
  businessId,
  menus,
  deleted,
  canManage,
  onClose,
  onNotice,
  onChanged,
}: {
  businessId: string;
  publicId: string;
  menus: MenuView[];
  deleted: DeletedRecordView[];
  canManage: boolean;
  onClose: () => void;
  onNotice: (kind: 'ok' | 'error', text: string) => void;
  onChanged: () => void;
}) {
  const [target, setTarget] = useState<{ menu: MenuView; impact: MenuImpact } | null>(null);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  async function openDelete(menu: MenuView) {
    setLoading(menu.id);
    setProblem(null);
    const result = await menuImpactAction(businessId, menu.id);
    setLoading(null);
    if (!result.ok) {
      setProblem(result.error);
      return;
    }
    setTyped('');
    setTarget({ menu, impact: result.impact });
  }

  async function confirmDelete() {
    if (!target) return;
    setBusy(true);
    const result = await deleteMenuAction(businessId, target.menu.id, typed);
    setBusy(false);
    if (result.ok) {
      onNotice('ok', result.message);
      setTarget(null);
      onChanged();
    } else {
      setProblem(result.error);
    }
  }

  async function restore(recordId: string) {
    setBusy(true);
    const result = await restoreDeletedAction(businessId, recordId);
    setBusy(false);
    if (result.ok) {
      onNotice('ok', 'Restored with its dishes, prices and links.');
      onChanged();
    } else {
      onNotice('error', result.error);
    }
  }

  return (
    <div className="mg__sheet" role="dialog" aria-modal="true" aria-label="Menus and deleted items" onKeyDown={(event) => { if (event.key === 'Escape') onClose(); }}>
      <div className="mg__sheet-card mg__sheet-card--wide">
        <header className="mg__drawer-head">
          <h3>المنيوهات والمحذوفات · Menus &amp; deleted</h3>
          <button type="button" className="mg__icon" onClick={onClose} aria-label="Close">×</button>
        </header>

        {problem ? <p className="admin__message admin__message--error" role="alert">{problem}</p> : null}

        <section aria-label="Menus">
          <h4>المنيوهات · Menus</h4>
          {menus.length === 0 ? <p className="admin__empty">No menu yet.</p> : (
            <ul className="mg__menu-list">
              {menus.map((menu) => {
                const dishes = menu.sections.reduce((total, section) => total + section.dishes.length, 0);
                return (
                  <li key={menu.id}>
                    <div>
                      <strong>{menu.title}</strong>
                      <span className="admin__hint"> · {menu.key} · {menu.sections.length} sections · {dishes} dishes</span>
                      {menu.isLive ? <span className="mg__live"> live</span> : null}
                    </div>
                    {canManage ? (
                      <button type="button" className="admin__button admin__button--danger" onClick={() => void openDelete(menu)} disabled={loading === menu.id || busy}>
                        {loading === menu.id ? 'جاري التحقق · Checking…' : 'حذف المنيو · Delete menu'}
                      </button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {target ? (
          <section className="mg__danger" aria-label="Confirm menu deletion">
            <h4>حذف «{target.menu.title}»؟ · Delete “{target.menu.title}”?</h4>
            <ul className="mg__impact">
              <li>{target.impact.sections} sections</li>
              <li>{target.impact.dishes} dishes, with their prices and option links</li>
              <li>{target.impact.publishedVersions} published versions</li>
              {target.impact.isLive ? <li>This menu is live: it disappears from the public menu at once.</li> : null}
            </ul>
            {target.impact.blockedBy.length > 0 ? (
              <p className="admin__message admin__message--error" role="alert">
                لا يمكن الحذف: أصناف أخرى تقترحها، وستبقى دون هدف · Blocked: other dishes suggest these: {target.impact.blockedBy.join(', ')}. Remove those suggestions first.
              </p>
            ) : (
              <p className="admin__hint">
                الحذف قابل للاستعادة من القائمة أدناه. · It can be restored from the list below.
              </p>
            )}
            <label className="admin__field">
              <span className="admin__label">اكتب اسم المنيو للتأكيد: {target.menu.key} · Type the menu name to confirm: {target.menu.key}</span>
              <input className="admin__input" value={typed} onChange={(event) => setTyped(event.target.value)} autoComplete="off" />
            </label>
            <div className="admin__actions">
              <button type="button" className="admin__button admin__button--secondary" onClick={() => setTarget(null)}>إلغاء · Cancel</button>
              <button
                type="button"
                className="admin__button admin__button--danger"
                disabled={busy || typed.trim() !== target.menu.key || target.impact.blockedBy.length > 0}
                onClick={() => void confirmDelete()}
              >
                حذف نهائياً من المنيو · Delete menu
              </button>
            </div>
          </section>
        ) : null}

        <section aria-label="Deleted items">
          <h4>المحذوفات · Deleted (restorable)</h4>
          {deleted.length === 0 ? <p className="admin__empty">Nothing deleted.</p> : (
            <ul className="mg__menu-list">
              {deleted.map((record) => (
                <li key={record.id}>
                  <div>
                    <strong>{record.kind === 'MENU' ? 'منيو · Menu' : 'أصناف · Dishes'}: {record.label}</strong>
                    <span className="admin__hint"> · {record.count} · {new Date(record.deletedAt).toLocaleString()}{record.deletedBy ? ` · ${record.deletedBy}` : ''}</span>
                    {record.restoredAt ? <span className="mg__live"> restored</span> : null}
                  </div>
                  {canManage && !record.restoredAt ? (
                    <button type="button" className="admin__button admin__button--secondary" onClick={() => void restore(record.id)} disabled={busy}>
                      استعادة · Restore
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
