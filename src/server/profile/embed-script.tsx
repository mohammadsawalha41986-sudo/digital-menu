/**
 * Auto-height for an embedded menu.
 *
 * An iframe has no idea how tall its document is, so a menu embedded at a
 * fixed height either gets an inner scrollbar — the thing that makes embeds
 * feel cheap on a phone — or acres of blank space. The fix is for the frame to
 * tell its host how tall it actually is, and for the host to resize.
 *
 * Deliberately small and deliberately inline: this must run before the host's
 * first paint, and a separate request for ~500 bytes would be slower than the
 * bytes themselves.
 *
 * Security: it posts to `*` because the host origin is not knowable — the
 * whole point is that anyone may embed. What it posts is a height and a
 * marker, nothing about the business, and it *receives* nothing at all. There
 * is no message listener, so a hostile host cannot use this channel to reach
 * into the frame.
 */
export function EmbedHeightScript() {
  const script = `(function(){
  if (window.parent === window) return;
  var last = 0;
  function send(){
    var h = Math.ceil(document.documentElement.getBoundingClientRect().height);
    if (!h || Math.abs(h - last) < 2) return;
    last = h;
    window.parent.postMessage({ type: 'digital-menu:height', height: h }, '*');
  }
  if (window.ResizeObserver) new ResizeObserver(send).observe(document.documentElement);
  window.addEventListener('load', send);
  addEventListener('resize', send);
  send();
})();`;

  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
