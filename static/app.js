'use strict';
/* spotDLr frontend: library, player, Spotify search and downloads. No framework, no build step. */

// ---------- tiny helpers ----------

// html`` escapes every interpolated value unless it is already Safe (another html`` result or icon()).
class Safe { constructor(s) { this.s = s; } toString() { return this.s; } }
const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ESCAPES[c]);
// false renders as '' (handy for ${cond && html`…`}), so boolean attributes need String(): aria-pressed="${String(on)}"
const toHtml = (v) => v instanceof Safe ? v.s : Array.isArray(v) ? v.map(toHtml).join('') : (v === null || v === undefined || v === false) ? '' : esc(v);
function html(strings, ...values) {
    let out = strings[0];
    values.forEach((v, i) => { out += toHtml(v) + strings[i + 1]; });
    return new Safe(out);
}
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

async function api(path, options = {}) {
    const response = await fetch('/api' + path, { headers: { 'Content-Type': 'application/json' }, ...options });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.detail || `Request failed (${response.status})`);
    return data;
}

const store = {
    get(key, fallback) { try { const v = localStorage.getItem('spotdlr.' + key); return v === null ? fallback : JSON.parse(v); } catch { return fallback; } },
    set(key, value) { try { localStorage.setItem('spotdlr.' + key, JSON.stringify(value)); } catch { /* private mode */ } },
};

// ---------- icons (24×24) ----------

const ICONS = {
    play: '<path fill="currentColor" stroke="none" d="M7.05 3.6A1 1 0 0 0 5.5 4.44v15.12a1 1 0 0 0 1.55.84l11.68-7.56a1 1 0 0 0 0-1.68z"/>',
    pause: '<rect fill="currentColor" stroke="none" x="5.5" y="3.5" width="4.5" height="17" rx="1.2"/><rect fill="currentColor" stroke="none" x="14" y="3.5" width="4.5" height="17" rx="1.2"/>',
    next: '<path fill="currentColor" stroke="none" d="M4.5 4.9v14.2a.9.9 0 0 0 1.4.75l10.2-7.1a.9.9 0 0 0 0-1.5L5.9 4.15a.9.9 0 0 0-1.4.75z"/><rect fill="currentColor" stroke="none" x="17.3" y="4" width="2.4" height="16" rx="1"/>',
    prev: '<path fill="currentColor" stroke="none" d="M19.5 4.9v14.2a.9.9 0 0 1-1.4.75L7.9 12.75a.9.9 0 0 1 0-1.5l10.2-7.1a.9.9 0 0 1 1.4.75z"/><rect fill="currentColor" stroke="none" x="4.3" y="4" width="2.4" height="16" rx="1"/>',
    shuffle: '<path d="M2 18h1.4c1.3 0 2.5-.6 3.3-1.7l6.1-8.6c.7-1.1 2-1.7 3.3-1.7H22"/><path d="m18 2 4 4-4 4"/><path d="M2 6h1.9c1.5 0 2.9.9 3.6 2.2"/><path d="M22 18h-5.9c-1.3 0-2.6-.7-3.3-1.8l-.5-.8"/><path d="m18 14 4 4-4 4"/>',
    repeat: '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
    repeatOne: '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/><path d="M11 10h1v4"/>',
    volume: '<path d="M11 4.7 6.3 8.5H3v7h3.3l4.7 3.8z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.6 5.4a9.5 9.5 0 0 1 0 13.2"/>',
    volumeLow: '<path d="M11 4.7 6.3 8.5H3v7h3.3l4.7 3.8z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/>',
    mute: '<path d="M11 4.7 6.3 8.5H3v7h3.3l4.7 3.8z"/><path d="m22 9-6 6"/><path d="m16 9 6 6"/>',
    search: '<circle cx="11" cy="11" r="7.5"/><path d="m21 21-4.6-4.6"/>',
    home: '<path d="M3 10.2 12 3l9 7.2V20a1 1 0 0 1-1 1h-5.5v-6.5h-5V21H4a1 1 0 0 1-1-1z"/>',
    library: '<path d="M4 3.5v17"/><path d="M9 3.5v17"/><path d="m13.6 4.3 6 16.2"/>',
    download: '<circle cx="12" cy="12" r="9.5"/><path d="M12 7v9"/><path d="m8.2 12.4 3.8 3.8 3.8-3.8"/>',
    downloadPlain: '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 20.5h14"/>',
    check: '<circle fill="currentColor" stroke="none" cx="12" cy="12" r="10"/><path stroke="#000" stroke-width="2.4" d="m7.5 12.3 3 3 6-6.3"/>',
    clock: '<circle cx="12" cy="12" r="9.5"/><path d="M12 6.5V12l3.5 2"/>',
    back: '<path d="m15 18-6-6 6-6"/>',
    up: '<path d="m18 15-6-6-6 6"/>',
    down: '<path d="m6 9 6 6 6-6"/>',
    wave: '<path d="M2 12h3l3-7 4 14 4-10 2 3h4"/>',
    bars: '<path d="M4 20v-6"/><path d="M9 20V8"/><path d="M14 20V4"/><path d="M19 20v-9"/>',
    ring: '<circle cx="12" cy="12" r="5"/><path d="M12 2v3"/><path d="M12 19v3"/><path d="M2 12h3"/><path d="M19 12h3"/><path d="m4.9 4.9 2.1 2.1"/><path d="m17 17 2.1 2.1"/><path d="m4.9 19.1 2.1-2.1"/><path d="m17 7 2.1-2.1"/>',
    sparkle: '<circle cx="5" cy="6" r="1.5"/><circle cx="17" cy="4" r="1"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="15" r="1.5"/><circle cx="6" cy="18" r="1"/>',
    vinyl: '<circle cx="12" cy="12" r="9.5"/><circle cx="12" cy="12" r="3.5"/><path d="M12 5.5a6.5 6.5 0 0 1 6.5 6.5"/>',
    sun: '<path d="M7 13a5 5 0 0 1 10 0"/><path d="M3 17h18"/><path d="M6 21h12"/><path d="M12 3v3"/><path d="m5 7 1.5 1.5"/><path d="m19 7-1.5 1.5"/>',
    mic: '<rect x="9" y="2.5" width="6" height="11.5" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><path d="M12 18v3.5"/>',
    heart: '<path d="M12 20.3 4.6 13a4.8 4.8 0 0 1 6.8-6.8l.6.6.6-.6a4.8 4.8 0 0 1 6.8 6.8z"/>',
    heartFilled: '<path fill="currentColor" stroke="none" d="M12 20.3 4.6 13a4.8 4.8 0 0 1 6.8-6.8l.6.6.6-.6a4.8 4.8 0 0 1 6.8 6.8z"/>',
    more: '<circle fill="currentColor" stroke="none" cx="5" cy="12" r="1.8"/><circle fill="currentColor" stroke="none" cx="12" cy="12" r="1.8"/><circle fill="currentColor" stroke="none" cx="19" cy="12" r="1.8"/>',
    plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
    upload: '<path d="M12 15V3"/><path d="m7 8 5-5 5 5"/><path d="M5 20.5h14"/>',
    usb: '<rect x="7" y="9" width="10" height="12.5" rx="2"/><path d="M9.5 9V3h5v6"/><path d="M11 5.5h.01"/><path d="M13 5.5h.01"/>',
    trash: '<path d="M4 7h16"/><path d="M9.5 7V4.5h5V7"/><path d="M6.5 7l1 13.5h9l1-13.5"/>',
    listAdd: '<path d="M4 6h11"/><path d="M4 12h11"/><path d="M4 18h7"/><path d="M18 14v7"/><path d="M14.5 17.5h7"/>',
    checkPlain: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    off: '<circle cx="12" cy="12" r="9.5"/><path d="m5.3 5.3 13.4 13.4"/>',
    expand: '<path d="M15 3h6v6"/><path d="m21 3-7 7"/><path d="M9 21H3v-6"/><path d="m3 21 7-7"/>',
    forward: '<path d="m9 18 6-6-6-6"/>',
    close: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    settings: '<path d="M4 21v-7"/><path d="M4 10V3"/><path d="M12 21v-9"/><path d="M12 8V3"/><path d="M20 21v-5"/><path d="M20 12V3"/><path d="M1.5 14h5"/><path d="M9.5 8h5"/><path d="M17.5 16h5"/>',
    note: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
    user: '<circle cx="12" cy="8" r="4.5"/><path d="M3.5 21a8.5 8.5 0 0 1 17 0"/>',
    disc: '<circle cx="12" cy="12" r="9.5"/><circle cx="12" cy="12" r="2.5"/>',
    loader: '<path d="M21 12a9 9 0 1 1-6.2-8.56"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
    speaker: '<path fill="currentColor" stroke="none" d="M11 4.7 6.3 8.5H3v7h3.3l4.7 3.8z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/>',
    warn: '<path d="M12 3 2 20.5h20z"/><path d="M12 10v4.5"/><path d="M12 17.5v.01"/>',
    chart: '<path d="M3 20.5h18"/><path d="M6 17V11"/><path d="M11 17V5"/><path d="M16 17v-8"/><path d="M21 17v-4"/>',
    spotDLr: '<path fill="currentColor" stroke="none" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm-1 5h2v6.6l2.3-2.3 1.4 1.4L12 17.4l-4.7-4.7 1.4-1.4 2.3 2.3z"/>',
};
const icon = (name, size = 16, cls = '') => new Safe(
    `<svg class="icon ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`
);
const eq = () => html`<span class="eq" aria-hidden="true"><i></i><i></i><i></i></span>`;

// ---------- formatting ----------

const fmtTime = (s) => { s = Math.max(0, Math.floor(s || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
function fmtLong(seconds) {
    const h = Math.floor(seconds / 3600), m = Math.floor((seconds % 3600) / 60), s = Math.floor(seconds % 60);
    if (h) return `about ${h} hr ${m} min`;
    return m ? `${m} min ${s} sec` : `${s} sec`;
}
function fmtAdded(ts) {
    const days = (Date.now() / 1000 - ts) / 86400;
    if (days < 1) return 'Today';
    if (days < 2) return 'Yesterday';
    if (days < 7) return `${Math.floor(days)} days ago`;
    if (days < 28) { const w = Math.floor(days / 7); return `${w} week${w > 1 ? 's' : ''} ago`; }
    return new Date(ts * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
const plural = (n, word) => `${n.toLocaleString()} ${word}${n === 1 ? '' : 's'}`;
const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; };

// ---------- state ----------

const S = {
    tracks: [],
    collections: [],
    byId: new Map(),
    bySpotifyId: new Map(),
    byVideoId: new Map(),
    byTitleArtist: new Map(),
    artists: [],            // derived from tags: [{ name, trackIds, coverId }]
    genres: [],             // derived from track.genre: [{ name, trackIds, coverIds }]
    liked: new Set(),       // track ids you liked (♥)
    likedOrder: [],         // the same, newest like first
    genrePending: 0,
    jobs: [],
    init: { initialized: true },
    libFilter: store.get('libFilter', 'all'),
    libQuery: '',
    settings: { format: 'm4a', bitrate: 'auto', lyrics: false, ...store.get('settings', {}) },
    spotifyCache: new Map(), // "kind/id" or "search/q" -> { time, data }
};

const artUrl = (trackId) => `/api/art/${encodeURIComponent(trackId)}`;
const artistHref = (name) => `#/artist/${encodeURIComponent(name)}`;
// "feat."/"with" credits are dropped so "Bad Haircut (feat. JVKE)" matches "Bad Haircut"; other parentheses
// stay, so "golden hour (piano version)" doesn't match "golden hour"
const songKey = (title, artist) => `${String(title || '').toLowerCase().replace(/\s*[([](feat|ft|with)\b[^)\]]*[)\]]/g, '').replace(/[^\p{L}\p{N}]+/gu, '')}|${String(artist || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')}`;
// Remote track → local id: exact id first (Spotify or YouTube), then title + main artist
const owned = (t) => (t.source === 'ytm' ? S.byVideoId.get(t.id) : S.bySpotifyId.get(t.id))
    || S.byTitleArtist.get(songKey(t.name, t.artists[0] && t.artists[0].name)) || null;
const remoteHref = (item, kind) => `#/${item.source || 'spotify'}/${kind}/${encodeURIComponent(item.id)}`;

async function loadLibrary() {
    const data = await api('/library');
    S.tracks = data.tracks;
    S.collections = data.collections;
    S.likedOrder = (data.liked || []).filter((id) => data.tracks.some((t) => t.id === id));
    S.liked = new Set(S.likedOrder);
    S.byId = new Map(S.tracks.map((t) => [t.id, t]));
    S.bySpotifyId = new Map();
    S.byVideoId = new Map();
    S.byTitleArtist = new Map();
    for (const t of S.tracks) {
        if (t.spotify_id && !S.bySpotifyId.has(t.spotify_id)) S.bySpotifyId.set(t.spotify_id, t.id);
        if (t.youtube_id && !S.byVideoId.has(t.youtube_id)) S.byVideoId.set(t.youtube_id, t.id);
        const key = songKey(t.title, t.artists[0]);
        if (!S.byTitleArtist.has(key)) S.byTitleArtist.set(key, t.id);
    }
    const artists = new Map();
    for (const t of S.tracks) {
        for (const name of t.artists) {
            if (!artists.has(name)) artists.set(name, { name, trackIds: [], coverId: null });
            const a = artists.get(name);
            a.trackIds.push(t.id);
            if (!a.coverId && t.has_cover) a.coverId = t.id;
        }
    }
    S.artists = [...artists.values()].sort((a, b) => b.trackIds.length - a.trackIds.length || a.name.localeCompare(b.name));
    const genres = new Map();
    for (const t of S.tracks) {
        if (!t.genre) continue;
        if (!genres.has(t.genre)) genres.set(t.genre, { name: t.genre, trackIds: [], coverIds: [], albums: new Set() });
        const g = genres.get(t.genre);
        g.trackIds.push(t.id);
        if (t.has_cover && g.coverIds.length < 4 && !g.albums.has(t.album)) { g.coverIds.push(t.id); g.albums.add(t.album); }
    }
    S.genres = [...genres.values()].sort((a, b) => b.trackIds.length - a.trackIds.length || a.name.localeCompare(b.name));
    renderSidebar();
}

// ---------- art ----------

function trackArt(track, cls = '') {
    if (track && track.has_cover) return html`<div class="art ${cls}"><img src="${artUrl(track.id)}" alt="" loading="lazy" decoding="async"></div>`;
    return html`<div class="art ${cls}">${icon('note', 20)}</div>`;
}
// Remote covers go through /api/img: cached on disk and fetched politely, because Google's
// image host answers bursts (a search page = 30-40 covers) with HTTP 429
const proxied = (url) => /^https:\/\//.test(url || '') ? `/api/img?u=${encodeURIComponent(url)}` : url;

function imageArt(url, cls = '', fallbackIcon = 'note') {
    url = proxied(url);
    // No crossorigin here: i.ytimg.com sends no CORS headers, so it would block the image.
    // applyHeroColor samples colour from its own separate request instead.
    if (url) return html`<div class="art ${cls}"><img src="${url}" alt="" loading="lazy" decoding="async"></div>`;
    return html`<div class="art ${cls}">${icon(fallbackIcon, 24)}</div>`;
}
function collectionArt(c, cls = '') {
    const ids = c.cover_ids;
    if (ids.length >= 4) {
        return html`<div class="art mosaic ${cls}">${ids.slice(0, 4).map((id) => html`<img src="${artUrl(id)}" alt="" loading="lazy">`)}</div>`;
    }
    return ids.length ? trackArt(S.byId.get(ids[0]), cls) : html`<div class="art ${cls}">${icon('note', 24)}</div>`;
}
const likedArt = (cls = '') => html`<div class="art liked-songs ${cls}">${icon('heartFilled', 24)}</div>`;
const allSongsArt = (cls = '') => html`<div class="art all-songs ${cls}">${icon('note', 24)}</div>`;
function artistArt(a, cls = '') {
    return a.coverId ? html`<div class="art round ${cls}"><img src="${artUrl(a.coverId)}" alt="" loading="lazy"></div>` : html`<div class="art round ${cls}">${icon('user', 24)}</div>`;
}

// Average colour of an image, darkened a little so white text stays readable. Resolves to null when
// it can't be read. Only same-origin images work (our /api/art and /api/img), since it reads pixels.
const coverColors = new Map(); // url -> Promise<colour | null>
function coverColor(imgUrl) {
    if (!imgUrl) return Promise.resolve(null);
    if (!coverColors.has(imgUrl)) {
        coverColors.set(imgUrl, new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onerror = () => resolve(null);
            img.onload = () => {
                try {
                    const canvas = document.createElement('canvas');
                    canvas.width = canvas.height = 12;
                    const ctx = canvas.getContext('2d', { willReadFrequently: true });
                    ctx.drawImage(img, 0, 0, 12, 12);
                    const px = ctx.getImageData(0, 0, 12, 12).data;
                    let r = 0, g = 0, b = 0, n = 0;
                    for (let i = 0; i < px.length; i += 4) {
                        const lum = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
                        if (lum < 18 || lum > 240) continue; // ignore near-black/white borders
                        r += px[i]; g += px[i + 1]; b += px[i + 2]; n++;
                    }
                    if (!n) return resolve(null);
                    const scale = Math.min(1, 150 / Math.max(r / n, g / n, b / n));
                    resolve(`rgb(${Math.round(r / n * scale)}, ${Math.round(g / n * scale)}, ${Math.round(b / n * scale)})`);
                } catch { resolve(null); }
            };
            img.src = imgUrl;
        }));
    }
    return coverColors.get(imgUrl);
}

function applyHeroColor(imgUrl) {
    const view = $('#view');
    view.dataset.heroSrc = imgUrl || '';
    view.style.setProperty('--hero', '#535353');
    coverColor(imgUrl).then((color) => {
        if (color && view.dataset.heroSrc === imgUrl) view.style.setProperty('--hero', color);
    });
}

// ---------- player ----------

const P = {
    audio: new Audio(),
    queue: [],           // local track ids in context order
    order: [],           // play order (indexes into queue), shuffled when shuffle is on
    pos: -1,             // position in order
    context: null,       // { key, label, href }
    shuffle: store.get('shuffle', false),
    repeat: store.get('repeat', 'off'), // off | all | one
    seeking: false,
};
P.audio.preload = 'auto';
P.audio.volume = store.get('volume', 0.8);

const currentTrack = () => S.byId.get(P.queue[P.order[P.pos]]) || null;

function buildOrder(startIndex) {
    const idx = P.queue.map((_, i) => i);
    if (P.shuffle) {
        const rest = idx.filter((i) => i !== startIndex);
        for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [rest[i], rest[j]] = [rest[j], rest[i]]; }
        P.order = startIndex >= 0 ? [startIndex, ...rest] : rest;
        P.pos = 0;
    } else {
        P.order = idx;
        P.pos = Math.max(0, startIndex);
    }
}

function playContext(trackIds, startIndex, context) {
    const ids = trackIds.filter((id) => S.byId.has(id));
    if (!ids.length) return;
    const start = startIndex === null || startIndex === undefined ? (P.shuffle ? -1 : 0) : ids.indexOf(trackIds[startIndex]);
    P.queue = ids;
    P.context = context;
    buildOrder(start);
    loadAndPlay();
}

// ---------- listening history (for the Stats page) ----------
// Count only time actually heard: each timeupdate adds the step since the last one if it's small and
// forward. A seek is a jump, not listening. The server decides if it counts (30 s, or half a short song).
const listen = { id: null, seconds: 0, last: null };

function startListen(trackId) {
    flushListen();
    listen.id = trackId;
    listen.seconds = 0;
    listen.last = null;
}

function flushListen(useBeacon = false) {
    if (listen.id && listen.seconds >= 10) {
        const body = JSON.stringify({ track_id: listen.id, seconds: Math.round(listen.seconds * 10) / 10 });
        if (useBeacon && navigator.sendBeacon) navigator.sendBeacon('/api/plays', new Blob([body], { type: 'application/json' }));
        else fetch('/api/plays', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
    }
    listen.id = null;
    listen.seconds = 0;
    listen.last = null;
}

// ---------- resume where you left off ----------
// The queue, play order, position in it, context (the playlist/album/…) and time in the song, saved in
// localStorage. On launch the player comes back paused at that spot and the app opens that playlist.
// ~17 bytes per queued song, so even All songs (600) is ~10 KB.

function saveSession() {
    const t = currentTrack();
    if (!t) return;
    store.set('session', {
        queue: P.queue, order: P.order, pos: P.pos, context: P.context,
        trackId: t.id, time: Math.floor(P.audio.currentTime || 0),
    });
}

const RESUMABLE_PAGE = /^#\/(songs$|liked$|collection\/|artist\/|genre\/)/; // library pages only: a search page would re-run a YouTube search

function restoreSession() {
    const saved = store.get('session', null);
    if (!saved || !Array.isArray(saved.queue)) return null;
    // Songs deleted since are dropped; rebuild the order around what's left
    const queue = saved.queue.filter((id) => S.byId.has(id));
    const start = queue.indexOf(saved.trackId);
    if (start < 0) return null;
    const oldToNew = new Map(saved.queue.map((id, i) => [i, queue.indexOf(id)]));
    const order = (saved.order || []).map((i) => oldToNew.get(i)).filter((i) => i !== undefined && i >= 0);
    P.queue = queue;
    P.context = saved.context || null;
    if (order.length === queue.length) { P.order = order; P.pos = order.indexOf(start); } else buildOrder(start);
    const t = currentTrack();
    startListen(t.id);   // counting only happens while it actually plays
    P.audio.src = `/api/stream/${encodeURIComponent(t.id)}`;
    if (saved.time > 0) P.audio.addEventListener('loadedmetadata', () => { if (saved.time < P.audio.duration - 1) P.audio.currentTime = saved.time; }, { once: true });
    updateNowPlaying();
    updateControls();
    return P.context && RESUMABLE_PAGE.test(P.context.href || '') ? P.context.href : null;
}

function loadAndPlay() {
    const t = currentTrack();
    if (!t) return;
    startListen(t.id);
    P.audio.src = `/api/stream/${encodeURIComponent(t.id)}`;
    P.audio.play().catch((err) => { if (err.name !== 'AbortError') toast(`Couldn't play "${t.title}"`, 'error'); });
    updateNowPlaying();
    saveSession();
}

function togglePlay() {
    if (!currentTrack()) {
        if (S.tracks.length) playContext(S.tracks.map((t) => t.id), null, { key: 'songs', label: 'All songs', href: '#/songs' });
        return;
    }
    if (P.audio.paused) P.audio.play(); else P.audio.pause();
}

function next(auto = false) {
    if (!currentTrack()) return;
    if (auto && P.repeat === 'one') { startListen(currentTrack().id); P.audio.currentTime = 0; P.audio.play(); return; }
    if (P.pos < P.order.length - 1) P.pos++;
    else if (P.repeat !== 'off') { if (P.shuffle) buildOrder(-1); else P.pos = 0; }
    else { if (auto) { P.audio.pause(); P.audio.currentTime = 0; } return; }
    loadAndPlay();
}

function prev() {
    if (!currentTrack()) return;
    if (P.audio.currentTime > 3 || P.pos === 0 && P.repeat === 'off') { P.audio.currentTime = 0; return; }
    P.pos = P.pos > 0 ? P.pos - 1 : P.order.length - 1;
    loadAndPlay();
}

function toggleShuffle() {
    P.shuffle = !P.shuffle;
    store.set('shuffle', P.shuffle);
    const cur = P.order[P.pos];
    if (P.queue.length) buildOrder(cur ?? -1);
    updateControls();
    renderNowView();  // the previous/next songs changed
    saveSession();
}

function cycleRepeat() {
    P.repeat = { off: 'all', all: 'one', one: 'off' }[P.repeat];
    store.set('repeat', P.repeat);
    updateControls();
    renderNowView();
}

const isContextPlaying = (key) => P.context && P.context.key === key && !P.audio.paused;

function updateNowPlaying() {
    const t = currentTrack();
    $('#player').classList.toggle('idle', !t);
    if (!t) return;
    $('#npArt').outerHTML = trackArt(t).toString().replace('class="art ', 'id="npArt" class="art ');
    $('#npTitle').textContent = t.title;
    $('#npTitle').href = P.context ? P.context.href : '#/songs';
    $('#npArtist').innerHTML = html`${t.artists.map((a, i) => html`${i ? ', ' : ''}<a href="${artistHref(a)}">${a}</a>`)}`.toString();
    document.title = `${t.title} • ${t.artists.join(', ')}`;
    $('#npLike').innerHTML = likeButton(t.id).s;
    renderNowView();
    if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
            title: t.title,
            artist: t.artists.join(', '),
            album: t.album,
            artwork: t.has_cover ? [{ src: location.origin + artUrl(t.id), sizes: '640x640', type: 'image/jpeg' }] : [],
        });
    }
    markPlaying();
}

function updateControls() {
    const playing = !P.audio.paused && !!currentTrack();
    $('#playBtn').innerHTML = icon(playing ? 'pause' : 'play', 16).s;
    $('#playBtn').setAttribute('aria-label', playing ? 'Pause' : 'Play');
    const shuffle = $('#shuffleBtn');
    shuffle.classList.toggle('on', P.shuffle);
    shuffle.setAttribute('aria-pressed', P.shuffle);
    const repeat = $('#repeatBtn');
    repeat.innerHTML = icon(P.repeat === 'one' ? 'repeatOne' : 'repeat', 16).s;
    repeat.classList.toggle('on', P.repeat !== 'off');
    repeat.setAttribute('aria-pressed', P.repeat !== 'off');
    repeat.setAttribute('aria-label', { off: 'Repeat', all: 'Repeat all', one: 'Repeat one' }[P.repeat]);
    document.body.classList.toggle('is-playing', playing);
    // Big play buttons in the view reflect whether their context is the one playing
    $$('[data-play-context]').forEach((btn) => {
        const on = isContextPlaying(btn.dataset.playContext);
        btn.innerHTML = icon(on ? 'pause' : 'play', btn.dataset.size ? +btn.dataset.size : 24).s;
        btn.setAttribute('aria-label', on ? 'Pause' : 'Play');
    });
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
}

function markPlaying() {
    const t = currentTrack();
    $$('.track[data-id]').forEach((row) => row.classList.toggle('playing', !!t && row.dataset.id === t.id));
    $$('.lib-item[data-key]').forEach((item) => item.classList.toggle('playing', !!P.context && P.context.key === item.dataset.key));
}

// ---------- Now Playing view ----------
// Full view of the current song: info + genre on the left, a vertical feed of the previous / current / next
// covers in the middle (scroll, ↑/↓ or click to move), background tinted from the cover.

const NV = { open: false, opener: null, prevId: null, nextId: null, wheel: 0, wheelLock: 0, lyrics: store.get('nvLyrics', false), colors: new Map() };

// ---------- lyrics ----------
// /api/lyrics gives {lines: [{t, text}] | null, plain, instrumental}. While shown, a rAF loop finds the
// current line: the last one whose time has passed, by binary search (~6 steps for 60 lines), checked
// every frame because timeupdate only fires ~4x/s and would light lines up to 250 ms late.

const LYRICS_LEAD = 0.25;   // seconds early: a line should light up as it starts, not just after
const L = { data: new Map(), raf: 0, index: -2, userScrollUntil: 0 }; // data: track id -> {state, result|error}

function fetchLyrics(trackId) {
    const known = L.data.get(trackId);
    if (known && known.state !== 'error') return;
    L.data.set(trackId, { state: 'loading' });
    api(`/lyrics/${encodeURIComponent(trackId)}`)
        .then((result) => L.data.set(trackId, { state: 'ok', result }))
        .catch((err) => L.data.set(trackId, { state: 'error', error: err.message }))
        .finally(() => { const t = currentTrack(); if (NV.open && NV.lyrics && t && t.id === trackId) fillLyrics(); });
}

function lyricsBody(trackId) {
    const entry = L.data.get(trackId);
    if (!entry || entry.state === 'loading') {
        return html`<div class="nv-lyrics-msg" aria-busy="true">${[70, 55, 80, 45, 65].map((w) => html`<div class="skeleton nv-lyrics-skel" style="width:${w}%"></div>`)}</div>`;
    }
    if (entry.state === 'error') {
        return html`<div class="nv-lyrics-msg"><p>Couldn't load lyrics. ${entry.error}</p><button class="pill-btn" data-lyrics-retry>Try again</button></div>`;
    }
    const r = entry.result;
    if (r.lines) {
        return html`<div class="nv-lines">${r.lines.map((line, i) => line.text
            ? html`<button class="nv-line" data-line="${i}" data-t="${line.t}" tabindex="-1">${line.text}</button>`
            : html`<div class="nv-line gap" data-line="${i}" aria-hidden="true">♪</div>`)}</div>
            <p class="nv-lyrics-credit">Lyrics from ${r.source === 'file' ? 'the song\'s .lrc file' : 'LRCLIB'}</p>`;
    }
    if (r.plain) {
        return html`<div class="nv-lines plain">${r.plain.split('\n').map((text) => html`<p class="nv-line">${text || '\u00a0'}</p>`)}</div>
            <p class="nv-lyrics-credit">Not time-synced • LRCLIB</p>`;
    }
    if (r.instrumental) return html`<div class="nv-lyrics-msg"><p class="big">♪ Instrumental</p></div>`;
    return html`<div class="nv-lyrics-msg"><p class="big">No lyrics for this song</p><p>LRCLIB doesn't have them yet.</p></div>`;
}

function fillLyrics() {
    const box = $('#nowRoot .nv-lyrics');
    const t = currentTrack();
    if (!box || !t) return;
    box.innerHTML = lyricsBody(t.id).toString();
    box.scrollTop = 0;
    L.index = -2;
    startLyrics();
}

// The last line with t <= now, or -1 before the first
function lineAt(lines, now) {
    let lo = 0, hi = lines.length - 1, found = -1;
    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (lines[mid].t <= now) { found = mid; lo = mid + 1; } else hi = mid - 1;
    }
    return found;
}

function lyricsTick() {
    L.raf = 0;
    const t = currentTrack();
    const entry = t && L.data.get(t.id);
    const box = $('#nowRoot .nv-lyrics');
    if (!NV.open || !NV.lyrics || !box || !entry || entry.state !== 'ok' || !entry.result.lines || document.hidden) return;
    const index = lineAt(entry.result.lines, P.audio.currentTime + LYRICS_LEAD);
    if (index !== L.index) {
        L.index = index;
        $$('.nv-line[data-line]', box).forEach((el) => {
            const i = +el.dataset.line;
            el.classList.toggle('active', i === index);
            el.classList.toggle('past', i < index);
        });
        const active = index >= 0 && $(`.nv-line[data-line="${index}"]`, box);
        if (Date.now() > L.userScrollUntil) {
            // Keep the current line ~40% down the box, like Spotify
            const top = active ? active.offsetTop - box.clientHeight * 0.4 + active.offsetHeight / 2 : 0;
            box.scrollTo({ top, behavior: reducedMotion.matches ? 'auto' : 'smooth' });
        }
    }
    L.raf = requestAnimationFrame(lyricsTick);
}

function startLyrics() {
    if (!L.raf && NV.open && NV.lyrics) L.raf = requestAnimationFrame(lyricsTick);
}

function toggleLyrics() {
    NV.lyrics = !NV.lyrics;
    store.set('nvLyrics', NV.lyrics);
    NV.prevId = NV.nextId = null; // no slide animation for the swap
    renderNowView();
}

// ---------- visualizer ----------
// The <audio> element feeds an AnalyserNode, which hands us the sound as numbers 60 times a second:
// getByteFrequencyData = loudness (0-255) per frequency band, getByteTimeDomainData = the waveform itself.
// Works because songs stream from our own server; the browser zeroes the data for other-site audio.
// Once connected, ALL playback goes through the AudioContext, so it's created on a click (browsers start
// a context made without one suspended = silence) and resumed on every play.

const VIZ_MODES = [
    ['bars', 'Bars', 'bars'], ['wave', 'Wave', 'wave'], ['ring', 'Ring', 'ring'], ['particles', 'Particles', 'sparkle'],
    ['vinyl', 'Vinyl', 'vinyl'], ['retro', 'Retro', 'sun'], ['off', 'Off', 'off'],
];
const VIZ = Object.fromEntries(VIZ_MODES.map(([key, label, iconName]) => [key, { label, icon: iconName }]));
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const V = {
    mode: store.get('vizMode', reducedMotion.matches ? 'off' : 'bars'),
    ctx: null, analyser: null, freq: null, wave: null,
    canvas: null, raf: 0, color: [83, 83, 83], bands: {}, last: 0,
    smooth: { bass: 0, treble: 0, level: 0 },
    particles: null, stars: null, rotation: 0, arm: null, ridge: null, cover: null, // per-mode state
};
if (!VIZ[V.mode]) V.mode = 'bars';

function ensureAudioGraph() {
    if (V.analyser) return true;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return false;
    try {
        V.ctx = new AudioCtx();
        const source = V.ctx.createMediaElementSource(P.audio);
        V.analyser = V.ctx.createAnalyser();
        V.analyser.fftSize = 2048;               // 1024 frequency bins, each sampleRate/2048 ≈ 21.5 Hz wide
        V.analyser.smoothingTimeConstant = 0.8;  // blend 80% of the last frame in, so bars fall smoothly
        source.connect(V.analyser);
        V.analyser.connect(V.ctx.destination);   // forget this and the music goes silent
        V.freq = new Uint8Array(V.analyser.frequencyBinCount);
        V.wave = new Uint8Array(V.analyser.fftSize);
        P.audio.addEventListener('play', () => V.ctx.state === 'suspended' && V.ctx.resume());
        return true;
    } catch { return false; }
}

// Bars on a log scale, like hearing: 30 Hz to 16 kHz in equal *ratios*. Linear bins would give the bass
// (where most of the energy is) 3 bars and spend 50 on hiss. Returns [firstBin, lastBin] per bar.
function vizBands(count, sampleRate) {
    const binHz = sampleRate / 2048;
    const bands = [];
    for (let i = 0; i < count; i++) {
        const lo = 30 * Math.pow(16000 / 30, i / count);
        const hi = 30 * Math.pow(16000 / 30, (i + 1) / count);
        const first = Math.floor(lo / binHz);
        bands.push([first, Math.max(first, Math.floor(hi / binHz))]);
    }
    return bands;
}

function setVizColor(css) {
    const m = /rgb\((\d+), (\d+), (\d+)\)/.exec(css || '');
    V.color = m ? [+m[1], +m[2], +m[3]] : [83, 83, 83];
}

const bandsFor = (count) => V.bands[count] || (V.bands[count] = vizBands(count, V.ctx.sampleRate));
// Loudness 0-1 of each log-spaced band: its loudest bin
function bandLevels(count) {
    return bandsFor(count).map(([first, last]) => {
        let peak = 0;
        for (let k = first; k <= last; k++) peak = Math.max(peak, V.freq[k]);
        return peak / 255;
    });
}
const binAverage = (from, to) => { let sum = 0; for (let k = from; k <= to; k++) sum += V.freq[k]; return sum / ((to - from + 1) * 255); };
const lerp = (a, b, t) => a + (b - a) * t;
const tint = (alpha, lift = 0.55) => { const [r, g, b] = V.color.map((c) => Math.round(c + (255 - c) * lift)); return `rgba(${r}, ${g}, ${b}, ${alpha})`; };

// Each mode draws one frame onto the full-panel canvas. f = { w, h, dt, now, bass, treble, level, card, playing }
// card = the current cover's box inside the panel ({ x, y, size, cx, cy }), so Ring and Vinyl follow it as it slides.
const VIZ_DRAW = {
    bars(g, f) {
        const levels = bandLevels(64), stripH = f.h * 0.32, gap = 3, barW = (f.w - gap * 63) / 64;
        levels.forEach((v, i) => {
            const barH = Math.max(2, v * v * stripH);      // squared: quiet stays low, loud jumps out
            g.fillStyle = tint((0.14 + 0.36 * v) * (NV.lyrics ? 0.6 : 1)); // faint enough that white text on top stays readable
            g.beginPath();
            g.roundRect(i * (barW + gap), f.h - barH, barW, barH, [3, 3, 0, 0]);
            g.fill();
        });
    },
    wave(g, f) {
        V.analyser.getByteTimeDomainData(V.wave);          // 2048 samples, 128 = silence
        // Every 8th sample: 256 points is smoother than 2048 (~2 per pixel, jagged) and ⅛ of the work
        const points = V.wave.length / 8, step = f.w / (points - 1), mid = f.h * 0.8, amp = f.h * 0.18;
        g.lineWidth = 2;
        g.strokeStyle = tint(NV.lyrics ? 0.5 : 0.85);
        g.beginPath();
        for (let i = 0; i < points; i++) {
            const y = mid + ((V.wave[i * 8] - 128) / 128) * amp;
            i ? g.lineTo(i * step, y) : g.moveTo(0, y);
        }
        g.stroke();
    },
    // The spectrum bent into a circle around the (now round) cover, mirrored left/right so it's symmetric:
    // bass at the top, treble meeting at the bottom.
    ring(g, f) {
        if (!f.card) return;
        const levels = bandLevels(48), inner = f.card.size / 2 + 10, maxLen = f.card.size * 0.2;
        g.lineCap = 'round';
        g.lineWidth = Math.max(2, f.card.size * 0.012);
        for (let side = -1; side <= 1; side += 2) {
            levels.forEach((v, i) => {
                const angle = -Math.PI / 2 + side * (i + 0.5) * (Math.PI / 48);
                const len = 3 + v * v * maxLen;
                const cos = Math.cos(angle), sin = Math.sin(angle);
                g.strokeStyle = tint(0.35 + 0.6 * v);
                g.beginPath();
                g.moveTo(f.card.cx + cos * inner, f.card.cy + sin * inner);
                g.lineTo(f.card.cx + cos * (inner + len), f.card.cy + sin * (inner + len));
                g.stroke();
            });
        }
        // A soft glow behind the cover that swells with the bass
        const glow = g.createRadialGradient(f.card.cx, f.card.cy, inner * 0.8, f.card.cx, f.card.cy, inner + maxLen * (0.6 + f.bass));
        glow.addColorStop(0, tint(0.25 * f.bass + 0.05, 0.3));
        glow.addColorStop(1, tint(0, 0.3));
        g.fillStyle = glow;
        g.fillRect(0, 0, f.w, f.h);
    },
    // From VYBE: drifting dots. Bass = faster and bigger, treble = brighter, overall loudness = more opaque.
    particles(g, f) {
        if (!V.particles) {
            V.particles = Array.from({ length: 700 }, () => ({
                x: Math.random(), y: Math.random(), vx: (Math.random() - 0.5) * 0.04, vy: (Math.random() - 0.5) * 0.04, size: 0.6 + Math.random() * 1.4,
            }));
        }
        const speed = (0.3 + f.bass * 2.4) * f.dt, grow = 1 + f.bass * 1.6;
        const alpha = Math.min(1, (0.35 + f.treble * 0.65) * (0.5 + f.level * 0.8) + 0.1);
        g.fillStyle = tint(Math.min(0.75, alpha), 0.4);
        g.beginPath();
        for (const p of V.particles) {
            p.x = (p.x + p.vx * speed + 1) % 1;            // wrap around the edges
            p.y = (p.y + p.vy * speed + 1) % 1;
            const r = p.size * grow;
            g.moveTo(p.x * f.w + r, p.y * f.h);
            g.arc(p.x * f.w, p.y * f.h, r, 0, Math.PI * 2);
        }
        g.fill();                                         // one fill for all dots: ~1 draw call instead of 700
    },
    // From VYBE: a record at real 33⅓ RPM with the cover as its label; the tonearm swings off when paused.
    vinyl(g, f) {
        if (!f.card) return;
        const { cx, cy } = f.card, R = f.card.size / 2;
        if (f.playing) V.rotation += (33.333 / 60) * Math.PI * 2 * f.dt; // revolutions/s → radians this frame
        const glowR = R * (1.12 + f.bass * 0.25);
        const glow = g.createRadialGradient(cx, cy, R * 0.7, cx, cy, glowR);
        glow.addColorStop(0, tint(0.2 + f.bass * 0.35, 0.3));
        glow.addColorStop(1, tint(0, 0.3));
        g.fillStyle = glow;
        g.beginPath(); g.arc(cx, cy, glowR, 0, Math.PI * 2); g.fill();

        g.save();
        g.translate(cx, cy);
        g.rotate(V.rotation);
        g.fillStyle = '#0b0b0e';
        g.beginPath(); g.arc(0, 0, R, 0, Math.PI * 2); g.fill();
        for (let i = 0; i < 26; i++) {                     // grooves
            g.strokeStyle = i % 4 === 0 ? 'rgba(255,255,255,.09)' : 'rgba(255,255,255,.04)';
            g.lineWidth = 1;
            g.beginPath(); g.arc(0, 0, R * (0.36 + (i / 26) * 0.6), 0, Math.PI * 2); g.stroke();
        }
        const sheen = g.createLinearGradient(-R, -R, R, R);
        sheen.addColorStop(0, 'rgba(255,255,255,0)'); sheen.addColorStop(0.48, 'rgba(255,255,255,.06)');
        sheen.addColorStop(0.52, 'rgba(255,255,255,.06)'); sheen.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = sheen;
        g.beginPath(); g.arc(0, 0, R, 0, Math.PI * 2); g.fill();
        const label = R * 0.36;
        g.save();
        g.beginPath(); g.arc(0, 0, label, 0, Math.PI * 2); g.clip();
        if (V.cover && V.cover.complete && V.cover.naturalWidth) {
            const side = Math.min(V.cover.naturalWidth, V.cover.naturalHeight); // centre-crop, like object-fit: cover
            g.drawImage(V.cover, (V.cover.naturalWidth - side) / 2, (V.cover.naturalHeight - side) / 2, side, side, -label, -label, label * 2, label * 2);
        } else { g.fillStyle = tint(1, 0); g.fillRect(-label, -label, label * 2, label * 2); }
        g.restore();
        g.fillStyle = '#050507';
        g.beginPath(); g.arc(0, 0, R * 0.025, 0, Math.PI * 2); g.fill();
        g.restore();

        // Tonearm: aimed at a real point on the record (not guessed), easing between playing and resting
        const pivotX = cx + R * 1.08, pivotY = cy - R * 1.02;
        const tipX = cx + Math.cos(-0.85) * R * 0.75, tipY = cy + Math.sin(-0.85) * R * 0.75;
        const armLen = Math.hypot(tipX - pivotX, tipY - pivotY), playAngle = Math.atan2(tipY - pivotY, tipX - pivotX);
        V.arm = lerp(V.arm ?? playAngle - 1.15, f.playing ? playAngle : playAngle - 1.15, Math.min(1, f.dt * 3));
        const armW = Math.max(2, R * 0.03);
        g.save();
        g.translate(pivotX, pivotY);
        g.rotate(V.arm);
        g.strokeStyle = '#d8d8de'; g.lineWidth = armW; g.lineCap = 'round';
        g.beginPath(); g.moveTo(0, 0); g.lineTo(armLen, 0); g.stroke();
        g.fillStyle = '#c9c9d2'; g.fillRect(armLen - armW * 1.6, -armW * 0.9, armW * 3.2, armW * 1.8);
        g.fillStyle = '#2a2a32'; g.beginPath(); g.arc(0, 0, armW * 1.8, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#c9c9d2'; g.beginPath(); g.arc(0, 0, armW * 0.6, 0, Math.PI * 2); g.fill();
        g.restore();
    },
    // From VYBE: synthwave. Starfield, a striped sun, a scrolling perspective grid, and the spectrum as a
    // mountain range mirrored from the centre (bass at the edges), so both sides rise together.
    retro(g, f) {
        const horizon = f.h * 0.66, cx = f.w / 2;
        const sky = g.createLinearGradient(0, 0, 0, horizon);
        sky.addColorStop(0, '#0c0616'); sky.addColorStop(1, '#1b0a2e');
        g.fillStyle = sky; g.fillRect(0, 0, f.w, horizon);
        const ground = g.createLinearGradient(0, horizon, 0, f.h);
        ground.addColorStop(0, '#170a28'); ground.addColorStop(1, '#040207');
        g.fillStyle = ground; g.fillRect(0, horizon, f.w, f.h - horizon);
        if (!V.stars) V.stars = Array.from({ length: 90 }, () => ({ x: Math.random(), y: Math.random(), r: 0.5 + Math.random() * 1.3, phase: Math.random() * 6.28 }));
        const t = f.now / 1000;
        g.fillStyle = '#ffe3f7';
        for (const star of V.stars) {
            g.globalAlpha = 0.25 + 0.3 * (1 + Math.sin(t * 1.4 + star.phase));
            g.beginPath(); g.arc(star.x * f.w, star.y * horizon, star.r, 0, Math.PI * 2); g.fill();
        }
        g.globalAlpha = 1;
        const sunR = f.h * 0.17;
        g.save();
        g.beginPath(); g.arc(cx, horizon, sunR, 0, Math.PI * 2); g.clip();
        const sun = g.createLinearGradient(0, horizon - sunR, 0, horizon + sunR);
        sun.addColorStop(0, '#ffd23f'); sun.addColorStop(0.5, '#ff7a3d'); sun.addColorStop(1, '#ff2f8f');
        g.fillStyle = sun; g.fillRect(cx - sunR, horizon - sunR, sunR * 2, sunR * 2);
        g.fillStyle = '#1b0a2e';
        for (let y = horizon - sunR * 0.05, gap = sunR * 0.05; y < horizon + sunR; y += gap, gap *= 1.22) g.fillRect(cx - sunR, y, sunR * 2, gap * 0.6);
        g.restore();
        g.strokeStyle = 'rgba(255, 90, 210, .35)'; g.lineWidth = 1;
        for (let i = 0; i <= 16; i++) { g.beginPath(); g.moveTo(cx, horizon); g.lineTo(f.w * (i / 16 - 0.5) * 2.6 + cx, f.h); g.stroke(); }
        const scroll = (t * 0.12) % 1;
        for (let i = 0; i <= 14; i++) {
            const k = ((i + scroll) / 14) % 1, y = horizon + (f.h - horizon) * k ** 1.9;
            g.globalAlpha = 0.15 + (1 - k) * 0.1;
            g.beginPath(); g.moveTo(0, y); g.lineTo(f.w, y); g.stroke();
        }
        g.globalAlpha = 1;
        // Mountains: 36 log bands, eased, bass at the outer edge, mirrored onto the right half
        const levels = bandLevels(36);
        V.ridge = V.ridge || new Float32Array(36);
        levels.forEach((v, i) => { V.ridge[i] = lerp(V.ridge[i], v, Math.min(1, f.dt * 12)); });
        const half = f.w / 2, step = half / 36, peak = f.h * 0.3;
        const pts = Array.from(V.ridge, (v, i) => ({ x: i * step + step / 2, y: horizon - v * peak }));
        pts.push({ x: half, y: pts[35].y });
        const trace = () => {
            g.moveTo(0, horizon); g.lineTo(pts[0].x, pts[0].y);
            for (let i = 0; i < pts.length - 1; i++) g.quadraticCurveTo(pts[i].x, pts[i].y, (pts[i].x + pts[i + 1].x) / 2, (pts[i].y + pts[i + 1].y) / 2);
            for (let i = pts.length - 1; i > 0; i--) g.quadraticCurveTo(f.w - pts[i].x, pts[i].y, f.w - (pts[i].x + pts[i - 1].x) / 2, (pts[i].y + pts[i - 1].y) / 2);
            g.lineTo(f.w - pts[0].x, pts[0].y); g.lineTo(f.w, horizon);
        };
        g.save();
        g.shadowColor = 'rgba(255, 47, 200, .65)'; g.shadowBlur = 18;
        g.beginPath(); trace(); g.closePath();
        const fill = g.createLinearGradient(0, horizon - peak, 0, horizon);
        fill.addColorStop(0, '#ff2fd0'); fill.addColorStop(0.55, '#ff4d7a'); fill.addColorStop(1, '#ff9a3d');
        g.fillStyle = fill; g.fill();
        g.restore();
        g.beginPath(); trace();
        g.strokeStyle = 'rgba(255, 220, 245, .8)'; g.lineWidth = 1.5; g.stroke();
    },
};
const PULSE_MODES = new Set(['bars', 'wave', 'ring', 'particles', 'retro']); // Vinyl replaces the cover; no pulse

function vizFrame(now) {
    V.raf = 0;
    if (!NV.open || V.mode === 'off' || !V.analyser || document.hidden) return;
    const canvas = V.canvas, section = canvas.parentElement;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    }
    const g = canvas.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);

    V.analyser.getByteFrequencyData(V.freq);
    const dt = Math.min(0.1, (now - (V.last || now)) / 1000); // seconds since last frame, so speed doesn't depend on refresh rate
    V.last = now;
    // bins 2-6 ≈ 43-150 Hz (kick, bass); 140-460 ≈ 3-10 kHz (hi-hats, sibilance); eased so they don't flicker
    V.smooth.bass = lerp(V.smooth.bass, binAverage(2, 6), 0.35);
    V.smooth.treble = lerp(V.smooth.treble, binAverage(140, 460), 0.25);
    V.smooth.level = lerp(V.smooth.level, binAverage(0, 511), 0.2);

    const cardEl = $('.nv-card.current', section);
    let card = null;
    if (cardEl) {
        const a = cardEl.getBoundingClientRect(), b = section.getBoundingClientRect();
        const size = cardEl.offsetWidth;                  // unscaled size: the pulse shouldn't feed back into the ring
        card = { size, cx: a.left - b.left + a.width / 2, cy: a.top - b.top + a.height / 2 };
    }
    const bass = V.smooth.bass;
    VIZ_DRAW[V.mode](g, { w, h, dt, now, bass, treble: V.smooth.treble, level: V.smooth.level, card, playing: !P.audio.paused });
    if (cardEl) cardEl.style.transform = PULSE_MODES.has(V.mode) && !reducedMotion.matches ? `scale(${1 + 0.035 * bass * bass})` : '';
    V.raf = requestAnimationFrame(vizFrame);
}

function startViz() {
    if (V.raf || !NV.open || V.mode === 'off' || !ensureAudioGraph()) return;
    if (V.ctx.state === 'suspended') V.ctx.resume();
    V.last = 0;
    V.raf = requestAnimationFrame(vizFrame);
}

function stopViz() {
    cancelAnimationFrame(V.raf);
    V.raf = 0;
    if (V.canvas) V.canvas.getContext('2d').clearRect(0, 0, V.canvas.width, V.canvas.height);
    const cover = $('#nowRoot .nv-card.current');
    if (cover) cover.style.transform = '';
}

function setVizMode(mode) {
    if (!VIZ[mode]) return;
    V.mode = mode;
    store.set('vizMode', mode);
    const section = $('#nowRoot .nv');
    if (section) section.dataset.viz = mode;               // CSS: round cover for Ring, hidden cover for Vinyl
    const btn = $('#nowRoot [data-nv-viz]');
    if (btn) { btn.innerHTML = vizButtonInner().s; btn.classList.toggle('on', mode !== 'off'); }
    $$('#nowRoot [data-viz-option]').forEach((item) => item.setAttribute('aria-checked', item.dataset.vizOption === mode));
    stopViz();
    startViz();
}
const cycleVizMode = () => setVizMode(VIZ_MODES[(VIZ_MODES.findIndex(([k]) => k === V.mode) + 1) % VIZ_MODES.length][0]);
const vizButtonInner = () => html`${icon(VIZ[V.mode].icon, 16)}<span>${VIZ[V.mode].label}</span>${icon('down', 14, 'chev')}`;
const vizMenu = () => html`<div class="nv-viz-menu" role="menu" aria-label="Visualizer" hidden>
    ${VIZ_MODES.map(([key, label, iconName]) => html`<button role="menuitemradio" aria-checked="${String(key === V.mode)}" data-viz-option="${key}" tabindex="-1">${icon(iconName, 16)}<span>${label}</span>${icon('checkPlain', 16, 'tick')}</button>`)}
</div>`;

// Dropdown: button toggles, ↑/↓ move, Enter/Space pick, Esc/Tab/click-outside close (Esc here doesn't close the view)
function vizMenuOpen() { const m = $('#nowRoot .nv-viz-menu'); return !!m && !m.hidden; }
function openVizMenu(focusCurrent = true) {
    const menu = $('#nowRoot .nv-viz-menu'), btn = $('#nowRoot [data-nv-viz]');
    if (!menu) return;
    menu.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    if (focusCurrent) ($('[aria-checked="true"]', menu) || $('[data-viz-option]', menu)).focus();
}
function closeVizMenu(returnFocus = true) {
    const menu = $('#nowRoot .nv-viz-menu'), btn = $('#nowRoot [data-nv-viz]');
    if (!menu || menu.hidden) return;
    menu.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
    if (returnFocus) btn.focus();
}

// The song `offset` steps away in play order, or null. Wraps only when that's what next() would do.
function neighbour(offset) {
    if (!currentTrack()) return null;
    let i = P.pos + offset;
    if ((i < 0 || i >= P.order.length) && P.repeat === 'all' && !P.shuffle) i = (i + P.order.length) % P.order.length;
    return i >= 0 && i < P.order.length ? S.byId.get(P.queue[P.order[i]]) || null : null;
}

function stepSong(offset) {
    if (offset > 0) return neighbour(1) && next();
    if (!neighbour(-1)) return;
    P.pos = P.pos > 0 ? P.pos - 1 : P.order.length - 1; // previous song, even past the 3 s "restart" point
    loadAndPlay();
}

function nvCard(t, step) {
    if (!t) return html`<div class="nv-card empty" aria-hidden="true"></div>`;
    const art = t.has_cover ? html`<img src="${artUrl(t.id)}" alt="">` : icon('note', 64);
    if (!step) return html`<div class="nv-card current">${art}</div>`;
    return html`<button class="nv-card" data-nv-step="${step}" aria-label="${step > 0 ? 'Next' : 'Previous'}: ${t.title}" tabindex="-1">${art}</button>`;
}

function renderNowView() {
    const root = $('#nowRoot');
    const t = currentTrack();
    if (!NV.open || !t) { root.innerHTML = ''; return; }
    const prevT = neighbour(-1), nextT = neighbour(1);
    // Slide the feed the way the songs moved: the old "next" coming up from below, or the old "previous" from above
    const dir = t.id === NV.nextId ? 'up' : t.id === NV.prevId ? 'down' : '';
    NV.prevId = prevT && prevT.id;
    NV.nextId = nextT && nextT.id;
    const context = P.context || { label: 'All songs', href: '#/songs' };
    const year = t.year ? ` • ${t.year}` : '';
    const hadFocus = root.contains(document.activeElement) ? document.activeElement.dataset.nvFocus : null;

    // The backdrop and panel are built once per opening; re-renders (song change, lyrics on/off) only replace
    // what's inside. Rebuilding them replayed the backdrop's fade-in and reset the tint to grey: a visible flash.
    let section = $('.nv', root);
    if (!section) {
        root.innerHTML = `<div class="nv-backdrop" data-nv-close><section class="nv" role="dialog" aria-label="Now playing" tabindex="-1" data-nv-focus="panel"></section></div>`;
        section = $('.nv', root);
    }
    section.dataset.viz = V.mode;
    section.innerHTML = html`
                <header class="nv-head">
                    <a class="nv-context" href="${context.href}">${context.label}</a>
                    <div class="nv-head-actions">
                        <button class="nv-pill ${NV.lyrics ? 'on' : ''}" data-nv-lyrics data-nv-focus="lyrics" aria-pressed="${String(NV.lyrics)}" title="Lyrics (L)">${icon('mic', 16)}<span>Lyrics</span></button>
                        <div class="nv-viz-wrap">
                            <button class="nv-viz ${V.mode !== 'off' ? 'on' : ''}" data-nv-viz data-nv-focus="viz" aria-haspopup="menu" aria-expanded="false" title="Visualizer (V)"><span class="sr-only">Visualizer: </span>${vizButtonInner()}</button>
                            ${vizMenu()}
                        </div>
                        <button class="icon-btn" data-nv-close data-nv-focus="close" aria-label="Close">${icon('close', 20)}</button>
                    </div>
                </header>
                <div class="nv-body">
                    <div class="nv-info">
                        <h2 class="nv-title ${t.title.length > 40 ? 'long' : ''}">${t.title}</h2>
                        <p class="nv-artists">${t.artists.map((a, i) => html`${i ? ', ' : ''}<a href="${artistHref(a)}">${a}</a>`)}</p>
                        <p class="nv-album">${t.album}${year}</p>
                        <div class="nv-like">${likeButton(t.id, { big: true })}</div>
                        <div class="nv-progress" aria-hidden="true"><i></i></div>
                        ${t.genre ? html`<div class="nv-tags"><a class="chip small" href="${genreHref(t.genre)}">#${t.genre.toLowerCase()}</a></div>` : ''}
                        ${nextT ? html`<p class="nv-upnext"><span>Up next</span>${nextT.title} • ${nextT.artists.join(', ')}</p>` : ''}
                    </div>
                    ${NV.lyrics
                        ? html`<div class="nv-lyrics" tabindex="0" aria-label="Lyrics">${lyricsBody(t.id)}</div>`
                        : html`<div class="nv-feed ${dir}" aria-live="polite">${nvCard(prevT, -1)}${nvCard(t, 0)}${nvCard(nextT, 1)}</div>`}
                    <div class="nv-nav">
                        <button class="icon-btn" data-nv-step="-1" data-nv-focus="up" aria-label="Previous song" ${prevT ? '' : 'disabled'}>${icon('up', 24)}</button>
                        <button class="icon-btn" data-nv-step="1" data-nv-focus="down" aria-label="Next song" ${nextT ? '' : 'disabled'}>${icon('down', 24)}</button>
                    </div>
                </div>`.toString();
    // One canvas for the whole time the view is open, moved into each re-render, so drawing never restarts
    if (!V.canvas) { V.canvas = document.createElement('canvas'); V.canvas.className = 'nv-viz-canvas'; V.canvas.setAttribute('aria-hidden', 'true'); }
    section.prepend(V.canvas);
    if (t.has_cover && (!V.cover || V.cover.dataset.id !== t.id)) { V.cover = new Image(); V.cover.dataset.id = t.id; V.cover.src = artUrl(t.id); }
    else if (!t.has_cover) V.cover = null;
    const focusEl = hadFocus && $(`[data-nv-focus="${hadFocus}"]`, root);
    if (focusEl && !focusEl.disabled) focusEl.focus(); else if (hadFocus) section.focus();
    updateNowProgress();
    if (NV.lyrics) { fetchLyrics(t.id); L.index = -2; startLyrics(); }
    const coverUrl = t.has_cover ? artUrl(t.id) : null;
    const applyColor = (color) => { section.style.setProperty('--nv', color || '#535353'); setVizColor(color); };
    if (NV.colors.has(coverUrl)) applyColor(NV.colors.get(coverUrl)); // known: no grey frame in between
    else coverColor(coverUrl).then((color) => { NV.colors.set(coverUrl, color); if (currentTrack() === t) applyColor(color); });
}

function updateNowProgress() {
    const bar = NV.open && $('#nowRoot .nv-progress i');
    if (bar) bar.style.width = `${P.audio.duration ? (P.audio.currentTime / P.audio.duration) * 100 : 0}%`;
}

function openNowView() {
    if (!currentTrack() || NV.open) return;
    NV.open = true;
    NV.opener = document.activeElement;
    NV.prevId = NV.nextId = null; // no slide on open
    renderNowView();
    $('#nowBtn').setAttribute('aria-pressed', 'true');
    $('#nowRoot .nv').focus();
    startViz();  // opening is a click, so the AudioContext may start here
}

function closeNowView() {
    if (!NV.open) return;
    NV.open = false;
    stopViz();
    renderNowView();
    $('#nowBtn').setAttribute('aria-pressed', 'false');
    if (NV.opener && NV.opener.isConnected) NV.opener.focus();
}

function bindNowView() {
    $('#nowBtn').innerHTML = icon('expand', 16).s;
    $('#nowBtn').addEventListener('click', () => (NV.open ? closeNowView() : openNowView()));
    $('#player').addEventListener('click', (e) => { if (e.target.closest('#npArt')) openNowView(); });
    const root = $('#nowRoot');
    root.addEventListener('click', (e) => {
        const step = e.target.closest('[data-nv-step]');
        if (step) { stepSong(+step.dataset.nvStep); return; }
        const line = e.target.closest('.nv-line[data-t]');
        if (line) { P.audio.currentTime = +line.dataset.t; if (P.audio.paused) P.audio.play(); L.userScrollUntil = 0; return; }
        if (e.target.closest('[data-nv-lyrics]')) { toggleLyrics(); return; }
        if (e.target.closest('[data-lyrics-retry]')) { const t = currentTrack(); if (t) { L.data.delete(t.id); fillLyrics(); fetchLyrics(t.id); } return; }
        const option = e.target.closest('[data-viz-option]');
        if (option) { setVizMode(option.dataset.vizOption); closeVizMenu(); return; }
        if (e.target.closest('[data-nv-viz]')) { vizMenuOpen() ? closeVizMenu() : openVizMenu(e.detail === 0); return; } // detail 0 = keyboard
        if (vizMenuOpen()) { closeVizMenu(false); if (!e.target.closest('a, button')) return; }
        // Close on the X, on the dimmed area around the panel, or when a link inside navigates away
        if (e.target.closest('button[data-nv-close]') || e.target.matches('.nv-backdrop') || e.target.closest('a')) closeNowView();
    });
    // On document, not the view: focus may be on the player bar (e.g. after pausing) while the view is open
    document.addEventListener('keydown', (e) => {
        if (!NV.open || $('#modalRoot').children.length) return;
        const el = e.target instanceof Element ? e.target : document.body;
        if (vizMenuOpen()) {
            const items = $$('#nowRoot [data-viz-option]'), i = items.indexOf(document.activeElement);
            if (e.key === 'Escape') { e.preventDefault(); closeVizMenu(); }
            else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus();
            } else if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); items[e.key === 'Home' ? 0 : items.length - 1].focus(); }
            else if (e.key === 'Tab') closeVizMenu(false);
            return;                                        // Enter/Space click the focused option natively
        }
        if (e.key === 'Escape') { e.preventDefault(); closeNowView(); }
        else if (e.key === 'ArrowDown' && el.closest('[data-nv-viz]')) { e.preventDefault(); openVizMenu(); }
        else if (e.key.toLowerCase() === 'l' && !e.metaKey && !e.ctrlKey && !el.closest('input, textarea, select')) toggleLyrics();
        else if (e.key.toLowerCase() === 'v' && !e.metaKey && !e.ctrlKey && !el.closest('input, textarea, select')) cycleVizMode();
        else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && (root.contains(el) || el === document.body)) {
            e.preventDefault();
            stepSong(e.key === 'ArrowDown' ? 1 : -1);
        }
    });
    // One song per scroll gesture: a trackpad fires dozens of small wheel events, so add them up and then pause
    root.addEventListener('wheel', (e) => {
        if (!e.target.closest('.nv-feed')) return;
        e.preventDefault();
        if (Date.now() < NV.wheelLock) return;
        NV.wheel += e.deltaY;
        if (Math.abs(NV.wheel) > 60) {
            stepSong(NV.wheel > 0 ? 1 : -1);
            NV.wheel = 0;
            NV.wheelLock = Date.now() + 700;
        }
    }, { passive: false });
    for (const type of ['wheel', 'touchmove', 'pointerdown']) {
        root.addEventListener(type, (e) => { if (e.target.closest('.nv-lyrics')) L.userScrollUntil = Date.now() + 3000; }, { passive: true });
    }
    window.addEventListener('hashchange', closeNowView);
    // rAF stops in a hidden window anyway; restart drawing when it comes back
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { startViz(); startLyrics(); } });
}

function setRangeFill(input) {
    const pct = ((input.value - input.min) / (input.max - input.min)) * 100;
    input.style.setProperty('--fill', `${pct}%`);
}

function bindPlayer() {
    $('#shuffleBtn').innerHTML = icon('shuffle', 16).s;
    $('#prevBtn').innerHTML = icon('prev', 16).s;
    $('#nextBtn').innerHTML = icon('next', 16).s;
    $('#playBtn').addEventListener('click', togglePlay);
    $('#nextBtn').addEventListener('click', () => next());
    $('#prevBtn').addEventListener('click', prev);
    $('#shuffleBtn').addEventListener('click', toggleShuffle);
    $('#repeatBtn').addEventListener('click', cycleRepeat);

    const seek = $('#seekBar');
    seek.addEventListener('input', () => {
        P.seeking = true;
        setRangeFill(seek);
        $('#timeCurrent').textContent = fmtTime((seek.value / 1000) * (P.audio.duration || 0));
    });
    seek.addEventListener('change', () => {
        if (P.audio.duration) P.audio.currentTime = (seek.value / 1000) * P.audio.duration;
        P.seeking = false;
    });

    const volume = $('#volumeBar');
    const mute = $('#muteBtn');
    const showVolume = () => {
        volume.value = P.audio.muted ? 0 : Math.round(P.audio.volume * 100);
        setRangeFill(volume);
        const v = P.audio.muted ? 0 : P.audio.volume;
        mute.innerHTML = icon(v === 0 ? 'mute' : v < 0.5 ? 'volumeLow' : 'volume', 16).s;
        mute.setAttribute('aria-label', P.audio.muted ? 'Unmute' : 'Mute');
    };
    volume.addEventListener('input', () => {
        P.audio.muted = false;
        P.audio.volume = volume.value / 100;
        store.set('volume', P.audio.volume);
        showVolume();
    });
    mute.addEventListener('click', () => { P.audio.muted = !P.audio.muted; showVolume(); });
    showVolume();

    P.audio.addEventListener('timeupdate', () => {
        if (!P.audio.paused && listen.id) {
            const now = P.audio.currentTime;
            if (listen.last !== null && now > listen.last && now - listen.last < 1.5) listen.seconds += now - listen.last;
            listen.last = now;
        }
        if (P.seeking) return;
        const d = P.audio.duration || 0;
        seek.value = d ? Math.round((P.audio.currentTime / d) * 1000) : 0;
        setRangeFill(seek);
        $('#timeCurrent').textContent = fmtTime(P.audio.currentTime);
        $('#timeTotal').textContent = fmtTime(d);
        updateNowProgress();
    });
    P.audio.addEventListener('loadedmetadata', () => { $('#timeTotal').textContent = fmtTime(P.audio.duration); });
    P.audio.addEventListener('play', updateControls);
    P.audio.addEventListener('pause', updateControls);
    P.audio.addEventListener('ended', () => { flushListen(); next(true); });  // report before moving on (or stopping)
    P.audio.addEventListener('seeking', () => { listen.last = null; });  // a jump isn't listening
    window.addEventListener('pagehide', () => { flushListen(true); saveSession(); });
    P.audio.addEventListener('pause', saveSession);
    let lastSave = 0;
    P.audio.addEventListener('timeupdate', () => { if (Date.now() - lastSave > 5000) { lastSave = Date.now(); saveSession(); } });
    P.audio.addEventListener('error', () => {
        const t = currentTrack();
        if (t && P.audio.src) { toast(`Couldn't load "${t.title}". Skipping.`, 'error'); setTimeout(() => next(true), 600); }
    });

    if ('mediaSession' in navigator) {
        const ms = navigator.mediaSession;
        ms.setActionHandler('play', () => P.audio.play());
        ms.setActionHandler('pause', () => P.audio.pause());
        ms.setActionHandler('previoustrack', prev);
        ms.setActionHandler('nexttrack', () => next());
        try { ms.setActionHandler('seekto', (e) => { P.audio.currentTime = e.seekTime; }); } catch { /* unsupported */ }
    }
    updateControls();
}

// ---------- downloads ----------

const ACTIVE = new Set(['queued', 'downloading']);
let pollTimer = null;

const jobFor = (url) => S.jobs.find((j) => j.query === url && ACTIVE.has(j.status));

async function startDownload({ url, type, title, image, total }) {
    try {
        const job = await api('/download', {
            method: 'POST',
            body: JSON.stringify({ query: url, type, title, image, total, format: S.settings.format, bitrate: S.settings.bitrate, includeLyrics: S.settings.lyrics }),
        });
        S.jobs.unshift(job);
        toast(`Added to downloads: ${job.title}`);
        updateDownloadButtons();
        schedulePoll(300);
    } catch (err) {
        toast(err.message, 'error');
    }
}

function schedulePoll(delay) {
    clearTimeout(pollTimer);
    pollTimer = setTimeout(pollJobs, delay);
}

async function pollJobs() {
    let data;
    try { data = await api('/jobs'); } catch { schedulePoll(5000); return; }
    const before = new Map(S.jobs.map((j) => [j.id, j.status]));
    S.jobs = data.jobs;
    let finished = false;
    for (const job of S.jobs) {
        const was = before.get(job.id);
        if (was && ACTIVE.has(was) && !ACTIVE.has(job.status)) {
            finished = true;
            if (job.status === 'completed') toast(`Downloaded: ${job.title} (${job.message})`);
            else if (job.status === 'failed') toast(`Download failed: ${job.title}`, 'error');
        }
    }
    const active = S.jobs.filter((j) => ACTIVE.has(j.status)).length;
    const badge = $('#downloadsBadge');
    badge.hidden = !active;
    badge.textContent = active;
    $('#downloadsBtn').classList.toggle('busy', !!active);
    if (finished) { await loadLibrary(); rerender(); }
    else if (route().name === 'downloads') renderJobsList();
    else updateDownloadButtons();
    schedulePoll(active ? 1000 : 15000);
}

// Swap download buttons to spinners/checks without re-rendering the view
function updateDownloadButtons() {
    $$('[data-download-url]').forEach((btn) => {
        const job = jobFor(btn.dataset.downloadUrl);
        btn.classList.toggle('busy', !!job);
        btn.disabled = !!job;
        if (btn.classList.contains('status-btn')) {
            btn.innerHTML = icon(job ? 'loader' : 'download', 18, job ? 'spinning' : '').s;
        } else if (job) {
            btn.innerHTML = html`${icon('loader', 18, 'spinning')} ${job.status === 'queued' ? 'Queued' : 'Downloading…'}`.s;
        }
    });
}

// ---------- toasts & modal ----------

function toast(message, kind = '') {
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    el.textContent = message;
    $('#toasts').appendChild(el);
    setTimeout(() => el.remove(), kind === 'error' ? 6000 : 3500);
}

function connectionLine(c) {
    if (c && c.initialized) return html`<div class="conn-status ok">${icon('check', 16)} Connected${c.client_id_hint ? html` · Client ID ${c.client_id_hint}` : ''}</div>`;
    return html`<div class="conn-status bad">${icon('warn', 16)} <span>${c && c.configured ? 'Not working: ' : 'Not connected. '}${(c && c.message) || ''}</span></div>`;
}

// From source: how this copy relates to the release ("v2.0.1-3-gabc1234-dirty" = 3 commits after 2.0.1,
// plus uncommitted changes). Nothing for the installed app or an exact release checkout.
function buildLine(build, ver) {
    if (!build || build === `v${ver}`) return '';
    const m = /^v?([\d.]+)(?:-(\d+)-g([0-9a-f]+))?(-dirty)?$/.exec(build);
    if (!m) return html`<p class="about-build">Running from source (${build})</p>`;
    const parts = ['Running from source'];
    if (m[2]) parts.push(`${plural(+m[2], 'change')} after ${m[1]}`);
    if (m[4]) parts.push('with unsaved edits');
    return html`<p class="about-build" title="${build}">${parts.join(', ')}</p>`;
}

function openSettings(focus = 'downloads') {
    const s = S.settings;
    const lossless = (f) => f === 'flac' || f === 'wav';
    $('#modalRoot').innerHTML = html`
        <div class="modal-backdrop" data-close>
            <div class="modal wide" role="dialog" aria-modal="true" aria-labelledby="settingsTitle">
                <div class="modal-head"><h2 id="settingsTitle">Settings</h2>
                    <button type="button" class="icon-btn" data-close aria-label="Close settings">${icon('close', 18)}</button></div>

                <section class="modal-section" aria-labelledby="credsTitle">
                    <h3 id="credsTitle">Spotify connection</h3>
                    <div id="connStatus">${connectionLine(S.init)}</div>
                    <form id="credsForm" autocomplete="off">
                        <div class="field">
                            <label for="credId">Client ID</label>
                            <input class="field-input" id="credId" name="client_id" spellcheck="false" autocapitalize="off" maxlength="64" placeholder="32 letters and numbers">
                        </div>
                        <div class="field">
                            <label for="credSecret">Client Secret</label>
                            <div class="input-row">
                                <input class="field-input" id="credSecret" name="client_secret" type="password" autocomplete="new-password" spellcheck="false" maxlength="64" placeholder="32 letters and numbers">
                                <button type="button" class="pill-btn" id="credReveal" aria-pressed="false">Show</button>
                            </div>
                        </div>
                        <details class="how-to"><summary>Where do I get these?</summary>
                            <ol>
                                <li>Open the <a href="https://developer.spotify.com/dashboard/" target="_blank" rel="noopener">Spotify developer dashboard</a> → <strong>Create app</strong>.</li>
                                <li>Any name and description. Redirect URI: <code>http://127.0.0.1:8000/callback</code> (required, never used). Tick <strong>Web API</strong>.</li>
                                <li>Open the app → <strong>Settings</strong>, copy the Client ID, then <strong>View client secret</strong>.</li>
                            </ol>
                        </details>
                        <p class="form-error" id="credError" role="alert" hidden></p>
                        <div class="modal-actions">
                            <small class="field-note">Tested with Spotify before saving. Stored in <code>.env</code> on this computer only; the secret is never shown again.</small>
                            <button type="submit" class="pill-btn primary" id="credSave">Save & test</button>
                        </div>
                    </form>
                </section>

                <section class="modal-section" aria-labelledby="dlTitle">
                    <h3 id="dlTitle">Downloads</h3>
                    <form id="dlForm">
                        <div class="field">
                            <label for="setFormat">Format</label>
                            <select id="setFormat">
                                ${[['m4a', 'M4A (AAC) — recommended'], ['mp3', 'MP3 — plays everywhere'], ['opus', 'Opus — smallest'], ['flac', 'FLAC — lossless container'], ['wav', 'WAV — uncompressed']]
                                    .map(([v, label]) => html`<option value="${v}" ${v === s.format ? new Safe('selected') : ''}>${label}</option>`)}
                            </select>
                        </div>
                        <div class="field">
                            <label for="setBitrate">Quality</label>
                            <select id="setBitrate" ${lossless(s.format) ? new Safe('disabled') : ''}>
                                ${[['auto', 'Auto — keep source quality (recommended)'], ['128', '128 kbps'], ['192', '192 kbps'], ['256', '256 kbps'], ['320', '320 kbps']]
                                    .map(([v, label]) => html`<option value="${v}" ${v === s.bitrate ? new Safe('selected') : ''}>${label}</option>`)}
                            </select>
                            <small>Songs come from YouTube Music at about 128–160 kbps. Higher settings re-encode to a bigger file but can't add detail that isn't there.</small>
                        </div>
                        <div class="field">
                            <label class="check"><input type="checkbox" id="setLyrics" ${s.lyrics ? new Safe('checked') : ''}> Save synced lyrics (.lrc files)</label>
                        </div>
                        <div class="modal-actions"><button type="submit" class="pill-btn primary">Save download settings</button></div>
                    </form>
                </section>

                <section class="modal-section about" aria-label="About spotDLr">
                    <div class="about-name">${icon('spotDLr', 20)}<strong>spotDLr</strong><span class="about-version">${S.init.version ? `Version ${S.init.version}` : ''}</span></div>
                    ${buildLine(S.init.build, S.init.version)}
                    <a class="link about-link" href="https://github.com/HoldenGrant/spotDLr-web_ui/blob/main/CHANGELOG.md" target="_blank" rel="noopener">What's new</a>
                </section>
            </div>
        </div>`.s;

    // Listeners go on the backdrop, which is thrown away on close, so they never pile up
    const backdrop = $('#modalRoot .modal-backdrop');
    const opener = document.activeElement;
    const close = () => { $('#modalRoot').innerHTML = ''; if (opener && opener.focus) opener.focus(); };
    backdrop.addEventListener('click', (e) => { if (e.target.closest('[data-close]') && (e.target === backdrop || e.target.closest('button[data-close]'))) close(); });
    backdrop.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

    // Current status from the server (the cached S.init may be stale)
    api('/credentials').then((c) => {
        $('#connStatus').innerHTML = connectionLine(c).s;
        if (c.client_id_hint) $('#credId').placeholder = `Saved: ${c.client_id_hint} (enter a new one to replace it)`;
    }).catch(() => {});

    $('#credReveal').addEventListener('click', (e) => {
        const input = $('#credSecret');
        const show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        e.currentTarget.textContent = show ? 'Hide' : 'Show';
        e.currentTarget.setAttribute('aria-pressed', show);
    });

    $('#credsForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = $('#credId').value.trim();
        const secret = $('#credSecret').value.trim();
        const err = $('#credError');
        const showError = (msg) => { err.textContent = msg; err.hidden = false; };
        err.hidden = true;
        if (!/^[A-Za-z0-9]{32}$/.test(id)) return showError('The Client ID should be 32 letters and numbers. Copy it again from the dashboard.');
        if (!/^[A-Za-z0-9]{32}$/.test(secret)) return showError('The Client Secret should be 32 letters and numbers. Click "View client secret" in the dashboard and copy it.');
        const btn = $('#credSave');
        btn.disabled = true;
        btn.innerHTML = html`${icon('loader', 16, 'spinning')} Testing…`.s;
        try {
            const c = await api('/credentials', { method: 'POST', body: JSON.stringify({ client_id: id, client_secret: secret }) });
            S.init = { initialized: c.initialized, message: c.message };
            S.spotifyCache.clear();
            $('#connStatus').innerHTML = connectionLine(c).s;
            $('#credId').value = '';
            $('#credSecret').value = '';
            $('#credId').placeholder = `Saved: ${c.client_id_hint}`;
            toast(c.initialized ? 'Spotify connected' : 'Keys saved. Spotify isn\'t allowing requests yet (see the message above).', c.initialized ? '' : 'error');
            rerender();
        } catch (error) {
            showError(error.message);
            $('#credSecret').focus();
        } finally {
            btn.disabled = false;
            btn.textContent = 'Save & test';
        }
    });

    $('#setFormat').addEventListener('change', (e) => { $('#setBitrate').disabled = lossless(e.target.value); });
    $('#dlForm').addEventListener('submit', (e) => {
        e.preventDefault();
        S.settings = { format: $('#setFormat').value, bitrate: $('#setBitrate').value, lyrics: $('#setLyrics').checked };
        store.set('settings', S.settings);
        close();
        toast('Download settings saved');
        if (route().name === 'downloads') rerender();
    });
    (focus === 'spotify' ? $('#credId') : $('#setFormat')).focus();
}

// ---------- sidebar ----------

function renderSidebar() {
    $('#libraryChips').innerHTML = html`${[['all', 'All'], ['playlist', 'Playlists'], ['album', 'Albums'], ['artist', 'Artists']].map(([key, label]) =>
        html`<button class="chip ${S.libFilter === key ? 'active' : ''}" data-lib-filter="${key}">${label}</button>`)}`.s;

    const q = S.libQuery.trim().toLowerCase();
    const match = (text) => !q || text.toLowerCase().includes(q);
    const items = [];
    if ((S.libFilter === 'all' || S.libFilter === 'playlist') && match('Liked Songs')) {
        items.push(html`<li class="lib-item" data-href="#/liked" data-key="liked">${likedArt()}
            <div class="lib-item-text"><div class="lib-item-name">Liked Songs</div><div class="lib-item-sub">Playlist • ${plural(S.liked.size, 'song')}</div></div></li>`);
    }
    if (S.libFilter === 'all' && match('All songs')) {
        items.push(html`<li class="lib-item" data-href="#/songs" data-key="songs">${allSongsArt()}
            <div class="lib-item-text"><div class="lib-item-name">All songs</div><div class="lib-item-sub">Playlist • ${plural(S.tracks.length, 'song')}</div></div></li>`);
    }
    if (S.libFilter !== 'artist') {
        for (const c of S.collections) {
            if (S.libFilter !== 'all' && c.kind !== S.libFilter) continue;
            if (!match(c.name)) continue;
            const sub = c.kind === 'album' ? `Album • ${c.artist}` : `Playlist • ${plural(c.track_ids.length, 'song')}`;
            items.push(html`<li class="lib-item" data-href="#/collection/${encodeURIComponent(c.key)}" data-key="collection:${c.key}">${collectionArt(c)}
                <div class="lib-item-text"><div class="lib-item-name">${c.name}</div><div class="lib-item-sub">${sub}</div></div></li>`);
        }
    }
    if (S.libFilter === 'artist' || S.libFilter === 'all') {
        const artists = S.libFilter === 'all' ? S.artists.filter((a) => a.trackIds.length >= 3).slice(0, 12) : S.artists;
        for (const a of artists) {
            if (!match(a.name)) continue;
            items.push(html`<li class="lib-item" data-href="${artistHref(a.name)}" data-key="artist:${a.name}">${artistArt(a)}
                <div class="lib-item-text"><div class="lib-item-name">${a.name}</div><div class="lib-item-sub">Artist</div></div></li>`);
        }
    }
    $('#libraryList').innerHTML = items.length ? html`${items}`.s : html`<li class="empty" style="padding:24px 8px">Nothing here yet</li>`.s;
    highlightSidebar();
    markPlaying();
}

function highlightSidebar() {
    const hash = location.hash || '#/';
    $$('.lib-item').forEach((item) => item.classList.toggle('active', item.dataset.href === hash));
}

// ---------- shared view pieces ----------

const contexts = new Map(); // id -> { ids, context } for play buttons in the current view
let ctxSeq = 0;
function registerContext(ids, context) {
    const id = `ctx${++ctxSeq}`;
    contexts.set(id, { ids, context });
    return id;
}

// Track table for local tracks
function localTable(tracks, context, { showAlbum = true, numbered = true } = {}) {
    const ctx = registerContext(tracks.map((t) => t.id), context);
    return html`
    <div class="tracks ${showAlbum ? '' : 'no-album'}" role="grid" aria-label="${context.label}">
        <div class="track-head" role="row">
            <span>#</span><span>Title</span>${showAlbum ? html`<span class="album-cell">Album</span>` : ''}<span class="date-cell">Date added</span>
            <span class="right">${icon('clock', 16)}</span>
        </div>
        ${tracks.map((t, i) => html`
        <div class="track" role="row" data-id="${t.id}" data-ctx="${ctx}" data-index="${i}">
            <span class="num"><span class="n">${numbered ? i + 1 : ''}</span>${eq()}<button class="row-play" data-action="play-row" aria-label="Play ${t.title}">${icon('play', 14)}</button></span>
            <div class="title-cell">${trackArt(t)}<div class="title-text">
                <div class="title-name">${t.title}</div>
                <div class="title-sub"><span>${t.artists.map((a, j) => html`${j ? ', ' : ''}<a href="${artistHref(a)}">${a}</a>`)}</span></div>
            </div></div>
            ${showAlbum ? html`<span class="album-cell">${t.album}</span>` : ''}
            <span class="date-cell">${fmtAdded(t.added)}</span>
            <span class="duration right">${likeButton(t.id)}<span class="dur">${fmtTime(t.duration)}</span><button class="row-more" data-action="row-menu" aria-label="More options for ${t.title}" aria-haspopup="menu">${icon('more', 16)}</button></span>
        </div>`)}
    </div>`;
}

const likeButton = (id, { big = false } = {}) => html`<button class="like-btn ${big ? 'big' : ''} ${S.liked.has(id) ? 'on' : ''}" data-action="like" data-like-id="${id}" aria-pressed="${String(S.liked.has(id))}" aria-label="${S.liked.has(id) ? 'Remove from Liked Songs' : 'Save to Liked Songs'}">${icon(S.liked.has(id) ? 'heartFilled' : 'heart', big ? 22 : 16)}</button>`;

// Status button for a Spotify track: play if owned, else download
function trackStatus(t) {
    const localId = owned(t);
    if (localId) return html`<button class="status-btn owned" data-action="play-local" data-local-id="${localId}" title="In your library — play" aria-label="Play ${t.name} from your library">${icon('check', 18)}</button>`;
    const job = jobFor(t.url);
    return html`<button class="status-btn download ${job ? 'busy' : ''}" data-download-url="${t.url}" data-action="download" data-type="track" data-title="${t.artists.map((a) => a.name).join(', ')} - ${t.name}" data-image="${t.album.image || ''}" title="Download" aria-label="Download ${t.name}" ${job ? new Safe('disabled') : ''}>${icon(job ? 'loader' : 'download', 18, job ? 'spinning' : '')}</button>`;
}

function spotifyArtistLinks(artists, source) {
    return html`${artists.map((a, j) => html`${j ? ', ' : ''}${a.id ? html`<a href="${remoteHref({ source, id: a.id }, 'artist')}">${a.name}</a>` : a.name}`)}`;
}

// Track table for Spotify tracks (album / playlist / artist top tracks)
function spotifyTable(tracks, { showAlbum = true, showArt = true, context } = {}) {
    const localIds = tracks.map(owned).filter(Boolean);
    const ctx = registerContext(localIds, context);
    return html`
    <div class="tracks ${showAlbum ? '' : 'no-album'}" role="grid">
        <div class="track-head" role="row">
            <span>#</span><span>Title</span>${showAlbum ? html`<span class="album-cell">Album</span>` : ''}<span class="date-cell"></span>
            <span class="right">${icon('clock', 16)}</span>
        </div>
        ${tracks.map((t, i) => {
            const localId = owned(t);
            return html`
        <div class="track" role="row" ${localId ? html`data-id="${localId}" data-ctx="${ctx}" data-index="${localIds.indexOf(localId)}"` : ''}>
            <span class="num"><span class="n">${i + 1}</span>${eq()}${localId ? html`<button class="row-play" data-action="play-row" aria-label="Play ${t.name}">${icon('play', 14)}</button>` : ''}</span>
            <div class="title-cell">${showArt ? imageArt(t.album.image) : ''}<div class="title-text">
                <div class="title-name">${t.name}</div>
                <div class="title-sub">${t.explicit ? html`<span class="explicit" title="Explicit">E</span>` : ''}<span>${spotifyArtistLinks(t.artists, t.source)}</span></div>
            </div></div>
            ${showAlbum ? html`<span class="album-cell">${t.album.id ? html`<a href="${remoteHref({ source: t.source, id: t.album.id }, 'album')}">${t.album.name}</a>` : t.album.name || ''}</span>` : ''}
            <span class="date-cell"></span>
            <span class="duration right">${trackStatus(t)}<span>${fmtTime(t.duration_ms / 1000)}</span></span>
        </div>`;
        })}
    </div>`;
}

function card({ href, art, title, sub, playCtx, download }) {
    return html`
    <a class="card" href="${href}">
        <div class="card-art">${art}
            ${playCtx ? html`<button class="fab" data-action="play-ctx" data-ctx="${playCtx}" aria-label="Play ${title}">${icon('play', 20)}</button>` : ''}
            ${download ? html`<button class="fab secondary" data-action="download" data-download-url="${download.url}" data-type="${download.type}" data-title="${title}" data-image="${download.image || ''}" data-total="${download.total || ''}" aria-label="Download ${title}" title="Download">${icon('downloadPlain', 20)}</button>` : ''}
        </div>
        <div class="card-title">${title}</div>
        <div class="card-sub">${sub}</div>
    </a>`;
}

const collectionCard = (c) => card({
    href: `#/collection/${encodeURIComponent(c.key)}`,
    art: collectionArt(c),
    title: c.name,
    sub: c.kind === 'album' ? `${c.year || ''}${c.year ? ' • ' : ''}${c.artist}` : `${plural(c.track_ids.length, 'song')}`,
    playCtx: registerContext(c.track_ids, { key: `collection:${c.key}`, label: c.name, href: `#/collection/${encodeURIComponent(c.key)}` }),
});
const localArtistCard = (a) => card({
    href: artistHref(a.name), art: artistArt(a), title: a.name, sub: 'Artist',
    playCtx: registerContext(a.trackIds, { key: `artist:${a.name}`, label: a.name, href: artistHref(a.name) }),
});
const albumCard = (a) => card({
    href: remoteHref(a, 'album'), art: imageArt(a.image), title: a.name,
    sub: `${a.year || ''}${a.year ? ' • ' : ''}${a.album_type === 'single' ? 'Single' : a.artists.map((x) => x.name).join(', ')}`,
    download: { url: a.url, type: 'album', image: a.image, total: a.total_tracks },
});
const artistCard = (a) => card({ href: remoteHref(a, 'artist'), art: imageArt(a.image, 'round', 'user'), title: a.name, sub: 'Artist' });
const playlistCard = (p) => card({
    href: remoteHref(p, 'playlist'), art: imageArt(p.image), title: p.name, sub: `By ${p.owner || (p.source === 'ytm' ? 'YouTube Music' : 'Spotify')}`,
    download: { url: p.url, type: 'playlist', image: p.image, total: p.total_tracks },
});

function bigPlay(ctxKey, ids, context) {
    const ctx = registerContext(ids, context);
    return html`<button class="play-big" data-action="play-ctx" data-ctx="${ctx}" data-play-context="${ctxKey}" aria-label="Play">${icon('play', 24)}</button>`;
}
const shuffleToggle = () => html`<button class="toggle-btn ${P.shuffle ? 'on' : ''}" data-action="toggle-shuffle" aria-label="Shuffle" aria-pressed="${String(P.shuffle)}">${icon('shuffle', 28)}</button>`;

const titleSize = (name) => name.length > 30 ? 'small' : name.length > 14 ? 'medium' : '';

const loadingView = () => html`<div class="view-pad">${[1, 2, 3, 4, 5, 6].map(() => html`<div class="skeleton" style="height:56px;margin-bottom:8px"></div>`)}</div>`;
const errorView = (message) => html`<div class="view-pad"><div class="error-box">${message}</div></div>`;

// ---------- genres ----------

// One distinct colour per genre (Spotify's Browse cards are each a different saturated colour).
// Assigned by the genre's rank, not a hash of its name, so no two of the top 16 ever share a colour.
const GENRE_COLORS = ['#e13300', '#1e3264', '#148a08', '#8400e7', '#e8115b', '#0d73ec', '#bc5900', '#27856a',
    '#af2896', '#477d95', '#503750', '#7358ff', '#a56752', '#006450', '#e91429', '#8d67ab'];
const genreColor = (name) => {
    const rank = S.genres.findIndex((g) => g.name === name);
    return GENRE_COLORS[(rank < 0 ? 0 : rank) % GENRE_COLORS.length];
};
const genreHref = (name) => `#/genre/${encodeURIComponent(name)}`;

function genreCard(g) {
    const cover = S.byId.get(g.coverIds[0]);
    return html`<a class="genre-card" href="${genreHref(g.name)}" style="--c:${genreColor(g.name)}">
        <h3>${g.name}</h3><span class="genre-count">${plural(g.trackIds.length, 'song')}</span>
        ${cover && cover.has_cover ? html`<img src="${artUrl(cover.id)}" alt="" loading="lazy">` : ''}</a>`;
}

function genreProgress() {
    if (!S.genrePending) return '';
    return html`<p class="genre-progress">${icon('loader', 14, 'spinning')} Finding genres… ${S.genrePending} songs left</p>`;
}

function viewGenres() {
    return html`<div class="view-pad">
        <h1 class="greeting" style="margin-top:8px">Browse by genre</h1>${genreProgress()}
        ${S.genres.length ? html`<div class="genre-grid">${S.genres.map(genreCard)}</div>`
            : html`<div class="empty"><h2>No genres yet</h2><p>They're looked up in the background and appear here as they're found.</p></div>`}
    </div>`;
}

function viewGenre(name) {
    const g = S.genres.find((x) => x.name === name);
    if (!g) return html`<div class="empty"><h2>No ${name} songs yet</h2><p><a class="pill-btn" href="#/genres">All genres</a></p></div>`;
    const tracks = g.trackIds.map((id) => S.byId.get(id));
    const context = { key: `genre:${name}`, label: name, href: genreHref(name) };
    const total = tracks.reduce((sum, t) => sum + t.duration, 0);
    const color = genreColor(name);
    const art = g.coverIds.length >= 4
        ? html`<div class="art mosaic">${g.coverIds.map((id) => html`<img src="${artUrl(id)}" alt="">`)}</div>`
        : trackArt(S.byId.get(g.coverIds[0]));
    return html`
    <header class="hero" style="--hero:${color}">
        ${art}
        <div class="hero-text">
            <div class="hero-kind">Genre</div>
            <h1 class="hero-title ${titleSize(name)}">${name}</h1>
            <div class="hero-meta"><strong>Your library</strong><span class="dot">${plural(tracks.length, 'song')}, ${fmtLong(total)}</span></div>
        </div>
    </header>
    <div class="below-hero" style="--hero:${color}">
        <div class="action-bar">${bigPlay(context.key, g.trackIds, context)}${shuffleToggle()}
            <a class="pill-btn" href="#/genres">All genres</a></div>
        ${localTable(tracks, context)}
    </div>`;
}

// ---------- views ----------

function viewHome() {
    if (!S.tracks.length) {
        return html`<div class="empty">${icon('note', 48)}<h2>Your library is empty</h2>
            <p>Search for a song, album or playlist and download it. It'll show up here.</p>
            <a class="pill-btn primary" href="#/search">Search Spotify</a></div>`;
    }
    const recent = S.tracks.slice(0, 20);
    const recentCtx = registerContext(recent.map((t) => t.id), { key: 'recent', label: 'Recently added', href: '#/songs' });
    const tiles = [
        html`<a class="tile" href="#/songs">${allSongsArt()}<span class="tile-name">All songs</span>
            <button class="fab" data-action="play-ctx" data-ctx="${registerContext(S.tracks.map((t) => t.id), { key: 'songs', label: 'All songs', href: '#/songs' })}" aria-label="Play all songs">${icon('play', 16)}</button></a>`,
        ...S.collections.slice(0, 7).map((c) => html`<a class="tile" href="#/collection/${encodeURIComponent(c.key)}">${collectionArt(c)}<span class="tile-name">${c.name}</span>
            <button class="fab" data-action="play-ctx" data-ctx="${registerContext(c.track_ids, { key: `collection:${c.key}`, label: c.name, href: `#/collection/${encodeURIComponent(c.key)}` })}" aria-label="Play ${c.name}">${icon('play', 16)}</button></a>`),
    ];
    return html`
    
    <div class="greeting-wrap">
        <h1 class="greeting">${greeting()}</h1>
        <div class="tiles">${tiles}</div>
    </div>
    <div class="view-pad">
        <section class="section">
            <div class="section-head"><h2 class="section-title"><a href="#/songs">Recently added</a></h2><a class="section-more" href="#/songs">Show all</a></div>
            <div class="shelf">${recent.slice(0, 10).map((t, i) => html`
                <a class="card" href="${artistHref(t.artists[0])}">
                    <div class="card-art">${trackArt(t)}<button class="fab" data-action="play-ctx" data-ctx="${recentCtx}" data-index="${i}" aria-label="Play ${t.title}">${icon('play', 20)}</button></div>
                    <div class="card-title">${t.title}</div><div class="card-sub">${t.artists.join(', ')}</div>
                </a>`)}</div>
        </section>
        ${S.genres.length || S.genrePending ? html`<section class="section">
            <div class="section-head"><h2 class="section-title"><a href="#/genres">Browse by genre</a></h2>${S.genres.length ? html`<a class="section-more" href="#/genres">Show all</a>` : ''}</div>
            ${genreProgress()}
            <div class="genre-shelf">${S.genres.slice(0, 12).map(genreCard)}</div>
        </section>` : ''}
        <section class="section">
            <div class="section-head"><h2 class="section-title">Your playlists & albums</h2></div>
            <div class="shelf">${S.collections.map(collectionCard)}</div>
        </section>
        <section class="section">
            <div class="section-head"><h2 class="section-title">Artists in your library</h2></div>
            <div class="shelf">${S.artists.slice(0, 12).map(localArtistCard)}</div>
        </section>
    </div>`;
}

function viewSongs() {
    const context = { key: 'songs', label: 'All songs', href: '#/songs' };
    const total = S.tracks.reduce((sum, t) => sum + t.duration, 0);
    return html`
    <header class="hero" style="--hero:#5038a0">
        ${allSongsArt()}
        <div class="hero-text">
            <div class="hero-kind">Playlist</div>
            <h1 class="hero-title">All songs</h1>
            <div class="hero-meta"><strong>Downloaded</strong><span class="dot">${plural(S.tracks.length, 'song')}, ${fmtLong(total)}</span></div>
        </div>
    </header>
    <div class="below-hero" style="--hero:#5038a0">
        <div class="action-bar">${bigPlay('songs', S.tracks.map((t) => t.id), context)}${shuffleToggle()}</div>
        ${S.genres.length ? html`<div class="genre-chips">${S.genres.map((g) => html`<a class="chip" href="${genreHref(g.name)}">${g.name} <span class="chip-count">${g.trackIds.length}</span></a>`)}</div>` : ''}
        ${S.tracks.length ? localTable(S.tracks, context) : html`<div class="empty"><h2>No songs yet</h2><p>Downloads show up here.</p></div>`}
    </div>`;
}

function viewCollection(key) {
    const c = S.collections.find((x) => x.key === key);
    if (!c) return html`<div class="empty"><h2>Not found</h2><p>This folder isn't in your library anymore.</p></div>`;
    const tracks = c.track_ids.map((id) => S.byId.get(id)).filter(Boolean);
    const context = { key: `collection:${c.key}`, label: c.name, href: `#/collection/${encodeURIComponent(c.key)}` };
    const meta = c.kind === 'album'
        ? html`<a class="link" href="${artistHref(c.artist)}"><strong>${c.artist}</strong></a>${c.year ? html`<span class="dot">${c.year}</span>` : ''}<span class="dot">${plural(tracks.length, 'song')}, ${fmtLong(c.duration)}</span>`
        : html`<strong>${c.editable ? 'Your playlist' : 'Downloaded'}</strong><span class="dot">${plural(tracks.length, 'song')}, ${fmtLong(c.duration)}</span>`;
    return html`
    <header class="hero">
        ${collectionArt(c)}
        <div class="hero-text">
            <div class="hero-kind">${c.kind === 'album' ? 'Album' : 'Playlist'}</div>
            <h1 class="hero-title ${titleSize(c.name)}">${c.name}</h1>
            <div class="hero-meta">${meta}</div>
        </div>
    </header>
    <div class="below-hero">
        <div class="action-bar">${tracks.length ? html`${bigPlay(context.key, c.track_ids, context)}${shuffleToggle()}` : ''}${collectionMoreButton(c.name)}</div>
        ${tracks.length ? localTable(tracks, context, { showAlbum: c.kind !== 'album' })
            : html`<div class="empty"><h2>Let's find something for your playlist</h2><p>On any song, click ${icon('more', 14)} and choose <strong>Add to playlist</strong>.</p></div>`}
    </div>`;
}

const collectionMoreButton = (label) => html`<button class="toggle-btn big-more" data-action="collection-menu" aria-label="More options for ${label}" aria-haspopup="menu">${icon('more', 28)}</button>`;

function viewLiked() {
    const context = { key: 'liked', label: 'Liked Songs', href: '#/liked' };
    const tracks = S.likedOrder.map((id) => S.byId.get(id)).filter(Boolean);
    const total = tracks.reduce((sum, t) => sum + t.duration, 0);
    return html`
    <header class="hero" style="--hero:#4f3b9c">
        ${likedArt()}
        <div class="hero-text">
            <div class="hero-kind">Playlist</div>
            <h1 class="hero-title">Liked Songs</h1>
            <div class="hero-meta"><strong>Your likes</strong><span class="dot">${plural(tracks.length, 'song')}${tracks.length ? `, ${fmtLong(total)}` : ''}</span></div>
        </div>
    </header>
    <div class="below-hero" style="--hero:#4f3b9c">
        <div class="action-bar">${tracks.length ? html`${bigPlay('liked', tracks.map((t) => t.id), context)}${shuffleToggle()}${collectionMoreButton('Liked Songs')}` : ''}</div>
        ${tracks.length ? localTable(tracks, context, { numbered: true })
            : html`<div class="empty"><h2>Songs you like will appear here</h2><p>Save songs by tapping the ${icon('heart', 14)} next to them.</p></div>`}
    </div>`;
}

function viewLocalArtist(name) {
    const a = S.artists.find((x) => x.name === name);
    if (!a) return html`<div class="empty"><h2>No songs by ${name}</h2><p><a class="pill-btn primary" href="#/search/${encodeURIComponent(name)}">Search Spotify</a></p></div>`;
    const tracks = a.trackIds.map((id) => S.byId.get(id));
    const context = { key: `artist:${name}`, label: name, href: artistHref(name) };
    const total = tracks.reduce((sum, t) => sum + t.duration, 0);
    return html`
    <header class="hero">
        ${artistArt(a)}
        <div class="hero-text">
            <div class="hero-kind">Artist</div>
            <h1 class="hero-title ${titleSize(name)}">${name}</h1>
            <div class="hero-meta">${plural(tracks.length, 'song')} in your library<span class="dot">${fmtLong(total)}</span></div>
        </div>
    </header>
    <div class="below-hero">
        <div class="action-bar">${bigPlay(context.key, a.trackIds, context)}${shuffleToggle()}
            <a class="pill-btn" href="#/search/${encodeURIComponent(name)}">${icon('search', 14)} More on Spotify</a></div>
        ${localTable(tracks, context)}
    </div>`;
}

async function cachedSpotify(key, path) {
    const hit = S.spotifyCache.get(key);
    if (hit && Date.now() - hit.time < 5 * 60 * 1000) return hit.data;
    const data = await api(path);
    S.spotifyCache.set(key, { time: Date.now(), data });
    return data;
}

const SEARCH_FILTERS = [['all', 'All'], ['songs', 'Songs'], ['artists', 'Artists'], ['albums', 'Albums'], ['playlists', 'Playlists'], ['library', 'In your library']];

function localMatches(q) {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    return S.tracks.filter((t) => {
        const hay = `${t.title} ${t.artists.join(' ')} ${t.album}`.toLowerCase();
        return terms.every((term) => hay.includes(term));
    });
}

async function viewSearch(q, filter) {
    if (!q) {
        const recent = store.get('recentSearches', []);
        return html`<div class="view-pad">
            ${recent.length ? html`<section class="section"><div class="section-head"><h2 class="section-title">Recent searches</h2></div>
                <div class="recent-searches">${recent.map((r) => html`<a class="chip" href="#/search/${encodeURIComponent(r)}">${r}</a>`)}</div></section>` : ''}
            <section class="section"><div class="section-head"><h2 class="section-title">Search Spotify</h2></div>
                <p style="color:var(--sub)">Find songs, artists, albums and playlists. Anything you don't have yet can be downloaded straight into your library. You can also paste a Spotify link.</p></section>
            ${S.collections.length ? html`<section class="section"><div class="section-head"><h2 class="section-title">Your library</h2></div>
                <div class="grid">${S.collections.map(collectionCard)}</div></section>` : ''}
        </div>`;
    }

    // Pasted link: album/playlist/artist open their page; a track gets a download card
    const spotifyLink = q.match(/(?:open\.spotify\.com\/(?:intl-[a-z]+\/)?|spotify:)(track|album|playlist|artist)[/:]([A-Za-z0-9]{22})/);
    const ytm = q.match(/music\.youtube\.com\/(?:watch\?(?:.*&)?v=([\w-]{11})|browse\/(MPRE[\w-]+)|playlist\?(?:.*&)?list=([\w-]+)|channel\/(UC[\w-]+))/);
    const link = spotifyLink ? { source: 'spotify', kind: spotifyLink[1], id: spotifyLink[2] }
        : ytm ? { source: 'ytm', kind: ytm[1] ? 'track' : ytm[2] ? 'album' : ytm[3] ? 'playlist' : 'artist', id: ytm[1] || ytm[2] || ytm[3] || ytm[4] } : null;
    if (link && link.source === 'ytm' && link.kind === 'playlist' && link.id.startsWith('OLAK5uy_')) link.kind = 'download-only'; // album audio playlist: just download
    if (link) {
        if (link.kind !== 'track' && link.kind !== 'download-only') { location.replace(remoteHref(link, link.kind)); return html``; }
        const url = link.source === 'spotify' ? `https://open.spotify.com/track/${link.id}` : q.trim();
        const localId = link.kind === 'track' ? (link.source === 'ytm' ? S.byVideoId.get(link.id) : S.bySpotifyId.get(link.id)) : null;
        return html`<div class="view-pad"><div class="link-card">${icon('link', 24)}<div style="flex:1">${link.source === 'ytm' ? 'YouTube Music' : 'Spotify'} ${link.kind === 'track' ? 'song' : 'album'} link</div>
            ${localId ? html`<button class="pill-btn primary" data-action="play-local" data-local-id="${localId}">${icon('play', 14)} In your library — play</button>`
                      : html`<button class="pill-btn primary" data-action="download" data-download-url="${url}" data-type="${link.kind === 'track' ? 'track' : 'album'}">${icon('downloadPlain', 14)} Download</button>`}</div></div>`;
    }

    const recent = store.get('recentSearches', []).filter((r) => r.toLowerCase() !== q.toLowerCase());
    store.set('recentSearches', [q, ...recent].slice(0, 8));

    const local = localMatches(q);
    let results = null, error = null;
    if (filter !== 'library') {
        try { results = await cachedSpotify(`search/${q.toLowerCase()}`, `/search?q=${encodeURIComponent(q)}`); }
        catch (err) { error = err.message; }
    }
    const chips = html`<div class="filter-chips">${SEARCH_FILTERS.map(([key, label]) =>
        html`<a class="chip ${filter === key ? 'active' : ''}" href="#/search/${encodeURIComponent(q)}${key === 'all' ? '' : '/' + key}">${label}</a>`)}</div>`;
    const localContext = { key: `search:${q}`, label: `"${q}" in your library`, href: `#/search/${encodeURIComponent(q)}/library` };
    const localSection = (limit) => local.length ? html`<section class="section">
        <div class="section-head"><h2 class="section-title">In your library</h2>${limit && local.length > limit ? html`<a class="section-more" href="#/search/${encodeURIComponent(q)}/library">Show all ${local.length}</a>` : ''}</div>
        ${localTable(limit ? local.slice(0, limit) : local, localContext)}</section>` : '';
    const sourceName = results && results.source === 'ytm' ? 'YouTube Music' : S.init.initialized ? 'Spotify' : 'YouTube Music';
    const errorBox = error ? html`<div class="error-box" style="margin-bottom:24px">${sourceName} search failed: ${error}</div>` : '';

    if (filter === 'library') {
        return html`${chips}<div class="view-pad">${local.length ? localSection(0) : html`<div class="empty"><h2>Nothing in your library matches "${q}"</h2></div>`}</div>`;
    }
    if (!results) return html`${chips}<div class="view-pad">${errorBox}${localSection(0)}</div>`;

    const { tracks, artists, albums, playlists } = results;
    const nothing = !tracks.length && !artists.length && !albums.length && !playlists.length;
    if (nothing && !local.length) return html`${chips}<div class="empty"><h2>No results found for "${q}"</h2><p>Check the spelling, or try fewer words.</p></div>`;

    if (filter === 'songs') return html`${chips}<div class="view-pad">${spotifyTable(tracks, { context: { key: `search-songs:${q}`, label: q, href: location.hash } })}</div>`;
    if (filter === 'artists') return html`${chips}<div class="view-pad"><div class="grid">${artists.map(artistCard)}</div></div>`;
    if (filter === 'albums') return html`${chips}<div class="view-pad"><div class="grid">${albums.map(albumCard)}</div></div>`;
    if (filter === 'playlists') return html`${chips}<div class="view-pad"><div class="grid">${playlists.map(playlistCard)}</div></div>`;

    // "All": top result + songs, then the rest
    const qLower = q.toLowerCase();
    const topArtist = artists.find((a) => a.name.toLowerCase() === qLower);
    let top = '';
    if (topArtist || (!tracks.length && artists.length)) {
        const a = topArtist || artists[0];
        top = html`<a class="top-result" href="${remoteHref(a, 'artist')}">${imageArt(a.image, 'round', 'user')}
            <div class="top-result-name">${a.name}</div><div class="top-result-sub"><span class="type-tag">Artist</span></div></a>`;
    } else if (tracks.length) {
        const t = tracks[0];
        const localId = owned(t);
        top = html`<a class="top-result" href="${t.album.id ? remoteHref({ source: t.source, id: t.album.id }, 'album') : '#'}">${imageArt(t.album.image)}
            <div class="top-result-name">${t.name}</div>
            <div class="top-result-sub"><span class="type-tag">Song</span><span>${spotifyArtistLinks(t.artists, t.source)}</span></div>
            ${localId ? html`<button class="fab" data-action="play-local" data-local-id="${localId}" aria-label="Play ${t.name}">${icon('play', 20)}</button>`
                      : html`<button class="fab" data-action="download" data-download-url="${t.url}" data-type="track" data-title="${t.artists.map((a) => a.name).join(', ')} - ${t.name}" data-image="${t.album.image || ''}" aria-label="Download ${t.name}">${icon('downloadPlain', 20)}</button>`}</a>`;
    }
    return html`
    
    ${chips}
    <div class="view-pad">
        ${errorBox}
        ${tracks.length || top ? html`<div class="search-top">
            <section><div class="section-head"><h2 class="section-title">Top result</h2></div>${top}</section>
            <section><div class="section-head"><h2 class="section-title">Songs</h2><a class="section-more" href="#/search/${encodeURIComponent(q)}/songs">Show all</a></div>
                <div class="rows">${spotifyRows(tracks.slice(0, 4), q)}</div></section>
        </div>` : ''}
        ${localSection(5)}
        ${artists.length ? html`<section class="section"><div class="section-head"><h2 class="section-title">Artists</h2><a class="section-more" href="#/search/${encodeURIComponent(q)}/artists">Show all</a></div><div class="shelf">${artists.map(artistCard)}</div></section>` : ''}
        ${albums.length ? html`<section class="section"><div class="section-head"><h2 class="section-title">Albums</h2><a class="section-more" href="#/search/${encodeURIComponent(q)}/albums">Show all</a></div><div class="shelf">${albums.map(albumCard)}</div></section>` : ''}
        ${playlists.length ? html`<section class="section"><div class="section-head"><h2 class="section-title">Playlists</h2><a class="section-more" href="#/search/${encodeURIComponent(q)}/playlists">Show all</a></div><div class="shelf">${playlists.map(playlistCard)}</div></section>` : ''}
    </div>`;
}

// Compact song rows for the search "All" tab
function spotifyRows(tracks, q) {
    const localIds = tracks.map(owned).filter(Boolean);
    const ctx = registerContext(localIds, { key: `search-top:${q}`, label: q, href: location.hash });
    return html`${tracks.map((t) => {
        const localId = owned(t);
        return html`<div class="track" ${localId ? html`data-id="${localId}" data-ctx="${ctx}" data-index="${localIds.indexOf(localId)}"` : ''}>
            <div class="title-cell">${imageArt(t.album.image)}<div class="title-text">
                <div class="title-name">${t.name}</div>
                <div class="title-sub">${t.explicit ? html`<span class="explicit">E</span>` : ''}<span>${spotifyArtistLinks(t.artists, t.source)}</span></div></div></div>
            ${trackStatus(t)}
            <span class="duration right">${fmtTime(t.duration_ms / 1000)}</span>
        </div>`;
    })}`;
}

async function viewRemote(source, kind, id) {
    let data;
    try { data = await cachedSpotify(`${source}/${kind}/${id}`, `/${source}/${kind}/${encodeURIComponent(id)}`); }
    catch (err) { return html`${errorView(err.message)}`; }

    if (kind === 'artist') {
        const top = data.top_tracks || [];
        const ownedCount = top.filter(owned).length;
        return html`
        <header class="hero">
            ${imageArt(data.image, 'round', 'user')}
            <div class="hero-text">
                <div class="hero-kind">Artist</div>
                <h1 class="hero-title ${titleSize(data.name)}">${data.name}</h1>
                <div class="hero-meta">${data.followers !== null && data.followers !== undefined ? `${data.followers.toLocaleString()} followers` : data.subscribers ? `${data.subscribers} subscribers` : ''}
                    ${S.artists.some((a) => a.name === data.name) ? html`<span class="dot"><a class="link" href="${artistHref(data.name)}">In your library</a></span>` : ''}</div>
            </div>
        </header>
        <div class="below-hero">
            ${top.length ? html`<section class="section"><div class="section-head"><h2 class="section-title">Popular</h2>
                ${ownedCount ? html`<span class="section-more">${ownedCount} of ${top.length} in your library</span>` : ''}</div>
                ${spotifyTable(top, { showAlbum: true, context: { key: `${source}-artist:${id}`, label: data.name, href: location.hash } })}</section>` : ''}
            ${data.albums && data.albums.length ? html`<section class="section"><div class="section-head"><h2 class="section-title">Discography</h2></div>
                <div class="grid">${data.albums.map(albumCard)}</div></section>` : ''}
        </div>`;
    }

    const tracks = data.tracks || [];
    const ownedIds = tracks.map(owned).filter(Boolean);
    const allOwned = tracks.length && ownedIds.length === tracks.length;
    const duration = tracks.reduce((sum, t) => sum + t.duration_ms, 0) / 1000;
    const context = { key: `${source}-${kind}:${id}`, label: data.name, href: location.hash };
    const job = jobFor(data.url);
    const downloadBtn = allOwned
        ? html`<span class="text-btn" style="color:var(--green)">${icon('check', 24)} In your library</span>`
        : html`<button class="pill-btn primary" data-action="download" data-download-url="${data.url}" data-type="${kind}" data-title="${data.name}" data-image="${data.image || ''}" data-total="${data.total_tracks || ''}" ${job ? new Safe('disabled') : ''}>
            ${job ? html`${icon('loader', 18, 'spinning')} ${job.status === 'queued' ? 'Queued' : 'Downloading…'}` : html`${icon('downloadPlain', 18)} ${ownedIds.length ? `Download ${tracks.length - ownedIds.length} missing` : `Download ${kind}`}`}</button>`;
    const meta = kind === 'album'
        ? html`<strong>${spotifyArtistLinks(data.artists, source)}</strong>${data.year ? html`<span class="dot">${data.year}</span>` : ''}<span class="dot">${plural(data.total_tracks || tracks.length, 'song')}, ${fmtLong(duration)}</span>`
        : html`<strong>${data.owner || 'Spotify'}</strong><span class="dot">${plural(data.total_tracks || tracks.length, 'song')}${tracks.length < (data.total_tracks || 0) ? ` (first ${tracks.length} shown)` : ''}</span>
            ${data.via_embed && tracks.length >= 100 ? html`<span class="dot" title="Without Spotify's API, its public player lists at most 100 songs">first 100 songs only</span>` : ''}`;
    return html`
    
    <header class="hero">
        ${imageArt(data.image)}
        <div class="hero-text">
            <div class="hero-kind">${kind === 'album' ? (data.album_type === 'single' ? 'Single' : 'Album') : 'Playlist'}</div>
            <h1 class="hero-title ${titleSize(data.name)}">${data.name}</h1>
            ${data.description ? html`<p class="hero-desc">${data.description}</p>` : ''}
            <div class="hero-meta">${meta}</div>
        </div>
    </header>
    <div class="below-hero">
        <div class="action-bar">
            ${ownedIds.length ? bigPlay(context.key, ownedIds, context) : ''}
            ${downloadBtn}
            ${ownedIds.length && !allOwned ? html`<span style="color:var(--sub)">${ownedIds.length} of ${tracks.length} in your library</span>` : ''}
        </div>
        ${data.tracks_hidden
            ? html`<div class="empty">${icon('disc', 40)}<h2>Spotify doesn't share this playlist's songs</h2>
                <p>Since February 2026, Spotify only lets apps see the songs in playlists you own. You can still try downloading it.</p></div>`
            // Embed playlists carry no per-song cover or album, so don't show empty columns
            : spotifyTable(tracks, { showAlbum: kind === 'playlist' && !data.via_embed, showArt: kind === 'playlist' && !data.via_embed, context })}
    </div>`;
}

function jobRow(job) {
    const pct = job.total ? Math.min(100, Math.round((job.done / job.total) * 100)) : 0;
    const active = ACTIVE.has(job.status);
    return html`
    <li class="job">
        ${job.image ? imageArt(job.image) : html`<div class="art">${icon(job.kind === 'track' ? 'note' : 'disc', 24)}</div>`}
        <div style="min-width:0">
            <div class="job-title">${job.title}</div>
            <div class="job-meta"><span class="state ${job.status}">${job.status}</span>
                <span>${job.kind[0].toUpperCase() + job.kind.slice(1)}</span>
                ${job.total ? html`<span>${job.done} / ${job.total}</span>` : ''}
                <span>${job.message}</span></div>
            ${active ? html`<div class="job-bar ${job.status === 'queued' || !job.total ? 'indeterminate' : ''}"><i style="--progress:${pct / 100}"></i></div>` : ''}
            ${job.note ? html`<div class="job-meta">${job.note}</div>` : ''}
            ${job.error ? html`<div class="job-error">${job.error}</div>` : ''}
            ${job.log && job.log.length && job.status !== 'queued' ? html`<details><summary>${job.source === 'spotify' ? 'spotDL output' : 'Details'}</summary><pre>${job.log.join('\n')}</pre></details>` : ''}
        </div>
        <div>${active ? html`<button class="pill-btn" data-action="cancel-job" data-job-id="${job.id}">Cancel</button>`
            : (job.status === 'failed' || (job.error && job.status === 'completed'))
                ? html`<button class="pill-btn" data-action="download" data-download-url="${job.query}" data-type="${job.kind}" data-title="${job.title}" data-image="${job.image || ''}" title="Songs you already have are skipped">Retry</button>` : ''}</div>
    </li>`;
}

function renderJobsList() {
    const list = $('#jobsList');
    if (!list) return;
    const open = new Set($$('details[open]', list).map((d) => d.closest('.job') && [...list.children].indexOf(d.closest('.job'))));
    list.innerHTML = S.jobs.length ? html`${S.jobs.map(jobRow)}`.s : html`<li class="empty" style="padding:32px">No downloads yet. Search for something, or paste a link above.</li>`.s;
    [...list.children].forEach((li, i) => { if (open.has(i)) { const d = $('details', li); if (d) d.open = true; } });
}

function viewDownloads() {
    const s = S.settings;
    const label = { m4a: 'M4A', mp3: 'MP3', opus: 'Opus', flac: 'FLAC', wav: 'WAV' }[s.format];
    const quality = s.format === 'flac' || s.format === 'wav' ? '' : s.bitrate === 'auto' ? ', source quality' : `, ${s.bitrate} kbps`;
    return html`
    
    <div class="view-pad">
        <h1 class="greeting" style="margin-top:8px">Downloads</h1>
        <form class="paste-row" id="pasteForm">
            <input class="text-input" id="pasteInput" placeholder="Paste a Spotify link: track, album, playlist or artist" autocomplete="off" aria-label="Spotify link">
            <button class="pill-btn primary" type="submit" style="height:48px;padding:0 24px">${icon('downloadPlain', 16)} Download</button>
        </form>
        <p class="settings-line">Saving as ${label}${quality}${s.lyrics ? ', with lyrics' : ''}. <button type="button" data-action="settings">Change</button></p>
        <ul class="jobs" id="jobsList"></ul>
    </div>`;
}

// ---------- stats page ----------

const STATS_RANGES = [[7, 'Last 7 days'], [30, 'Last 30 days'], [90, 'Last 90 days'], [365, 'Last 12 months'], [0, 'All time']];
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const fmtListen = (sec) => {
    const h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60);
    return h ? `${h.toLocaleString()} hr ${m} min` : `${m} min`;
};
const fmtCompact = (n) => n >= 1e6 ? `${(n / 1e6).toFixed(1).replace(/\.0$/, '')}M` : n >= 1e4 ? `${(n / 1e3).toFixed(1).replace(/\.0$/, '')}K` : Math.round(n).toLocaleString();
const fmtBytes = (b) => b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${Math.round(b / 1e6)} MB`;
const fmtMinutes = (sec) => sec >= 3600 ? `${(sec / 3600).toFixed(1).replace(/\.0$/, '')} hr` : `${Math.round(sec / 60)} min`;
// "Dec '25", not "Dec 25" (which reads as the 25th of December)
const monthAxis = (key, i) => { const [y, m] = key.split('-').map(Number); return m === 1 || i === 0 ? `${MONTHS[m - 1]} '${String(y).slice(2)}` : MONTHS[m - 1]; };
const monthLong = (key) => { const [y, m] = key.split('-').map(Number); return `${MONTHS[m - 1]} ${y}`; };
const dayAxis = (key) => { const d = new Date(`${key}T12:00`); return `${MONTHS[d.getMonth()]} ${d.getDate()}`; };
const dayLong = (key) => new Date(`${key}T12:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
const hourName = (h) => `${h % 12 || 12} ${h < 12 ? 'am' : 'pm'}`;

// Axis top: the next "clean" number (1, 2, 4, 5, 10 × 10^n) at or above the max
function niceMax(value) {
    if (value <= 0) return 1;
    const exp = 10 ** Math.floor(Math.log10(value));
    return [1, 2, 4, 5, 10].map((m) => m * exp).find((v) => v >= value);
}

// Time axes must be clean in the unit shown (whole hours, or minutes), not in seconds: 5040 s = "1.4 hr"
const niceTime = (seconds) => {
    if (seconds > 3600) return niceMax(seconds / 3600) * 3600;
    let minutes = niceMax(Math.max(seconds, 60) / 60);
    if (minutes % 2) minutes = niceMax(minutes + 0.001);  // a 5-min top would put the middle tick at 2.5 min
    return minutes * 60;
};

function chartCard({ title, sub, body, table, wide = false }) {
    return html`<section class="chart-card ${wide ? 'wide' : ''}">
        <header class="chart-head">
            <div><h3>${title}</h3>${sub ? html`<p>${sub}</p>` : ''}</div>
            <button class="chip small" data-action="toggle-table" aria-pressed="false">Table</button>
        </header>
        <div class="chart-body">${body}</div>
        <div class="chart-table">${table}</div>
    </section>`;
}

function dataTable(headers, rows) {
    return html`<table><thead><tr>${headers.map((h, i) => html`<th class="${i ? 'num' : ''}">${h}</th>`)}</tr></thead>
        <tbody>${rows.map((r) => html`<tr>${r.map((c, i) => html`<td class="${i ? 'num' : ''}">${c}</td>`)}</tr>`)}</tbody></table>`;
}

// Columns: one series, values from a single baseline, ≤24px wide, 4px rounded tops. Only the peak gets a label.
function columnChart(data, { fmt, axisLabel, tipLabel }) {
    const values = data.map((d) => d.value);
    const peak = Math.max(0, ...values);
    const top = fmt === fmtMinutes ? niceTime(peak) : niceMax(peak);
    const integer = values.every(Number.isInteger) && fmt === fmtCompact;
    const ticks = [0, top / 2, top].filter((t) => !integer || Number.isInteger(t));
    const every = Math.ceil(data.length / 8);
    const peakIndex = values.indexOf(peak);
    return html`<div class="cols-chart" style="--n:${data.length}">
        <div class="y-axis">${ticks.map((t) => html`<span style="bottom:${(t / top) * 100}%">${fmt(t)}</span>`)}</div>
        <div class="plot">
            ${ticks.map((t) => html`<i class="gridline" style="bottom:${(t / top) * 100}%"></i>`)}
            ${data.map((d, i) => html`<div class="col" tabindex="0" role="img" aria-label="${tipLabel(d.key)}: ${fmt(d.value)}"
                    data-tip-label="${tipLabel(d.key)}" data-tip-value="${fmt(d.value)}">
                <span class="col-bar" style="height:${d.value > 0 ? `max(2px, ${(d.value / top) * 100}%)` : '0'}">${i === peakIndex && peak > 0 ? html`<em class="col-value">${fmt(d.value)}</em>` : ''}</span>
            </div>`)}
        </div>
        <div class="x-axis">${data.map((d, i) => {
            // Every nth label plus the last one, skipping a regular label that would sit on top of the last
            const last = data.length - 1;
            const show = i === last || (i % every === 0 && last - i >= every);
            return html`<span>${show ? axisLabel(d.key, i) : ''}</span>`;
        })}</div>
    </div>`;
}

// Horizontal bars: label · bar · value at the tip
function barList(items, { fmt, labelOf = (d) => d.key, hrefOf }) {
    const top = Math.max(1, ...items.map((d) => d.value));
    return html`<ol class="hbars">${items.map((d) => {
        const href = hrefOf && hrefOf(d);  // "Other" has nowhere to go: plain text, not a link to this page
        return html`
        <li class="hbar-row" tabindex="0" data-tip-label="${labelOf(d)}" data-tip-value="${fmt(d.value)}">
            <span class="hbar-label">${href ? html`<a href="${href}">${labelOf(d)}</a>` : labelOf(d)}</span>
            <span class="hbar-track"><span class="hbar" style="width:${(d.value / top) * 100}%"></span></span>
            <span class="hbar-value">${fmt(d.value)}</span>
        </li>`;
    })}</ol>`;
}

// Weekday × hour grid, 5 validated steps of one green (dark → bright); empty cells are a neutral tile
function heatmap(rows) {
    const peak = Math.max(0, ...rows.flat());
    const level = (v) => (v <= 0 || !peak ? 0 : Math.min(5, Math.ceil((v / peak) * 5)));
    return html`<div class="heat">
        <div class="heat-grid">
            ${rows.map((row, day) => html`<span class="heat-day">${WEEKDAYS[day]}</span>${row.map((v, hour) => html`<span class="heat-cell l${level(v)}" tabindex="0"
                    role="img" aria-label="${WEEKDAYS[day]} ${hourName(hour)}: ${fmtMinutes(v)}" data-tip-label="${WEEKDAYS[day]}, ${hourName(hour)}" data-tip-value="${fmtMinutes(v)}"></span>`)}`)}
            <span></span>${Array.from({ length: 24 }, (_, h) => html`<span class="heat-hour">${h % 6 === 0 ? hourName(h) : ''}</span>`)}
        </div>
        <div class="heat-legend" aria-hidden="true">Less ${[0, 1, 2, 3, 4, 5].map((l) => html`<span class="heat-cell l${l}"></span>`)} More</div>
    </div>`;
}

function statTile(label, value, delta) {
    return html`<div class="stat-tile"><div class="stat-label">${label}</div><div class="stat-value">${value}</div>${delta || ''}</div>`;
}

function deltaText(current, previous, rangeLabel) {
    if (previous === null || previous === undefined) return '';
    if (!previous) return current ? html`<div class="stat-delta">New this period</div>` : '';
    const pct = Math.round(((current - previous) / previous) * 100);
    const arrow = pct > 0 ? '▲' : pct < 0 ? '▼' : '';
    return html`<div class="stat-delta">${arrow} ${Math.abs(pct)}% vs previous ${rangeLabel.replace('Last ', '').replace('12 months', 'year')}</div>`;
}

let statsCache = null;
async function viewStats() {
    const days = store.get('statsDays', 30);
    let data;
    try { data = await api(`/stats?days=${days}`); statsCache = data; }
    catch (err) { if (!statsCache) return errorView(err.message); data = statsCache; }
    const lib = data.library;
    const lis = data.listening;
    const rangeLabel = (STATS_RANGES.find(([d]) => d === days) || STATS_RANGES[1])[1];

    // Library: genres as top 10 + Other (bars, not a donut: there are more than 7 classes)
    const knownGenres = lib.genres.filter((g) => g.key !== 'Unknown');
    const genreBars = knownGenres.slice(0, 10);
    const otherGenres = knownGenres.slice(10).reduce((sum, g) => sum + g.value, 0);
    if (otherGenres) genreBars.push({ key: 'Other', value: otherGenres });

    const librarySection = html`
    <section class="stats-section">
        <h2 class="section-title">Your library</h2>
        <div class="stat-row">
            ${statTile('Songs', lib.songs.toLocaleString())}
            ${statTile('Artists', lib.artists.toLocaleString())}
            ${statTile('Albums', lib.albums.toLocaleString())}
            ${statTile('Music', fmtListen(lib.seconds))}
            ${statTile('On disk', fmtBytes(lib.bytes))}
        </div>
        <div class="chart-grid">
            ${chartCard({ title: 'Songs added', sub: 'Per month', wide: true,
                body: columnChart(lib.added_by_month, { fmt: fmtCompact, axisLabel: monthAxis, tipLabel: monthLong }),
                table: dataTable(['Month', 'Songs'], lib.added_by_month.map((d) => [monthLong(d.key), d.value])) })}
            ${chartCard({ title: 'Genres', sub: `${lib.genres_known.toLocaleString()} of ${lib.songs.toLocaleString()} songs have a genre`,
                body: barList(genreBars, { fmt: fmtCompact, hrefOf: (d) => d.key === 'Other' ? null : genreHref(d.key) }),
                table: dataTable(['Genre', 'Songs'], knownGenres.map((g) => [g.key, g.value])) })}
            ${chartCard({ title: 'Top artists', sub: 'By number of songs',
                body: barList(lib.top_artists, { fmt: fmtCompact, hrefOf: (d) => artistHref(d.key) }),
                table: dataTable(['Artist', 'Songs'], lib.top_artists.map((a) => [a.key, a.value])) })}
            ${lib.decades.length ? chartCard({ title: 'Release decades', sub: `${lib.years_known.toLocaleString()} of ${lib.songs.toLocaleString()} songs have a release year`, wide: true,
                body: columnChart(lib.decades, { fmt: fmtCompact, axisLabel: (k) => k, tipLabel: (k) => k }),
                table: dataTable(['Decade', 'Songs'], lib.decades.map((d) => [d.key, d.value])) }) : ''}
        </div>
    </section>`;

    const bucketAxis = lis.bucket === 'day' ? dayAxis : monthAxis;
    const bucketLong = lis.bucket === 'day' ? dayLong : monthLong;
    const listeningBody = !lis.plays
        ? html`<div class="empty stats-empty">${icon('chart', 40)}<h2>No listening ${days ? 'in this period' : 'yet'}</h2>
            <p>Songs count once they've played for 30 seconds. Play some music and your stats appear here.</p></div>`
        : html`
        <div class="stat-row">
            <div class="stat-tile hero-tile"><div class="stat-label">Listening time</div><div class="hero-value">${fmtListen(lis.seconds)}</div>${deltaText(lis.seconds, lis.previous_seconds, rangeLabel)}</div>
            ${statTile('Plays', lis.plays.toLocaleString(), deltaText(lis.plays, lis.previous_plays, rangeLabel))}
            ${statTile('Different songs', lis.songs.toLocaleString())}
            ${statTile('Artists', lis.artists.toLocaleString())}
        </div>
        <div class="chart-grid">
            ${chartCard({ title: 'Listening time', sub: lis.bucket === 'day' ? 'Per day' : 'Per month', wide: true,
                body: columnChart(lis.per_bucket, { fmt: fmtMinutes, axisLabel: bucketAxis, tipLabel: bucketLong }),
                table: dataTable([lis.bucket === 'day' ? 'Day' : 'Month', 'Listening'], lis.per_bucket.map((d) => [bucketLong(d.key), fmtMinutes(d.value)])) })}
            ${chartCard({ title: 'Top songs', sub: 'Most played',
                body: html`<ol class="top-songs">${lis.top_songs.map((t, i) => {
                    const local = t.in_library ? S.byId.get(t.id) : null;
                    return html`<li class="top-song" ${local ? html`data-action="play-local" data-local-id="${t.id}" tabindex="0"` : ''}>
                        <span class="rank">${i + 1}</span>${trackArt(local)}
                        <span class="top-song-text"><span class="title-name">${t.title}</span><span class="title-sub">${t.artists.join(', ')}</span></span>
                        <span class="top-song-plays">${plural(t.plays, 'play')}</span></li>`;
                })}</ol>`,
                table: dataTable(['Song', 'Artist', 'Plays', 'Listening'], lis.top_songs.map((t) => [t.title, t.artists.join(', '), t.plays, fmtMinutes(t.seconds)])) })}
            ${chartCard({ title: 'Top artists', sub: 'By listening time',
                body: barList(lis.top_artists, { fmt: fmtMinutes, hrefOf: (d) => artistHref(d.key) }),
                table: dataTable(['Artist', 'Listening'], lis.top_artists.map((a) => [a.key, fmtMinutes(a.value)])) })}
            ${chartCard({ title: 'When you listen', sub: 'By weekday and hour', wide: true,
                body: heatmap(lis.heatmap),
                table: dataTable(['Day', ...Array.from({ length: 24 }, (_, h) => hourName(h))], lis.heatmap.map((row, d) => [WEEKDAYS[d], ...row.map((v) => (v ? fmtMinutes(v) : '–'))])) })}
            ${chartCard({ title: 'Genres you play', sub: 'By listening time', wide: true,
                body: barList(lis.genres.slice(0, 10), { fmt: fmtMinutes }),
                table: dataTable(['Genre', 'Listening'], lis.genres.map((g) => [g.key, fmtMinutes(g.value)])) })}
        </div>`;

    return html`<div class="view-pad stats-page">
        <h1 class="greeting" style="margin-top:8px">Your stats</h1>
        ${librarySection}
        <section class="stats-section">
            <h2 class="section-title">Listening</h2>
            <div class="filter-row" role="group" aria-label="Time range">${STATS_RANGES.map(([d, label]) =>
                html`<button class="chip ${d === days ? 'active' : ''}" data-stats-days="${d}" aria-pressed="${String(d === days)}">${label}</button>`)}</div>
            <div class="stats-listening">${listeningBody}</div>
        </section>
    </div>`;
}

// One shared tooltip for every chart mark (hover or keyboard focus); text only, never innerHTML
function bindChartTooltip() {
    const tip = document.createElement('div');
    tip.className = 'chart-tip';
    tip.setAttribute('role', 'tooltip');
    tip.hidden = true;
    const value = document.createElement('strong');
    const label = document.createElement('span');
    tip.append(value, label);
    document.body.appendChild(tip);
    const show = (e) => {
        const mark = e.target.closest && e.target.closest('[data-tip-value]');
        if (!mark) return;
        value.textContent = mark.dataset.tipValue;
        label.textContent = mark.dataset.tipLabel;
        tip.hidden = false;
        const box = mark.getBoundingClientRect();
        const left = Math.min(window.innerWidth - tip.offsetWidth - 8, Math.max(8, box.left + box.width / 2 - tip.offsetWidth / 2));
        tip.style.left = `${left}px`;
        tip.style.top = `${Math.max(8, box.top - tip.offsetHeight - 8)}px`;
    };
    const hide = (e) => { if (e.target.closest && e.target.closest('[data-tip-value]')) tip.hidden = true; };
    document.addEventListener('pointerover', show);
    document.addEventListener('focusin', show);
    document.addEventListener('pointerout', hide);
    document.addEventListener('focusout', hide);
    document.addEventListener('scroll', () => { tip.hidden = true; }, true);
}

// ---------- router ----------

function route() {
    const hash = location.hash.replace(/^#\/?/, '');
    const [name, ...rest] = hash.split('/');
    const parts = rest.map((p) => { try { return decodeURIComponent(p); } catch { return p; } });
    switch (name) {
        case '': return { name: 'home' };
        case 'songs': return { name: 'songs' };
        case 'liked': return { name: 'liked' };
        case 'collection': return { name: 'collection', key: parts.join('/') };
        case 'artist': return { name: 'artist', artist: parts.join('/') };
        case 'search': return { name: 'search', q: parts[0] || '', filter: parts[1] || 'all' };
        case 'spotify': case 'ytm': return { name: 'remote', source: name, kind: parts[0], id: parts.slice(1).join('/') };
        case 'downloads': return { name: 'downloads' };
        case 'genres': return { name: 'genres' };
        case 'stats': return { name: 'stats' };
        case 'genre': return { name: 'genre', genre: parts.join('/') };
        default: return { name: 'home' };
    }
}

let renderSeq = 0;
async function render({ keepScroll = false } = {}) {
    const seq = ++renderSeq;
    const r = route();
    const main = $('#main');
    const view = $('#view');
    const scroll = main.scrollTop;
    contexts.clear();
    view.style.removeProperty('--hero');
    delete view.dataset.heroSrc;

    // Keep the search box in sync with the URL
    const input = $('#searchInput');
    if (r.name === 'search' && document.activeElement !== input) input.value = r.q;
    if (r.name !== 'search' && document.activeElement !== input) input.value = '';
    $('#searchBox').classList.toggle('has-value', !!input.value);
    $('#homeBtn').classList.toggle('active', r.name === 'home');

    let content;
    const isAsync = r.name === 'search' && r.q || r.name === 'remote';
    if (isAsync && !keepScroll) view.innerHTML = loadingView().s;
    switch (r.name) {
        case 'songs': content = viewSongs(); break;
        case 'liked': content = viewLiked(); break;
        case 'collection': content = viewCollection(r.key); break;
        case 'artist': content = viewLocalArtist(r.artist); break;
        case 'search': content = await viewSearch(r.q, r.filter); break;
        case 'remote': content = await viewRemote(r.source, r.kind, r.id); break;
        case 'downloads': content = viewDownloads(); break;
        case 'genres': content = viewGenres(); break;
        case 'stats': content = await viewStats(); break;
        case 'genre': content = viewGenre(r.genre); break;
        default: content = viewHome();
    }
    if (seq !== renderSeq) return; // a newer navigation won
    view.innerHTML = content.s;
    main.scrollTop = keepScroll ? scroll : 0;

    // Hero colour from the first cover in the header
    const heroImg = $('.hero .art img', view);
    if (heroImg) applyHeroColor(heroImg.src);
    else if (r.name === 'home') view.style.setProperty('--hero', '#3a3a6a');

    if (r.name === 'downloads') {
        renderJobsList();
        $('#pasteForm').addEventListener('submit', (e) => {
            e.preventDefault();
            const url = $('#pasteInput').value.trim();
            if (!url) return;
            startDownload({ url });
            $('#pasteInput').value = '';
        });
    }
    highlightSidebar();
    markPlaying();
    updateControls();
}
const rerender = () => render({ keepScroll: true });

// ---------- events ----------

function playFromRow(row) {
    const c = contexts.get(row.dataset.ctx);
    if (!c) return;
    const t = currentTrack();
    if (t && t.id === row.dataset.id && P.context && P.context.key === c.context.key) { togglePlay(); return; }
    playContext(c.ids, +row.dataset.index, c.context);
}

function bindEvents() {
    // Delegated clicks for everything rendered into the view, sidebar and player
    document.addEventListener('click', (e) => {
        const actionEl = e.target.closest('[data-action]');
        if (actionEl) {
            const action = actionEl.dataset.action;
            e.preventDefault();
            e.stopPropagation();
            if (action === 'play-row') playFromRow(actionEl.closest('.track'));
            else if (action === 'play-ctx') {
                const c = contexts.get(actionEl.dataset.ctx);
                if (!c) return;
                if (actionEl.dataset.playContext && P.context && P.context.key === c.context.key && currentTrack()) togglePlay();
                else playContext(c.ids, actionEl.dataset.index !== undefined ? +actionEl.dataset.index : null, c.context);
            } else if (action === 'play-local') {
                const id = actionEl.dataset.localId;
                playContext([id], 0, { key: `track:${id}`, label: S.byId.get(id)?.title || '', href: location.hash });
            } else if (action === 'download') {
                startDownload({
                    url: actionEl.dataset.downloadUrl, type: actionEl.dataset.type,
                    title: actionEl.dataset.title || undefined, image: actionEl.dataset.image || undefined,
                    total: actionEl.dataset.total ? +actionEl.dataset.total : undefined,
                });
            } else if (action === 'toggle-shuffle') {
                toggleShuffle();
                actionEl.classList.toggle('on', P.shuffle);
                actionEl.setAttribute('aria-pressed', P.shuffle);
            } else if (action === 'cancel-job') {
                api(`/jobs/${encodeURIComponent(actionEl.dataset.jobId)}`, { method: 'DELETE' }).then(() => schedulePoll(200)).catch((err) => toast(err.message, 'error'));
            } else if (action === 'toggle-table') {
                const card = actionEl.closest('.chart-card');
                const on = card.classList.toggle('show-table');
                actionEl.textContent = on ? 'Chart' : 'Table';
                actionEl.setAttribute('aria-pressed', on);
            } else if (action === 'like') toggleLike(actionEl.dataset.likeId);
            else if (action === 'row-menu') rowMenu(actionEl.closest('.track'), { anchor: actionEl });
            else if (action === 'collection-menu') collectionMenu(actionEl);
            else if (action === 'settings') openSettings();
            else if (action === 'connect-spotify') openSettings('spotify');
            return;
        }
        const row = e.target.closest('.track[data-id]');
        if (row && !e.target.closest('a')) {
            $$('.track.selected').forEach((r) => r.classList.remove('selected'));
            row.classList.add('selected');
        }
        const libItem = e.target.closest('.lib-item[data-href]');
        if (libItem) location.hash = libItem.dataset.href;
        const range = e.target.closest('[data-stats-days]');
        if (range) {
            store.set('statsDays', +range.dataset.statsDays);
            $('#view').classList.add('refreshing');  // keep the old charts, dimmed, while the new range loads
            rerender().then(() => $('#view').classList.remove('refreshing'));
            return;
        }
        const chip = e.target.closest('[data-lib-filter]');
        if (chip) { S.libFilter = chip.dataset.libFilter; store.set('libFilter', S.libFilter); renderSidebar(); }
    });
    document.addEventListener('contextmenu', (e) => {
        const row = e.target.closest('.track[data-id]');
        if (!row || !S.byId.has(row.dataset.id) || e.target.closest('a')) return;
        e.preventDefault();
        rowMenu(row, { x: e.clientX, y: e.clientY });
    });
    document.addEventListener('dblclick', (e) => {
        const row = e.target.closest('.track[data-id]');
        if (row && !e.target.closest('a, button')) playFromRow(row);
    });

    // Search box → #/search/<q>, debounced; replaceState so typing doesn't flood history
    const input = $('#searchInput');
    let searchTimer = null;
    input.addEventListener('input', () => {
        $('#searchBox').classList.toggle('has-value', !!input.value);
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => {
            const q = input.value.trim();
            const target = q ? `#/search/${encodeURIComponent(q)}` : '#/search';
            if (route().name === 'search') history.replaceState(null, '', target);
            else history.pushState(null, '', target);
            render();
        }, 350);
    });
    input.addEventListener('focus', () => { if (route().name !== 'search' && !input.value) { history.pushState(null, '', '#/search'); render(); } });
    input.addEventListener('keydown', (e) => { if (e.key === 'Escape') input.blur(); });
    $('#searchClear').addEventListener('click', (e) => { e.preventDefault(); input.value = ''; input.focus(); history.replaceState(null, '', '#/search'); render(); });

    $('#libraryFilterInput').addEventListener('input', (e) => { S.libQuery = e.target.value; renderSidebar(); });
    $('#navBack').addEventListener('click', () => history.back());
    $('#navForward').addEventListener('click', () => history.forward());
    $('#settingsBtn').addEventListener('click', openSettings);
    window.addEventListener('hashchange', () => render());
    window.addEventListener('popstate', () => render());

    // Keyboard: space = play/pause, / or ⌘K = search
    document.addEventListener('keydown', (e) => {
        const el = e.target instanceof Element ? e.target : document.body;
        const typing = el.closest('input, select, textarea, [contenteditable]');
        if (e.key === ' ' && !typing && !el.closest('button, a')) { e.preventDefault(); togglePlay(); }
        else if ((e.key === '/' && !typing) || (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey))) { e.preventDefault(); input.focus(); input.select(); }
    });
}

function bindImageFallback() {
    document.addEventListener('error', (e) => {
        const img = e.target;
        if (!(img instanceof HTMLImageElement) || !img.closest('.art')) return;
        const art = img.closest('.art');
        img.remove();
        if (!art.querySelector('img, svg')) art.innerHTML = icon(art.classList.contains('round') ? 'user' : 'note', 24).s;
    }, true); // error events don't bubble, so listen in the capture phase
}

function paintChrome() {
    $('#brandMark').innerHTML = icon('spotDLr', 32).s;
    $('#navBack').innerHTML = icon('back', 18).s;
    $('#navForward').innerHTML = icon('forward', 18).s;
    $('#homeBtn').innerHTML = icon('home', 22).s;
    $('#searchIcon').innerHTML = icon('search', 22).s;
    $('#searchClear').innerHTML = icon('close', 18).s;
    $('#downloadsBtn').insertAdjacentHTML('afterbegin', icon('downloadPlain', 20).s);
    $('#settingsBtn').innerHTML = icon('settings', 20).s;
    $('#statsBtn').innerHTML = icon('chart', 20).s;
    $('#createBtn').innerHTML = icon('plus', 20).s;
    $('#createBtn').addEventListener('click', (e) => createMenu(e.currentTarget));
    $('#libraryTitle').innerHTML = html`${icon('library', 22)}<span>Your Library</span>`.s;
    $('#libraryFilter').insertAdjacentHTML('afterbegin', icon('search', 14).s);
}

// ---------- menus (⋯ buttons and right-click) ----------
// One menu at a time, in #menuRoot. Keyboard: ↑/↓/Home/End move, Enter/Space pick, Esc closes and returns
// focus to the button that opened it; any click outside, Tab, scrolling or resizing closes it.

const M = { opener: null, cleanup: null };

function showMenu(items, { anchor = null, x = 0, y = 0, label = 'Options' } = {}) {
    closeMenu(false);
    const root = $('#menuRoot');
    root.innerHTML = html`<div class="menu" role="menu" aria-label="${label}">${items.map((item, i) => item === '-'
        ? html`<div class="menu-sep" role="separator"></div>`
        : html`<button class="menu-item ${item.danger ? 'danger' : ''}" role="menuitem" data-menu-index="${i}" tabindex="-1" ${item.disabled ? 'disabled' : ''}>${icon(item.icon || 'note', 16)}<span>${item.label}</span></button>`)}</div>`.s;
    const menu = $('.menu', root);
    // Under the button (right-aligned), or at the cursor; then kept inside the window
    const r = anchor ? anchor.getBoundingClientRect() : { left: x, right: x, bottom: y, top: y };
    const w = menu.offsetWidth, h = menu.offsetHeight;
    const left = anchor ? r.right - w : x;
    let top = r.bottom + 4;
    if (top + h > innerHeight - 8) top = Math.max(8, (anchor ? r.top - 4 : y) - h);
    menu.style.left = `${Math.max(8, Math.min(left, innerWidth - w - 8))}px`;
    menu.style.top = `${top}px`;
    M.opener = anchor || document.activeElement;
    if (anchor) anchor.setAttribute('aria-expanded', 'true');
    const buttons = $$('.menu-item:not([disabled])', menu);
    buttons[0]?.focus();

    const pick = (e) => {
        const btn = e.target.closest('.menu-item');
        if (!btn || btn.disabled) return;
        const item = items[+btn.dataset.menuIndex];
        closeMenu(false);
        item.run();
    };
    const onKey = (e) => {
        const i = buttons.indexOf(document.activeElement);
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeMenu(); }
        else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); buttons[(i + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length].focus(); }
        else if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); buttons[e.key === 'Home' ? 0 : buttons.length - 1].focus(); }
        else if (e.key === 'Tab') closeMenu(false);
    };
    const outside = (e) => { if (!menu.contains(e.target)) closeMenu(false); };
    const away = () => closeMenu(false);
    menu.addEventListener('click', pick);
    menu.addEventListener('keydown', onKey);
    setTimeout(() => document.addEventListener('pointerdown', outside, true)); // not the click that opened it
    window.addEventListener('resize', away);
    document.addEventListener('scroll', away, true);
    M.cleanup = () => {
        document.removeEventListener('pointerdown', outside, true);
        window.removeEventListener('resize', away);
        document.removeEventListener('scroll', away, true);
    };
}

function closeMenu(returnFocus = true) {
    if (!M.cleanup) return;
    M.cleanup();
    M.cleanup = null;
    $('#menuRoot').innerHTML = '';
    if (M.opener) {
        M.opener.removeAttribute?.('aria-expanded');
        if (returnFocus && M.opener.isConnected) M.opener.focus();
    }
}

// The playlist you made that a row belongs to (for "Remove from …"), from the row's play context
function rowPlaylist(row) {
    const ctx = contexts.get(row.dataset.ctx);
    const key = ctx && ctx.context.key.startsWith('collection:') ? ctx.context.key.slice(11) : null;
    const c = key && S.collections.find((x) => x.key === key);
    return c && c.editable ? c : null;
}

function rowMenu(row, position) {
    const t = row && S.byId.get(row.dataset.id);
    if (!t) return;
    const playlist = rowPlaylist(row);
    showMenu([
        { label: S.liked.has(t.id) ? 'Remove from Liked Songs' : 'Save to Liked Songs', icon: S.liked.has(t.id) ? 'heartFilled' : 'heart', run: () => toggleLike(t.id) },
        { label: 'Add to playlist', icon: 'listAdd', run: () => addToPlaylistDialog([t.id], t.title) },
        ...(playlist ? [{ label: `Remove from ${playlist.name}`, icon: 'trash', run: () => removeFromPlaylist(playlist, [t.id], t.title) }] : []),
        { label: 'Send to device', icon: 'usb', run: () => sendToDeviceDialog([t.id], t.title, null) },
        '-',
        { label: `Go to ${t.artists[0]}`, icon: 'user', run: () => { location.hash = artistHref(t.artists[0]); } },
    ], { ...position, label: `Options for ${t.title}` });
}

function collectionMenu(anchor) {
    const r = route();
    const c = r.name === 'collection' && S.collections.find((x) => x.key === r.key);
    const ids = c ? c.track_ids : r.name === 'liked' ? S.likedOrder : [];
    const name = c ? c.name : 'Liked Songs';
    showMenu([
        { label: 'Add to another playlist', icon: 'listAdd', disabled: !ids.length, run: () => addToPlaylistDialog(ids, name) },
        { label: 'Send to device', icon: 'usb', disabled: !ids.length, run: () => sendToDeviceDialog(ids, name, name) },
        ...(c && c.editable ? ['-', { label: 'Delete playlist', icon: 'trash', danger: true, run: () => deletePlaylistDialog(c) }] : []),
    ], { anchor, label: `Options for ${name}` });
}

function createMenu(anchor) {
    showMenu([
        { label: 'New playlist', icon: 'listAdd', run: () => newPlaylistDialog([]) },
        { label: 'Add music files', icon: 'upload', run: () => addFilesDialog([]) },
    ], { anchor, label: 'Create' });
}

// ---------- dialogs ----------

function openModal({ title, body, wide = false, onOpen }) {
    closeMenu(false);
    const opener = document.activeElement;
    $('#modalRoot').innerHTML = html`
        <div class="modal-backdrop" data-close>
            <div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="dialogTitle">
                <div class="modal-head"><h2 id="dialogTitle">${title}</h2>
                    <button type="button" class="icon-btn" data-close aria-label="Close">${icon('close', 18)}</button></div>
                ${body}
            </div>
        </div>`.s;
    const backdrop = $('#modalRoot .modal-backdrop');
    const modal = $('.modal', backdrop);
    const close = () => { $('#modalRoot').innerHTML = ''; if (opener && opener.isConnected && opener.focus) opener.focus(); };
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop || e.target.closest('button[data-close]')) close(); });
    backdrop.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } });
    if (onOpen) onOpen(modal, close);
    ($('[autofocus]', modal) || $('input:not(.sr-only), select, button:not([data-close])', modal) || modal).focus();
    return close;
}

const editablePlaylists = () => S.collections.filter((c) => c.editable);

async function refreshLibrary() {
    await loadLibrary();
    renderSidebar();
    await rerender();
}

function newPlaylistDialog(trackIds) {
    const n = editablePlaylists().length + 1;
    openModal({
        title: 'New playlist',
        body: html`<form id="newPlaylistForm" class="dialog-form">
            <label class="field"><span>Name</span><input class="field-input plain" id="playlistName" maxlength="120" value="My Playlist #${n}" autofocus></label>
            ${trackIds.length ? html`<p class="dialog-note">${plural(trackIds.length, 'song')} will be added.</p>` : ''}
            <p class="form-error" id="playlistError" hidden></p>
            <div class="modal-actions"><button type="button" class="pill-btn" data-close>Cancel</button><button type="submit" class="pill-btn primary">Create</button></div>
        </form>`,
        onOpen: (modal, close) => {
            setTimeout(() => $('#playlistName', modal).select());
            $('#newPlaylistForm', modal).addEventListener('submit', async (e) => {
                e.preventDefault();
                const err = $('#playlistError', modal);
                try {
                    const { key } = await api('/playlists', { method: 'POST', body: JSON.stringify({ name: $('#playlistName', modal).value, track_ids: trackIds }) });
                    close();
                    await refreshLibrary();
                    toast(`Created ${key}`);
                    location.hash = `#/collection/${encodeURIComponent(key)}`;
                } catch (error) { err.textContent = error.message; err.hidden = false; }
            });
        },
    });
}

function addToPlaylistDialog(trackIds, label) {
    const lists = editablePlaylists();
    openModal({
        title: 'Add to playlist',
        body: html`<p class="dialog-note">${trackIds.length === 1 ? label : plural(trackIds.length, 'song')}</p>
            <div class="pick-list">
                <button class="pick-row" data-new-playlist><div class="art pick-art">${icon('plus', 22)}</div><div><div class="pick-name">New playlist</div></div></button>
                ${lists.map((c) => html`<button class="pick-row" data-playlist-key="${c.key}">${collectionArt(c, 'pick-art')}<div><div class="pick-name">${c.name}</div><div class="pick-sub">${plural(c.track_ids.length, 'song')}</div></div></button>`)}
            </div>
            ${lists.length ? '' : html`<p class="dialog-note">You haven't made a playlist yet. Downloaded playlists can't be changed, so songs go into playlists you make here.</p>`}`,
        onOpen: (modal, close) => {
            modal.addEventListener('click', async (e) => {
                if (e.target.closest('[data-new-playlist]')) { close(); newPlaylistDialog(trackIds); return; }
                const row = e.target.closest('[data-playlist-key]');
                if (!row) return;
                const key = row.dataset.playlistKey;
                const before = S.collections.find((c) => c.key === key).track_ids.length;
                try {
                    const { count } = await api(`/playlists/${encodeURIComponent(key)}/tracks`, { method: 'POST', body: JSON.stringify({ track_ids: trackIds, action: 'add' }) });
                    close();
                    toast(count === before ? `Already in ${key}` : `Added to ${key}`);
                    await refreshLibrary();
                } catch (error) { toast(error.message, 'error'); }
            });
        },
    });
}

async function removeFromPlaylist(playlist, trackIds, label) {
    try {
        await api(`/playlists/${encodeURIComponent(playlist.key)}/tracks`, { method: 'POST', body: JSON.stringify({ track_ids: trackIds, action: 'remove' }) });
        toast(`Removed ${label} from ${playlist.name}`);
        await refreshLibrary();
    } catch (error) { toast(error.message, 'error'); }
}

function deletePlaylistDialog(c) {
    openModal({
        title: `Delete ${c.name}?`,
        body: html`<p class="dialog-note">The playlist is removed. ${c.track_ids.length === 1 ? 'Its song stays' : `Its ${plural(c.track_ids.length, 'song')} stay`} in your library.</p>
            <div class="modal-actions"><button type="button" class="pill-btn" data-close autofocus>Cancel</button><button type="button" class="pill-btn danger" id="confirmDelete">Delete</button></div>`,
        onOpen: (modal, close) => {
            $('#confirmDelete', modal).addEventListener('click', async () => {
                try {
                    await api(`/playlists/${encodeURIComponent(c.key)}`, { method: 'DELETE' });
                    close();
                    toast(`Deleted ${c.name}`);
                    location.hash = '#/';
                    await refreshLibrary();
                } catch (error) { toast(error.message, 'error'); }
            });
        },
    });
}

// ---------- likes ----------

async function toggleLike(id) {
    const liked = !S.liked.has(id);
    const apply = (on) => {
        if (on) { S.liked.add(id); S.likedOrder = [id, ...S.likedOrder.filter((x) => x !== id)]; }
        else { S.liked.delete(id); S.likedOrder = S.likedOrder.filter((x) => x !== id); }
        $$(`.like-btn[data-like-id="${id}"]`).forEach((btn) => { btn.outerHTML = likeButton(id, { big: btn.classList.contains('big') }).s; });
        renderSidebar();
        if (route().name === 'liked') rerender();
    };
    apply(liked); // instant; undone if the server says no
    try { await api(`/likes/${encodeURIComponent(id)}`, { method: 'POST', body: JSON.stringify({ liked }) }); }
    catch (error) { apply(!liked); toast(`Couldn't save that: ${error.message}`, 'error'); }
}

// ---------- adding files ----------

const AUDIO_EXT = ['.mp3', '.m4a', '.flac', '.wav', '.ogg', '.opus', '.aac'];
const isAudioFile = (f) => AUDIO_EXT.some((ext) => f.name.toLowerCase().endsWith(ext));
const fmtSize = (b) => b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : b >= 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`;

// One file as the raw request body; XHR (not fetch) because fetch can't report upload progress
function uploadFile(file, album, onProgress) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        const query = new URLSearchParams({ name: file.name, ...(album ? { album } : {}) });
        xhr.open('POST', `/api/import?${query}`);
        xhr.setRequestHeader('Content-Type', 'application/octet-stream');
        xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
        xhr.onload = () => {
            let data = {};
            try { data = JSON.parse(xhr.responseText); } catch { /* not JSON */ }
            if (xhr.status < 300) resolve(data); else reject(new Error(data.detail || `Upload failed (${xhr.status})`));
        };
        xhr.onerror = () => reject(new Error('The upload stopped. Is spotDLr still running?'));
        xhr.send(file);
    });
}

const readAsDataUrl = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Couldn't read that image"));
    reader.readAsDataURL(file);
});

function addFilesDialog(initialFiles) {
    let files = initialFiles.filter(isAudioFile);
    const skippedAtStart = initialFiles.length - files.length;
    let cover = null;
    const lists = editablePlaylists();
    openModal({
        title: 'Add music files',
        wide: true,
        body: html`<form id="addFilesForm" class="dialog-form">
            <label class="drop-zone" id="dropZone">
                <input type="file" id="fileInput" multiple accept="${AUDIO_EXT.join(',')},audio/*" class="sr-only">
                ${icon('upload', 28)}<strong>Drop music files here, or click to choose</strong>
                <span>MP3, M4A, FLAC, WAV, OGG or Opus. They're copied into your spotDLr music folder.</span>
            </label>
            <ul class="file-list" id="fileList"></ul>
            <p class="dialog-note" id="skippedNote" ${skippedAtStart ? '' : 'hidden'}>${skippedAtStart ? `${plural(skippedAtStart, 'file')} skipped: not music.` : ''}</p>
            <fieldset class="choice-group">
                <legend>Add them as</legend>
                <label class="choice"><input type="radio" name="addAs" value="library" checked><span><strong>Songs in your library</strong><small>Keeps each file's own title, artist and album.</small></span></label>
                <label class="choice"><input type="radio" name="addAs" value="album"><span><strong>A new album</strong><small>Writes the album name, artist, year and cover into the files, so every music player groups them.</small></span></label>
                <label class="choice ${lists.length ? '' : 'disabled'}"><input type="radio" name="addAs" value="playlist" ${lists.length ? '' : 'disabled'}><span><strong>Songs in a playlist</strong><small>${lists.length ? 'Adds them to your library and to a playlist you made.' : 'Make a playlist first: + next to Your Library.'}</small></span></label>
            </fieldset>
            <div class="album-fields" id="albumFields" hidden>
                <div class="cover-pick">
                    <label class="cover-box" id="coverBox" title="Choose a cover image">${icon('note', 32)}<input type="file" id="coverInput" accept="image/jpeg,image/png" class="sr-only"><span class="sr-only">Cover image</span></label>
                    <small>Cover (JPEG or PNG)</small>
                </div>
                <div class="album-text">
                    <label class="field"><span>Album name</span><input class="field-input plain" id="albumName" maxlength="200"></label>
                    <label class="field"><span>Artist</span><input class="field-input plain" id="albumArtist" maxlength="200"></label>
                    <label class="field short"><span>Year</span><input class="field-input plain" id="albumYear" inputmode="numeric" maxlength="4" placeholder="2026"></label>
                </div>
            </div>
            <label class="field" id="playlistPick" hidden><span>Playlist</span>
                <select id="playlistSelect">${lists.map((c) => html`<option value="${c.key}">${c.name}</option>`)}</select></label>
            <div class="upload-progress" id="uploadProgress" hidden><div class="progress-bar"><i></i></div><p id="uploadStatus"></p></div>
            <p class="form-error" id="addError" hidden></p>
            <div class="modal-actions"><button type="button" class="pill-btn" data-close>Cancel</button><button type="submit" class="pill-btn primary" id="addSubmit">Add</button></div>
        </form>`,
        onOpen: (modal, close) => {
            const list = $('#fileList', modal), submit = $('#addSubmit', modal), err = $('#addError', modal);
            const showFiles = () => {
                list.innerHTML = html`${files.map((f, i) => html`<li><span class="file-name">${f.name}</span><span class="file-size">${fmtSize(f.size)}</span><button type="button" class="icon-btn" data-remove-file="${i}" aria-label="Remove ${f.name}">${icon('close', 14)}</button></li>`)}`.s;
                submit.textContent = files.length ? `Add ${plural(files.length, 'song')}` : 'Add';
                submit.disabled = !files.length;
            };
            const addFiles = (picked) => {
                const good = [...picked].filter(isAudioFile);
                const skipped = picked.length - good.length;
                const note = $('#skippedNote', modal);
                note.hidden = !skipped;
                note.textContent = skipped ? `${plural(skipped, 'file')} skipped: not music.` : '';
                files = files.concat(good.filter((f) => !files.some((x) => x.name === f.name && x.size === f.size)));
                showFiles();
            };
            showFiles();
            $('#fileInput', modal).addEventListener('change', (e) => { addFiles(e.target.files); e.target.value = ''; });
            const zone = $('#dropZone', modal);
            zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('over'); });
            zone.addEventListener('dragleave', () => zone.classList.remove('over'));
            zone.addEventListener('drop', (e) => { e.preventDefault(); e.stopPropagation(); zone.classList.remove('over'); addFiles(e.dataTransfer.files); });
            list.addEventListener('click', (e) => { const b = e.target.closest('[data-remove-file]'); if (b) { files.splice(+b.dataset.removeFile, 1); showFiles(); } });
            const mode = () => $('input[name="addAs"]:checked', modal).value;
            modal.addEventListener('change', (e) => {
                if (e.target.name !== 'addAs') return;
                $('#albumFields', modal).hidden = mode() !== 'album';
                $('#playlistPick', modal).hidden = mode() !== 'playlist';
            });
            $('#coverInput', modal).addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (!file) return;
                try {
                    cover = await readAsDataUrl(file);
                    const box = $('#coverBox', modal);
                    box.querySelector('img')?.remove();
                    box.querySelector('svg')?.remove();
                    box.insertAdjacentHTML('afterbegin', html`<img src="${cover}" alt="">`.s);
                } catch (error) { err.textContent = error.message; err.hidden = false; }
            });

            $('#addFilesForm', modal).addEventListener('submit', async (e) => {
                e.preventDefault();
                err.hidden = true;
                const how = mode();
                const album = $('#albumName', modal).value.trim(), artist = $('#albumArtist', modal).value.trim(), year = $('#albumYear', modal).value.trim();
                const playlistKey = $('#playlistSelect', modal)?.value;
                if (how === 'album' && (!album || !artist)) { err.textContent = 'An album needs a name and an artist.'; err.hidden = false; return; }
                if (how === 'album' && year && !/^\d{4}$/.test(year)) { err.textContent = 'The year should be four digits, like 2026.'; err.hidden = false; return; }
                $$('input, select, button:not([data-close])', modal).forEach((el) => { el.disabled = true; });
                const progress = $('#uploadProgress', modal), bar = $('.progress-bar i', progress), status = $('#uploadStatus', modal);
                progress.hidden = false;
                const total = files.reduce((sum, f) => sum + f.size, 0) || 1;
                let sent = 0;
                const paths = [], failed = [];
                for (const [i, file] of files.entries()) {
                    status.textContent = `Adding ${i + 1} of ${files.length}: ${file.name}`;
                    try {
                        const { path } = await uploadFile(file, how === 'album' ? album : '', (fraction) => { bar.style.width = `${((sent + fraction * file.size) / total) * 100}%`; });
                        paths.push(path);
                    } catch (error) { failed.push(`${file.name}: ${error.message}`); }
                    sent += file.size;
                    bar.style.width = `${(sent / total) * 100}%`;
                }
                try {
                    if (how === 'album' && paths.length) {
                        status.textContent = 'Writing the album details into the files…';
                        await api('/import/album', { method: 'POST', body: JSON.stringify({ paths, album, artist, year: year || null, cover }) });
                    }
                    await loadLibrary();
                    if (how === 'playlist' && paths.length) {
                        const ids = paths.map((p) => S.tracks.find((t) => t.path === p)?.id).filter(Boolean);
                        await api(`/playlists/${encodeURIComponent(playlistKey)}/tracks`, { method: 'POST', body: JSON.stringify({ track_ids: ids, action: 'add' }) });
                    }
                } catch (error) { failed.push(error.message); }
                if (failed.length) {
                    status.textContent = paths.length ? `Added ${plural(paths.length, 'song')}. Some didn't work:` : 'Nothing was added:';
                    err.textContent = failed.join(' • ');
                    err.hidden = false;
                    await refreshLibrary();
                    return;
                }
                close();
                await refreshLibrary();
                toast(`Added ${plural(paths.length, 'song')}`);
                const folder = paths[0] && paths[0].includes('/') ? paths[0].split('/')[0] : null;
                location.hash = how === 'album' && folder ? `#/collection/${encodeURIComponent(folder)}`
                    : how === 'playlist' ? `#/collection/${encodeURIComponent(playlistKey)}` : '#/songs';
            });
        },
    });
}

// Drop music files anywhere in the window to add them
function bindFileDrop() {
    const overlay = $('#dropOverlay');
    let depth = 0;
    const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
    document.addEventListener('dragenter', (e) => { if (!hasFiles(e) || $('#modalRoot').children.length) return; depth++; overlay.hidden = false; });
    document.addEventListener('dragleave', (e) => { if (!hasFiles(e)) return; depth = Math.max(0, depth - 1); if (!depth) overlay.hidden = true; });
    document.addEventListener('dragover', (e) => { if (hasFiles(e)) e.preventDefault(); }); // otherwise the browser opens the file
    document.addEventListener('drop', (e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        depth = 0;
        overlay.hidden = true;
        if (!$('#modalRoot').children.length) addFilesDialog([...e.dataTransfer.files]);
    });
}

// ---------- send to device ----------

function sendToDeviceDialog(trackIds, label, collection) {
    const tracks = trackIds.map((id) => S.byId.get(id)).filter(Boolean);
    const allMp3 = tracks.every((t) => t.path.toLowerCase().endsWith('.mp3'));
    const prefs = { folder: 'Music', format: allMp3 ? 'original' : 'mp3', bitrate: 256, ...store.get('sendPrefs', {}) };
    const estimate = (format, bitrate) => tracks.reduce((sum, t) =>
        sum + (format === 'mp3' && !t.path.toLowerCase().endsWith('.mp3') ? bitrate * 1000 / 8 * t.duration : t.size), 0);
    const isWindows = /Win/.test(navigator.platform || navigator.userAgent);
    openModal({
        title: 'Send to device',
        wide: true,
        body: html`<form id="sendForm" class="dialog-form">
            <p class="dialog-note">${trackIds.length === 1 ? label : html`<strong>${label}</strong>, ${plural(tracks.length, 'song')}`}. Plug in your MP3 player or USB drive, then pick it.</p>
            <fieldset class="choice-group"><legend>Device <button type="button" class="link-btn" id="refreshDevices">Refresh</button></legend>
                <div id="deviceList"><p class="dialog-note">Looking for devices…</p></div>
                <label class="choice"><input type="radio" name="device" value="other"><span><strong>Somewhere else</strong><small>Type a folder, for a player that doesn't show up above</small></span></label>
                <input class="field-input" id="otherPath" aria-label="Folder path" placeholder="${isWindows ? 'E:\\' : '/Volumes/MY PLAYER'}" hidden>
            </fieldset>
            <label class="field"><span>Folder on the device</span><input class="field-input plain" id="sendFolder" value="${prefs.folder}" maxlength="80"></label>
            <fieldset class="choice-group"><legend>Format</legend>
                <label class="choice"><input type="radio" name="format" value="mp3" ${prefs.format === 'mp3' ? 'checked' : ''}><span><strong>Convert to MP3</strong><small>Plays on any MP3 player. spotDLr downloads .m4a, which many players can't play.</small></span></label>
                <label class="choice"><input type="radio" name="format" value="original" ${prefs.format === 'original' ? 'checked' : ''}><span><strong>Keep the original files</strong><small>Best quality, for players and phones that play .m4a (AAC).</small></span></label>
                <label class="field short" id="bitrateField"><span>MP3 quality</span><select id="sendBitrate">${[128, 192, 256, 320].map((b) => html`<option value="${b}" ${b === prefs.bitrate ? 'selected' : ''}>${b} kbps${b === 256 ? ' (recommended)' : b === 128 ? ' (smallest)' : ''}</option>`)}</select></label>
            </fieldset>
            <p class="dialog-note" id="sendEstimate"></p>
            <div class="upload-progress" id="sendProgress" hidden><div class="progress-bar"><i></i></div><p id="sendStatus"></p></div>
            <p class="form-error" id="sendError" hidden></p>
            <div class="modal-actions"><button type="button" class="pill-btn" data-close id="sendCancel">Cancel</button><button type="submit" class="pill-btn primary" id="sendSubmit">Send</button></div>
        </form>`,
        onOpen: (modal) => {
            const err = $('#sendError', modal), submit = $('#sendSubmit', modal);
            let devices = [];
            const format = () => $('input[name="format"]:checked', modal).value;
            const chosenDevice = () => $('input[name="device"]:checked', modal)?.value;
            const showEstimate = () => {
                $('#bitrateField', modal).hidden = format() !== 'mp3';
                const need = estimate(format(), +$('#sendBitrate', modal).value);
                const d = devices.find((x) => x.path === chosenDevice());
                $('#sendEstimate', modal).textContent = `About ${fmtSize(need)} to copy${d ? `, with ${fmtSize(d.free)} free on ${d.name}` : ''}.${d && need > d.free ? ' That won\'t fit.' : ''}`;
                $('#sendEstimate', modal).classList.toggle('warn', !!d && need > d.free);
            };
            const loadDevices = async () => {
                $('#deviceList', modal).innerHTML = html`<p class="dialog-note">Looking for devices…</p>`.s;
                try { devices = (await api('/devices')).devices; } catch { devices = []; }
                const last = store.get('sendDevice', null);
                const preferred = devices.some((d) => d.path === last) ? last : devices[0]?.path;
                $('#deviceList', modal).innerHTML = devices.length
                    ? html`${devices.map((d) => html`<label class="choice"><input type="radio" name="device" value="${d.path}" ${d.path === preferred ? 'checked' : ''}><span><strong>${icon('usb', 16)} ${d.name}</strong><small>${fmtSize(d.free)} free of ${fmtSize(d.total)} • ${d.path}</small></span></label>`)}`.s
                    : html`<p class="dialog-note">No MP3 player or USB drive found. Plug one in and click Refresh. Players that connect like a phone (not as a drive) won't show up.</p>`.s;
                if (!devices.length) $('input[name="device"][value="other"]', modal).checked = true;
                $('#otherPath', modal).hidden = chosenDevice() !== 'other';
                showEstimate();
            };
            loadDevices();
            $('#refreshDevices', modal).addEventListener('click', loadDevices);
            modal.addEventListener('change', (e) => {
                if (e.target.name === 'device') $('#otherPath', modal).hidden = e.target.value !== 'other';
                showEstimate();
            });

            $('#sendForm', modal).addEventListener('submit', async (e) => {
                e.preventDefault();
                err.hidden = true;
                const picked = chosenDevice();
                const device = picked === 'other' ? $('#otherPath', modal).value.trim() : picked;
                if (!device) { err.textContent = 'Pick a device, or type a folder.'; err.hidden = false; return; }
                const body = { track_ids: tracks.map((t) => t.id), device, subfolder: $('#sendFolder', modal).value.trim(), collection,
                    format: format(), bitrate: +$('#sendBitrate', modal).value };
                store.set('sendPrefs', { folder: body.subfolder, format: body.format, bitrate: body.bitrate });
                if (picked !== 'other') store.set('sendDevice', device);
                let job;
                try { job = await api('/export', { method: 'POST', body: JSON.stringify(body) }); }
                catch (error) { err.textContent = error.message; err.hidden = false; return; }
                const name = devices.find((d) => d.path === device)?.name || device;
                submit.disabled = true;
                $$('fieldset, .field input, .field select', modal).forEach((el) => { el.disabled = true; });
                $('#sendCancel', modal).textContent = 'Hide';
                const progress = $('#sendProgress', modal), bar = $('.progress-bar i', progress), status = $('#sendStatus', modal);
                progress.hidden = false;
                while (job.status === 'copying') {
                    bar.style.width = `${(job.done / job.total) * 100}%`;
                    status.textContent = job.current ? `${body.format === 'mp3' ? 'Converting and copying' : 'Copying'} ${job.done + 1} of ${job.total}: ${job.current}` : `Copying ${job.done} of ${job.total}`;
                    await new Promise((r) => setTimeout(r, 500));
                    try { job = await api(`/export/${job.id}`); } catch { /* keep polling */ }
                }
                $('#sendCancel', modal).textContent = 'Close';
                if (job.status === 'done') {
                    bar.style.width = '100%';
                    const copied = job.total - job.skipped;
                    status.textContent = `Done: ${plural(copied, 'song')} copied to ${name}${job.skipped ? `, ${job.skipped} already there` : ''}. Eject the device before unplugging it.`;
                    toast(`Sent ${plural(copied, 'song')} to ${name}`);
                } else {
                    err.textContent = `Stopped after ${job.done} of ${job.total}: ${job.error}`;
                    err.hidden = false;
                }
            });
            showEstimate();
        },
    });
}

// ---------- boot ----------

// While genres are being looked up, refresh the library every 15 s so they appear as they're found
async function pollGenres() {
    let status;
    try { status = await api('/genres/status'); } catch { setTimeout(pollGenres, 30000); return; }
    const was = S.genrePending;
    S.genrePending = status.pending;
    if (was || status.pending) {
        await loadLibrary();
        if (['home', 'songs', 'genres', 'genre'].includes(route().name)) rerender();
    }
    setTimeout(pollGenres, status.pending ? 15000 : 60000);
}

// ---------- window check-in ----------
// The installed Windows app stops its server when the last window closes, and it learns that from the
// page itself: a check-in every 15 s, a goodbye on close. (Harmless when running from source.)
const WINDOW_ID = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2));
const checkIn = () => fetch('/api/window/alive', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: WINDOW_ID }) }).catch(() => {});
function bindWindowCheckIn() {
    checkIn();
    setInterval(checkIn, 15000);
    window.addEventListener('pagehide', () => navigator.sendBeacon('/api/window/bye', new Blob([JSON.stringify({ id: WINDOW_ID })], { type: 'application/json' })));
    window.addEventListener('pageshow', (e) => { if (e.persisted) checkIn(); }); // back from the back/forward cache
}

(async function boot() {
    bindWindowCheckIn();
    paintChrome();
    bindFileDrop();
    bindImageFallback();
    bindChartTooltip();
    bindPlayer();
    bindNowView();
    bindEvents();
    try { S.init = await api('/status/init'); } catch { S.init = { initialized: false, message: 'Server not reachable' }; }
    try { await loadLibrary(); } catch (err) { toast(`Couldn't load your library: ${err.message}`, 'error'); }
    const resumePage = restoreSession();
    // Opening or reloading the app on Home (or no page, as the app window opens) shows the last playlist.
    // Reloading any other page (Stats, a search, another playlist) stays on it.
    if (resumePage && ['', '#', '#/'].includes(location.hash)) history.replaceState(null, '', resumePage);
    await render();
    pollJobs();
    pollGenres();
})();
