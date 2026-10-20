'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync(path.join(__dirname, '../static/app.js'), 'utf8');
const fn = source.match(/function addToPlaylistDialog\(trackIds, label\) \{[\s\S]*?\n\}/)[0];
const S = { collections: [
    { key: 'Made here', name: 'Made here', kind: 'playlist', editable: true, track_ids: [] },
    { key: 'Downloaded mix', name: 'Downloaded mix', kind: 'playlist', editable: false, track_ids: ['a'] },
    { key: 'Album', name: 'Album', kind: 'album', editable: false, track_ids: ['b'] },
] };
const shown = [];
const open = vm.runInNewContext(fn + '; addToPlaylistDialog', {
    S, editablePlaylists: () => S.collections.filter((item) => item.editable),
    openModal: () => {}, icon: () => '', plural: () => '',
    html: (strings, ...values) => strings.reduce((text, part, i) => text + part + (values[i] ?? ''), ''),
    collectionArt: (collection) => { shown.push(collection.key); return ''; },
});
open(['song'], 'Song');
assert.deepEqual(shown, ['Made here', 'Downloaded mix']);
console.log('Playlist picker includes created and downloaded playlists, excluding albums.');
