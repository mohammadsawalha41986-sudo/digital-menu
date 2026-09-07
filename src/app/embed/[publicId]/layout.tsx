import type { ReactNode } from 'react';
import '../../embed.css';

/**
 * Embed shell.
 *
 * Everything that makes sense on a page of our own and no sense inside
 * someone else's: no page background painted over the host, no minimum
 * viewport height, no margin. The host decides the surrounding layout; this
 * document is a component in it.
 */
export default function EmbedLayout({ children }: { children: ReactNode }) {
  return <div className="embed-root">{children}</div>;
}
