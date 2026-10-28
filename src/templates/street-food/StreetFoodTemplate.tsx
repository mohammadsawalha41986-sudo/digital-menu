import SabahApp from './sabah/SabahApp';
import { profileToSabah } from './profile-to-sabah';
import type { TemplateRenderProps } from '../types';

/**
 * STREET FOOD — the Sabah El Lail reference app, hoisted into the templates
 * registry so it serves any restaurant whose `templateKey` is set to it.
 *
 * Composition identity (the thing a staff member sees in the template
 * picker): a photo-led panoramic hero, a horizontally snap-scrolling
 * category chip rail with icons, 2/3/4-column vertical photo-card grid,
 * search + filter row with view-mode toggle, item customize sheet (options,
 * add-ons, spice level, notes), an in-page cart drawer with WhatsApp
 * handover, a customer reviews block, a Google Maps block with the
 * restaurant's address and a tall decorated footer. Every panel is the one
 * authored in the reference ZIP; this template is not a reinterpretation of
 * it.
 *
 * Why the whole app runs as a client component: the reference uses Framer
 * Motion scroll-reveals, a hydrated cart in `localStorage`, modal state,
 * search debounce, filter toggles and view-mode state — none of which a
 * server component owns. The template renders content into one `SabahApp`
 * mount and the app owns everything below it.
 */
export function StreetFoodTemplate({ profile, locale }: TemplateRenderProps) {
  const { restaurantInfo, menuCategories, menuItems } = profileToSabah(profile);

  return (
    <SabahApp
      restaurantInfo={restaurantInfo}
      menuCategories={menuCategories}
      menuItems={menuItems}
      initialLang={locale}
    />
  );
}
