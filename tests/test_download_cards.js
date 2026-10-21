'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../static/app.js'), 'utf8');
const match = source.match(/function downloadCollectionForJob\([\s\S]*?\n\}/);
assert.ok(match, 'app.js must define downloadCollectionForJob');
const find = vm.runInNewContext(`${match[0]}; downloadCollectionForJob`);
const collections = [
    { key: 'playlist-starboy', name: 'Starboy', kind: 'playlist', track_ids: ['1'] },
    { key: 'album-starboy', name: 'Starboy', kind: 'album', track_ids: ['1', '2'] },
    { key: 'empty', name: 'Empty', kind: 'album', track_ids: [] },
];

assert.equal(find({ status: 'completed', kind: 'album', title: 'Starboy' }, collections).key, 'album-starboy');
assert.equal(find({ status: 'completed', kind: 'playlist', title: ' starBOY ' }, collections).key, 'playlist-starboy');
assert.equal(find({ status: 'downloading', kind: 'album', title: 'Starboy' }, collections), null);
assert.equal(find({ status: 'completed', kind: 'track', title: 'Starboy' }, collections), null);
assert.equal(find({ status: 'completed', kind: 'album', title: 'Empty' }, collections), null);

console.log('Download card checks passed: completed albums and playlists resolve to playable library collections.');
