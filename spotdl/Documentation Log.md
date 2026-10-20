---
tags: [spotdlr, documentation]
updated: 2026-10-20
---

# Documentation Log

Related: [[Home]] · [[History]] · [[Roadmap]]

## 2026-10-20 — Native Mac app and existing-music lyrics

Updated root `README.md`, `SETUP.md`, `DEPLOYMENT.md` and Unreleased changelog entries, plus the existing vault's launcher, API, frontend/backend, storage, playback, hub, roadmap, history and bug notes.

The Mac documentation now follows `launcher/macOS.swift` and `make_launcher.sh`: Cocoa/WebKit, macOS 12.3+, local compilation/ad-hoc signing, recorded project/PATH, automatic server reuse/startup, menus/file picker/fullscreen, separate WebKit state and the continuing Python server after ⌘Q. It explicitly distinguishes this project-dependent local app from a self-contained distribution and from the unchanged Windows `desktop.py` path. Scheduled playback still needs a running designated client.

Lyrics documentation follows `Lyrics.save_existing`, `start_save`, `save_status`, `_save_library`, their `app.py` routes and the frontend actions. It covers preserved sidecars, synced-only saves, unavailable/failed outcomes, one background library pass, progress loss on server restart and the stale-backend `405` diagnosis.

Evidence comes from the current source and the earlier Oct 20 implementation checks recorded in [[History]]. This pass does not repeat those application smoke tests or claim a native-app RAM benchmark. The earlier Chrome memory snapshots are labelled historical. No release version or application code is changed by this documentation pass; the separate `spotDLr/` vault is left alone.

Validation passed: **14 vault notes**, **124 wiki links** (including heading targets), **15 local Markdown links** (including local heading targets), balanced fenced blocks, and coverage for all **58 declared HTTP route/method pairs** parsed from `app.py`. `git diff --check` passed. These are documentation consistency checks; application smoke tests were not rerun during this pass.

## 2026-10-19 — Source-based documentation pass

Updated the existing `spotdl/` vault at the user's request. The separate `spotDLr/` vault and its Welcome note were left in place.

The documentation describes the current local working tree, including uncommitted features. `version.py` declares `2.2.0`; entries under `CHANGELOG.md` → Unreleased should not be treated as a published release.

### Added

- [[Data and Storage]]: directory selection, persistent files, path-based track IDs, collections, browser state, cleanup, and restart behavior.
- [[Search and Downloads]]: engine selection for source versus installer builds, embed matching, queue outcomes, cancellation, and runtime requirements.
- [[Playback and Schedules]]: queue/session model, streaming, volume, lyrics, listening reports, scheduling, and export/test tools.
- [[Phone Access]]: pairing, access pause versus key rotation, Wi-Fi/Tailscale/Funnel, request guard, and home-screen behavior.

### Refreshed

- [[Home]]: topic navigation and current system overview.
- [[Backend]]: module inventory, concurrency description, optional Spotify downloads, and configuration pointers.
- [[Frontend]]: current routes, related topic links, and volume factors.
- [[How It Works]]: startup status, optional source IDs, search/download branching, and historical benchmark labels.
- [[API Reference]]: missing routes, phone guard, credential-save behavior, current payload fields, and engine differences.
- [[Launchers & Setup]]: optional credentials, launcher probes, path/runtime guidance, and source-review notes.

### Evidence and limits

Read the repository README, requirements, changelog, existing vault notes, backend entry points/modules, frontend state and workflow functions, launchers, service worker/manifest, installer spec, and Windows workflow. Important source symbols are listed in each new topic note.

Validation for this pass checks internal note links and heading targets, API path coverage against route declarations parsed from `app.py`, whitespace, and the scope of changed files. This is documentation verification, not an application smoke test. Older dated UI, platform, and performance test reports remain historical records; they were not rerun here.

Results: all **14 vault notes** passed note/heading-link and fenced-block checks; all **55 declared HTTP route/method pairs** have a matching entry in [[API Reference]]; `git diff --check -- spotdl` passed. The pass added five notes and refreshed six existing notes. File hashes confirmed application sources were unchanged; Obsidian's live `workspace.json` also changed during the session, independently of these Markdown edits.

Real `.env` contents, pairing keys, listening records, and personal library contents were not needed for these notes and were not copied into the vault.

## Remaining documentation work

- [x] Root `README.md`, `SETUP.md`, and `DEPLOYMENT.md` aligned with source Python 3.10–3.13, optional Spotify, current directories and native Mac lifecycle (Oct 20).
- [ ] Reconcile version reporting: `version.VERSION` is `2.2.0`, while the FastAPI app metadata in `app.py` still declares `2.0.0`. This pass records the difference without changing application code.
- [x] Earlier Unreleased Phone access entry aligned with `PhoneAccess.disable`: disabling pauses access; New QR code invalidates paired sessions (Oct 20).
- [ ] Keep platform/CI test evidence dated and distinguish configured workflow steps from observed successful runs. Search/download failures in the Windows workflow are warnings and can leave a build green.
- [ ] Expand request/response examples and error cases beyond the existing API summary as endpoints change.
- [ ] Review older UI descriptions and measurements after future layout/player changes; avoid maintaining module line-count estimates as architecture facts.

These are documentation follow-ups, not claims that the corresponding app features are broken.
