# Embedding a menu in a website

## The snippet

Admin → a business → **Links, QR & embed** → *Copy embed code*. Paste it into
any page: WordPress (a Custom HTML block), Shopify, Webflow, Squarespace, a
React or Next.js app, or plain HTML.

```html
<iframe
  id="dm-xxxxxx"
  src="https://your-host/embed/DEM001"
  title="Demo Restaurant"
  loading="lazy"
  style="width:100%;border:0;display:block;height:900px"
  referrerpolicy="no-referrer-when-downgrade"
></iframe>
<script>
  (function () {
    var frame = document.getElementById('dm-xxxxxx');
    window.addEventListener('message', function (event) {
      if (!frame || event.source !== frame.contentWindow) return;
      var data = event.data;
      if (!data || data.type !== 'digital-menu:height') return;
      var height = Number(data.height);
      if (height > 0 && height < 20000) frame.style.height = height + 'px';
    });
  })();
</script>
```

The `<script>` is not decoration. Without it the frame keeps its 900px and the
menu scrolls inside a box, which is the single thing that makes an embedded
menu feel like an embedded menu rather than part of the page.

## Addresses

| What | Address |
|---|---|
| Whole profile | `/embed/{publicId}` |
| One menu | `/embed/{publicId}/menu/{menuKey}` |

Use the single-menu form for a page that should show the drinks list and
nothing else. Both take `?lang=ar` or `?lang=en` to pin a language; without it
the visitor's own is used.

## What the host can rely on

- **Any origin may frame it.** `/embed/*` is the one path where
  `frame-ancestors *` is set, and it sends no `X-Frame-Options` — the old
  header has no "allow any origin" form, so sending it would override the CSP
  in the browsers that still read it.
- **It sizes itself.** The frame posts `{ type: 'digital-menu:height', height }`
  to its parent on load, on resize and whenever its content changes.
- **It is transparent.** The embed paints no page background and reserves no
  viewport height, so it sits on the host's own background rather than in a box
  on it.
- **It carries no platform footer.** An embed is the restaurant's menu, not an
  advertisement for the platform serving it.
- **It is `noindex`.** The canonical menu URL is the one that should rank; two
  indexable copies of one menu compete with each other.

## What it does not do

- It **never posts anything but a height**, and it listens for nothing. There
  is no channel a hostile host can use to reach into the frame.
- It does **not** inherit the host's fonts or colours. The menu is the
  business's brand, deliberately.

## Analytics

An embedded view is a real customer looking at a real menu, so it counts. Not
counting it would make the numbers wrong in the other direction.

## Troubleshooting

**The frame stays 900px.** The `<script>` was not pasted, or the page's CSP
blocks inline script. Copy the listener into an existing bundle instead — it
only needs `window.addEventListener('message', …)`.

**"Refused to display in a frame".** The host is on `https` and the embed on
`http`, or a proxy in front of the host strips the CSP. Check the response
headers of `/embed/{publicId}` directly.

**The menu is empty.** The menu has no published version. An unpublished menu's
address renders nothing on purpose; publish it first.
