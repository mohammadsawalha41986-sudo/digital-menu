/**
 * Interaction tracking for the public profile.
 *
 * About 900 bytes of inline script and no framework, because the profile is
 * otherwise zero-JavaScript and a visitor who scanned a QR should not pay for
 * an analytics bundle.
 *
 * It reports only what the server cannot see: which contact action was tapped,
 * which download opened, which item was expanded. Each event carries a public
 * key and nothing else — no identifiers, no page content, no personal data
 * (master spec §110, §113).
 */
export function AnalyticsScript({
  publicId,
  branchKey,
  locale,
}: {
  publicId: string;
  branchKey: string | null;
  locale: string;
}) {
  // Every value here is server-derived and already constrained: a validated
  // public id, a `[a-z0-9-]` branch key, a locale from a two-member enum.
  // Escaping `<` anyway costs one line and removes the whole class of "a value
  // closed the script tag early".
  const config = JSON.stringify({ publicId, branch: branchKey, locale }).replaceAll(
    '<',
    '\\u003c',
  );

  const script = `
(function(){
  var c = ${config};
  function send(event, target){
    try {
      var body = JSON.stringify({
        publicId: c.publicId, branch: c.branch, locale: c.locale,
        event: event, target: target || null
      });
      // sendBeacon survives the page being unloaded by a tel: or maps link.
      if (navigator.sendBeacon) {
        navigator.sendBeacon('/api/events', new Blob([body], {type:'application/json'}));
      } else {
        fetch('/api/events', {method:'POST', body: body, headers:{'content-type':'application/json'}, keepalive: true});
      }
    } catch (e) {}
  }

  document.addEventListener('click', function(e){
    var el = e.target instanceof Element ? e.target.closest('[data-event]') : null;
    if (!el) return;
    send(el.getAttribute('data-event'), el.getAttribute('data-download') || null);
  }, {capture:true, passive:true});

  document.addEventListener('toggle', function(e){
    var el = e.target;
    if (!(el instanceof HTMLDetailsElement) || !el.open) return;
    var code = el.getAttribute('data-item');
    if (code) send('item_view', code);
  }, {capture:true});

  // Category impressions, only where the browser supports it and only once each.
  if ('IntersectionObserver' in window) {
    var seen = {};
    var io = new IntersectionObserver(function(entries){
      entries.forEach(function(entry){
        if (!entry.isIntersecting) return;
        var key = entry.target.getAttribute('data-category');
        if (!key || seen[key]) return;
        seen[key] = 1;
        send('category_view', key);
      });
    }, {threshold: 0.5});

    document.querySelectorAll('[data-category]').forEach(function(el){ io.observe(el); });
    document.querySelectorAll('[data-offer]').forEach(function(el){
      var o = new IntersectionObserver(function(entries){
        entries.forEach(function(entry){
          if (!entry.isIntersecting) return;
          o.disconnect();
          send('offer_view', el.getAttribute('data-offer'));
        });
      }, {threshold: 0.5});
      o.observe(el);
    });
  }
})();
`.trim();

  return (
    <script
      // Built entirely from server-side values: the public id is validated
      // before it reaches here, and the rest are literals.
      dangerouslySetInnerHTML={{ __html: script }}
      suppressHydrationWarning
    />
  );
}
