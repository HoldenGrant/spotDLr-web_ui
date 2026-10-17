# Frontend

`index.html` (shell) + `static/app.js` (~1,200 lines) + `static/app.css` (~470 lines). Vanilla JS, no framework, no build step. Related: [[How It Works]] · [[Backend]] · [[API Reference]]

---

## Layout

Modelled on Spotify's current desktop app: dark, with Home and search in the top bar.

```
┌─ spotDLr  ‹ ›      [⌂] [🔍 What do you want to play?        ✕]          [⬇ 2] [⚙] ┐
├───────────────┬────────────────────────────────────────────────────────────────┤
│ Your Library  │  hero: cover · "Playlist" · BIG TITLE · meta (colour from cover)│
│ [All][Playl…] │  (▶) ⤨   [Download 2 missing]                                  │
│ 🔍 filter     │  #  Title                Album        Date added       🕒       │
│ ▣ All songs   │  1  ▣ Remind Me          Never Land   Dec 30, 2025   2:50       │
│ ▦ JVKE Radio  │  …                                                              │
├───────────────┴────────────────────────────────────────────────────────────────┤
│ ▣ Title / Artist          ⤨  ⏮  (▶)  ⏭  ↻            🔈 ━━━━━            │
│                     0:42 ━━━━━━━━●──────────── 2:50                            │
└──────────────────────────────────────────────────────────────────────────────────┘
```

At ≤1100 px the "Date added" column goes; at ≤860 px the sidebar collapses to covers and the album column goes; at ≤600 px the sidebar and seek row hide.

## Theme (`:root` in `app.css`)

`--bg #000`, panels `--panel #121212`, raised `#1f1f1f / #2a2a2a`, text `#fff` / `--sub #b3b3b3`, accent `--green #1ed760`. Font: **Figtree** (Google Fonts), falling back to the system font. Each hero takes its colour from the average of its cover (`applyHeroColor`, a 12×12 canvas sample that skips near-black and near-white pixels, then darkens so white text stays readable).

## Routes (hash router, `route()`)

| Hash | View |
|---|---|
| `#/` | Home: greeting, quick tiles, Recently added, Your playlists & albums, Artists |
| `#/songs` | All songs |
| `#/collection/<folder>` | A local playlist/album |
| `#/artist/<name>` | A local artist (from tags) |
| `#/search/<q>[/songs\|artists\|albums\|playlists\|library]` | Search, with filter chips |
| `#/spotify/album\|playlist\|artist/<id>` | Spotify item, with download buttons |
| `#/downloads` | Paste-a-link box, settings line, job list |
| `#/stats` | **Stats**: library tiles and charts, then listening (range chips, hero figure, charts, heatmap) |
| `#/genres` | All genres as coloured cards |
| `#/genre/<name>` | One genre as a playlist (play, shuffle, track list) |

A pasted Spotify album/playlist/artist link in the search box jumps straight to its page; a track link shows a download card.

## How rendering works

- **`html` tagged template** escapes every interpolated value unless it's already `Safe` (another `html` result or an `icon()`). Tag text and Spotify data can never inject markup. This replaced the old unescaped `data-filename` attributes.
- Each view returns one string; `render()` swaps `#view` and restores scroll when it's a refresh (`rerender()`), not a navigation. `renderSeq` drops stale renders when you navigate fast.
- **Event delegation**: one `click` and one `dblclick` listener on `document`, keyed on `data-action` (`play-row`, `play-ctx`, `play-local`, `download`, `toggle-shuffle`, `cancel-job`, `settings`).
- **Contexts**: when a view renders a list it calls `registerContext(trackIds, {key, label, href})` and stamps `data-ctx` on rows and play buttons. Clicking plays that exact list from that index.

## Player (`P`)

```
P.queue  = local track ids, in context order
P.order  = play order: [0..n-1], or with shuffle [current, …random rest]
P.pos    = position in P.order
```

- `next(auto)`: repeat-one replays; at the end, repeat-all wraps (reshuffling if shuffle is on), otherwise it stops.
- `prev()`: restarts the song if more than 3 s in, like Spotify.
- **Resume where you left off** (`saveSession` / `restoreSession`): `spotdlr.session` in localStorage holds the queue, order, `pos`, context and the time in the song (whole seconds). It's saved on every song change, shuffle toggle and pause, every 5 s while playing, and on `pagehide`. At boot, after the library loads, the player comes back **paused** at that spot. Songs deleted since are dropped and the shuffle order is remapped; if the song itself is gone, nothing is restored. **Opening or reloading on Home** (hash empty, `#` or `#/`; the app window opens `http://localhost:8000`) goes to the context's page, library pages only (`#/songs`, `#/collection/…`, `#/artist/…`, `#/genre/…`), since a search page would re-run a YouTube search. Reloading any other page (Stats, a search, another playlist) stays on it. Checked in headless Chrome: relaunch → same playlist page, song, queue position and time (±1 s); Play continues from there; Next goes to the next song in the playlist; a saved queue with 2 deleted songs restores cleanly.
- Volume, shuffle and repeat persist in `localStorage` (`spotdlr.*`, wrapped in try/catch).
- **Media Session**: title, artist, album and cover, plus play/pause/next/prev/seek handlers, so the Mac media keys and Control Center work.
- Keyboard: `Space` play/pause (not while typing or focused on a button), `/` or `⌘K` focuses search, `Esc` leaves it.

## Now Playing view (Oct 16)

Opened from the cover in the player bar or the expand button next to the volume (`#nowBtn`). It's an overlay in `#nowRoot`, not a route, and stops 80 px above the bottom so the player bar stays usable.
- **State:** `NV` (`open`, `prevId`/`nextId` from the last render). `renderNowView()` re-renders on every song change (from `updateNowPlaying`), on shuffle/repeat changes (the neighbours change), and does nothing while closed.
- **Feed:** three square cards (previous, current, next from `neighbour(±1)`, which wraps only when `next()` would). The column is shorter than all three, so the outer two peek in. The slide direction comes from comparing the new song with the previous render's `nextId`/`prevId`, so it animates correctly whatever moved the song (feed, player bar, media keys, auto-advance).
- **Input:** ↑/↓ (on `document` while open, unless a modal is up), clicking a peeking card, or the wheel. The wheel adds up `deltaY` until it passes 60, steps once, then locks for 700 ms, so one trackpad flick = one song. `stepSong(-1)` always goes to the previous song (the player bar's ⏮ restarts the song after 3 s).
- **Colour:** `coverColor(url)` (shared with the hero gradient) averages a 12×12 downscale of the cover; cached per URL as a promise.
- **Closes on:** Esc, ×, clicking the dimmed area, any link inside (genre chip, artist, context), or `hashchange`. Focus goes back to whatever opened it.
- **Visualizer** (`V`). Pick a mode from the **dropdown** in the header (a menu of `menuitemradio`s: ↑/↓/Home/End move, Enter picks, Esc/Tab/click-outside close it without closing the view), or press `V` to cycle. Modes: **Bars, Wave, Ring, Particles, Vinyl, Retro, Off**, saved as `spotdlr.vizMode` (Off by default with reduced motion). Particles, Vinyl and Retro are ports of VYBE's visualizers (`~/Documents/music-visualizer/src/components/visualizer/`) to plain canvas.
  - **Pipeline:** `<audio>` → `MediaElementSource` → `AnalyserNode` (fftSize 2048 = 1024 bins of ≈21.5 Hz, smoothing 0.8) → speakers. The samples are readable only because `/api/stream` is same-origin.
  - **One canvas over the whole panel**, behind the content, reused across re-renders. Each frame, `vizFrame` computes eased `bass` (bins 2–6 ≈ 43–150 Hz), `treble` (140–460 ≈ 3–10 kHz) and `level`, plus the current cover's box (measured every frame, so Ring/Vinyl follow the slide animation; the *unscaled* size, so the pulse doesn't feed back), then calls `VIZ_DRAW[mode](g, f)`. `dt` from the rAF timestamp keeps speeds independent of the refresh rate.
  - **Modes:** Bars = 64 log-spaced bands (`vizBands`, 30 Hz–16 kHz), height ∝ value². Wave = every 8th of 2048 time samples. Ring = 48 bands mirrored around the cover (made round via `data-viz` CSS), bass at the top. Particles = 700 dots in one path/fill; bass → speed and size, treble → brightness. Vinyl = a record at 33⅓ RPM (`dt`-based) with the cover as the label (the real cover is hidden via CSS); the tonearm eases off the record when paused. Retro = stars, striped sun, scrolling grid, 36-band mountains mirrored from the centre.
  - **Readability:** Bars stay in the bottom 32% at ≤50% opacity. Retro and Particles give `.nv-info` a dark blurred backing, because white text over pink mountains was unreadable.
  - **Gotchas:** after `createMediaElementSource`, *all* playback goes through the AudioContext, so a suspended context = silence. It's created only on a click and resumed on every `play`. The rAF loop runs only while the view is open, the mode isn't Off and the window is visible. `.nv-head` is `z-index: 2` so the menu opens over the covers.
  - **Checked (headless Chrome):** non-zero frequency data; playback at real time through the graph and after closing; every mode's draw takes ≤0.4 ms of JS per frame (median ≤0.2 ms); Vinyl stops rotating when paused; the dropdown works by mouse and keyboard; no console errors.

## Lyrics (in the Now Playing view)

**Lyrics** button or `L` swaps the cover feed for lyrics (`NV.lyrics`, saved as `spotdlr.nvLyrics`). `L.data` caches `/api/lyrics` per track (`loading | ok | error`; errors get a "Try again" button). While shown, `lyricsTick` runs every animation frame: `lineAt()` binary-searches the last line with `t ≤ currentTime + 0.25 s` (the lead lights a line as it starts). Only when the index changes does it set `.active`/`.past` and scroll the line to ~40% of the box. Every frame rather than on `timeupdate`, which fires ~4×/s and would be up to 250 ms late. Wheel/touch/pointerdown in the box pause auto-scroll for 3 s (not the `scroll` event: our own smooth scroll fires that too). Clicking a line seeks there (and plays). Plain-only lyrics show static; none → "No lyrics for this song"; instrumental → "♪ Instrumental". Visualizers keep running behind; Bars/Wave draw at 60% strength under lyrics, and Retro/Particles give the lyrics a dark blurred backing. Ring and Vinyl draw nothing while lyrics are on (there's no cover to draw around).

**Checked (headless Chrome):** the highlighted line equals the expected line at set times; clicking line 3 seeks there; manual scroll holds position for 3 s, then auto-scroll resumes; next song loads its lyrics; plain-only (Martin Sheen Or JFK, 40 lines) and none (white noise) render; the setting survives a reload.

## Organizing: likes, menus, your playlists, adding files, Send to device (Oct 17)

- **♥ on every song row**, in the player bar and in Now Playing (`likeButton`, `toggleLike`: updates instantly, rolls back if the server refuses). **Liked Songs** (`#/liked`) is first in Your Library, newest like first.
- **One menu component** (`showMenu`, in `#menuRoot`) for ⋯ on rows, right-click on rows, ⋯ on playlist/album pages and **+** next to Your Library. ↑/↓/Home/End, Enter, Esc returns focus to the opener; outside click, Tab, scroll or resize close it.
- **Row menu:** like/unlike, Add to playlist, Remove from <playlist> (only inside a playlist you made, from the row's play context), Send to device, Go to artist. **Page menu:** add all to another playlist, Send to device, Delete playlist (yours only; a confirm dialog, never a native one).
- **Dialogs** share `openModal`. *New playlist* goes to the new page. *Add to playlist* lists only your playlists (downloaded ones are read-only) plus "New playlist".
- **Add music files:** a drop zone, a file picker, or drop files anywhere on the window (`bindFileDrop`, overlay). Add as library songs, **a new album** (name, artist, year, cover preview → `/api/import/album`), or songs in one of your playlists. Uploads go one by one through XHR, because `fetch` can't report upload progress.
- **Send to device:** detected drives with free space (Refresh), or "Somewhere else" (a typed path); folder on the device (default `Music`); **Convert to MP3** (default unless everything is already MP3; 128–320 kbps, default 256) or keep the originals; a size estimate that warns when it won't fit; progress, then "Eject the device before unplugging it". The last device, folder, format and quality are remembered.
- **Gotcha fixed along the way:** `html```  renders `false` as `''`, so `aria-pressed="${false}"` came out empty. Boolean ARIA attributes now use `String()`. And a global `[hidden] { display: none !important }`, because `.field { display: flex }` beat the browser's own `[hidden]` rule and showed hidden fields.
- **Checked (headless Chrome, throwaway library):** like → Liked Songs and sidebar count; + menu keyboard and Esc focus; create playlist (empty state) → add via ⋯ and via right-click → remove → delete with confirm (songs kept); add files (a .jpg skipped), as an album with a cover → album page with name, artist, year, cover; Send to device → 2 MP3s with tags and cover on the "device"; no console errors. **Not checked:** a real USB stick (none plugged in) and Windows drive detection.

## Downloads in the UI

- `startDownload()` → `POST /api/download` with the saved settings → toast → button becomes a spinner.
- `pollJobs()`: every 1 s while anything is active, else 15 s. When a job finishes it shows a toast, reloads the library, and re-renders, so ⬇ turns into ✓ in place.
- **Settings modal** (sliders icon, or **Connect Spotify** on the banner), two sections:
  - **Spotify connection**: green/amber status line, Client ID, Client Secret (password field with Show/Hide), a "Where do I get these?" guide, and **Save & test**. Format is checked in the browser, then the server tests the keys with Spotify before saving. On success both fields clear, the placeholder shows `Saved: …1111`, the Spotify cache clears, and the view re-renders without the banner. The secret is never pre-filled.
  - **Downloads**: format, quality ("Auto — keep source quality" is the default), lyrics.
  - Listeners attach to the backdrop, which is discarded on close, so reopening doesn't pile up handlers. A styled modal, never `window.alert/confirm`.

## Verified (Oct 15)

Driven through the Chrome DevTools Protocol against the real app (Spotify layer mocked from real library IDs): play, seek to 50% (85.0 s of 170 s, which exercises Range), next, shuffle (current track first, all 50 unique), repeat cycle, double-click a row, Space pause/resume, search URL sync, download click → spinner → finished toast, album page plays only owned tracks, back button. **No console errors.**

## Stats page (Oct 16)

Built to the dataviz method: form picked by the data's job, colour last and **validated** (not eyeballed).

- **Forms:** stat tiles and one hero figure for single numbers; columns for trends (one series); sorted horizontal bars for genres and artists (15 genres is too many for a donut; top 10 + Other); a weekday × hour heatmap.
- **Colour:** every chart is one series, so one mark colour, **`#1a9847`**: the app green stepped into the dark-mode lightness band. The validator failed the bright `#1ed760` on lightness (0.77 vs ≤ 0.67), so that stays the hover accent. The heatmap is 5 steps of the same hue; the first attempt's lowest step failed contrast (1.90:1 vs the 2:1 floor) and was lifted to `#16592e` (2.23:1). Empty cells are a neutral tile, not a ramp step.
- **Marks:** columns ≤ 24 px with 4 px rounded tops, non-zero bars at least 2 px tall, hairline grid, only the peak column labelled, values at the bar tips.
- **Axes:** clean ticks (`niceMax`: 1/2/4/5/10 × 10ⁿ); time axes are clean in the unit shown (`niceTime`: whole hours, or even minutes), never "42 min / 1.4 hr"; months read "Dec '25" (not "Dec 25"); decades are continuous (an empty 1970s shows as zero).
- **Interaction:** one shared tooltip (value strong, label secondary, filled with `textContent`) on hover **and keyboard focus**; every chart has a **Table** toggle; range chips sit above only the listening section they scope; changing range keeps the old charts dimmed until the new ones arrive.
- **Listening tracking** (`listen` in `app.js`): adds each `timeupdate` step if it moves forward by < 1.5 s, so seeks don't count; reports on song change, end, repeat-one and `pagehide` (`sendBeacon`). The server keeps listens of ≥ 30 s (or half a short song).

Tested against the real library with 900 synthetic plays in a throwaway data folder: all charts render, real mouse hover and real Tab show the tooltip (a scripted `.focus()` doesn't fire `focusin` in unfocused headless Chrome; a test artifact), table toggle, range switch, and a real 4× playback recording one listen with a 60 s seek ignored.
