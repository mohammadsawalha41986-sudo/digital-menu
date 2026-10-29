'use client';

import { chooseStyleAction } from '@/server/admin/wizard-actions';
import { PhotoLayoutPicker, type PhotoLayout } from '../../../../photo-layout-picker';

/**
 * Step 3 — how dish photos are laid out.
 *
 * Every restaurant uses the same menu design; colours and fonts come from the
 * logo in step 2. What is left to choose is the photo layout.
 */
export function StyleStep({
  businessId,
  layouts,
  current,
}: {
  businessId: string;
  layouts: readonly PhotoLayout[];
  current: string;
}) {
  return (
    <div className="build__card">
      <h2 className="build__step-title">شكل عرض الصور · Photo layout</h2>
      <p className="build__lede">
        Each option below shows your own menu, with your logo and colours.
      </p>
      <PhotoLayoutPicker
        businessId={businessId}
        layouts={layouts}
        current={current}
        action={chooseStyleAction}
      />
    </div>
  );
}
