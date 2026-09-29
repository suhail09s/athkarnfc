const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { TRACKS, normalizeData, loadTrack, seekTime, parseRange } = require('../shared.js');
const root = path.join(__dirname, '..');

test('all prayer data has numeric counts and valid transcript segments', () => {
    for (const file of fs.readdirSync(path.join(root, 'assets/athkar')).filter(file => file.endsWith('.json'))) {
        const items = normalizeData(JSON.parse(fs.readFileSync(path.join(root, 'assets/athkar', file))));
        assert.ok(items.length);
        assert.ok(items.every(item => !item.text.includes('<span')));
    }
    const evening = normalizeData(JSON.parse(fs.readFileSync(path.join(root, 'assets/athkar/evening.json'))));
    for (const [label, expected] of Object.entries({ 'ثلاث مرات': 3, 'أربع مرات': 4, 'سبعة مرات': 7, 'عشرة مرات': 10, 'مائة مرة': 100 })) {
        const matches = evening.filter(item => item.repeat_count === label);
        assert.ok(matches.length, label);
        assert.ok(matches.every(item => item.repeatCount === expected), label);
    }
});
test('morning failure uses its own dataset and never requests evening', async () => {
    const requested = [];
    const result = await loadTrack(TRACKS[1], async url => {
        requested.push(url);
        return { ok: url.endsWith('/morning.json'), status: 404,
            json: async () => JSON.parse(fs.readFileSync(path.join(root, url))) };
    });
    assert.deepEqual(requested, [TRACKS[1].data, TRACKS[1].fallback]);
    assert.equal(result.items.length, 31);
    assert.equal(result.usedFallback, true);
    assert.equal(result.path, TRACKS[1].fallback);
});
test('the synchronized dataset is used and reported when it loads', async () => {
    const result = await loadTrack(TRACKS[2], async url => ({
        ok: true, status: 200, json: async () => JSON.parse(fs.readFileSync(path.join(root, url)))
    }));
    assert.equal(result.usedFallback, false);
    assert.equal(result.path, TRACKS[2].data);
    assert.equal(result.items.length, 32);
});
test('the published artifact only contains allowlisted runtime files', () => {
    const { collect, entries } = require('../deploy/stage.cjs');
    const files = collect().map(file => file.name);
    for (const required of ['index.html', 'car.html', 'sw.js', 'manifest.json', 'CNAME', '.nojekyll']) {
        assert.ok(files.includes(required), `Artifact is missing ${required}`);
    }
    for (const asset of ['assets/audio/track3.mp3', 'assets/icons/apple-touch-icon.png', 'assets/icons/icon-192.png']) {
        assert.ok(files.includes(asset), `Artifact is missing ${asset}`);
    }
    assert.ok(!files.some(name => name.includes('.DS_Store') || name.startsWith('work/') ||
        name.startsWith('tests/') || name.startsWith('deploy/')), 'Local files must not be published');
    for (const entry of entries()) {
        assert.ok(files.some(name => name === entry || name.startsWith(`${entry}/`)), `Nothing staged for ${entry}`);
    }
});
test('invalid data and exhausted fallbacks are reported', async () => {
    assert.throws(() => normalizeData([]));
    assert.throws(() => normalizeData([{ dhikr_items: [{ text: 'test', repeatCount: 0 }] }]));
    await assert.rejects(loadTrack(TRACKS[1], async () => ({ ok: false, status: 503 })));
});
test('seeking handles unloaded media and clamps to boundaries', () => {
    assert.equal(seekTime(0, 10, NaN), null);
    assert.equal(seekTime(5, -10, 100), 0);
    assert.equal(seekTime(95, 10, 100), 100);
    assert.equal(seekTime(20, 10, 100), 30);
});
test('offline audio byte ranges support bounded, open-ended and suffix requests', () => {
    assert.deepEqual(parseRange('bytes=10-19', 100), { start: 10, end: 19 });
    assert.deepEqual(parseRange('bytes=90-', 100), { start: 90, end: 99 });
    assert.deepEqual(parseRange('bytes=-10', 100), { start: 90, end: 99 });
    assert.deepEqual(parseRange('bytes=90-999', 100), { start: 90, end: 99 });
    assert.deepEqual(parseRange('bytes=100-', 100), { unsatisfiable: true });
    assert.deepEqual(parseRange('bytes=-0', 100), { unsatisfiable: true });
    assert.equal(parseRange('bytes=0-1,5-6', 100), null);
});
test('all referenced local page assets, shell assets and audio are deployable', () => {
    const deploy = fs.readFileSync(path.join(root, 'deploy/files.txt'), 'utf8').trim().split('\n');
    function check(asset) {
        if (!asset) return;
        asset = asset.replace(/^\.\//, '');
        if (!asset) return;
        assert.ok(fs.existsSync(path.join(root, asset)), `Missing ${asset}`);
        assert.ok(deploy.some(entry => asset === entry || asset.startsWith(entry + '/')), `Not deployed: ${asset}`);
    }
    for (const html of ['index.html', 'car.html']) {
        const contents = fs.readFileSync(path.join(root, html), 'utf8');
        for (const match of contents.matchAll(/(?:src|href)="([^"#]+)"/g)) {
            if (!match[1].includes('://')) check(match[1]);
        }
    }
    const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
    const assets = sw.match(/const SHELL_ASSETS = \[([\s\S]*?)\];/)[1];
    for (const match of assets.matchAll(/'([^']+)'/g)) check(match[1]);
    for (const track of TRACKS) { check(track.audio); check(track.data); check(track.fallback); }
    assert.ok(!assets.includes('.mp3'), 'Large audio must not block shell installation');
});

test('time-based startup switches exactly at local noon, including early morning', () => {
    const { timeTrack, startupTrack, DEFAULT_PREFERENCES } = require('../shared.js');
    for (const [hour, minute, expected] of [[0, 0, 'morning'], [4, 59, 'morning'], [11, 59, 'morning'], [12, 0, 'evening'], [23, 59, 'evening']]) {
        const date = new Date(2026, 8, 23, hour, minute);
        assert.equal(timeTrack(date), expected);
        assert.equal(startupTrack(null, DEFAULT_PREFERENCES, 'travel', date), expected);
    }
    const date = new Date(2026, 8, 23, 8);
    assert.equal(startupTrack('travel', DEFAULT_PREFERENCES, 'evening', date), 'travel');
    assert.equal(startupTrack(null, { autoplay: false }, 'travel', date), 'travel');
    assert.equal(startupTrack('auto', { autoplay: false }, 'travel', date), 'morning');
});
test('preferences validate saved values and tolerate corrupt or older records', () => {
    const { normalizePreferences, DEFAULT_PREFERENCES } = require('../shared.js');
    assert.deepEqual(normalizePreferences(null), DEFAULT_PREFERENCES);
    assert.deepEqual(normalizePreferences([]), DEFAULT_PREFERENCES);
    assert.deepEqual(normalizePreferences({ autoplay: 'false', speed: 99 }), DEFAULT_PREFERENCES);
    assert.deepEqual(normalizePreferences({ autoplay: false, speed: 1.5, haptics: false }), {
        autoplay: false, speed: 1.5, keepAwake: true, haptics: false, autoScroll: true
    });
});

test('prayer cues use transcript starts and estimate untimed recordings by text length', () => {
    const { prayerCues } = require('../shared.js');
    assert.deepEqual(prayerCues([
        { text: 'one', segments: [{ start: 4, end: 8, text: 'one' }] },
        { text: 'two', segments: [{ start: 12, end: 16, text: 'two' }] }
    ], 20), [4, 12]);
    assert.deepEqual(prayerCues([
        { text: 'aa', segments: [] }, { text: 'bbbbbb', segments: [] }
    ], 80), [0, 20]);
    assert.deepEqual(prayerCues([], 80), []);
    assert.deepEqual(prayerCues([{ text: 'a', segments: [] }], NaN), []);
});

test('evening transcript covers the recording in spoken order with valid boundaries', () => {
    const { normalizeData, prayerCues } = require('../shared.js');
    const data = JSON.parse(fs.readFileSync(path.join(root, 'assets/athkar/evening_audio.json')));
    const items = normalizeData(data);
    assert.equal(items.length, 32);
    const totalSegments = items.reduce((sum, item) => sum + item.segments.length, 0);
    assert.equal(totalSegments, 121);
    assert.equal(items[0].segments.length, 9);
    const cues = prayerCues(items, 601.5789);
    assert.equal(cues[0], 1.56);
    assert.equal(cues.at(-1), 561.8);
    for (let index = 1; index < items.length; index++) {
        assert.ok(cues[index] > cues[index - 1], `Cue ${index} must follow cue ${index - 1}`);
        assert.ok(items[index - 1].segments.at(-1).end <= cues[index], `Prayer ${index} overlaps its predecessor`);
    }
    assert.ok(items.at(-1).segments.at(-1).end >= 601.57);
});
