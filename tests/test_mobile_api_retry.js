const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('static/app.js', 'utf8');
const start = source.indexOf('async function apiRequest(');
const end = source.indexOf('\nasync function api(', start);
assert.ok(start >= 0 && end > start, 'apiRequest must be defined before api');
const calls = [];
const context = {
    fetch: async (url, options) => {
        calls.push({ url, options });
        if (calls.length === 1) throw new TypeError('Load failed');
        return { ok: true };
    },
    setTimeout: (resolve) => resolve(),
};
const apiRequest = vm.runInNewContext(`${source.slice(start, end)}; apiRequest`, context);

(async () => {
    await apiRequest('/search?q=test');
    assert.equal(calls.length, 2, 'a failed read request retries once');

    calls.length = 0;
    context.fetch = async () => { calls.push(1); throw new TypeError('Load failed'); };
    await assert.rejects(apiRequest('/preferences/client', { method: 'PUT' }));
    assert.equal(calls.length, 1, 'a write request is never replayed');
    console.log('Mobile API retry checks passed: one retry for reads, none for writes.');
})();
