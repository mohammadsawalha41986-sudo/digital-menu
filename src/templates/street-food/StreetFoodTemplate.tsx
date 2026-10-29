import SabahApp from './sabah/SabahApp';
import { profileToSabah } from './profile-to-sabah';
import { renderQr } from '@/server/qr/service';
import type { PublicProfile } from '@/server/profile/types';
import type { Locale } from '@/i18n/config';
import type { TemplateRenderProps } from '../types';

/** The template's variants are its dish photo layouts. */
const IMAGE_LAYOUTS: Record<string, 'grid' | 'list' | 'large'> = { a: 'grid', b: 'list', c: 'large' };

/**
 * STREET FOOD — the Sabah El Lail reference app, hoisted into the templates
 * registry so it serves any restaurant whose `templateKey` is set to it.
 *
 * Composition: photo-led hero slides, a category chip rail with icons, a
 * photo-card grid with search and filters, an item customize sheet, a cart
 * drawer with WhatsApp handover, location with an embedded map, QR and
 * calories modals, and a decorated footer.
 *
 * Every restaurant-specific value (name, phone, WhatsApp number, logo,
 * address, dishes, hero slides, QR code) comes from the profile through
 * `profileToSabah`; none is read from the reference fixture.
 */
export function StreetFoodTemplate({ profile, locale }: TemplateRenderProps) {
  return <StreetFoodWithQr profile={profile} locale={locale} />;
}

async function StreetFoodWithQr({ profile, locale }: { profile: PublicProfile; locale: Locale }) {
  const { restaurantInfo, menuCategories, menuItems, logoUrl, slides } = profileToSabah(profile);

  // The QR encodes the permanent `/m/{publicId}` destination — the same one
  // printed on the restaurant's tables. A failure here must not take the menu
  // down, so the modal simply shows no code.
  const qrDataUri = await renderQr({ publicId: profile.publicId, sizePx: 300 })
    .then((qr) => `data:image/svg+xml;utf8,${encodeURIComponent(qr.svg)}`)
    .catch(() => null);

  return (
    <SabahApp
      restaurantInfo={restaurantInfo}
      menuCategories={menuCategories}
      menuItems={menuItems}
      logoUrl={logoUrl}
      slides={slides}
      qrDataUri={qrDataUri}
      imageLayout={IMAGE_LAYOUTS[profile.variantKey] ?? 'grid'}
      initialLang={locale}
    />
  );
}
