'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

// Crossfade hand-over: the next song is loaded on a third player ahead of the fade; when the fade starts the three
// players trade jobs, so the outgoing song carries on where it is (no jump to a new spot in the file, which on a slow
// connection arrived after the song had ended and left a silent gap) and the next one starts at once.
const source = fs.readFileSync(path.join(__dirname, '../static/app.js'), 'utf8');
const grab = (name) => {
    const match = source.match(new RegExp(`function ${name}\\([\\s\\S]*?\\n\\}`));
    assert.ok(match, `app.js must define ${name}`);
    return match[0];
};

function player(name, src = null) {
    const el = { name, src, muted: false, paused: false, error: null, loads: 0, pauses: 0 };
    el.getAttribute = () => el.src;
    el.removeAttribute = () => { el.src = null; };
    el.pause = () => { el.paused = true; el.pauses += 1; };
    el.load = () => { el.loads += 1; };
    return el;
}

function scene({ held = 'next', direct = true } = {}) {
    const outgoing = player('outgoing', '/api/stream/current');
    const loaded = player('loaded', '/api/stream/next');
    const oldTail = player('oldTail');
    const wired = [];
    const context = { P: { audio: outgoing }, XF: { el: oldTail, preEl: loaded, preId: held, direct }, wirePlayers: () => wired.push('wired') };
    outgoing.muted = true;
    vm.createContext(context);
    vm.runInContext(`${grab('dropPreloaded')}\n${grab('takePreloaded')}`, context);
    return { context, outgoing, loaded, oldTail, wired };
}

// The normal case
let s = scene();
assert.equal(vm.runInContext("takePreloaded('next')", s.context), true);
assert.equal(s.context.P.audio, s.loaded, 'the loaded player becomes the main one');
assert.equal(s.context.XF.el, s.outgoing, 'the old main player carries on with the outgoing song as the fading one');
assert.equal(s.outgoing.src, '/api/stream/current', 'the outgoing song is not reloaded or seeked');
assert.equal(s.outgoing.pauses, 0, 'and not paused');
assert.equal(s.context.XF.preEl, s.oldTail, 'the player that was fading becomes the spare');
assert.equal(s.oldTail.loads, 1, 'and is emptied');
assert.equal(s.loaded.muted, true, 'mute carries over to the new main player');
assert.equal(s.context.XF.preId, null);
assert.deepEqual(s.wired, ['wired'], 'the visualizer and volume paths are rewired');

// Anything else falls back to loading the song the usual way, and lets go of what was held
for (const [label, options, ask] of [
    ['a different song was chosen', {}, 'other'],
    ['no hand-over was planned for this fade', { direct: false }, 'next'],
    ['nothing was held', { held: null }, 'next'],
]) {
    s = scene(options);
    assert.equal(vm.runInContext(`takePreloaded('${ask}')`, s.context), false, label);
    assert.equal(s.context.P.audio, s.outgoing, `${label}: the main player stays`);
    assert.equal(s.context.XF.el, s.oldTail, `${label}: the fading player stays`);
    assert.equal(s.loaded.src, null, `${label}: the held song is dropped`);
    assert.equal(s.context.XF.preId, null, `${label}: nothing is remembered`);
}
s = scene();
s.loaded.error = { code: 4 };
assert.equal(vm.runInContext("takePreloaded('next')", s.context), false, 'a song that failed to load is not handed over');

console.log('Crossfade hand-over checks passed: players trade jobs, outgoing song untouched, fallbacks drop the held song.');
