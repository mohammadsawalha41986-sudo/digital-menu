/*
 * The menu's service worker. It exists so the browser will offer to install
 * the menu. It never answers from a cache: prices and dishes come from the
 * network on every visit, so a change made by the restaurant shows at once.
 */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {
  // No respondWith: the request goes to the network as it would without us.
});
