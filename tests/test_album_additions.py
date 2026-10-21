import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]


class AlbumAdditionTests(unittest.TestCase):
    def test_album_grouping_preserves_files_identity_and_existing_playlists(self):
        code = """
from pathlib import Path
import app
from downloader import write_playlist
from library import ALBUM_FILE, Library, _read_playlist

root = app.DOWNLOAD_DIR
folder = root / 'First album'
folder.mkdir()
original = folder / 'First Artist - Original.mp3'
original.write_bytes(b'original audio and tags')
other = root / 'Other album'
other.mkdir()
extra = other / 'Other Artist - Extra.mp3'
extra.write_bytes(b'extra audio and tags')
extra.with_suffix('.lrc').write_text('[00:00]Lyrics', encoding='utf-8')
write_playlist(root / 'My playlist', [extra, original])
before = app.library.snapshot()
tracks = {t['path']: t for t in before['tracks']}
extra_id = tracks['Other album/Other Artist - Extra.mp3']['id']
original_id = tracks['First album/First Artist - Original.mp3']['id']
album = next(c for c in before['collections'] if c['key'] == folder.name)
assert album['kind'] == 'album'
app.likes.set(extra_id, True)
unchanged = {p: (p.read_bytes(), p.stat().st_mtime_ns) for p in (original, extra, extra.with_suffix('.lrc'), root / 'My playlist/playlist.m3u8')}
result = app.add_album_tracks(folder.name, app.AlbumTracksRequest(track_ids=[extra_id, extra_id, original_id]))
assert result == {'count': 2}, result
assert app.add_album_tracks(folder.name, app.AlbumTracksRequest(track_ids=[extra_id])) == result
fresh = Library(root).snapshot()  # a fresh instance: grouping survives an app restart
updated = next(c for c in fresh['collections'] if c['key'] == folder.name)
assert updated['kind'] == 'album' and not updated['editable'], updated
assert updated['track_ids'] == [original_id, extra_id], updated
assert all(updated[k] == album[k] for k in ('name', 'artist', 'year'))
assert {t['path']: t for t in fresh['tracks']} == tracks
assert len(fresh['tracks']) == 2
assert app.likes.ids() == [extra_id]
assert _read_playlist(folder / 'playlist.m3u8', root) == [original.relative_to(root).as_posix(), extra.relative_to(root).as_posix()]
assert all((p.read_bytes(), p.stat().st_mtime_ns) == state for p, state in unchanged.items())
assert not (folder / extra.name).exists()
source = next(c for c in fresh['collections'] if c['key'] == other.name)
assert source['kind'] == 'album' and source['track_ids'] == [extra_id]

# Even when its original file is removed, the album stays an album, with its identity.
original.unlink()
remaining = next(c for c in Library(root).snapshot()['collections'] if c['key'] == folder.name)
assert remaining['kind'] == 'album' and remaining['name'] == album['name']
assert remaining['track_ids'] == [extra_id] and not remaining['editable']
assert not app.organize.is_user_playlist(folder)
for operation in (lambda: app.organize.delete_playlist(root, folder.name), lambda: app.organize.rename_playlist(root, folder.name, 'Renamed')):
    try: operation()
    except app.OrganizeError as error: assert error.status == 403
    else: raise AssertionError('Album must not become an editable playlist')
"""
        self.run_isolated(code)

    def test_invalid_targets_fail_before_writing_album_metadata(self):
        code = """
import app
from downloader import write_playlist
from library import ALBUM_FILE
root = app.DOWNLOAD_DIR
folder = root / 'Album'
folder.mkdir()
song = folder / 'Artist - Song.mp3'
song.write_bytes(b'audio')
track_id = app.library.scan()[0]['id']
write_playlist(root / 'Playlist', [song])
for key, ids, status in [('missing', [track_id], 404), ('../Album', [track_id], 404), ('Playlist', [track_id], 403), ('Album', ['unknown'], 404)]:
    try: app.add_album_tracks(key, app.AlbumTracksRequest(track_ids=ids))
    except app.OrganizeError as error: assert error.status == status, (key, error.status)
    else: raise AssertionError('Invalid album request accepted')
assert not (folder / ALBUM_FILE).exists()
assert not (folder / 'playlist.m3u8').exists()
outside = root.parent / 'outside'
outside.mkdir()
(outside / 'Artist - Outside.mp3').write_bytes(b'outside audio')
linked = root / 'Linked album'
linked.symlink_to(outside, target_is_directory=True)
collection = {'key': linked.name, 'name': 'Linked', 'artist': 'Artist', 'year': None}
try: app.organize.add_to_album(root, collection, [song])
except app.OrganizeError as error: assert error.status == 403
else: raise AssertionError('Outside album accepted')
collection['key'] = folder.name
link = root / 'linked.mp3'
link.symlink_to(outside / 'Artist - Outside.mp3')
try: app.organize.add_to_album(root, collection, [song, link])
except app.OrganizeError as error: assert error.status == 400
else: raise AssertionError('Outside audio accepted')
assert not (outside / ALBUM_FILE).exists() and not (folder / ALBUM_FILE).exists()
# Broken metadata should never prevent the library from loading.
for text in ('{', '[]', '{"name": 123, "artist": "Artist"}'):
    (folder / ALBUM_FILE).write_text(text, encoding='utf-8')
    assert app.library.snapshot()['tracks']
"""
        self.run_isolated(code)

    def run_isolated(self, code):
        with tempfile.TemporaryDirectory() as temporary:
            environment = {**os.environ, "SPOTDLR_DATA_DIR": str(Path(temporary) / "data"),
                           "SPOTDLR_MUSIC_DIR": str(Path(temporary) / "music")}
            subprocess.run([sys.executable, "-c", code], env=environment, cwd=ROOT, check=True)
