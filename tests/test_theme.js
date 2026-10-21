'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../static/theme.js'), 'utf8');

function load(saved = {}, hour = 12, minute = 0) {
    let now = new Date(2026, 9, 23, hour, minute).getTime(), nextId = 0, storageBlocked = false;
    const storage = new Map(Object.entries(saved).map(([key, value]) => ['spotdlr.' + key, JSON.stringify(value)]));
    const timers = new Map(), docEvents = {}, winEvents = {}, systemEvents = {}, properties = {}, metas = {}, nativeModes = [];
    const root = { dataset: {}, style: { setProperty: (key, value) => { properties[key] = value; } } };
    const system = { matches: true, addEventListener: (type, fn) => { systemEvents[type] = fn; } };
    class Clock extends Date {
        constructor(...args) { super(...(args.length ? args : [now])); }
        static now() { return now; }
    }
    const document = { documentElement: root, hidden: false, querySelector: (selector) => ({ setAttribute: (key, value) => { metas[selector] = value; } }),
        addEventListener: (type, fn) => { docEvents[type] = fn; }, dispatchEvent() {} };
    const context = vm.createContext({ Date: Clock, Math, Event: class { constructor(type) { this.type = type; } }, document,
        window: { matchMedia: () => system, addEventListener: (type, fn) => { winEvents[type] = fn; },
            webkit: { messageHandlers: { theme: { postMessage: (mode) => nativeModes.push(mode) } } } },
        localStorage: { getItem: (key) => storage.get(key) ?? null,
            setItem: (key, value) => { if (storageBlocked) throw new Error('Storage blocked'); storage.set(key, value); } },
        setTimeout: (fn, delay) => { const id = ++nextId; timers.set(id, { fn, at: now + delay }); return id; },
        clearTimeout: (id) => timers.delete(id),
    });
    const theme = vm.runInContext(source + '; Theme;', context);
    return { theme, root, properties, storage, timers, metas, nativeModes,
        at(hour, minute = 0, fire = true) {
            now = new Date(2026, 9, 23, hour, minute, 0, 60).getTime();
            if (fire) for (const [id, timer] of [...timers]) if (timer.at <= now) { timers.delete(id); timer.fn(); }
        },
        focus: () => winEvents.focus(), visible: () => docEvents.visibilitychange(),
        system(dark) { system.matches = dark; systemEvents.change(); },
        blockStorage() { storageBlocked = true; },
    };
}

for (const [hour, expected] of [[0, 'dark'], [6, 'dark'], [7, 'light'], [18, 'light'], [19, 'dark'], [23, 'dark']]) {
    const day = load({ mode: 'daylight' }, hour);
    assert.equal(day.root.dataset.mode, expected, `daylight at ${hour}`);
    const night = load({ mode: 'nightlight' }, hour);
    assert.equal(night.root.dataset.mode, expected === 'dark' ? 'light' : 'dark', `reverse at ${hour}`);
}

const automatic = load({ mode: 'daylight' }, 6, 59);
assert.equal(automatic.timers.size, 1);
automatic.at(7);
assert.equal(automatic.root.dataset.mode, 'light', 'automatic switch at day boundary');
automatic.at(19);
assert.equal(automatic.root.dataset.mode, 'dark', 'automatic switch at night boundary');
automatic.at(8, 0, false);
automatic.focus();
assert.equal(automatic.root.dataset.mode, 'light', 'refresh after sleep/clock change');
automatic.at(20, 0, false);
automatic.visible();
assert.equal(automatic.root.dataset.mode, 'dark', 'refresh when visible');
automatic.theme.setMode('light');
assert.equal(automatic.timers.size, 0, 'manual themes do not keep schedule timers');
assert.equal(automatic.metas['meta[name="theme-color"]'], '#f2f3f5', 'light browser chrome follows the theme');
assert.equal(automatic.metas['meta[name="apple-mobile-web-app-status-bar-style"]'], 'default', 'light iPhone status bar follows the theme');
assert.equal(automatic.nativeModes.at(-1), 'light', 'native Mac window receives the light theme');
automatic.theme.setMode('system');
automatic.system(false);
assert.equal(automatic.root.dataset.mode, 'light');
automatic.system(true);
assert.equal(automatic.root.dataset.mode, 'dark');
assert.equal(automatic.metas['meta[name="theme-color"]'], '#121212', 'dark browser chrome follows the theme');
assert.equal(automatic.metas['meta[name="apple-mobile-web-app-status-bar-style"]'], 'black', 'dark iPhone status bar follows the theme');
assert.equal(automatic.nativeModes.at(-1), 'dark', 'native Mac window receives the dark theme');
automatic.theme.setMode('nightlight');
for (let i = 0; i < 10; i++) automatic.theme.setSchedule('08:30', '21:15');
assert.equal(automatic.timers.size, 1, 'editing the schedule replaces its timer');
assert.equal(JSON.parse(automatic.storage.get('spotdlr.themeSchedule')).night, '21:15');
assert.equal(load({ mode: 'daylight', themeSchedule: { day: '08:30', night: '21:15' } }, 8, 29).root.dataset.mode, 'dark');
assert.equal(load({ mode: 'daylight', themeSchedule: { day: '08:30', night: '21:15' } }, 8, 30).root.dataset.mode, 'light');
for (const hour of [0, 5, 22, 23]) assert.equal(load({ mode: 'daylight', themeSchedule: { day: '22:00', night: '06:00' } }, hour).root.dataset.mode, 'light');
for (const hour of [6, 12, 21]) assert.equal(load({ mode: 'daylight', themeSchedule: { day: '22:00', night: '06:00' } }, hour).root.dataset.mode, 'dark');
for (const times of [['07:00', '07:00'], ['', '19:00'], ['25:00', '19:00'], ['7:00', '19:00']]) {
    assert.throws(() => automatic.theme.setSchedule(...times));
}
assert.equal(automatic.theme.schedule.day, '08:30', 'invalid edits retain the saved schedule');

function luminance(hex) {
    const channels = hex.slice(1).match(/../g).map((v) => parseInt(v, 16) / 255).map((v) => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
    return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
}
function contrast(a, b) { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); }
function tinted(background, accent) {
    const bg = background.slice(1).match(/../g).map((v) => parseInt(v, 16));
    return '#' + accent.slice(1).match(/../g).map((v, i) => Math.round(bg[i] * .88 + parseInt(v, 16) * .12).toString(16).padStart(2, '0')).join('');
}
const custom = load();
for (const [i, color] of ['#000000', '#ffffff', '#ff8844', '#123aff', '#ff00ff', '#008000', '#777777', '#ff0000'].entries()) {
    const saved = custom.theme.saveCustom('Color ' + i, color);
    assert.equal(saved.color, color, 'chosen swatch stays exact');
    assert.equal(custom.theme.current, saved.id);
    custom.theme.setMode('dark');
    assert.ok(contrast(custom.properties['--green'], '#282828') >= 4.5, color + ': dark text contrast');
    assert.ok(contrast(custom.properties['--green'], tinted('#282828', custom.properties['--green'])) >= 4.5, color + ': dark selected-tab contrast');
    assert.ok(contrast(custom.properties['--accent-fill'], '#000000') >= 4.5, color + ': button contrast');
    custom.theme.setMode('light');
    assert.ok(contrast(custom.properties['--green'], '#f2f3f5') >= 4.5, color + ': light text contrast');
    assert.ok(contrast(custom.properties['--green'], tinted('#f2f3f5', custom.properties['--green'])) >= 4.5, color + ': light selected-tab contrast');
    assert.ok(contrast(saved.color, saved.ink) >= 4.5, color + ': checkmark contrast');
}
assert.equal(custom.theme.colors.length, 14);
const stored = JSON.parse(custom.storage.get('spotdlr.customColors'));
const selected = custom.theme.current;
const restored = load({ customColors: stored, theme: selected, mode: 'daylight', themeSchedule: { day: '08:30', night: '21:15' } }, 20);
assert.equal(restored.theme.current, selected, 'selected custom color survives reload');
assert.equal(restored.theme.colors.length, 14, 'saved colors survive reload');
assert.equal(restored.root.dataset.mode, 'light');
for (const [name, color] of [['', '#ff8844'], ['green', '#ff8844'], ['Color 0', '#ff8844'], ['Long'.repeat(9), '#ff8844'], ['Bad', '#xyzxyz'], ['Bad', 'red; color:black']]) {
    assert.throws(() => custom.theme.saveCustom(name, color));
}
custom.blockStorage();
assert.throws(() => custom.theme.saveCustom('Blocked', '#ff8844'), /Could not save/);
assert.equal(custom.theme.colors.length, 14, 'storage failures do not claim a saved color');
for (const invalid of [null, {}, 'bad', [null, {}, { id: 'custom-bad', name: 'Bad', color: 'url(x)' }]]) {
    assert.equal(load({ customColors: invalid, themeSchedule: invalid, mode: 'invalid' }).theme.colors.length, 6);
}
assert.equal(load({ theme: 'purple', mode: 'light' }).theme.current, 'purple', 'existing preferences stay compatible');
console.log('Theme checks passed: day/night boundaries, reverse schedules, wake, persistence, custom colors and contrast.');
