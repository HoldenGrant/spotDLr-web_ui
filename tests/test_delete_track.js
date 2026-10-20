'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../static/app.js'), 'utf8');
const fn = source.match(/function removeTrackFromQueue\(id\) \{[\s\S]*?\n\}/);
assert.ok(fn);
const cases = [
    { queue: ['a', 'b', 'c'], order: [0, 1, 2], pos: 1, remove: 'a', expected: ['b', 'c'], current: 'b' },
    { queue: ['a', 'b', 'c'], order: [2, 0, 1], pos: 2, remove: 'a', expected: ['c', 'b'], current: 'b' },
    { queue: ['a', 'b', 'c'], order: [2, 0, 1], pos: 1, remove: 'a', expected: ['c', 'b'], current: 'b' },
    { queue: ['a', 'b', 'c'], order: [0, 1, 2], pos: 2, remove: 'c', expected: ['a', 'b'], current: 'b' },
    { queue: ['a'], order: [0], pos: 0, remove: 'a', expected: [], current: undefined },
    { queue: ['a', 'b', 'a'], order: [0, 1, 2], pos: 1, remove: 'a', expected: ['b'], current: 'b' },
    { queue: ['b'], order: [0], pos: 0, queued: 'a', remove: 'a', expected: ['b'], current: 'b' },
];
for (const item of cases) {
    const P = { queue: [...item.queue], order: [...item.order], pos: item.pos, queued: item.queued || null, upNext: ['a', 'b', 'a'] };
    const remove = vm.runInNewContext(fn[0] + '; removeTrackFromQueue', { P });
    remove(item.remove);
    assert.equal(JSON.stringify(P.order.map((i) => P.queue[i])), JSON.stringify(item.expected));
    assert.equal(P.queued || P.queue[P.order[P.pos]], item.current);
    assert.ok(!P.upNext.includes(item.remove));
}
console.log(`Delete queue checks passed (${cases.length} cases).`);
