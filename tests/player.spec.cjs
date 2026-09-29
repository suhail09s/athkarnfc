const { test: base, expect } = require('@playwright/test');
const { spawn } = require('node:child_process');
const path = require('node:path');
const { once } = require('node:events');
const test = base.extend({
    offlineOrigin: async ({}, use) => {
        const server = spawn(process.execPath, [path.join(__dirname, 'server.cjs')], { env: { ...process.env, PORT: '0' } });
        const [output] = await once(server.stdout, 'data');
        const url = String(output).match(/http:\/\/\S+/)[0];
        async function stop() {
            if (server.exitCode !== null || server.signalCode !== null) return;
            const exited = once(server, 'exit');
            server.kill();
            await exited;
        }
        try { await use({ url, stop }); } finally { await stop(); }
    }
});

for (const mode of ['normal', 'car']) {
    const url = mode === 'car' ? '/car.html?autoplay=evening' : '/?autoplay=evening';
    const active = mode === 'car' ? '#evening' : '.track[data-track="2"]';
    test(`${mode}: evening counts, controls, playback and accessible seeking`, async ({ page }) => {
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(url);
        const panel = page.locator(active);
        await expect(panel.locator('.repeat-badge')).toHaveCount(32);
        // evening_audio.json follows the recording, which recites each prayer
        // once, so a single press completes the count in either mode.
        const counter = panel.locator('.repeat-badge').first();
        const restingLabel = await counter.textContent();
        await counter.focus();
        await page.keyboard.press('Enter');
        await expect(counter).toHaveAttribute('aria-disabled', 'true');
        await expect(counter).toHaveText(/مكتمل|Complete/);
        await panel.locator('.reset-count:visible').first().click();
        await expect(counter).toHaveAttribute('aria-disabled', 'false');
        await expect(counter).toHaveText(restingLabel);
        // Ensure media is started through a real user gesture on both browser engines.
        await panel.locator('audio').evaluate(audio => audio.pause());
        await panel.locator('.play-pause-btn').click();
        await expect.poll(() => panel.locator('audio').evaluate(audio => !audio.paused && audio.currentTime > 0)).toBeTruthy();
        await panel.locator('audio').evaluate(audio => { audio.pause(); audio.currentTime = 20; });
        await panel.locator('.next-btn').click();
        await expect.poll(() => panel.locator('audio').evaluate(audio => Math.round(audio.currentTime))).toBe(30);
        await panel.locator('.prev-btn').click();
        await expect.poll(() => panel.locator('audio').evaluate(audio => Math.round(audio.currentTime))).toBe(20);
        await panel.locator('.progress-bar').focus();
        await page.keyboard.press('ArrowRight');
        await expect.poll(() => panel.locator('audio').evaluate(audio => audio.currentTime)).toBeGreaterThan(20);
        expect(errors).toEqual([]);
    });
    test(`${mode}: save audio, reload offline with NFC parameters, seek and remove`, async ({ page, context, browserName, offlineOrigin }) => {
        await page.goto(offlineOrigin.url + (mode === 'car' ? '/car.html?autoplay=travel' : '/?autoplay=travel'));
        const panel = page.locator(mode === 'car' ? '#travel' : '.track[data-track="0"]');
        await expect(panel.locator('.offline-button')).toBeEnabled();
        await panel.locator('.offline-button').click();
        await expect(panel.locator('.offline-status')).toHaveText(mode === 'car' ? 'الصوت متاح دون اتصال' : 'Audio available offline');
        await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBeTruthy();
        // Stop the actual origin in both engines. WebKit's offline emulation
        // rejects even cached service-worker responses on macOS; shutting down
        // the server tests cache-only operation without that harness limitation.
        await offlineOrigin.stop();
        if (browserName === 'chromium') await context.setOffline(true);
        await page.reload();
        await expect(panel.locator('.repeat-badge')).toHaveCount(1);
        const ranged = await page.evaluate(async () => {
            const response = await fetch('assets/audio/track1.mp3', { headers: { Range: 'bytes=10-19' } });
            return { status: response.status, range: response.headers.get('Content-Range'), size: (await response.arrayBuffer()).byteLength };
        });
        expect(ranged.status).toBe(206);
        expect(ranged.range).toMatch(/^bytes 10-19\//);
        expect(ranged.size).toBe(10);
        await panel.locator('audio').evaluate(audio => audio.pause());
        await panel.locator('.play-pause-btn').click();
        await expect.poll(() => panel.locator('audio').evaluate(audio => !audio.paused && audio.currentTime > 0)).toBeTruthy();
        await panel.locator('audio').evaluate(audio => { audio.currentTime = 30; });
        await expect.poll(() => panel.locator('audio').evaluate(audio => audio.currentTime)).toBeGreaterThan(30);
        await expect(panel.locator('.offline-button')).toBeEnabled();
        await panel.locator('.offline-button').click();
        await expect(panel.locator('.offline-button')).toHaveText(mode === 'car' ? 'حفظ للاستماع دون اتصال' : 'Save offline');
    });
}

test('morning remains usable when evening data is unavailable', async ({ page }) => {
    await page.route('**/assets/athkar/evening*.json', route => route.fulfill({ status: 503, body: 'Unavailable' }));
    await page.goto('/?autoplay=morning');
    await expect(page.locator('#carousel-1 .repeat-badge')).toHaveCount(13);
    await expect(page.locator('#carousel-2 .retry-button')).toHaveCount(1);
});
test('the reading list is labelled when the synchronized dataset fails', async ({ page }) => {
    await page.route('**/assets/athkar/morning_v2.json', route => route.fulfill({ status: 503, body: 'Unavailable' }));
    await page.goto('/?autoplay=morning');
    const morning = page.locator('.track[data-track="1"]');
    await expect(morning.locator('.repeat-badge')).toHaveCount(31);
    await expect(morning.locator('.fallback-note')).toBeVisible();
    await expect(morning.locator('.fallback-note')).toHaveText(/reading list/);
});
test('blocked autoplay does not hijack closing or switching tracks', async ({ page }) => {
    await page.addInitScript(() => {
        HTMLMediaElement.prototype.play = function () { return Promise.reject(new DOMException('Blocked', 'NotAllowedError')); };
    });
    await page.goto('/?autoplay=travel');
    await expect(page.locator('.track.open .player-status')).toHaveText('Tap Play to start listening.');
    await page.locator('.track.open .track-btn').click();
    await expect(page.locator('.track.open')).toHaveCount(0);
});
test('small screens have no horizontal overflow in either mode', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    for (const url of ['/?autoplay=morning', '/car.html?autoplay=morning']) {
        await page.goto(url);
        // Wait for the morning track specifically: the first badge in the DOM
        // belongs to a collapsed panel in normal mode.
        const morning = url.startsWith('/car')
            ? page.locator('#morning .repeat-badge')
            : page.locator('#carousel-1 .repeat-badge');
        await expect(morning).toHaveCount(13);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
    }
});

test('prayer navigation preserves counts and switching pauses the old recording', async ({ page }) => {
    // Drive playback from the test: with autoplay left on, which track is open
    // depends on the clock, and playback may already have carried the follower
    // past the first prayer before the first assertion.
    await page.addInitScript(() => localStorage.setItem(
        'athkarnfc_preferences_v1', JSON.stringify({ autoplay: false, speed: 1 })));
    await page.goto('/?autoplay=morning');
    const morning = page.locator('.track[data-track="1"]');
    await expect(morning.locator('.repeat-badge')).toHaveCount(13);
    await expect(morning.locator('.prayer-previous')).toBeDisabled();
    await morning.locator('.prayer-next').click();
    await expect(morning.locator('.prayer-previous')).toBeEnabled();
    await expect.poll(() => morning.locator('audio').evaluate(audio => audio.currentTime)).toBeGreaterThan(30);
    await expect.poll(() => morning.locator('audio').evaluate(audio => !audio.paused)).toBeTruthy();
    await morning.locator('.prayer-previous').click();
    await expect(morning.locator('.prayer-previous')).toBeDisabled();
    await expect.poll(() => morning.locator('audio').evaluate(audio => audio.currentTime)).toBeLessThan(2);
    await morning.locator('audio').evaluate(audio => audio.pause());
    await morning.locator('.play-pause-btn').click();
    await expect.poll(() => morning.locator('audio').evaluate(audio => !audio.paused)).toBeTruthy();
    await morning.locator('.track-btn').click();
    await page.locator('.track[data-track="0"] .track-btn').click();
    await page.locator('.track[data-track="0"] .play-pause-btn').click();
    await expect.poll(() => page.locator('audio').evaluateAll(audios => audios.filter(audio => !audio.paused).length)).toBe(1);
    expect(await morning.locator('audio').evaluate(audio => audio.paused)).toBeTruthy();
});

test('timestamped evening prayer navigation seeks audio and playback follows the selected card', async ({ page }) => {
    await page.goto('/?autoplay=evening');
    const evening = page.locator('.track[data-track="2"]');
    await evening.locator('audio').evaluate(audio => audio.pause());
    await evening.locator('.prayer-next').click();
    await expect.poll(() => evening.locator('audio').evaluate(audio => audio.currentTime)).toBeGreaterThan(48);
    await expect.poll(() => evening.locator('audio').evaluate(audio => audio.currentTime)).toBeLessThan(62);
    await expect.poll(() => evening.locator('audio').evaluate(audio => !audio.paused)).toBeTruthy();
    await evening.locator('audio').evaluate(audio => { audio.currentTime = audio.duration * .75; });
    await expect.poll(() => evening.locator('.prayer-previous').isEnabled()).toBeTruthy();
    await expect.poll(() => evening.locator('.prayer-next').isEnabled()).toBeTruthy();
});

test('worker rejects unknown audio paths and still saves allowed recordings', async ({ page }) => {
    await page.goto('/?autoplay=travel');
    const panel = page.locator('.track[data-track="0"]');
    await expect(panel.locator('.offline-button')).toBeEnabled();
    // Send an invalid path through the same worker API; it must never be cached.
    const result = await page.evaluate(async () => {
        const registration = await navigator.serviceWorker.ready;
        return new Promise(resolve => {
            const channel = new MessageChannel();
            channel.port1.onmessage = event => { channel.port1.close(); resolve(event.data); };
            registration.active.postMessage({ type: 'SAVE_AUDIO', path: 'assets/audio/missing.mp3' }, [channel.port2]);
        });
    });
    expect(result.ok).toBe(false);
    await panel.locator('.offline-button').click();
    await expect(panel.locator('.offline-status')).toHaveText('Audio available offline');
});
