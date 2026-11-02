'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import {
  copyDishesAction,
  createDishAction,
  createSectionAction,
  deleteDishesAction,
  deleteSectionAction,
  moveDishesAction,
  reorderDishesAction,
  reorderSectionsAction,
  setSectionVisibleAction,
} from '@/server/admin/manage-actions';
import type { ManageView, DishRowView } from '@/server/menu-manage/view';
import type { ItemView } from '@/server/menu-manage/service';
import { formatMinorAsDecimal, parsePriceToMinor } from '@/lib/money';
import { DishDrawer, type DrawerActions } from './dish-drawer';
import { MenuManager } from './menu-manager';
import { useDishSaves, type SaveStatus } from './use-dish-saves';
import './manage.css';

/** The add-dish dialog's choice for "name a new section instead". */
const NEW_SECTION = '__new';

const AVAILABILITY_LABEL: Record<string, { ar: string; en: string }> = {
  AVAILABLE: { ar: 'متوفر', en: 'Available' },
  UNAVAILABLE: { ar: 'غير متوفر الآن', en: 'Out right now' },
  HIDDEN: { ar: 'مخفي من المنيو', en: 'Hidden from menu' },
  SEASONAL: { ar: 'موسمي', en: 'Seasonal' },
};

const STATUS_LABEL: Record<SaveStatus, { ar: string; en: string } | null> = {
  idle: null,
  pending: { ar: 'بانتظار الحفظ', en: 'Waiting to save' },
  saving: { ar: 'جاري الحفظ', en: 'Saving' },
  saved: { ar: 'تم الحفظ', en: 'Saved' },
  error: { ar: 'فشل الحفظ', en: 'Not saved' },
  conflict: { ar: 'تغيّر في مكان آخر', en: 'Changed elsewhere' },
};

function subscribePhone(onChange: () => void) {
  const query = window.matchMedia('(max-width: 760px)');
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

function subscribeOnline(onChange: () => void) {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}

interface Row {
  dish: DishRowView;
  menuId: string;
  menuTitle: string;
  sectionName: string;
}

interface Props {
  businessId: string;
  view: ManageView;
  picker: DrawerActions;
}

export function ManageBoard({ businessId, view, picker }: Props) {
  const router = useRouter();
  const [menus, setMenus] = useState(view.menus);
  const [activeMenu, setActiveMenu] = useState<string>('all');
  const [activeSection, setActiveSection] = useState<string>('all');
  const [query, setQuery] = useState('');
  const [availabilityFilter, setAvailabilityFilter] = useState<string>('all');
  const [chosenMode, setChosenMode] = useState<'table' | 'cards' | null>(null);
  const [revision, setRevision] = useState(0);
  const phone = useSyncExternalStore(subscribePhone, () => window.matchMedia('(max-width: 760px)').matches, () => false);
  const mode = chosenMode ?? (phone ? 'cards' : 'table');
  const setMode = setChosenMode;
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [addingSection, setAddingSection] = useState(false);
  /** The add-dish dialog's section: an existing one, or NEW_SECTION to name a new one. */
  const [dishSection, setDishSection] = useState('');
  /** Arranging sections: drag or ▲▼ to order them, and hide or show each. */
  const [arranging, setArranging] = useState(false);
  const [dragSection, setDragSection] = useState<string | null>(null);
  /** The section a dragged dish is over, so it can light up as the drop target. */
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [menuManagerOpen, setMenuManagerOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string[] | null>(null);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [moveTarget, setMoveTarget] = useState<string>('');
  const [dragId, setDragId] = useState<string | null>(null);
  const [newDishName, setNewDishName] = useState('');
  
  const onSaved = useMemo(
    () => (item: ItemView) => {
      setMenus((current) =>
        current.map((menu) => ({
          ...menu,
          sections: menu.sections.map((section) => ({
            ...section,
            dishes: section.dishes.map((dish) =>
              dish.id === item.id
                ? {
                    ...dish,
                    nameAr: item.nameAr,
                    nameEn: item.nameEn,
                    descriptionAr: item.descriptionAr,
                    descriptionEn: item.descriptionEn,
                    priceMinor: item.priceMinor,
                    availability: item.availability,
                    sortOrder: item.sortOrder,
                    updatedAt: item.updatedAt,
                  }
                : dish,
            ),
          })),
        })),
      );
    },
    [],
  );

  const saves = useDishSaves(businessId, onSaved);

  /** Takes the version that is there now, and refreshes every place that shows the dish. */
  const takeTheirs = (id: string) => {
    const item = saves.takeTheirs(id);
    if (item) {
      onSaved(item);
      setRevision((n) => n + 1);
    }
  };

  // A fresh view from the server replaces the screen's copy, unless edits are
  // still in flight. Done during render (not in an effect), so there is no second pass.
  const [seenView, setSeenView] = useState(view);
  if (view !== seenView && !saves.hasUnsaved()) {
    setSeenView(view);
    setMenus(view.menus);
  }

  // Remember the version of every dish on screen, so the first save can be checked.
  useEffect(() => {
    for (const menu of view.menus) {
      for (const section of menu.sections) for (const dish of section.dishes) saves.seed(dish.id, dish.updatedAt);
    }
  }, [view, saves]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!saves.hasUnsaved()) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [saves]);

  const rows: Row[] = useMemo(
    () =>
      menus.flatMap((menu) =>
        menu.sections.flatMap((section) =>
          section.dishes.map((dish) => ({
            dish,
            menuId: menu.id,
            menuTitle: menu.title,
            sectionName: section.nameEn ?? section.nameAr,
          })),
        ),
      ),
    [menus],
  );

  const sections = useMemo(
    () =>
      menus
        .filter((menu) => activeMenu === 'all' || menu.id === activeMenu)
        .flatMap((menu) => menu.sections.map((section) => ({ ...section, menuId: menu.id, menuTitle: menu.title }))),
    [menus, activeMenu],
  );

  const needle = query.trim().toLowerCase();
  const visible = rows.filter((row) => {
    if (activeMenu !== 'all' && row.menuId !== activeMenu) return false;
    if (activeSection !== 'all' && !sections.some((s) => s.id === activeSection && s.dishes.some((d) => d.id === row.dish.id))) {
      return false;
    }
    if (availabilityFilter !== 'all' && row.dish.availability !== availabilityFilter) return false;
    if (needle) {
      const hay = `${row.dish.nameAr} ${row.dish.nameEn ?? ''} ${row.dish.itemCode}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });

  const reorderOn = activeSection !== 'all' && needle === '' && availabilityFilter === 'all';
  const drawerDish = drawerId ? rows.find((row) => row.dish.id === drawerId) ?? null : null;
  const drawerSection = drawerDish
    ? menus.flatMap((menu) => menu.sections).find((section) => section.dishes.some((dish) => dish.id === drawerDish.dish.id)) ?? null
    : null;

  const counts = useMemo(() => {
    const all = rows.map((row) => row.dish);
    return {
      total: all.length,
      available: all.filter((dish) => dish.availability === 'AVAILABLE').length,
      out: all.filter((dish) => dish.availability === 'UNAVAILABLE').length,
      hidden: all.filter((dish) => dish.availability === 'HIDDEN').length,
    };
  }, [rows]);

  function say(kind: 'ok' | 'error', text: string) {
    setNotice({ kind, text });
  }

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /** The section's dishes in the order they are shown, whatever the filters. */
  function sectionOrder(sectionId: string): DishRowView[] {
    const section = menus.flatMap((menu) => menu.sections).find((s) => s.id === sectionId);
    return section ? [...section.dishes].sort((a, b) => a.sortOrder - b.sortOrder) : [];
  }

  function applyOrder(sectionId: string, ids: string[]) {
    setMenus((current) =>
      current.map((menu) => ({
        ...menu,
        sections: menu.sections.map((section) =>
          section.id !== sectionId
            ? section
            : {
                ...section,
                dishes: section.dishes.map((dish) => ({ ...dish, sortOrder: ids.indexOf(dish.id) })),
              },
        ),
      })),
    );
  }

  async function reorder(sectionId: string, ids: string[]) {
    const previous = sectionOrder(sectionId).map((dish) => dish.id);
    applyOrder(sectionId, ids);
    const result = await reorderDishesAction(businessId, sectionId, ids);
    if (!result.ok) {
      applyOrder(sectionId, previous);
      say('error', `${result.error} The order was put back.`);
    }
  }

  function moveBy(dishId: string, delta: -1 | 1) {
    const section = menus.flatMap((menu) => menu.sections).find((s) => s.dishes.some((d) => d.id === dishId));
    if (!section) return;
    const ids = sectionOrder(section.id).map((dish) => dish.id);
    const index = ids.indexOf(dishId);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= ids.length) return;
    const next = [...ids];
    [next[index], next[target]] = [next[target]!, next[index]!];
    void reorder(section.id, next);
  }

  function dropOn(targetId: string) {
    if (!dragId || dragId === targetId) return;
    const target = rows.find((row) => row.dish.id === targetId);
    const dragged = rows.find((row) => row.dish.id === dragId);
    if (!target || !dragged || target.menuId !== dragged.menuId) return;
    const section = menus.flatMap((menu) => menu.sections).find((s) => s.dishes.some((d) => d.id === targetId));
    if (!section || !section.dishes.some((d) => d.id === dragId)) return;
    const ids = sectionOrder(section.id).map((dish) => dish.id).filter((id) => id !== dragId);
    const at = ids.indexOf(targetId);
    ids.splice(at, 0, dragId);
    setDragId(null);
    void reorder(section.id, ids);
  }

  async function deleteSelected(ids: string[]) {
    setBusy(true);
    const result = await deleteDishesAction(businessId, ids);
    setBusy(false);
    setConfirmDelete(null);
    if (result.ok) {
      const gone = new Set(ids);
      setMenus((current) =>
        current.map((menu) => ({
          ...menu,
          sections: menu.sections.map((section) => ({ ...section, dishes: section.dishes.filter((dish) => !gone.has(dish.id)) })),
        })),
      );
      setSelected(new Set());
      if (drawerId && gone.has(drawerId)) setDrawerId(null);
      say('ok', result.message);
      router.refresh();
    } else {
      say('error', result.error);
    }
  }

  async function copySelected() {
    if (!moveTarget || selected.size === 0) return;
    setBusy(true);
    const result = await copyDishesAction(businessId, [...selected], moveTarget);
    setBusy(false);
    if (result.ok) {
      setSelected(new Set());
      say('ok', result.message);
      router.refresh();
    } else {
      say('error', result.error);
    }
  }

  async function moveSelected() {
    if (!moveTarget || selected.size === 0) return;
    setBusy(true);
    const ids = [...selected];
    const result = await moveDishesAction(businessId, ids, moveTarget);
    setBusy(false);
    if (result.ok) {
      setSelected(new Set());
      setMoveTarget('');
      say('ok', result.message);
      router.refresh();
    } else {
      say('error', result.error);
    }
  }

  function setAvailabilityOfSelected(status: string) {
    for (const id of selected) saves.queue(id, { availability: status as never });
    say('ok', `Set ${selected.size} ${selected.size === 1 ? 'dish' : 'dishes'} to ${AVAILABILITY_LABEL[status]?.en ?? status}`);
  }

  async function addDish(name: string, price: string, availability: string, categoryId: string, newSection: string) {
    const withNewSection = categoryId === NEW_SECTION;
    setBusy(true);
    const result = await createDishAction(businessId, {
      categoryId: withNewSection ? null : categoryId,
      newSection: withNewSection ? newSection : null,
      nameAr: name,
      price,
      availability: availability as 'AVAILABLE',
    });
    setBusy(false);
    if (!result.ok) {
      say('error', result.error);
      return;
    }
    // A new section arrives with the refresh; an existing one shows the dish at once.
    if (!withNewSection) {
      setMenus((current) =>
        current.map((menu) => ({
          ...menu,
          sections: menu.sections.map((section) =>
            section.id === categoryId
              ? { ...section, dishes: [...section.dishes, { ...result.item, imageUrl: null, choices: 0 }] }
              : section,
          ),
        })),
      );
    }
    saves.seed(result.item.id, result.item.updatedAt);
    setCreating(false);
    setNewDishName('');
    setDrawerId(result.item.id);
    say('ok', withNewSection ? 'Dish and section added. Fill in the rest on the right.' : 'Dish added. Fill in the rest on the right.');
    router.refresh();
  }

  async function addSection(nameAr: string, nameEn: string, menuId: string) {
    setBusy(true);
    const result = await createSectionAction(businessId, { nameAr, nameEn, menuId: menuId || null });
    setBusy(false);
    if (!result.ok) {
      say('error', result.error);
      return;
    }
    setAddingSection(false);
    say('ok', result.message);
    router.refresh();
  }

  async function removeSection(sectionId: string, name: string) {
    if (!window.confirm(`حذف القسم «${name}»؟ · Delete the section “${name}”?`)) return;
    setBusy(true);
    const result = await deleteSectionAction(businessId, sectionId);
    setBusy(false);
    if (!result.ok) {
      say('error', result.error);
      return;
    }
    setActiveSection('all');
    say('ok', result.message);
    router.refresh();
  }

  const allSections = menus.flatMap((menu) => menu.sections);
  const firstSectionId = allSections[0]?.id ?? '';
  const noSections = allSections.length === 0;
  const activeSectionRow = activeSection !== 'all' ? allSections.find((section) => section.id === activeSection) : undefined;
  const hasDeletedMenu = view.deleted.some((record) => record.kind === 'MENU' && !record.restoredAt);

  function openAddDish() {
    setDishSection(activeSection !== 'all' && activeSectionRow ? activeSection : firstSectionId || NEW_SECTION);
    setCreating(true);
  }

  /** Saves a menu's section order, showing it at once and putting it back if the save fails. */
  async function saveSectionOrder(menuId: string, ids: string[]) {
    const previous = menus;
    setMenus((current) =>
      current.map((menu) =>
        menu.id !== menuId
          ? menu
          : { ...menu, sections: ids.flatMap((id) => menu.sections.filter((section) => section.id === id)) },
      ),
    );
    const result = await reorderSectionsAction(businessId, menuId, ids);
    if (!result.ok) {
      setMenus(previous);
      say('error', `${result.error} The order was put back.`);
    } else {
      say('ok', 'ترتيب الأقسام محفوظ · Section order saved');
    }
  }

  function moveSection(sectionId: string, delta: -1 | 1) {
    const menu = menus.find((candidate) => candidate.sections.some((section) => section.id === sectionId));
    if (!menu) return;
    const ids = menu.sections.map((section) => section.id);
    const index = ids.indexOf(sectionId);
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    void saveSectionOrder(menu.id, ids);
  }

  /** Drops the dragged section in the place of the one it lands on. */
  function dropSectionOn(targetId: string) {
    const dragged = dragSection;
    setDragSection(null);
    if (!dragged || dragged === targetId) return;
    const menu = menus.find((candidate) => candidate.sections.some((section) => section.id === targetId));
    if (!menu || !menu.sections.some((section) => section.id === dragged)) {
      say('error', 'الأقسام تُرتب داخل المنيو نفسه · Sections are arranged within their own menu.');
      return;
    }
    const ids = menu.sections.map((section) => section.id).filter((id) => id !== dragged);
    ids.splice(ids.indexOf(targetId), 0, dragged);
    void saveSectionOrder(menu.id, ids);
  }

  async function toggleSection(sectionId: string, visible: boolean) {
    const flip = (value: boolean) =>
      setMenus((current) =>
        current.map((menu) => ({
          ...menu,
          sections: menu.sections.map((section) => (section.id === sectionId ? { ...section, visible: value } : section)),
        })),
      );
    flip(visible);
    const result = await setSectionVisibleAction(businessId, sectionId, visible);
    if (result.ok) {
      say('ok', result.message);
    } else {
      flip(!visible);
      say('error', result.error);
    }
  }

  /** A dish dragged onto a section in the list moves there. */
  async function moveDishToSection(dishId: string, sectionId: string) {
    setDragId(null);
    setDropTarget(null);
    const from = allSections.find((section) => section.dishes.some((dish) => dish.id === dishId));
    const to = allSections.find((section) => section.id === sectionId);
    if (!from || !to || from.id === to.id) return;
    const moved = from.dishes.find((dish) => dish.id === dishId)!;
    setBusy(true);
    const result = await moveDishesAction(businessId, [dishId], sectionId);
    setBusy(false);
    if (!result.ok) {
      say('error', result.error);
      return;
    }
    setMenus((current) =>
      current.map((menu) => ({
        ...menu,
        sections: menu.sections.map((section) =>
          section.id === from.id
            ? { ...section, dishes: section.dishes.filter((dish) => dish.id !== dishId) }
            : section.id === to.id
              ? { ...section, dishes: [...section.dishes, { ...moved, categoryId: to.id }] }
              : section,
        ),
      })),
    );
    say('ok', `نُقل «${moved.nameAr}» إلى «${to.nameAr}» · Moved`);
    router.refresh();
  }

  return (
    <div className="mg" data-manage>
      {!online ? (
        <p className="mg__banner mg__banner--warn" role="status">
          You are offline. Edits stay on this screen and save when the connection returns.
        </p>
      ) : null}

      <header className="mg__top">
        <div className="mg__title">
          <h2>المنيو والأصناف</h2>
          <p className="admin__hint">Menu &amp; dishes · {counts.total} dishes · {counts.available} available · {counts.out} out · {counts.hidden} hidden</p>
        </div>
        <div className="mg__actions">
          {view.canEdit ? (
            <>
              <button type="button" className="admin__button" onClick={openAddDish}>
                + إضافة صنف · Add dish
              </button>
              <button type="button" className="admin__button admin__button--secondary" onClick={() => setAddingSection(true)}>
                + إضافة قسم · Add section
              </button>
            </>
          ) : null}
          <Link className="admin__button admin__button--secondary" href={`/admin/businesses/${businessId}/data`}>
            استيراد من إكسل · Import from Excel
          </Link>
          <button type="button" className="admin__button admin__button--secondary" onClick={() => setMenuManagerOpen(true)}>
            المنيوهات والمحذوفات · Menus &amp; deleted
          </button>
        </div>
      </header>

      <div className="mg__filters" role="toolbar" aria-label="Filter dishes">
        <label className="mg__search">
          <span className="admin__hint">بحث · Search</span>
          <input
            type="search"
            className="admin__input"
            placeholder="الاسم أو الكود · name or code"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <label>
          <span className="admin__hint">المنيو · Menu</span>
          <select className="admin__select" value={activeMenu} onChange={(event) => { setActiveMenu(event.target.value); setActiveSection('all'); }}>
            <option value="all">كل المنيوهات · All menus</option>
            {menus.map((menu) => (
              <option key={menu.id} value={menu.id}>{menu.title}{menu.isLive ? ' · live' : ''}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="admin__hint">التوفر · Availability</span>
          <select className="admin__select" value={availabilityFilter} onChange={(event) => setAvailabilityFilter(event.target.value)}>
            <option value="all">الكل · All</option>
            {Object.keys(AVAILABILITY_LABEL).map((key) => (
              <option key={key} value={key}>{AVAILABILITY_LABEL[key]!.ar} · {AVAILABILITY_LABEL[key]!.en}</option>
            ))}
          </select>
        </label>
        <div className="mg__view" role="group" aria-label="View">
          <button type="button" aria-pressed={mode === 'table'} className={mode === 'table' ? 'is-on' : ''} onClick={() => setMode('table')}>جدول · Table</button>
          <button type="button" aria-pressed={mode === 'cards'} className={mode === 'cards' ? 'is-on' : ''} onClick={() => setMode('cards')}>بطاقات · Cards</button>
        </div>
      </div>

      {notice ? (
        <p className={`admin__message admin__message--${notice.kind === 'ok' ? 'ok' : 'error'} mg__notice`} role={notice.kind === 'ok' ? 'status' : 'alert'}>
          {notice.text}
          <button type="button" className="mg__dismiss" onClick={() => setNotice(null)} aria-label="Dismiss">×</button>
        </p>
      ) : null}

      <div className={`mg__body${drawerDish && drawerSection ? ' has-drawer' : ''}`}>
        <nav className="mg__sections" aria-label="Sections">
          <button type="button" className={activeSection === 'all' ? 'is-on' : ''} onClick={() => setActiveSection('all')}>
            كل الأقسام · All sections <span>{visible.length}</span>
          </button>
          {view.canEdit && allSections.length > 0 ? (
            <button type="button" className="mg__arrange" aria-pressed={arranging} onClick={() => setArranging((on) => !on)}>
              {arranging ? 'تم · Done' : 'ترتيب وإظهار الأقسام · Arrange sections'}
            </button>
          ) : null}
          {sections.map((section) => {
            const count = rows.filter((row) => row.dish && section.dishes.some((d) => d.id === row.dish.id)).length;
            return (
              <button
                key={section.id}
                type="button"
                className={`${activeSection === section.id ? 'is-on' : ''}${dragId && dropTarget === section.id ? ' is-drop' : ''}${section.visible ? '' : ' is-hidden'}`}
                onClick={() => setActiveSection(section.id)}
                onDragOver={(event) => { if (dragId) { event.preventDefault(); setDropTarget(section.id); } }}
                onDragLeave={() => setDropTarget((current) => (current === section.id ? null : current))}
                onDrop={(event) => { event.preventDefault(); if (dragId) void moveDishToSection(dragId, section.id); }}
                data-drop-section={section.key}
                data-section-menu={section.menuId}
              >
                {section.nameAr}
                {section.nameEn ? <span className="mg__en"> · {section.nameEn}</span> : null}
                {section.visible ? null : <em className="mg__hidden-tag"> · مخفي</em>}
                <span>{count}</span>
              </button>
            );
          })}
          {reorderOn && view.canEdit && !arranging ? (
            <p className="mg__drop-hint">لنقل صنف إلى قسم آخر، اسحبه إلى اسم القسم هنا. · To move a dish, drag it onto a section here.</p>
          ) : null}
          {view.canEdit ? (
            <button type="button" className="mg__add-section" onClick={() => setAddingSection(true)}>
              + قسم جديد · New section
            </button>
          ) : null}
          {view.canEdit && activeSectionRow && activeSectionRow.dishes.length === 0 ? (
            <button
              type="button"
              className="mg__remove-section"
              disabled={busy}
              onClick={() => void removeSection(activeSectionRow.id, activeSectionRow.nameAr)}
            >
              حذف هذا القسم الفارغ · Delete this empty section
            </button>
          ) : null}
        </nav>

        <section className="mg__list" aria-label="Dishes">
          {arranging ? (
            <div className="mg__arranger" data-arranger="">
              <div className="mg__arranger-head">
                <div>
                  <h3>ترتيب الأقسام وإظهارها · Arrange sections</h3>
                  <p className="admin__hint">
                    اسحب القسم إلى مكانه أو استخدم ▲▼. القسم المخفي لا يراه العملاء ويبقى بأطباقه. · Drag a section or use ▲▼.
                    A hidden section keeps its dishes.
                  </p>
                </div>
                <button type="button" className="admin__button" onClick={() => setArranging(false)}>تم · Done</button>
              </div>
              {menus
                .filter((menu) => activeMenu === 'all' || menu.id === activeMenu)
                .map((menu) => (
                  <div key={menu.id} className="mg__arranger-menu">
                    {menus.length > 1 ? <h4>{menu.title}</h4> : null}
                    <ol className="mg__arranger-list">
                      {menu.sections.map((section, index) => (
                        <li
                          key={section.id}
                          className={`mg__section-row${dragSection === section.id ? ' is-dragging' : ''}${section.visible ? '' : ' is-hidden'}`}
                          draggable
                          onDragStart={() => setDragSection(section.id)}
                          onDragEnd={() => setDragSection(null)}
                          onDragOver={(event) => { if (dragSection) event.preventDefault(); }}
                          onDrop={(event) => { event.preventDefault(); dropSectionOn(section.id); }}
                          data-section-row={section.key}
                          data-section-menu={menu.id}
                          data-section-name={section.nameAr}
                        >
                          <span className="mg__grip" aria-hidden="true">⋮⋮</span>
                          <span className="mg__section-label">
                            <strong>{section.nameAr}</strong>
                            {section.nameEn ? <span className="mg__en">{section.nameEn}</span> : null}
                            <span className="mg__section-meta">
                              {section.dishes.length} {section.dishes.length === 1 ? 'صنف' : 'أصناف'}
                              {section.visible ? '' : ' · مخفي من المنيو'}
                            </span>
                          </span>
                          <span className="mg__section-tools">
                            <button type="button" className="mg__icon" aria-label={`Move ${section.nameAr} up`} disabled={index === 0} onClick={() => moveSection(section.id, -1)}>▲</button>
                            <button type="button" className="mg__icon" aria-label={`Move ${section.nameAr} down`} disabled={index === menu.sections.length - 1} onClick={() => moveSection(section.id, 1)}>▼</button>
                            <button type="button" className="mg__eye" data-hidden={section.visible ? 'false' : 'true'} aria-label={`${section.visible ? 'Hide' : 'Show'} ${section.nameAr}`} onClick={() => void toggleSection(section.id, !section.visible)}>
                              {section.visible ? 'إخفاء · Hide' : 'إظهار · Show'}
                            </button>
                          </span>
                        </li>
                      ))}
                    </ol>
                  </div>
                ))}
            </div>
          ) : noSections ? (
            <div className="mg__start" data-manage-start="">
              <h3>ابدأ منيو مطعمك · Start your menu</h3>
              <p className="admin__hint">
                أضف قسماً ثم أطباقه، أو ارفع ملف إكسل فيه كل الأصناف بأقسامها. لا تحتاج لإنشاء منيو أولاً: يُنشأ تلقائياً.
                · Add a section and its dishes, or upload a spreadsheet. The menu is created for you.
              </p>
              {view.canEdit ? (
                <div className="admin__actions mg__start-actions">
                  <button type="button" className="admin__button" onClick={() => setAddingSection(true)}>
                    + أضف قسماً · Add a section
                  </button>
                  <button type="button" className="admin__button admin__button--secondary" onClick={openAddDish}>
                    + أضف صنفاً · Add a dish
                  </button>
                  <Link className="admin__button admin__button--secondary" href={`/admin/businesses/${businessId}/data`}>
                    ارفع ملف إكسل · Upload Excel
                  </Link>
                </div>
              ) : null}
              {hasDeletedMenu ? (
                <p className="admin__hint">
                  حذفت منيو سابقاً؟ يمكن استعادته كما كان. · Deleted a menu before? It can be restored as it was.{' '}
                  <button type="button" className="mg__linkish" onClick={() => setMenuManagerOpen(true)}>
                    استعادة المنيو · Restore it
                  </button>
                </p>
              ) : null}
            </div>
          ) : visible.length === 0 ? (
            <p className="admin__empty">
              {rows.length === 0 ? 'No dishes yet. Add one, or import a spreadsheet.' : 'No dish matches these filters.'}
            </p>
          ) : mode === 'table' ? (
            <div className="admin__table-scroll">
              <table className="admin__table mg__table">
                <thead>
                  <tr>
                    <th scope="col"><span className="visually-hidden">تحديد · Select</span></th>
                    <th scope="col">الصنف · Dish</th>
                    <th scope="col" className="mg__col-section">القسم · Section</th>
                    <th scope="col">السعر · Price</th>
                    <th scope="col">التوفر · Availability</th>
                    <th scope="col">إجراءات · Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((row) => (
                    <DishRowTable
                      key={row.dish.id}
                      row={row}
                      view={view}
                      saves={saves}
                      selected={selected.has(row.dish.id)}
                      reorderOn={reorderOn}
                      dragging={dragId === row.dish.id}
                      onToggle={() => toggle(row.dish.id)}
                      onOpen={() => setDrawerId(row.dish.id)}
                      onMove={(delta) => moveBy(row.dish.id, delta)}
                      onDelete={() => setConfirmDelete([row.dish.id])}
                      onDragStart={() => setDragId(row.dish.id)}
                      onDragEnd={() => setDragId(null)}
                      onDrop={() => dropOn(row.dish.id)}
                      currency={view.currency}
                      onTakeTheirs={takeTheirs}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <ul className="mg__cards">
              {visible.map((row) => (
                <DishCard
                  key={row.dish.id}
                  row={row}
                  view={view}
                  saves={saves}
                  selected={selected.has(row.dish.id)}
                  onToggle={() => toggle(row.dish.id)}
                  onOpen={() => setDrawerId(row.dish.id)}
                  onMove={(delta) => moveBy(row.dish.id, delta)}
                  onDelete={() => setConfirmDelete([row.dish.id])}
                  currency={view.currency}
                  onTakeTheirs={takeTheirs}
                />
              ))}
            </ul>
          )}
        </section>
      {drawerDish && drawerSection ? (
        <DishDrawer
          key={drawerDish.dish.id}
          businessId={businessId}
          publicId={view.publicId}
          dish={drawerDish.dish}
          sectionId={drawerSection.id}
          sections={menus.flatMap((menu) => menu.sections.map((section) => ({ id: section.id, label: `${section.nameAr}${section.nameEn ? ` · ${section.nameEn}` : ''}`, menuTitle: menu.title })))}
          canEdit={view.canEdit}
          canManage={view.canManage}
          currency={view.currency}
          media={view.media}
          picker={picker}
          saves={saves}
          onClose={() => setDrawerId(null)}
          onMoved={() => router.refresh()}
          onDeleted={() => { setDrawerId(null); router.refresh(); }}
          onDuplicated={() => { router.refresh(); }}
          onNotice={say}
        revision={revision}
          onTakeTheirs={takeTheirs}
        />
      ) : null}
      </div>

      {selected.size > 0 ? (
        <div className="mg__bulk" role="region" aria-label="Selected dishes">
          <strong>{selected.size} مختار · selected</strong>
          {view.canEdit ? (
            <>
              <button type="button" className="admin__button admin__button--secondary" onClick={() => setAvailabilityOfSelected('AVAILABLE')}>متوفر · Available</button>
              <button type="button" className="admin__button admin__button--secondary" onClick={() => setAvailabilityOfSelected('UNAVAILABLE')}>غير متوفر · Out</button>
              <button type="button" className="admin__button admin__button--secondary" onClick={() => setAvailabilityOfSelected('HIDDEN')}>إخفاء · Hide</button>
              <label className="mg__inline">
                <span className="visually-hidden">نقل إلى قسم · Move to section</span>
                <select className="admin__select" value={moveTarget} onChange={(event) => setMoveTarget(event.target.value)}>
                  <option value="">نقل إلى · Move to…</option>
                  {menus.flatMap((menu) => menu.sections).map((section) => (
                    <option key={section.id} value={section.id}>{section.nameAr}</option>
                  ))}
                </select>
              </label>
              <button type="button" className="admin__button admin__button--secondary" disabled={!moveTarget || busy} onClick={moveSelected}>نقل · Move</button>
              <button type="button" className="admin__button admin__button--secondary" disabled={!moveTarget || busy} onClick={copySelected}>نسخ · Copy</button>
            </>
          ) : null}
          {view.canManage ? (
            <button type="button" className="admin__button admin__button--danger" onClick={() => setConfirmDelete([...selected])}>
              حذف · Delete
            </button>
          ) : null}
          <button type="button" className="admin__button admin__button--secondary" onClick={() => setSelected(new Set())}>إلغاء · Clear</button>
        </div>
      ) : null}

      {confirmDelete ? (
        <DeleteConfirm
          names={confirmDelete.map((id) => rows.find((row) => row.dish.id === id)?.dish.nameEn ?? rows.find((row) => row.dish.id === id)?.dish.nameAr ?? id)}
          busy={busy}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => void deleteSelected(confirmDelete)}
        />
      ) : null}

      {creating ? (
        <div className="mg__sheet" role="dialog" aria-modal="true" aria-label="Add a dish" onKeyDown={(event) => { if (event.key === 'Escape') setCreating(false); }}>
          <form
            className="mg__sheet-card"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              void addDish(
                String(form.get('nameAr') ?? '').trim(),
                String(form.get('price') ?? ''),
                String(form.get('availability') ?? 'AVAILABLE'),
                dishSection || NEW_SECTION,
                String(form.get('newSection') ?? '').trim(),
              );
            }}
          >
            <h3>إضافة صنف · Add a dish</h3>
            <label className="admin__field">
              <span className="admin__label">الاسم بالعربي · Name (Arabic)</span>
              <input name="nameAr" className="admin__input" required maxLength={120} value={newDishName} onChange={(event) => setNewDishName(event.target.value)} />
            </label>
            <label className="admin__field">
              <span className="admin__label">السعر · Price</span>
              <input name="price" className="admin__input" inputMode="decimal" placeholder="0.00" />
            </label>
            <label className="admin__field">
              <span className="admin__label">القسم · Section</span>
              <select name="section" className="admin__select" value={dishSection || NEW_SECTION} onChange={(event) => setDishSection(event.target.value)}>
                {allSections.map((section) => (
                  <option key={section.id} value={section.id}>{section.nameAr}{section.nameEn ? ` · ${section.nameEn}` : ''}</option>
                ))}
                <option value={NEW_SECTION}>＋ قسم جديد… · New section…</option>
              </select>
            </label>
            {(dishSection || NEW_SECTION) === NEW_SECTION ? (
              <label className="admin__field">
                <span className="admin__label">اسم القسم الجديد · New section name</span>
                <input name="newSection" className="admin__input" required maxLength={120} placeholder="مثال: المشويات · e.g. Grills" />
              </label>
            ) : null}
            <label className="admin__field">
              <span className="admin__label">التوفر · Availability</span>
              <select name="availability" className="admin__select" defaultValue="AVAILABLE">
                <option value="AVAILABLE">متوفر · Available</option>
                <option value="UNAVAILABLE">غير متوفر الآن · Out right now</option>
                <option value="HIDDEN">مخفي من المنيو · Hidden</option>
              </select>
            </label>
            <div className="admin__actions">
              <button type="button" className="admin__button admin__button--secondary" onClick={() => setCreating(false)}>إلغاء · Cancel</button>
              <button type="submit" className="admin__button" disabled={busy}>إضافة · Add</button>
            </div>
          </form>
        </div>
      ) : null}


      {addingSection ? (
        <div className="mg__sheet" role="dialog" aria-modal="true" aria-label="Add a section" onKeyDown={(event) => { if (event.key === 'Escape') setAddingSection(false); }}>
          <form
            className="mg__sheet-card"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              void addSection(
                String(form.get('sectionAr') ?? '').trim(),
                String(form.get('sectionEn') ?? '').trim(),
                String(form.get('sectionMenu') ?? ''),
              );
            }}
          >
            <h3>إضافة قسم · Add a section</h3>
            <p className="admin__hint">
              مثل: المشويات، المشروبات، الحلويات.{menus.length === 0 ? ' سيُنشأ المنيو تلقائياً.' : ''} · For example: Grills, Drinks, Desserts.
            </p>
            <label className="admin__field">
              <span className="admin__label">اسم القسم بالعربي · Section name (Arabic)</span>
              <input name="sectionAr" className="admin__input" required maxLength={120} />
            </label>
            <label className="admin__field">
              <span className="admin__label">بالإنجليزي (اختياري) · English (optional)</span>
              <input name="sectionEn" className="admin__input" maxLength={120} />
            </label>
            {menus.length > 1 ? (
              <label className="admin__field">
                <span className="admin__label">المنيو · Menu</span>
                <select name="sectionMenu" className="admin__select" defaultValue={activeMenu !== 'all' ? activeMenu : menus[0]?.id}>
                  {menus.map((menu) => (
                    <option key={menu.id} value={menu.id}>{menu.title}</option>
                  ))}
                </select>
              </label>
            ) : null}
            <div className="admin__actions">
              <button type="button" className="admin__button admin__button--secondary" onClick={() => setAddingSection(false)}>إلغاء · Cancel</button>
              <button type="submit" className="admin__button" disabled={busy}>إضافة القسم · Add section</button>
            </div>
          </form>
        </div>
      ) : null}

      {menuManagerOpen ? (
        <MenuManager
          businessId={businessId}
          publicId={view.publicId}
          menus={menus}
          deleted={view.deleted}
          canManage={view.canManage}
          onClose={() => setMenuManagerOpen(false)}
          onNotice={say}
          onChanged={() => router.refresh()}
        />
      ) : null}
    </div>
  );
}

function StatusBadge({ status, error, onRetry }: { status: SaveStatus; error: string | null; onRetry: () => void }) {
  const label = STATUS_LABEL[status];
  if (!label) return null;
  return (
    <span className={`mg__status mg__status--${status}`} role={status === 'error' || status === 'conflict' ? 'alert' : 'status'} aria-live="polite">
      {label.ar} · {label.en}
      {status === 'error' ? (
        <>
          <span className="mg__status-detail"> — {error ?? 'Try again.'}</span>
          <button type="button" className="mg__retry" onClick={onRetry}>إعادة المحاولة · Retry</button>
        </>
      ) : null}
    </span>
  );
}

function PriceField({
  dishId,
  priceMinor,
  currency,
  saves,
  disabled,
}: {
  dishId: string;
  priceMinor: number | null;
  currency: string;
  saves: ReturnType<typeof useDishSaves>;
  disabled: boolean;
}) {
  const initial = priceMinor === null ? '' : formatMinorAsDecimal(priceMinor, currency);
  const [text, setText] = useState(initial);
  const [lastInitial, setLastInitial] = useState(initial);
  if (initial !== lastInitial) {
    setLastInitial(initial);
    setText(initial);
  }

  function commit() {
    const next = text.trim();
    if (next === initial.trim()) return;
    if (next !== '' && parsePriceToMinor(next, currency) === null) {
      setText(initial);
      return;
    }
    saves.queue(dishId, { price: next });
  }

  return (
    <span className="mg__price">
      <input
        className="admin__input mg__price-input"
        inputMode="decimal"
        aria-label="Price"
        value={text}
        disabled={disabled}
        onChange={(event) => setText(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') (event.target as HTMLInputElement).blur();
          if (event.key === 'Escape') setText(initial);
        }}
        placeholder="—"
      />
      <span className="mg__cur">{currency}</span>
    </span>
  );
}

/**
 * One click turns a dish on or off the menu. Hidden and seasonal are set in the
 * editor, where the owner can see what they mean; the toggle shows them as they are.
 */
function AvailabilityToggle({
  dishId,
  value,
  saves,
  disabled,
}: {
  dishId: string;
  value: string;
  saves: ReturnType<typeof useDishSaves>;
  disabled: boolean;
}) {
  const on = value === 'AVAILABLE';
  const label = on
    ? 'متوفر · Available'
    : value === 'HIDDEN'
      ? 'مخفي · Hidden'
      : value === 'SEASONAL'
        ? 'موسمي · Seasonal'
        : 'غير متوفر · Out';
  return (
    <button
      type="button"
      className="mg__toggle"
      aria-pressed={on}
      disabled={disabled}
      onClick={() => saves.queue(dishId, { availability: on ? 'UNAVAILABLE' : 'AVAILABLE' })}
    >
      {label}
    </button>
  );
}

interface RowProps {
  row: Row;
  view: ManageView;
  saves: ReturnType<typeof useDishSaves>;
  selected: boolean;
  onToggle: () => void;
  onOpen: () => void;
  onMove: (delta: -1 | 1) => void;
  onDelete: () => void;
  currency: string;
  onTakeTheirs: (id: string) => void;
}

function DishRowTable(
  props: RowProps & {
    reorderOn: boolean;
    dragging: boolean;
    onDragStart: () => void;
    onDragEnd: () => void;
    onDrop: () => void;
  },
) {
  const { row, view, saves, selected, reorderOn, dragging, onToggle, onOpen, onMove, onDelete, onDragStart, onDragEnd, onDrop, currency } = props;
  const dish = row.dish;
  const status = saves.statusOf(dish.id);
  return (
    <tr
      data-dish-row={dish.itemCode}
      className={`${dragging ? 'is-dragging ' : ''}${status === 'conflict' ? 'is-conflict' : ''}`}
      draggable={reorderOn && view.canEdit}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={(event) => { if (reorderOn) event.preventDefault(); }}
      onDrop={(event) => { event.preventDefault(); if (reorderOn) onDrop(); }}
    >
      <td>
        <input type="checkbox" checked={selected} onChange={onToggle} aria-label={`Select ${dish.nameEn ?? dish.nameAr}`} />
      </td>
      <td>
        <div className="mg__dish">
          <Thumb url={dish.imageUrl} name={dish.nameEn ?? dish.nameAr} />
          <div>
            <button type="button" className="mg__name" onClick={onOpen}>
              <span className="mg__name-ar">{dish.nameAr}</span>
              {dish.nameEn ? <span className="mg__name-en">{dish.nameEn}</span> : null}
            </button>
            <span className="mg__code">{dish.itemCode}{dish.choices > 0 ? ` · ${dish.choices} choice${dish.choices > 1 ? 's' : ''}` : ''}</span>
          </div>
        </div>
      </td>
      <td className="mg__muted mg__col-section">{row.sectionName}</td>
      <td>
        <PriceField dishId={dish.id} priceMinor={dish.priceMinor} currency={currency} saves={saves} disabled={!view.canEdit} />
      </td>
      <td>
        <AvailabilityToggle dishId={dish.id} value={dish.availability} saves={saves} disabled={!view.canEdit} />
        <StatusBadge status={status} error={saves.errorOf(dish.id)} onRetry={() => saves.retry(dish.id)} />
        {status === 'conflict' ? <ConflictNote dishId={dish.id} saves={saves} onTake={() => props.onTakeTheirs(dish.id)} /> : null}
      </td>
      <td>
        <div className="mg__row-actions">
          <button type="button" className="admin__button admin__button--secondary" onClick={onOpen}>تعديل · Edit</button>
          {view.canEdit ? (
            <>
              <button type="button" className="mg__icon" onClick={() => onMove(-1)} aria-label="Move up">▲</button>
              <button type="button" className="mg__icon" onClick={() => onMove(1)} aria-label="Move down">▼</button>
              <HideButton dishId={dish.id} availability={dish.availability} saves={saves} />
            </>
          ) : null}
          {view.canManage ? (
            <button type="button" className="mg__icon mg__icon--danger" onClick={onDelete} aria-label={`Delete ${dish.nameEn ?? dish.nameAr}`}>🗑</button>
          ) : null}
        </div>
      </td>
    </tr>
  );
}

function DishCard(props: RowProps) {
  const { row, view, saves, selected, onToggle, onOpen, onMove, onDelete, currency } = props;
  const dish = row.dish;
  const status = saves.statusOf(dish.id);
  return (
    <li className={`mg__card ${selected ? 'is-selected' : ''}`} data-dish-row={dish.itemCode}>
      <label className="mg__card-check">
        <input type="checkbox" checked={selected} onChange={onToggle} aria-label={`Select ${dish.nameEn ?? dish.nameAr}`} />
      </label>
      <button type="button" className="mg__card-media" onClick={onOpen} aria-label={`Edit ${dish.nameEn ?? dish.nameAr}`}>
        <Thumb url={dish.imageUrl} name={dish.nameEn ?? dish.nameAr} large />
      </button>
      <div className="mg__card-body">
        <button type="button" className="mg__name" onClick={onOpen}>
          <span className="mg__name-ar">{dish.nameAr}</span>
          {dish.nameEn ? <span className="mg__name-en">{dish.nameEn}</span> : null}
        </button>
        <span className="mg__code">{row.sectionName} · {dish.itemCode}</span>
        <div className="mg__card-row">
          <PriceField dishId={dish.id} priceMinor={dish.priceMinor} currency={currency} saves={saves} disabled={!view.canEdit} />
          <AvailabilityToggle dishId={dish.id} value={dish.availability} saves={saves} disabled={!view.canEdit} />
        </div>
        <StatusBadge status={status} error={saves.errorOf(dish.id)} onRetry={() => saves.retry(dish.id)} />
        {status === 'conflict' ? <ConflictNote dishId={dish.id} saves={saves} onTake={() => props.onTakeTheirs(dish.id)} /> : null}
        <div className="mg__row-actions">
          <button type="button" className="admin__button admin__button--secondary" onClick={onOpen}>تعديل · Edit</button>
          {view.canEdit ? (
            <>
              <button type="button" className="mg__icon" onClick={() => onMove(-1)} aria-label="Move up">▲</button>
              <button type="button" className="mg__icon" onClick={() => onMove(1)} aria-label="Move down">▼</button>
              <HideButton dishId={dish.id} availability={dish.availability} saves={saves} />
            </>
          ) : null}
          {view.canManage ? (
            <button type="button" className="mg__icon mg__icon--danger" onClick={onDelete} aria-label={`Delete ${dish.nameEn ?? dish.nameAr}`}>🗑</button>
          ) : null}
        </div>
      </div>
    </li>
  );
}

function Thumb({ url, name, large = false }: { url: string | null; name: string; large?: boolean }) {
  const size = large ? 'mg__thumb mg__thumb--large' : 'mg__thumb';
  if (!url) return <span className={`${size} mg__thumb--empty`} aria-hidden="true">{name.slice(0, 1).toUpperCase()}</span>;
  return (
    // Thumbnails are the owner's own uploads; their URLs are already public.
    // eslint-disable-next-line @next/next/no-img-element
    <img className={size} src={url} alt="" loading="lazy" />
  );
}

function ConflictNote({ dishId, saves, onTake }: { dishId: string; saves: ReturnType<typeof useDishSaves>; onTake: () => void }) {
  return (
    <span className="mg__conflict" role="alert">
      <span>تغيّر هذا الصنف في مكان آخر، ولم نحفظ تعديلك. · This dish was changed elsewhere; your edit was not saved.</span>
      <button type="button" className="mg__retry" onClick={onTake}>أخذ النسخة الحالية · Use theirs</button>
      <button type="button" className="mg__retry" onClick={() => saves.keepMine(dishId)}>الإبقاء على تعديلي · Keep mine</button>
    </span>
  );
}

function DeleteConfirm({
  names,
  busy,
  onCancel,
  onConfirm,
}: {
  names: string[];
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="mg__sheet" role="dialog" aria-modal="true" aria-label="Confirm delete" onKeyDown={(event) => { if (event.key === 'Escape') onCancel(); }}>
      <div className="mg__sheet-card">
        <h3>حذف {names.length} {names.length === 1 ? 'صنف' : 'أصناف'} · Delete {names.length} {names.length === 1 ? 'dish' : 'dishes'}?</h3>
        <ul className="mg__names">
          {names.slice(0, 12).map((name, index) => (<li key={`${name}-${index}`}>{name}</li>))}
          {names.length > 12 ? <li>+ {names.length - 12} more</li> : null}
        </ul>
        <p className="admin__hint">
          يمكنك استعادتها من «المنيوهات والمحذوفات». · You can restore them from “Menus &amp; deleted”.
        </p>
        <div className="admin__actions">
          <button type="button" className="admin__button admin__button--secondary" onClick={onCancel} autoFocus>إلغاء · Cancel</button>
          <button type="button" className="admin__button admin__button--danger" onClick={onConfirm} disabled={busy}>حذف · Delete</button>
        </div>
      </div>
    </div>
  );
}

/** One click takes a dish off the public menu, or puts it back on. */
function HideButton({
  dishId,
  availability,
  saves,
}: {
  dishId: string;
  availability: string;
  saves: ReturnType<typeof useDishSaves>;
}) {
  const hidden = availability === 'HIDDEN';
  return (
    <button
      type="button"
      className="mg__eye"
      data-hidden={hidden ? 'true' : 'false'}
      onClick={() => saves.queue(dishId, { availability: hidden ? 'AVAILABLE' : 'HIDDEN' })}
    >
      {hidden ? 'إظهار · Show' : 'إخفاء · Hide'}
    </button>
  );
}
