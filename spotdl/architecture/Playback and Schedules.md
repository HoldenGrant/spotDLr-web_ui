---
tags: [spotdlr, architecture, playback]
updated: 2026-10-20
---

# Playback and Schedules

Music plays in the native Mac WebKit view or browser that opens spotDLr. The server streams files and stores shared state; each browser owns its playback queue, preferences, and schedule device identity.

Related: [[Home]] · [[Frontend]] · [[Data and Storage]] · [[Phone Access]] · [[API Reference]]

## Player and queue

`P` in `static/app.js` holds the player state. A view registers a context containing ordered track IDs. `playContext` loads that list into `P.queue`; `P.order` supplies normal or shuffled order and `P.pos` selects the current position.

`P.upNext` is a separate explicit queue. It plays before advancing the context, so Add to queue does not replace the playlist. `P.queued` identifies the currently playing explicit-queue song. The queue panel supports reorder, removal, and clearing.

`saveSession` stores context, queue/order, explicit queue, and playback time in `spotdlr.session`. After loading the library, `restoreSession` removes missing songs and restores the saved song **paused**. Preferences and sessions are specific to the browser origin/profile.

## Streaming

`GET /api/stream/{track_id}` resolves the library ID and streams the audio. `app._ranged_file` supports open-ended, bounded, and suffix byte ranges with `206` responses, and `416` for an unsatisfiable start. This enables seeking, including Safari playback.

Media Session integration exposes track metadata and playback actions to supported media controls.

## Volume, crossfade, and sleep

```text
main audio volume = userVolume × trackGain × fadeIn × sleepGain × wakeGain
```

- **Even out volume:** `loudness.py` measures integrated LUFS and sample peak using FFmpeg. Results are cached against file modification time and size. The player attenuates songs louder than its -14 LUFS target and never boosts quieter songs.
- **Crossfade:** an additional audio element overlaps outgoing and incoming songs. The setting ranges from off to 12 seconds.
- **Sleep timer:** pauses after a selected interval, fading during the last 10 seconds, or at the end of the current song.
- **Scheduled fade-in:** starts at 5% of the selected playback level and reaches full level over one minute, when programmatic volume control works.

`VOLUME_WORKS` detects programmatic volume support. Crossfade, volume normalization, and scheduled fade-in are disabled where that support is unavailable, including the documented iOS case.

## Lyrics and visualizers

Lyrics lookup order is the song's `.lrc` sidecar, disk cache, then LRCLIB. The result can be synced lines, plain text, instrumental, or no lyrics. Clicking a synced line seeks playback.

Desktop visualizers can use a Web Audio analyser. On iOS, the main player is deliberately kept outside Web Audio to avoid the lock-screen suspension problem described in the existing [[Frontend]] note. iOS visualizers use a generated pattern, as the UI states.

The phone home-screen service worker does not cache songs or app assets. Playback still requires the computer to be awake and serving files.

### Saving lyrics for existing music

- **One song:** ⋯ → **Download lyrics** calls `POST /api/lyrics/{track_id}`. Saves UTF-8 synced lyrics beside the audio with the same basename and `.lrc` extension.
- **Whole library:** **Settings → Downloads → Download library lyrics** calls `POST /api/lyrics/save-library`. A daemon worker handles songs sequentially; a lock prevents overlapping library passes. Another start request while it runs returns the existing pass status.
- Existing `.lrc` files are preserved, including a file created while lookup was in progress (`open("x")` prevents overwriting it). Audio files and tags are not rewritten.
- Only synced lyrics are saved. Plain-only results, instrumentals and misses count as unavailable; lookup/write failures count as failed and do not stop subsequent songs. The last failure is reported in the status.
- `GET /api/lyrics/save-status` exposes progress and saved/existing/unavailable/failed counts. Status is in memory, separate from the music-download job queue. Closing Settings or the client does not stop the pass while Python remains running. Stopping Python interrupts it; rerunning skips sidecars already present.

The **Save synced lyrics** download setting still applies to newly downloaded audio. Reading lyrics for playback does not itself save a sidecar. See [[API Reference]] for responses and error codes.

## Listening history

The frontend accumulates small forward playback-time steps and ignores large seeks. It flushes a report on song transitions and page exit. `stats.Plays.record` accepts at least 30 seconds, or half the duration of a shorter song; the frontend itself only sends reports after at least 10 seconds.

Accepted reports append a JSON line to `plays.jsonl`, including title, artists, album, and genre at listen time. Historical metadata therefore remains available when the track is later removed. This is browser-reported listening time, not a server measurement of whether sound was audible.

## Scheduled plays

1. The song/collection menu opens `scheduleDialog`, which saves the selection, time, repeat days or date, shuffle, fade-in, and browser `deviceId` to `/api/schedules`.
2. `startScheduler` checks every 15 seconds and when the page becomes visible; the saved list refreshes about once a minute.
3. Only enabled schedules matching this browser's device ID are considered. Time is evaluated in the browser's local timezone.
4. A schedule can start within three minutes of its due time. The page claims the occurrence through `POST /api/schedules/{schedule_id}/fired` before starting playback.
5. The server records `last_run` under a lock so repeated claims for that occurrence are refused; a one-off schedule is disabled after its claim.

This prevents duplicate starts across normal concurrent windows; it does not guarantee audible playback. A claim can succeed before autoplay is blocked or the page closes. The UI shows a tap-to-play prompt when the browser refuses autoplay.

Existing collections and Liked Songs resolve their current contents at playback time. A missing collection falls back to the saved IDs, excluding tracks no longer in the library.

The designated client must remain running: the native Mac app/web view or its original browser. A background Python server alone cannot play a schedule. On iPhone, it must be on screen because background pages can be suspended. Clearing site storage or using another origin can produce a new device ID. These are browser-driven scheduled plays, not a background operating-system alarm service.

## Export and listening tests

Send to device copies originals or converts to MP3, checks free space, and numbers collection files to retain order. Apple Music export runs on a Mac, stages compatible files, converts lossless sources to ALAC, and compares decoded-sample fingerprints before adding converted lossless files.

ABX tests create original and encoded/decoded WAV clips with matching lengths. Random X tokens hide the per-trial answer until completion; the result reports a one-sided binomial probability. This compares a chosen original with an encoded copy; a lossy original does not become a lossless reference.

## Source references

`static/app.js`: `playContext`, `saveSession`, `restoreSession`, `applyVolume`, `flushListen`, `dueOccurrence`, `checkSchedules`, `startScheduled`; `app.py`: `_ranged_file`, `record_play`; `stats.py`: `Plays`; `schedules.py`: `Schedules`; `loudness.py`; `lyrics.py`: `Lyrics.save_existing`, `start_save`, `save_status`, `_save_library`; `abx.py`; `apple_music.py`; `organize.py`: `Exporter`.
