const { test, expect } = require('@playwright/test');
const { STRINGS } = require('../shared.js');
test.use({ timezoneId: 'Asia/Riyadh' });
const key = 'athkarnfc_preferences_v1';
async function recordAutoplay(page) {
    await page.addInitScript(() => {
        window.playAttempts = [];
        HTMLMediaElement.prototype.play = function () {
            window.playAttempts.push(this.getAttribute('src'));
            return Promise.reject(new DOMException('Gesture required', 'NotAllowedError'));
        };
    });
}
for (const [time, track, audio] of [
    ['2026-09-22T21:00:00Z', 'morning', 'track2.mp3'], // 00:00 local
    ['2026-09-23T08:59:59Z', 'morning', 'track2.mp3'],
    ['2026-09-23T09:00:00Z', 'evening', 'track3.mp3']
]) {
    test(`opening at ${time} attempts the correct prayer in both modes`, async ({ page }) => {
        await recordAutoplay(page);
        await page.clock.setFixedTime(new Date(time));
        for (const url of ['/', '/car.html']) {
            await page.goto(url);
            await expect.poll(() => page.evaluate(() => window.playAttempts)).toEqual([`assets/audio/${audio}`]);
            if (url === '/') await expect(page.locator('.track.open .track-title')).toHaveText(track === 'morning' ? 'أذكار الصباح' : 'أذكار المساء');
            else await expect(page.locator(`#${track}`)).toHaveClass(/active/);
        }
    });
}
test('autoplay opt-out and all settings survive reloads and switching modes', async ({ page }) => {
    await recordAutoplay(page);
    await page.goto('/');
    await page.locator('.settings-button').click();
    await page.locator('#preference-autoplay').uncheck();
    await page.locator('#preference-speed').selectOption('1.5');
    for (const name of ['keepAwake', 'haptics', 'autoScroll']) await page.locator(`#preference-${name}`).uncheck();
    await expect(page.locator('.settings-status')).toHaveText(STRINGS.ar.settingsSaved);
    await page.locator('.settings-close').click();
    for (const url of ['/?autoplay=travel', '/car.html?autoplay=auto', '/']) {
        await page.goto(url);
        expect(await page.evaluate(() => window.playAttempts)).toEqual([]);
        expect(await page.locator('audio').evaluateAll(audios => audios.every(audio => audio.playbackRate === 1.5))).toBe(true);
        await page.locator('.settings-button').click();
        for (const name of ['autoplay', 'keepAwake', 'haptics', 'autoScroll']) await expect(page.locator(`#preference-${name}`)).not.toBeChecked();
        await expect(page.locator('#preference-speed')).toHaveValue('1.5');
        await page.keyboard.press('Escape');
    }
    // Re-enabling autoplay applies on next opening, not while changing settings.
    await page.locator('.settings-button').click();
    await page.locator('#preference-autoplay').check();
    expect(await page.evaluate(() => window.playAttempts)).toEqual([]);
    await page.reload();
    await expect.poll(() => page.evaluate(() => window.playAttempts.length)).toBe(1);
});
test('player speed button and settings share one saved preference', async ({ page }) => {
    await recordAutoplay(page);
    await page.goto('/?autoplay=travel');
    await page.locator('.track.open .speed-btn').click();
    await page.locator('.settings-button').click();
    await expect(page.locator('#preference-speed')).toHaveValue('1.25');
    await page.goto('/car.html');
    await expect(page.locator('.tab-panel.active .speed-btn')).toHaveText('1.25x');
});
test('legacy speed is migrated and unavailable storage does not break playback controls', async ({ page }) => {
    await recordAutoplay(page);
    await page.addInitScript(() => localStorage.setItem('athkarnfc_audio_speed', '2'));
    await page.goto('/');
    await expect(page.locator('.track.open .speed-btn')).toHaveText('2x');
    await page.addInitScript(() => {
        Storage.prototype.setItem = () => { throw new DOMException('Unavailable', 'QuotaExceededError'); };
    });
    await page.reload();
    await page.locator('.settings-button').click();
    await page.locator('#preference-autoplay').uncheck();
    await expect(page.locator('.settings-status')).toHaveText(STRINGS.ar.settingsUnsaved);
    await expect(page.locator('#preference-autoplay')).not.toBeChecked();
});
test('malformed preferences use safe defaults', async ({ page }) => {
    await recordAutoplay(page);
    await page.addInitScript(key => localStorage.setItem(key, '{invalid'), key);
    await page.goto('/');
    await page.locator('.settings-button').click();
    await expect(page.locator('#preference-autoplay')).toBeChecked();
    await expect(page.locator('#preference-speed')).toHaveValue('1');
});
