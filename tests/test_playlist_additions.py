import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]


class PlaylistAdditionTests(unittest.TestCase):
    def test_downloaded_playlists_accept_songs_without_moving_audio(self):
        code = """
from pathlib import Path
import app
from downloader import write_playlist
from organize import OrganizeError
from library import _read_playlist

root = app.DOWNLOAD_DIR
extra = root / 'Artist - Extra.mp3'
extra.write_bytes(b'extra audio')
for listed in (False, True):
    folder = root / ('Listed mix' if listed else 'Legacy mix')
    folder.mkdir()
    originals = [folder / 'Artist - First.mp3', folder / 'Artist - Second.mp3']
    for path in originals: path.write_bytes(b'original audio')
    if listed: write_playlist(folder, list(reversed(originals)))
    snapshot = app.library.snapshot()
    collection = next(c for c in snapshot['collections'] if c['key'] == folder.name)
    assert collection['kind'] == 'playlist' and not collection['editable']
    extra_id = next(t['id'] for t in snapshot['tracks'] if t['path'] == extra.name)
    before = list(collection['track_ids'])
    result = app.change_playlist(folder.name, app.PlaylistTracksRequest(track_ids=[extra_id, extra_id], action='add'))
    assert result['count'] == 3, result
    updated = next(c for c in app.library.snapshot()['collections'] if c['key'] == folder.name)
    assert updated['track_ids'] == before + [extra_id], updated
    assert app.change_playlist(folder.name, app.PlaylistTracksRequest(track_ids=[extra_id], action='add'))['count'] == 3
    assert _read_playlist(folder / 'playlist.m3u8', root)[-1] == extra.name
    assert not (folder / extra.name).exists()
    assert all(path.read_bytes() == b'original audio' for path in originals)
    try:
        app.change_playlist(folder.name, app.PlaylistTracksRequest(track_ids=[extra_id], action='remove'))
    except OrganizeError as error: assert error.status == 403
    else: raise AssertionError('Downloaded playlist removal must retain its existing protection')

write_playlist(root / 'My playlist', [extra])
assert app.change_playlist('My playlist', app.PlaylistTracksRequest(track_ids=[extra_id], action='add'))['count'] == 1
album = root / 'An album'
album.mkdir()
(album / 'Artist - Album song.mp3').write_bytes(b'album audio')
for key in ('An album', '../Legacy mix', 'missing'):
    try:
        app.change_playlist(key, app.PlaylistTracksRequest(track_ids=[extra_id], action='add'))
    except (OrganizeError, app.HTTPException) as error: assert getattr(error, 'status', getattr(error, 'status_code', None)) in (400, 403, 404)
    else: raise AssertionError('Must reject album or unknown playlist: ' + key)
assert not (album / 'playlist.m3u8').exists()
"""
        with tempfile.TemporaryDirectory() as temporary:
            environment = {**os.environ, "SPOTDLR_DATA_DIR": str(Path(temporary) / "data"),
                           "SPOTDLR_MUSIC_DIR": str(Path(temporary) / "music")}
            subprocess.run([sys.executable, "-c", code], env=environment, cwd=ROOT, check=True)

    @unittest.skipUnless(shutil.which("node"), "Node.js is needed for the playlist picker test")
    def test_picker_includes_downloaded_playlists(self):
        subprocess.run(["node", str(Path(__file__).with_suffix(".js"))], cwd=ROOT, check=True)
