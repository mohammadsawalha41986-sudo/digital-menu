import type { ReactNode } from 'react';

/**
 * The preview renders *only* the menu.
 *
 * It deliberately sits outside the dashboard route group: inside it, the
 * preview inherited the admin sidebar and navigation, so every style card in
 * the builder was showing a screenshot of the admin panel wrapped around a
 * sliver of menu. A preview that includes the tool it is previewed in is worse
 * than no preview.
 *
 * The gate that the dashboard layout would have provided is enforced by the
 * page itself: staff session, then tenant context, then a 404 for anything
 * else.
 */
export default function PreviewLayout({ children }: { children: ReactNode }) {
  return children;
}
