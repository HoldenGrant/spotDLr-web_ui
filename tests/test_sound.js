'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../static/app.js'), 'utf8');
const pick = (re, what) => { const m = source.match(re); assert.ok(m, `app.js must still define ${what}`); return m[0]; };
const roomImpulse = vm.runInNewContext(`${pick(/function roomImpulse\(ctx, seconds\) \{[\s\S]*?\n\}/, 'roomImpulse')}; roomImpulse`, { Math });
const ROOMS = vm.runInNewContext(`(${pick(/const ROOMS = \{[^\n]*\};/, 'ROOMS').replace(/^const ROOMS = /, '').replace(/;$/, '')})`);

// A stand-in for an AudioContext: just enough for roomImpulse to build its buffer
const rate = 16000;
const ctx = { sampleRate: rate, createBuffer: (channels, length) => {
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    return { length, numberOfChannels: channels, getChannelData: (i) => data[i] };
} };
const db = (x) => 20 * Math.log10(x);
const rms = (data, from, to) => { let s = 0; for (let i = from; i < to; i++) s += data[i] * data[i]; return Math.sqrt(s / (to - from)); };

for (const [key, [label, seconds]] of Object.entries(ROOMS)) {
    const ir = roomImpulse(ctx, seconds), left = ir.getChannelData(0), right = ir.getChannelData(1);
    const delay = Math.round(rate * Math.min(0.04, seconds * 0.01));
    // Silent until the first echo, which comes 4-40 ms late
    assert.ok(left.slice(0, delay).every((v) => v === 0) && right.slice(0, delay).every((v) => v === 0), `${label}: silent before the first echo`);
    // Unit energy per side: the room alone is about as loud as the song (so the dry/wet mix keeps the loudness)
    for (const side of [left, right]) {
        const energy = side.reduce((s, v) => s + v * v, 0);
        assert.ok(Math.abs(energy - 1) < 0.15, `${label}: energy ${energy.toFixed(2)} ≈ 1`);
    }
    // RT60 means what it says: the lows, which set the tail, are 60 dB down after `seconds`. The highs die twice as
    // fast but add to the start, so start-to-end measures a few dB more than 60; 50 ms windows keep the noise down.
    const win = Math.round(rate * 0.05), start = rms(left, delay, delay + win), end = rms(left, ir.length - win, ir.length);
    const drop = db(start) - db(end);
    assert.ok(drop > 55 && drop < 75, `${label}: ${drop.toFixed(1)} dB down by the end (RT60 ${seconds} s)`);
    // Each ear hears different echoes, which is what makes it sound like a room around you rather than in your head
    let same = 0; for (let i = delay; i < ir.length; i++) same += left[i] * right[i];
    assert.ok(Math.abs(same) < 0.2, `${label}: the two sides are uncorrelated (${same.toFixed(3)})`);
}
console.log(`Sound checks passed (${Object.keys(ROOMS).length} rooms: delay, energy, RT60, stereo).`);
