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
- Volume, shuffle and repeat persist in `localStorage` (`spotdlr.*`, wrapped in try/catch).
- **Media Session**: title, artist, album and cover, plus play/pause/next/prev/seek handlers, so the Mac media keys and Control Center work.
- Keyboard: `Space` play/pause (not while typing or focused on a button), `/` or `⌘K` focuses search, `Esc` leaves it.

## Downloads in the UI

- `startDownload()` → `POST /api/download` with the saved settings → toast → button becomes a spinner.
- `pollJobs()`: every 1 s while anything is active, else 15 s. When a job finishes it shows a toast, reloads the library, and re-renders, so ⬇ turns into ✓ in place.
- **Settings modal** (sliders icon, or **Connect Spotify** on the banner), two sections:
  - **Spotify connection**: green/amber status line, Client ID, Client Secret (password field with Show/Hide), a "Where do I get these?" guide, and **Save & test**. Format is checked in the browser, then the server tests the keys with Spotify before saving. On success both fields clear, the placeholder shows `Saved: …1111`, the Spotify cache clears, and the view re-renders without the banner. The secret is never pre-filled.
  - **Downloads**: format, quality ("Auto — keep source quality" is the default), lyrics.
  - Listeners attach to the backdrop, which is discarded on close, so reopening doesn't pile up handlers. A styled modal, never `window.alert/confirm`.

## Verified (Oct 15)

Driven through the Chrome DevTools Protocol against the real app (Spotify layer mocked from real library IDs): play, seek to 50% (85.0 s of 170 s, which exercises Range), next, shuffle (current track first, all 50 unique), repeat cycle, double-click a row, Space pause/resume, search URL sync, download click → spinner → finished toast, album page plays only owned tracks, back button. **No console errors.**
