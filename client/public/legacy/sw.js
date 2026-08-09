const CACHE = 'yuejian-independent-v2411';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './src/styles.css?v=2.4.11',
  './src/app.js?v=2.4.11',
  './src/data.js?v=2.4.11',
  './src/domain.js?v=2.4.11',
  './src/moods.js?v=2.4.11',
  './src/store.js?v=2.4.11',
  './src/services.js?v=2.4.11',
  './assets/app-icon.svg',
  './assets/cafe.jpg',
  './assets/city-night.jpg',
  './assets/couple-walk.jpg',
  './assets/gallery.jpg',
  './assets/restaurant.jpg',
  './assets/sunset-field.jpg',
  './assets/vinyl-listening.jpg',
  './assets/dessert-room.jpg',
  './assets/bookstore-night.jpg',
  './assets/gelato-street.jpg',
  './assets/gelato-shop.jpg',
  './assets/noodle-night.jpg',
  './assets/beijing-restaurants/trb-hutong.jpg',
  './assets/beijing-restaurants/kings-joy.jpg',
  './assets/beijing-restaurants/maison-flo.jpg',
  './assets/beijing-restaurants/quanjude-hepingmen.jpg',
  './assets/beijing-memories/jingshan-forbidden-city.jpg',
  './assets/beijing-memories/cafe-kitsune-sanlitun.jpg',
  './assets/beijing-activities/liangma-river-youyi-bridge.jpg',
  './assets/activity-scenes/pottery-wheel.jpg',
  './assets/activity-scenes/silver-ring-making.jpg',
  './assets/activity-scenes/beijing-forbidden-city-sunset.jpg',
  './assets/activity-scenes/comedy-stage.jpg',
  './assets/activity-scenes/escape-room.jpg',
  './assets/activity-scenes/board-game-table.jpg',
  './assets/activity-scenes/bowling-alley.jpg',
  './assets/activity-scenes/immersive-theater.jpg',
  './assets/activity-scenes/karaoke-room.jpg',
  './assets/activity-scenes/billiards-table.jpg',
  './assets/activity-scenes/arcade-room.jpg',
  './assets/activity-scenes/night-cycling.jpg',
  './assets/activity-scenes/cinema-screen.jpg',
  './assets/activity-scenes/baking-together.jpg',
  './assets/icons/arrow-left.svg',
  './assets/icons/badge-dollar-sign.svg',
  './assets/icons/battery-medium.svg',
  './assets/icons/calendar-days.svg',
  './assets/icons/check.svg',
  './assets/icons/chevron-right.svg',
  './assets/icons/circle-off.svg',
  './assets/icons/circle-user-round.svg',
  './assets/icons/clock-3.svg',
  './assets/icons/compass.svg',
  './assets/icons/external-link.svg',
  './assets/icons/eye-off.svg',
  './assets/icons/eye.svg',
  './assets/icons/heart.svg',
  './assets/icons/image-plus.svg',
  './assets/icons/map-pin-off.svg',
  './assets/icons/map-pin.svg',
  './assets/icons/message-circle-heart.svg',
  './assets/icons/moon-star.svg',
  './assets/icons/navigation.svg',
  './assets/icons/pencil.svg',
  './assets/icons/refresh-cw.svg',
  './assets/icons/route.svg',
  './assets/icons/search.svg',
  './assets/icons/send-horizontal.svg',
  './assets/icons/settings-2.svg',
  './assets/icons/share-2.svg',
  './assets/icons/shield-check.svg',
  './assets/icons/signal.svg',
  './assets/icons/sparkles.svg',
  './assets/icons/star.svg',
  './assets/icons/timer.svg',
  './assets/icons/trash-2.svg',
  './assets/icons/triangle-alert.svg',
  './assets/icons/utensils-crossed.svg',
  './assets/icons/wallet-cards.svg',
  './assets/icons/wifi-off.svg',
  './assets/icons/wifi.svg',
  './assets/icons/video.svg',
  './assets/icons/x.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (/(^|\/)api\//.test(new URL(event.request.url).pathname)) return;
  event.respondWith(
    fetch(event.request).then((response) => {
      const clone = response.clone();
      caches.open(CACHE).then((cache) => cache.put(event.request, clone));
      return response;
    }).catch(() => caches.match(event.request).then((cached) => {
      if (cached) return cached;
      if (event.request.mode === 'navigate') return caches.match('./index.html');
      return Response.error();
    }))
  );
});
