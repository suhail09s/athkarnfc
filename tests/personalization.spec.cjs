const { test, expect } = require('@playwright/test');
const { THEMES, ACCENTS, TEXT_SIZES, FONTS, STARTUPS, LANGUAGES, STRINGS, DEFAULT_PREFERENCES,
    normalizePreferences } = require('../shared.js');

// The saved record is the only input these tests need: the app reads it on load.
const seed = (page, values) => page.addInitScript(record =>
    localStorage.setItem('athkarnfc_preferences_v1', JSON.stringify(record)), values);
const stored = page => page.evaluate(() => JSON.parse(localStorage.getItem('athkarnfc_preferences_v1') || '{}'));
const ready = page => page.waitForFunction(
    () => document.documentElement.dataset.theme !== undefined &&
        document.querySelectorAll('.repeat-badge').length > 0, null, { timeout: 20000 });

test('Arabic is the default interface in both modes', async ({ page }) => {
    // Autoplay off, so the status text does not depend on the browser's
    // autoplay policy; the language is what this test is about.
    await seed(page, { autoplay: false });
    for (const url of ['/?autoplay=travel', '/car.html?autoplay=travel']) {
        await page.goto(url);
        await ready(page);
        expect(await page.evaluate(() => [document.documentElement.lang, document.documentElement.dir]))
            .toEqual(['ar', 'rtl']);
        await expect(page.locator('.settings-button')).toHaveText(STRINGS.ar.settings);
        await expect(page.locator('.offline-button').first()).toHaveText(STRINGS.ar.save);
        await expect(page.locator('.player-status').first()).toHaveText(STRINGS.ar.ready);
        if (url === '/?autoplay=travel') {
            // The meta line only exists to translate the Arabic title.
            await expect(page.locator('.track-meta').first()).toBeHidden();
        }
    }
});

test('switching language translates the interface and is stored', async ({ page }) => {
    await page.goto('/?autoplay=travel');
    await ready(page);
    await page.locator('.settings-button').click();
    await expect(page.locator('#preference-language')).toHaveValue('ar');
    await expect(page.locator('.settings-group').first()).toHaveText(STRINGS.ar.groupAppearance);

    await page.locator('#preference-language').selectOption('en');
    expect(await stored(page)).toMatchObject({ language: 'en' });
    expect(await page.evaluate(() => [document.documentElement.lang, document.documentElement.dir]))
        .toEqual(['en', 'ltr']);
    await expect(page.locator('.settings-group').first()).toHaveText(STRINGS.en.groupAppearance);
    await expect(page.locator('.settings-close')).toHaveText(STRINGS.en.settingsClose);
    await expect(page.locator('#preference-startup')).toBeVisible();
    await page.locator('.settings-close').click();
    await expect(page.locator('.settings-button')).toHaveText(STRINGS.en.settings);
    await expect(page.locator('.track-meta').first()).toBeVisible();
    await expect(page.locator('.offline-button').first()).toHaveText(STRINGS.en.save);

    // The choice survives a reload, and can be switched back.
    await page.reload();
    await ready(page);
    expect(await page.evaluate(() => document.documentElement.lang)).toBe('en');
    await expect(page.locator('.settings-button')).toHaveText(STRINGS.en.settings);
    await page.locator('.settings-button').click();
    await page.locator('#preference-language').selectOption('ar');
    await page.locator('.settings-close').click();
    await expect(page.locator('.settings-button')).toHaveText(STRINGS.ar.settings);
    expect(await page.evaluate(() => document.documentElement.dir)).toBe('rtl');
});

test('appearance choices are applied and stored', async ({ page }) => {
    await page.goto('/?autoplay=travel');
    await ready(page);
    const read = () => page.evaluate(() => {
        const root = document.documentElement;
        const text = document.querySelector('#carousel-0 .slide-content');
        return {
            theme: root.dataset.theme, accent: root.dataset.accent,
            size: root.dataset.textSize, font: root.dataset.font,
            accentValue: getComputedStyle(root).getPropertyValue('--accent-1').trim(),
            bodyBackground: getComputedStyle(document.body).backgroundColor,
            fontSize: parseFloat(getComputedStyle(text).fontSize),
            fontFamily: getComputedStyle(text).fontFamily
        };
    });
    const before = await read();
    expect(before.theme).toBe('dark');
    expect(before.accent).toBe('violet');
    expect(before.bodyBackground).toBe('rgb(15, 15, 20)');

    await page.locator('.settings-button').click();
    await page.locator('#preference-theme').selectOption('light');
    await page.locator('#preference-accent').selectOption('teal');
    await page.locator('#preference-textSize').selectOption('xlarge');
    await page.locator('#preference-font').selectOption('naskh');
    await page.locator('.settings-close').click();

    const after = await read();
    expect(after).toMatchObject({ theme: 'light', accent: 'teal', size: 'xlarge', font: 'naskh' });
    expect(after.bodyBackground).not.toBe(before.bodyBackground);
    expect(after.fontSize).toBeGreaterThan(before.fontSize);
    expect(after.fontFamily).toMatch(/Naskh/);
    expect(await stored(page)).toMatchObject({ theme: 'light', accent: 'teal', textSize: 'xlarge', font: 'naskh' });

    // Stored means the next visit starts that way, before any script runs.
    await page.reload();
    await ready(page);
    expect(await read()).toMatchObject({ theme: 'light', accent: 'teal', size: 'xlarge', font: 'naskh' });
});

test('every option the settings offer is accepted by the validator', async ({ page }) => {
    await page.goto('/?autoplay=travel');
    await ready(page);
    await page.locator('.settings-button').click();
    const cases = [
        ['language', LANGUAGES], ['theme', THEMES], ['accent', ACCENTS],
        ['textSize', TEXT_SIZES], ['font', FONTS], ['startup', STARTUPS],
        ['switchHour', ['0', '6', '12', '23']]
    ];
    for (const [key, values] of cases) {
        for (const value of values) {
            await page.locator(`#preference-${key}`).selectOption(String(value));
            const record = await stored(page);
            const expected = key === 'switchHour' ? Number(value) : value;
            // A rejected value silently falls back to the default, so a mismatch
            // means the interface offers something the validator refuses.
            // A rejected value falls back to the default, so a non-default
            // value that survives is proof the validator accepted it.
            expect(record[key], `${key}=${value} was not stored`).toEqual(expected);
        }
    }
    // The record round-trips through the validator unchanged.
    const record = await stored(page);
    expect(normalizePreferences(record)).toEqual(record);
});

test('the switch hour decides the opening prayer', async ({ page }) => {
    const afternoon = new Date(2026, 8, 23, 15, 0, 0);
    for (const [switchHour, expected] of [[20, 'أذكار الصباح'], [10, 'أذكار المساء']]) {
        await page.clock.setFixedTime(afternoon);
        // Autoplay on: with it off the app restores the last opened prayer
        // first, which is asserted in the next test.
        await seed(page, { switchHour, autoplay: true, language: 'ar' });
        await page.goto('/');
        await ready(page);
        await expect(page.locator('.track.open .track-title')).toHaveText(expected);
    }
});

test('the saved startup prayer wins over the clock', async ({ page }) => {
    // 09:00 would open the morning prayers by clock alone.
    await page.clock.setFixedTime(new Date(2026, 8, 23, 9, 0, 0));
    await seed(page, { startup: 'evening', autoplay: false, language: 'ar' });
    await page.goto('/');
    await ready(page);
    await expect(page.locator('.track.open .track-title')).toHaveText('أذكار المساء');

    // 'last' restores whichever prayer was opened before.
    await seed(page, { startup: 'last', autoplay: false, language: 'ar' });
    await page.goto('/?autoplay=travel');
    await ready(page);
    await page.goto('/');
    await ready(page);
    await expect(page.locator('.track.open .track-title')).toHaveText('دعاء السفر');
});

test('a language change keeps the repetition counts', async ({ page }) => {
    await page.goto('/?autoplay=evening');
    await ready(page);
    const badge = page.locator('#carousel-2 .repeat-badge').first();
    await expect(badge).toHaveText(`${STRINGS.ar.remaining}: 1`);
    await badge.click();
    await expect(badge).toHaveText(`✓ ${STRINGS.ar.complete}`);

    await page.locator('.settings-button').click();
    await page.locator('#preference-language').selectOption('en');
    await page.locator('.settings-close').click();
    // Re-rendering the cards would reset the count; the refresh pass must not.
    await expect(badge).toHaveText(`✓ ${STRINGS.en.complete}`);
    await page.reload();
    await ready(page);
    expect(await stored(page)).toMatchObject({ language: 'en' });
});

test('the reset button restores and stores the defaults', async ({ page }) => {
    await seed(page, { theme: 'light', accent: 'rose', language: 'en', startup: 'travel', switchHour: 5 });
    await page.goto('/?autoplay=travel');
    await ready(page);
    await page.locator('.settings-button').click();
    await page.locator('.settings-reset').click();
    // The record is removed so the current defaults apply, and the legacy speed
    // key is cleared so it cannot be re-imported.
    expect(await page.evaluate(() => [
        localStorage.getItem('athkarnfc_preferences_v1'),
        localStorage.getItem('athkarnfc_audio_speed')
    ])).toEqual([null, null]);
    await expect(page.locator('.settings-status')).toHaveText(STRINGS.ar.settingsResetDone);
    await expect(page.locator('#preference-theme')).toHaveValue('dark');
    await expect(page.locator('#preference-accent')).toHaveValue('violet');
    await expect(page.locator('#preference-switchHour')).toHaveValue('12');
    await expect(page.locator('#preference-startup')).toHaveValue('auto');
    expect(await page.evaluate(() => [document.documentElement.lang, document.documentElement.dataset.theme]))
        .toEqual(['ar', 'dark']);
});
