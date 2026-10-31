import Link from 'next/link';

/**
 * The option groups a dish takes (sizes, rice choice, extras, drinks), picked
 * from the groups the restaurant has made on the options page. The boxes post
 * with the dish: "Save dish" saves them with everything else on the card.
 */

export interface OptionGroupChoice {
  key: string;
  nameAr: string;
  nameEn: string;
  required: boolean;
  min: number;
  max: number;
  optionCount: number;
}

export function DishOptions({
  groups,
  href,
  chosen,
}: {
  groups: OptionGroupChoice[];
  href: string;
  chosen: string[];
}) {
  const rule = (group: OptionGroupChoice) => {
    const kind = group.required ? (group.min > 1 ? `إجباري · اختر ${group.min}` : 'إجباري · اختر واحداً') : 'اختياري';
    const up = group.max === 1 ? 'اختيار واحد' : `حتى ${group.max}`;
    return `${kind} · ${up}`;
  };

  return (
    <fieldset className="dish-options" aria-label="Options" data-dish-options="">
      <legend className="admin__label">الخيارات والإضافات · Options & add-ons</legend>
      {/* Marks that this form speaks for the dish's groups, so an empty
          selection clears them rather than leaving the old ones. */}
      <input type="hidden" name="modifiersPresent" value="1" />

      {groups.length === 0 ? (
        <p className="admin__hint">
          لا توجد مجموعات خيارات بعد. أنشئ الحجم أو نوع الرز أو الإضافات من{' '}
          <Link href={href}>صفحة الخيارات والإضافات</Link>، ثم ارجع هنا واختر ما يناسب الطبق. · No option groups yet: make them
          on the options page, then choose them here.
        </p>
      ) : (
        <>
          <p className="admin__hint">
            اختر المجموعات التي يأخذها هذا الطبق. لتعديل المجموعة نفسها، استخدم{' '}
            <Link href={href}>صفحة الخيارات</Link>. · Tick the groups this dish takes; edit a group on the options page.
          </p>
          <ul className="dish-options__list">
            {groups.map((group) => (
              <li key={group.key}>
                <label className="options__check">
                  <input
                    type="checkbox"
                    name="modifierKeys"
                    value={group.key}
                    defaultChecked={chosen.includes(group.key)}
                  />
                  <strong>{group.nameAr}</strong>
                  {group.nameEn ? <span className="admin__hint"> · {group.nameEn}</span> : null}
                  <span className="admin__hint"> — {rule(group)} · {group.optionCount} خيارات</span>
                </label>
              </li>
            ))}
          </ul>
        </>
      )}
    </fieldset>
  );
}
