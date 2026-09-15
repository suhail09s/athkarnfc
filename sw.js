const CACHE_NAME = 'athkarnfc-dual-v1';
const ASSETS = [
    './',
    './index.html',
    './style.css',
    './script.js',
    './car.html',
    './car.css',
    './car.js',
    './manifest.json',
    './assets/audio/track1.mp3',
    './assets/audio/track2.mp3',
    './assets/audio/track3.mp3',
    './assets/athkar/evening.json',
    './assets/athkar/morning.json',
    './assets/athkar/morning_v2.json'
];

self.addEventListener('install', event => {
    // Aggressively cache all critical assets including massive audio files upfront
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
    );
    // Force the waiting service worker to become the active service worker
    self.skipWaiting();
});

self.addEventListener('activate', event => {
    // Delete obsolete caches
    event.waitUntil(
        caches.keys().then(keys => Promise.all(
            keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
        ))
    );
    self.clients.claim();
});

// Cache-First / Stale-While-Revalidate Hybrid Strategy
self.addEventListener('fetch', event => {
    // Only intercept GET requests
    if (event.request.method !== 'GET') return;

    // Handle audio range requests gracefully via Cache-First
    if (event.request.headers.get('range')) {
        event.respondWith(
            caches.match(event.request).then(cachedResponse => {
                if(cachedResponse) return cachedResponse;
                return fetch(event.request);
            })
        );
        return;
    }

    event.respondWith(
        caches.match(event.request).then(cachedResponse => {
            // Stale-while-revalidate: Fetch fresh copy in background to keep cache up to date
            const networkFetch = fetch(event.request).then(networkResponse => {
                if (networkResponse && networkResponse.status === 200) {
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, networkResponse.clone()));
                }
                return networkResponse;
            }).catch(err => {
                console.warn('Offline Mode Active: Fetch failed, using cache only.', err);
            });

            // Return cached response immediately if available, otherwise wait for network
            return cachedResponse || networkFetch;
        })
    );
});
