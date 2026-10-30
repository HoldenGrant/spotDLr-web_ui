# To-do

Ideas being considered for future versions of spotDLr. An unchecked item is a note, not a committed release promise.

## Branding

- [ ] **Rename spotDLr to Localwyv:** use `localwyv` for the visual wordmark and **Localwyv** in documentation and installer titles.
  - Keep GitHub Pages as the project and download site; no custom website or domain is planned.
  - Decide later whether to retain the existing repository name and URL to avoid breaking links.

## Playback and devices

- [x] **Remote mode:** let a connected phone control playback on the source Mac or PC instead of playing audio through the phone.
  - Offer **Play on this phone** and **Control this computer** when choosing a playback device.
  - Support play, pause, previous, next, seek, volume, shuffle, repeat, queue management, and selecting music.
  - Keep the current song, progress, queue, and playback state synchronized between devices.
  - The source computer must remain awake with spotDLr running and connected through home Wi-Fi or Tailscale.
- [x] **Transfer playback:** move the current song, timestamp, queue, shuffle, and repeat state between the phone and source computer.

## Phone offline listening

- [ ] **Download to this phone:** add offline-download actions to songs, albums, and playlists.
- [ ] **Offline downloads:** provide one place to browse and remove music saved on the phone.
- [ ] **Storage usage:** show space used, available space when the browser exposes it, and the number of saved tracks.
- [ ] **Automatic cleanup:** optionally remove older downloads while keeping favorites and explicitly pinned music.
- [ ] **Download states:** clearly mark downloaded, downloading, failed, and unavailable tracks.
- [ ] **Offline playback:** keep downloaded music, its queue, and playback position usable after leaving the computer’s network.

The first caching layer is now in place for the phone interface and up to 150 recently viewed album artworks. Music files and library data still require the computer until offline downloads are implemented.
