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
test('the preview server has a content type for every published asset', () => {
    const { types } = require('./server.cjs');
    const assets = ['index.html', 'car.html', 'style.css', 'car.css', 'player.css', 'sw.js', 'manifest.json',
        ...TRACKS.flatMap(track => [track.audio, track.data, track.fallback]).filter(Boolean)];
    for (const html of ['index.html', 'car.html']) {
        for (const match of fs.readFileSync(path.join(root, html), 'utf8').matchAll(/(?:src|href)="([^"#]+)"/g)) {
            if (!match[1].includes('://')) assets.push(match[1].replace(/^\.\//, ''));
        }
    }
    for (const asset of new Set(assets)) {
        assert.ok(types[path.extname(asset)], `No content type for ${asset}`);
    }
});
test('the evening opening card is the reviewed Ayat al-Kursi text', () => {
    const data = JSON.parse(fs.readFileSync(path.join(root, 'assets/athkar/evening_audio.json')));
    const item = data[0].dhikr_items[0];
    // The card renders the segments, so they have to agree with the stored text.
    const displayed = item.segments.map(segment => segment.text).join(' ');
    assert.equal(displayed, item.text);
    assert.equal(item.segments.length, 9);
    // The refuge phrase is marked as separate from the prayer text, and it is the
    // only segment carrying that mark, so the two cannot be read as one ayah.
    const openings = item.segments.filter(segment => segment.opening);
    assert.equal(openings.length, 1);
    assert.equal(openings[0], item.segments[0]);
    assert.equal(openings[0].text, 'أَعُوذُ بِٱللَّهِ مِنَ ٱلشَّيْطَانِ ٱلرَّجِيمِ');
    assert.equal(item.segments.slice(1).filter(segment => segment.text.includes('أَعُوذُ')).length, 0);
    // The citation shown under the card.
    assert.ok(item.reference.includes('آية الكرسي - البقرة'), item.reference);
    assert.ok(item.reference.endsWith('٢٥٥]'), item.reference);
    assert.ok(displayed.startsWith('أَعُوذُ بِٱللَّهِ مِنَ ٱلشَّيْطَانِ ٱلرَّجِيمِ'), 'the refuge phrase is kept');
    assert.ok(displayed.endsWith('\u06DD٢٥٥'), 'the ayah number is shown with its end-of-ayah mark');
    assert.equal(displayed.includes(' ٢٥٥'), false, 'the number is not left unmarked');
    assert.deepEqual('ۚ ۖ ۗ'.split(' ').map(mark => displayed.split(mark).length - 1), [5, 2, 1]);
    // The unvowelled wording must not change silently.
    const unvowelled = value => Array.from(value)
        .filter(character => !/[\u064B-\u065F\u0670\u06D6-\u06DC\u06DE-\u06ED\u0640\u0653-\u0655]/.test(character))
        .map(character => ('ٱأإآ'.includes(character) ? 'ا' : character === '\u0649' ? 'ي' : character))
        .join('').split(/\s+/).filter(Boolean);
    assert.equal(unvowelled(displayed).slice(5).join(' '), 'الله لا اله الا هو الحي القيوم لا تاخذه سنة ولا نوم له ما في السموت وما في الارض من ذا الذي يشفع عنده الا باذنه يعلم ما بين ايديهم وما خلفهم ولا يحيطون بشيء من علمه الا بما شاء وسع كرسيه السموت والارض ولا يوده حفظهما وهو العلي العظيم \u06DD٢٥٥');
});
test('the three surah cards number their ayahs as the sources do', () => {
    const data = JSON.parse(fs.readFileSync(path.join(root, 'assets/athkar/evening_audio.json')));
    const items = data[0].dhikr_items;
    // Words per ayah, taken from the two sources this change was copied from.
    const surahs = [
        { reference: '[سورة الإخلاص - ١١٢]', words: [4, 2, 4, 5], cards: [1, 4, 7] },
        { reference: '[سورة الفلق - ١١٣]', words: [4, 4, 5, 5, 5], cards: [2, 5, 8] },
        { reference: '[سورة الناس - ١١٤]', words: [4, 2, 2, 4, 5, 3], cards: [3, 6, 9] }
    ];
    const digits = '١٢٣٤٥٦';
    const unvowelled = value => Array.from(value)
        .filter(character => !/[\u064B-\u065F\u0670\u06D6-\u06DC\u06DE-\u06ED\u0640\u0653-\u0655]/.test(character))
        .map(character => ('ٱأإآ'.includes(character) ? 'ا' : character === '\u0649' ? 'ي' : character))
        .join('').split(/\s+/).filter(Boolean);
    for (const surah of surahs) {
        for (const index of surah.cards) {
            const segments = items[index].segments;
            assert.equal(items[index].reference, surah.reference);
            const openings = segments.filter(segment => segment.opening);
            assert.equal(openings.length, 1);
            assert.equal(openings[0], segments[0]);
            assert.equal(openings[0].text.split(/\s+/).length, 4, 'the opening is the basmala');
            assert.equal(digits.split('').some(digit => openings[0].text.includes(digit)), false);
            // Every ayah's number must follow exactly that ayah's words.
            const tokens = unvowelled(segments.filter(segment => !segment.opening)
                .map(segment => segment.text).join(' '));
            let cursor = 0;
            for (const [position, count] of surah.words.entries()) {
                for (let step = 0; step < count; step++) {
                    assert.ok(tokens[cursor] !== undefined, `ayah ${position + 1} is short`);
                    assert.equal(/[٠-٩\u06DD]/.test(tokens[cursor]), false, 'a number sits inside ayah words');
                    cursor++;
                }
                assert.equal(tokens[cursor], `\u06DD${digits[position]}`,
                    `ayah ${position + 1} is not numbered in place`);
                cursor++;
            }
            assert.equal(cursor, tokens.length, 'extra text after the last ayah number');
        }
    }
});
test('an invalid citation or opening mark is rejected', () => {
    const { normalizeData } = require('../shared.js');
    const page = items => [{ dhikr_items: items }];
    assert.throws(() => normalizeData(page([{ text: 'x', repeatCount: 1, reference: 5 }])), /Invalid prayer reference/);
    assert.throws(() => normalizeData(page([{ text: 'x', repeatCount: 1, reference: '   ' }])), /Invalid prayer reference/);
    assert.throws(() => normalizeData(page([{ text: 'x', repeatCount: 1,
        segments: [{ start: 0, end: 1, text: 'x', opening: 'yes' }] }])), /Invalid transcript segment/);
    const valid = normalizeData(page([{ text: 'x', repeatCount: 1, reference: '[a]',
        segments: [{ start: 0, end: 1, text: 'x', opening: true }] }]));
    assert.equal(valid[0].reference, '[a]');
    assert.equal(valid[0].segments[0].opening, true);
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

test('time-based startup switches exactly at the switch hour, including early morning', () => {
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
    assert.deepEqual(normalizePreferences({autoplay: false, speed: 1.5, haptics: false}),
        { ...DEFAULT_PREFERENCES, autoplay: false, speed: 1.5, haptics: false });
});
test('personalization preferences are validated and default safely', () => {
    const { normalizePreferences, DEFAULT_PREFERENCES } = require('../shared.js');
    assert.equal(DEFAULT_PREFERENCES.language, 'ar');
    assert.deepEqual(normalizePreferences({
        language: 'en', theme: 'light', accent: 'teal', textSize: 'xlarge', font: 'naskh',
        switchHour: 18, startup: 'morning'
    }), {
        ...DEFAULT_PREFERENCES, language: 'en', theme: 'light', accent: 'teal',
        textSize: 'xlarge', font: 'naskh', switchHour: 18, startup: 'morning'
    });
    assert.deepEqual(normalizePreferences({
        language: 'fr', theme: 'blue', accent: 'pink', textSize: 'huge', font: 'comic',
        switchHour: 25, startup: 'fajr'
    }), DEFAULT_PREFERENCES);
    assert.equal(normalizePreferences({ switchHour: '12' }).switchHour, 12);
    assert.equal(normalizePreferences({ switchHour: 5 }).switchHour, 5);
    assert.equal(normalizePreferences({ switchHour: 0 }).switchHour, 0);
});
test('the switch hour and the startup prayer decide the opening track', () => {
    const { timeTrack, startupTrack, DEFAULT_PREFERENCES } = require('../shared.js');
    const afternoon = new Date(2026, 8, 23, 15, 0);
    assert.equal(timeTrack(afternoon, 20), 'morning');
    assert.equal(timeTrack(afternoon, 12), 'evening');
    assert.equal(startupTrack(null, { ...DEFAULT_PREFERENCES, switchHour: 20 }, 'travel', afternoon), 'morning');
    assert.equal(startupTrack(null, { ...DEFAULT_PREFERENCES, startup: 'travel' }, 'evening', afternoon), 'travel');
    assert.equal(startupTrack(null, { ...DEFAULT_PREFERENCES, startup: 'last' }, 'travel', afternoon), 'travel');
    assert.equal(startupTrack('morning', { ...DEFAULT_PREFERENCES, startup: 'travel' }, 'evening', afternoon), 'morning');
    assert.equal(startupTrack('auto', { ...DEFAULT_PREFERENCES, startup: 'travel' }, 'evening', afternoon), 'evening');
});
test('both languages define the same strings and cover every page hook', () => {
    const { STRINGS } = require('../shared.js');
    const arabic = Object.keys(STRINGS.ar).sort();
    assert.deepEqual(arabic, Object.keys(STRINGS.en).sort());
    for (const key of arabic) {
        assert.ok(STRINGS.ar[key].trim(), `Arabic text missing for ${key}`);
        assert.ok(STRINGS.en[key].trim(), `English text missing for ${key}`);
    }
    // Every hook the pages use must exist, and the settings UI must offer only
    // values the validator accepts (asserted in the browser suite).
    for (const html of ['index.html', 'car.html']) {
        const contents = fs.readFileSync(path.join(root, html), 'utf8');
        for (const match of contents.matchAll(/data-i18n(?:-aria)?="([^"]+)"/g)) {
            assert.ok(arabic.includes(match[1]), `Unknown interface string ${match[1]} in ${html}`);
        }
    }
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
