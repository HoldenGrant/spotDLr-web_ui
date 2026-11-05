// Phone app shell and artwork cache. Music streams and JSON APIs always stay on the network.
const VERSION = 'spotdlr-phone-__ASSET_V__'; // changes with any edit to the page's files, so the phone drops its old copy
const SHELL = `${VERSION}-shell`;
const ART = `${VERSION}-art`;
const HOME = '__HOME_URL__'; // filled in by the server: the home Wi-Fi address, or empty
const APP_SHELL = [
    '/',
    '/static/theme.js?v=__ASSET_V__',
    '/static/app.css?v=__ASSET_V__',
    '/static/app.js?v=__ASSET_V__',
    '/static/manifest.webmanifest',
    '/static/icons/icon-192.png',
    '/static/icons/icon-512.png',
    '/static/icons/apple-touch-icon.png',
];
const OFFLINE = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>spotDLr</title><body style="font:16px/1.5 system-ui,sans-serif;background:#121212;color:#fff;padding:48px 24px;max-width:440px;margin:auto">
<h1 style="font-size:22px">Can't reach your computer</h1>
<p style="color:#b3b3b3">The spotDLr interface is saved on this phone, but your library and uncached music still come from your computer. Make sure it is on and awake with spotDLr running.
Away from home, check that the Tailscale app is connected on this phone.</p>
<p><a href="/" style="color:#1ed760">Try again</a></p>
${HOME ? `<p style="color:#b3b3b3;margin-top:28px">At home, with Tailscale off? Open spotDLr on your home Wi-Fi instead:<br>
<a href="${HOME}/" style="color:#1ed760">${HOME.replace(/^https?:\/\//, '')}</a><br>(the first time, scan the “Home Wi-Fi only” code in Settings → Phone access on your computer)</p>` : ''}</body>`;

// Songs kept on the phone: the one just played and the next two, so a replay or the next song needs no trip to the
// computer. Not named spotdlr-phone-*, so an app update doesn't throw them away. Newest 40 (about 200 MB) stay.
const SONGS = 'spotdlr-songs';
const SONG_LIMIT = 40;
const keeping = new Set();
let keepChain = Promise.resolve();

// A saved song answers like the computer would: Safari asks for byte ranges (to start, to seek) and needs a real 206
async function savedSong(saved, rangeHeader) {
    const blob = await saved.blob();
    const type = saved.headers.get('Content-Type') || 'audio/mp4';
    const size = blob.size;
    const range = /^bytes=(\d*)-(\d*)$/.exec((rangeHeader || '').trim());
    if (!range || (range[1] === '' && range[2] === '')) {
        return new Response(blob, { status: 200, headers: { 'Content-Type': type, 'Content-Length': String(size), 'Accept-Ranges': 'bytes' } });
    }
    let start, end;
    if (range[1] === '') { start = Math.max(size - Number(range[2]), 0); end = size - 1; } // "the last N bytes"
    else { start = Number(range[1]); end = range[2] === '' ? size - 1 : Math.min(Number(range[2]), size - 1); }
    if (start >= size || start > end) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
    return new Response(blob.slice(start, end + 1), { status: 206, headers: {
        'Content-Type': type, 'Content-Length': String(end - start + 1), 'Content-Range': `bytes ${start}-${end}/${size}`, 'Accept-Ranges': 'bytes',
    } });
}

async function streamAnswer(request, path) {
    try {
        const saved = await (await caches.open(SONGS)).match(path);
        if (saved) return await savedSong(saved, request.headers.get('range'));
    } catch { /* fall through to the computer */ }
    return fetch(request);
}

function keepSongs(ids) {
    const wanted = ids.filter((id) => typeof id === 'string' && /^[\w-]{1,64}$/.test(id) && !keeping.has(id));
    wanted.forEach((id) => keeping.add(id));
    keepChain = wanted.reduce((chain, id) => chain.then(async () => {
        try {
            const cache = await caches.open(SONGS);
            const path = `/api/stream/${id}`;
            if (!(await cache.match(path))) {
                const response = await fetch(path); // the whole file, one at a time so the player's own stream isn't squeezed
                if (response.status === 200) { await cache.put(path, response); await trim(SONGS, SONG_LIMIT); }
            }
        } catch { /* offline or interrupted: nothing saved, the song just streams as before */ }
        keeping.delete(id);
    }), keepChain);
    return keepChain;
}

self.addEventListener('message', (event) => {
    if (Array.isArray(event.data?.keep)) event.waitUntil(keepSongs(event.data.keep.slice(0, 4)));
});

async function trim(cacheName, limit) {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    await Promise.all(keys.slice(0, Math.max(0, keys.length - limit)).map((key) => cache.delete(key)));
}

self.addEventListener('install', (event) => {
    event.waitUntil(caches.open(SHELL).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
    event.waitUntil(Promise.all([
        caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith('spotdlr-phone-') && ![SHELL, ART].includes(key)).map((key) => caches.delete(key)))),
        self.clients.claim(),
    ]));
});

self.addEventListener('fetch', (event) => {
    const request = event.request;
    if (request.method !== 'GET') return;
    const url = new URL(request.url);
    if (url.origin !== location.origin) return;

    if (request.mode === 'navigate') {
        // Use the live page whenever the computer can be reached. Its versioned assets are what deliver fixes to a
        // phone; the saved page is only an offline fallback.
        event.respondWith((async () => {
            const network = fetch(request).then((response) => {
                if (response.ok) caches.open(SHELL).then((cache) => cache.put('/', response.clone()));
                return response;
            });
            event.waitUntil(network.catch(() => {}));
            const cached = await caches.match('/');
            if (!cached) return network.catch(() => new Response(OFFLINE, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }));
            return network.catch(() => cached);
        })());
        return;
    }

    if (url.pathname.startsWith('/api/stream/')) {
        event.respondWith(streamAnswer(request, url.pathname));
        return;
    }

    if (url.pathname.startsWith('/api/art/')) {
        event.respondWith(caches.open(ART).then(async (cache) => {
            const cached = await cache.match(request);
            if (cached) return cached;
            const response = await fetch(request);
            if (response.ok) { await cache.put(request, response.clone()); trim(ART, 150); }
            return response;
        }));
        return;
    }

    if (url.pathname.startsWith('/static/')) {
        event.respondWith(caches.match(request).then((cached) => cached || fetch(request).then((response) => {
            if (response.ok) caches.open(SHELL).then((cache) => cache.put(request, response.clone()));
            return response;
        })));
    }
});
