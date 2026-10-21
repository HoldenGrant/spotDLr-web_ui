'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../static/app.js'), 'utf8');
const pick = (re, what) => { const m = source.match(re); assert.ok(m, `app.js must still define ${what}`); return m[0]; };
const vu = vm.runInNewContext(`${pick(/const VU_MARKS = [^\n]*/, 'VU_MARKS')}\n${pick(/const VU_REST = [^\n]*/, 'VU_REST')}\n${pick(/function vuAngle\(vu\) \{[\s\S]*?\n\}/, 'vuAngle')}; ({ vuAngle, VU_MARKS, VU_REST, VU_PIN })`);

// The needle lands exactly on every printed mark, rises steadily between them and stays between its two stops
for (const [mark, angle] of vu.VU_MARKS) assert.equal(vu.vuAngle(mark), angle, `${mark} VU`);
let last = -Infinity;
for (let level = -60; level <= 10; level += 0.25) {
    const angle = vu.vuAngle(level);
    assert.ok(angle >= last, `needle never falls back as the level rises (${level} VU)`);
    assert.ok(angle >= vu.VU_REST && angle <= vu.VU_PIN, `within the stops at ${level} VU`);
    last = angle;
}
assert.ok(vu.vuAngle(-80) - vu.VU_REST < 0.01, 'silence rests on the stop');
assert.equal(vu.vuAngle(8), vu.VU_PIN, 'too loud stays on the pin');

// Reel arithmetic from the comment: the tape fills area, so half the tape is not half the radius
const decks = vm.runInNewContext(`(${pick(/const DECKS = \{[\s\S]*?\n\};/, 'DECKS').replace(/^const DECKS = /, '').replace(/;$/, '')})`);
for (const [kind, d] of Object.entries(decks)) {
    const radius = (share) => Math.sqrt(d.hub ** 2 + (d.full ** 2 - d.hub ** 2) * share);
    assert.equal(radius(0), d.hub, `${kind}: an empty reel is the hub`);
    assert.equal(radius(1), d.full, `${kind}: a full reel`);
    assert.ok(radius(0.5) > (d.hub + d.full) / 2, `${kind}: halfway, each reel is past the middle radius`);
    const [[x0], [x1]] = d.reels;
    assert.ok(d.full + d.hub < x1 - x0, `${kind}: a full reel never overlaps the empty one`);
}
console.log('Cassette checks passed (VU scale and reel geometry).');
