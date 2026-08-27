'use client';

import { useState } from 'react';
import { ActionForm } from '../../../components';
import type { ActionState } from '@/server/admin/actions';

interface TemplateOption {
  key: string;
  label: string;
  description: string;
  variants: { key: string; label: string; description: string }[];
}

/**
 * Template and variant selection.
 *
 * Family and variant are dependent choices, so the variant list narrows when
 * the family changes — the one piece of local state this screen needs.
 */
export function TemplateForm({
  templates,
  currentTemplate,
  currentVariant,
  action,
}: {
  templates: TemplateOption[];
  currentTemplate: string;
  currentVariant: string;
  action: (previous: ActionState, formData: FormData) => Promise<ActionState>;
}) {
  const [selectedKey, setSelectedKey] = useState(
    templates.some((template) => template.key === currentTemplate)
      ? currentTemplate
      : (templates[0]?.key ?? ''),
  );

  const selected = templates.find((template) => template.key === selectedKey);

  return (
    <ActionForm action={action} submitLabel="Apply template">
      {!templates.some((template) => template.key === currentTemplate) ? (
        <p className="admin__message admin__message--warning" role="status">
          This business is set to <code>{currentTemplate}</code>, which is no longer available.
          Visitors are being served the default family until you choose one.
        </p>
      ) : null}

      <div className="admin__field">
        <label className="admin__label" htmlFor="templateKey">
          Template family
        </label>
        <select
          id="templateKey"
          name="templateKey"
          className="admin__select"
          value={selectedKey}
          onChange={(event) => setSelectedKey(event.target.value)}
        >
          {templates.map((template) => (
            <option key={template.key} value={template.key}>
              {template.label}
            </option>
          ))}
        </select>
        {selected ? <span className="admin__hint">{selected.description}</span> : null}
      </div>

      <div className="admin__field">
        <label className="admin__label" htmlFor="variantKey">
          Layout variant
        </label>
        <select
          id="variantKey"
          name="variantKey"
          className="admin__select"
          defaultValue={currentVariant}
          key={selectedKey}
        >
          {(selected?.variants ?? []).map((variant) => (
            <option key={variant.key} value={variant.key}>
              {variant.label} — {variant.description}
            </option>
          ))}
        </select>
      </div>
    </ActionForm>
  );
}
