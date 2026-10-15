'use strict';
/* spotDLr frontend: library, player, Spotify search and downloads. No framework, no build step. */

// ---------- tiny helpers ----------

// html`` escapes every interpolated value unless it is already Safe (another html`` result or icon()).
class Safe { constructor(s) { this.s = s; } toString() { return this.s; } }
const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ESCAPES[c]);
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
const allSongsArt = (cls = '') => html`<div class="art all-songs ${cls}">${icon('note', 24)}</div>`;
function artistArt(a, cls = '') {
    return a.coverId ? html`<div class="art round ${cls}"><img src="${artUrl(a.coverId)}" alt="" loading="lazy"></div>` : html`<div class="art round ${cls}">${icon('user', 24)}</div>`;
}

// Average colour of an image, darkened a little, for the hero gradient.
const heroColors = new Map();
function applyHeroColor(imgUrl) {
    const view = $('#view');
    const set = (c) => view.style.setProperty('--hero', c);
    if (!imgUrl) return set('#535353');
    if (heroColors.has(imgUrl)) return set(heroColors.get(imgUrl));
    const img = new Image();
    img.crossOrigin = 'anonymous';
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
            if (!n) return set('#535353');
            const scale = Math.min(1, 150 / Math.max(r / n, g / n, b / n)); // keep white text readable
            const color = `rgb(${Math.round(r / n * scale)}, ${Math.round(g / n * scale)}, ${Math.round(b / n * scale)})`;
            heroColors.set(imgUrl, color);
            if (view.dataset.heroSrc === imgUrl) set(color);
        } catch { set('#535353'); }
    };
    view.dataset.heroSrc = imgUrl;
    img.src = imgUrl;
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

function loadAndPlay() {
    const t = currentTrack();
    if (!t) return;
    P.audio.src = `/api/stream/${encodeURIComponent(t.id)}`;
    P.audio.play().catch((err) => { if (err.name !== 'AbortError') toast(`Couldn't play "${t.title}"`, 'error'); });
    updateNowPlaying();
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
    if (auto && P.repeat === 'one') { P.audio.currentTime = 0; P.audio.play(); return; }
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
}

function cycleRepeat() {
    P.repeat = { off: 'all', all: 'one', one: 'off' }[P.repeat];
    store.set('repeat', P.repeat);
    updateControls();
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
        if (P.seeking) return;
        const d = P.audio.duration || 0;
        seek.value = d ? Math.round((P.audio.currentTime / d) * 1000) : 0;
        setRangeFill(seek);
        $('#timeCurrent').textContent = fmtTime(P.audio.currentTime);
        $('#timeTotal').textContent = fmtTime(d);
    });
    P.audio.addEventListener('loadedmetadata', () => { $('#timeTotal').textContent = fmtTime(P.audio.duration); });
    P.audio.addEventListener('play', updateControls);
    P.audio.addEventListener('pause', updateControls);
    P.audio.addEventListener('ended', () => next(true));
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
            <span class="duration right">${fmtTime(t.duration)}</span>
        </div>`)}
    </div>`;
}

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
const shuffleToggle = () => html`<button class="toggle-btn ${P.shuffle ? 'on' : ''}" data-action="toggle-shuffle" aria-label="Shuffle" aria-pressed="${P.shuffle}">${icon('shuffle', 28)}</button>`;

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
        : html`<strong>Downloaded</strong><span class="dot">${plural(tracks.length, 'song')}, ${fmtLong(c.duration)}</span>`;
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
        <div class="action-bar">${bigPlay(context.key, c.track_ids, context)}${shuffleToggle()}</div>
        ${localTable(tracks, context, { showAlbum: c.kind !== 'album' })}
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

// ---------- router ----------

function route() {
    const hash = location.hash.replace(/^#\/?/, '');
    const [name, ...rest] = hash.split('/');
    const parts = rest.map((p) => { try { return decodeURIComponent(p); } catch { return p; } });
    switch (name) {
        case '': return { name: 'home' };
        case 'songs': return { name: 'songs' };
        case 'collection': return { name: 'collection', key: parts.join('/') };
        case 'artist': return { name: 'artist', artist: parts.join('/') };
        case 'search': return { name: 'search', q: parts[0] || '', filter: parts[1] || 'all' };
        case 'spotify': case 'ytm': return { name: 'remote', source: name, kind: parts[0], id: parts.slice(1).join('/') };
        case 'downloads': return { name: 'downloads' };
        case 'genres': return { name: 'genres' };
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
        case 'collection': content = viewCollection(r.key); break;
        case 'artist': content = viewLocalArtist(r.artist); break;
        case 'search': content = await viewSearch(r.q, r.filter); break;
        case 'remote': content = await viewRemote(r.source, r.kind, r.id); break;
        case 'downloads': content = viewDownloads(); break;
        case 'genres': content = viewGenres(); break;
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
            } else if (action === 'settings') openSettings();
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
        const chip = e.target.closest('[data-lib-filter]');
        if (chip) { S.libFilter = chip.dataset.libFilter; store.set('libFilter', S.libFilter); renderSidebar(); }
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
    $('#libraryTitle').innerHTML = html`${icon('library', 22)}<span>Your Library</span>`.s;
    $('#libraryFilter').insertAdjacentHTML('afterbegin', icon('search', 14).s);
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

(async function boot() {
    paintChrome();
    bindImageFallback();
    bindPlayer();
    bindEvents();
    try { S.init = await api('/status/init'); } catch { S.init = { initialized: false, message: 'Server not reachable' }; }
    try { await loadLibrary(); } catch (err) { toast(`Couldn't load your library: ${err.message}`, 'error'); }
    await render();
    pollJobs();
    pollGenres();
})();
