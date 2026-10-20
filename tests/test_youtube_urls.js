'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../static/app.js'), 'utf8');
const fn = source.match(/function parseYouTubeLink\(text\) \{[\s\S]*?\n\}/);
assert.ok(fn, 'Frontend must recognize regular YouTube links before text search');
const parse = vm.runInNewContext(fn[0] + '; parseYouTubeLink', { URL });
const cases = JSON.parse(fs.readFileSync(path.join(__dirname, 'youtube_urls.json'), 'utf8'));
for (const item of cases) {
    assert.equal(JSON.stringify(parse(item.url)), JSON.stringify({source:'ytm', kind:item.kind, id:item.id}), item.url);
}
for (const url of ['https://youtube.com/watch?v=short', 'https://youtu.be/8PTDv_szmL0extra',
    'https://music.youtube.com/watch?v=', 'https://youtube.com/watch', 'https://youtube.com/playlist']) {
    assert.throws(() => parse(url), (error) => /YouTube/.test(error.message), url);
}
for (const text of ['B.o.B Nothin On You', 'https://notyoutube.com/watch?v=8PTDv_szmL0',
    'https://music.youtube.com.example.org/watch?v=8PTDv_szmL0']) {
    assert.equal(parse(text), null, text);
}
console.log(`Frontend YouTube link checks passed (${cases.length} supported URL forms).`);
