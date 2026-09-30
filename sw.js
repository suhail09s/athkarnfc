'use strict';
importScripts('./shared.js');
const SHELL_CACHE = 'athkarnfc-shell-v12';
const AUDIO_CACHE = 'athkarnfc-audio-v2';
const SHELL_ASSETS = [
    './', './index.html', './car.html', './style.css', './car.css',
    './shared.js', './player.js', './player.css', './manifest.json', './assets/icons/icon.svg',
    './assets/athkar/travel.json', './assets/athkar/morning.json',
    './assets/athkar/morning_v2.json', './assets/athkar/evening.json',
    './assets/athkar/evening_audio.json'
];
const absolute = path => new URL(path, self.registration.scope).href;
const shellURLs = new Set(SHELL_ASSETS.map(absolute));
const audioURLs = new Set(Athkar.TRACKS.map(track => absolute(track.audio)));
self.addEventListener('install', event => {
    // Audio is optional and downloaded only on request; a failed audio download
    // can never prevent the application shell from installing.
    event.waitUntil(caches.open(SHELL_CACHE).then(cache => cache.addAll(SHELL_ASSETS)));
});
self.addEventListener('activate', event => {
    event.waitUntil((async () => {
        const names = await caches.keys();
        await Promise.all(names.filter(name => name.startsWith('athkarnfc-') &&
            name !== SHELL_CACHE && name !== AUDIO_CACHE).map(name => caches.delete(name)));
        await self.clients.claim();
    })());
});
// The stored body is read once per worker lifetime. Reading it for every range
// request would copy the whole recording on each seek (the evening file is
// about 24 MB).
const audioBlobs = new Map();
async function cachedAudio(url, cached) {
    if (!audioBlobs.has(url)) audioBlobs.set(url, await cached.blob());
    return audioBlobs.get(url);
}
async function audioResponse(request, url) {
    const cache = await caches.open(AUDIO_CACHE);
    const cached = await cache.match(url);
    if (!cached) return fetch(request); // Preserve the origin's range behavior.
    const header = request.headers.get('Range');
    if (!header) return cached;
    const blob = await cachedAudio(url, cached);
    const range = Athkar.parseRange(header, blob.size);
    if (!range) return new Response(blob, { headers: cached.headers });
    if (range.unsatisfiable) return new Response(null, {
        status: 416, headers: { 'Content-Range': `bytes */${blob.size}` }
    });
    const { start, end } = range;
    return new Response(blob.slice(start, end + 1), {
        status: 206,
        headers: {
            'Content-Type': cached.headers.get('Content-Type') || 'audio/mpeg',
            'Content-Range': `bytes ${start}-${end}/${blob.size}`,
            'Content-Length': String(end - start + 1),
            'Accept-Ranges': 'bytes'
        }
    });
}
self.addEventListener('fetch', event => {
    if (event.request.method !== 'GET') return;
    const url = new URL(event.request.url);
    if (url.origin !== self.location.origin) return;
    url.search = ''; // NFC query parameters select a track in the cached page.
    if (audioURLs.has(url.href)) {
        event.respondWith(audioResponse(event.request, url.href));
    } else if (shellURLs.has(url.href)) {
        // Versioned shell stays coherent until the next worker activates.
        event.respondWith(caches.open(SHELL_CACHE).then(async cache =>
            await cache.match(url.href) || fetch(event.request)));
    }
});
self.addEventListener('message', event => {
    const port = event.ports[0];
    const { type, path } = event.data || {};
    if (!port || !['AUDIO_STATUS', 'SAVE_AUDIO', 'REMOVE_AUDIO'].includes(type)) return;
    event.waitUntil((async () => {
        try {
            const url = absolute(path);
            if (!audioURLs.has(url)) throw new Error('Unknown audio');
            const cache = await caches.open(AUDIO_CACHE);
            if (type === 'SAVE_AUDIO' && !await cache.match(url)) {
                const response = await fetch(url);
                const contentType = response.headers.get('Content-Type') || '';
                // Some static hosts serve audio as application/octet-stream, so the
                // allowlisted file extension is accepted as a fallback signal.
                const audio = contentType.startsWith('audio/') || /\.(mp3|m4a|ogg|opus|wav)$/i.test(url);
                if (response.status !== 200 || !audio) throw new Error('Audio download failed');
                await cache.put(url, response); // Resolves only after the full body is stored.
                audioBlobs.delete(url);
            } else if (type === 'REMOVE_AUDIO') {
                await cache.delete(url);
                audioBlobs.delete(url);
            }
            port.postMessage({ ok: true, saved: Boolean(await cache.match(url)) });
        } catch (error) {
            port.postMessage({ ok: false, error: error.message });
        }
    })());
});
