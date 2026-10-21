'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../static/app.js'), 'utf8');
const match = source.match(/function playbackRecoveryAction\([\s\S]*?\n\}/);
assert.ok(match, 'app.js must define playbackRecoveryAction');
const action = vm.runInNewContext(`${match[0]}; playbackRecoveryAction`);
const state = { paused: false, ended: false, sameTrack: true, advanced: false, currentTime: 42, duration: 200, attempts: 0 };

assert.equal(action(state), 'retry', 'a stuck song reconnects');
assert.equal(action({ ...state, currentTime: 199.2 }), 'next', 'a final-frame stall advances the queue');
assert.equal(action({ ...state, advanced: true }), null, 'new progress cancels recovery');
assert.equal(action({ ...state, paused: true }), null, 'a user pause is never overridden');
assert.equal(action({ ...state, sameTrack: false }), null, 'an old timer cannot reload the next song');
assert.equal(action({ ...state, attempts: 3 }), 'wait', 'retries are bounded while the connection is unavailable');

console.log('Playback recovery checks passed: retry, queue advance, cancellation and retry limit.');
