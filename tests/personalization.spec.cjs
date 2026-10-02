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
        // These controls are icon-only, so their accessible name carries the
        // translation rather than their (empty) text.
        await expect(page.locator('.settings-button')).toHaveAttribute('aria-label', STRINGS.ar.settings);
        await expect(page.locator('.offline-button').first()).toHaveAttribute('aria-label', STRINGS.ar.save);
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
    await expect(page.locator('.settings-button')).toHaveAttribute('aria-label', STRINGS.en.settings);
    await expect(page.locator('.track-meta').first()).toBeVisible();
    await expect(page.locator('.offline-button').first()).toHaveAttribute('aria-label', STRINGS.en.save);

    // The choice survives a reload, and can be switched back.
    await page.reload();
    await ready(page);
    expect(await page.evaluate(() => document.documentElement.lang)).toBe('en');
    await expect(page.locator('.settings-button')).toHaveAttribute('aria-label', STRINGS.en.settings);
    await page.locator('.settings-button').click();
    await page.locator('#preference-language').selectOption('ar');
    await page.locator('.settings-close').click();
    await expect(page.locator('.settings-button')).toHaveAttribute('aria-label', STRINGS.ar.settings);
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

test('the player chrome is icon-only and stays out of the reading area', async ({ page }) => {
    await seed(page, { autoplay: false });
    await page.goto('/?autoplay=morning');
    await ready(page);
    const panel = page.locator('.track[data-track="1"]');

    // Settings and card navigation are symbols, not words. The name lives in the
    // accessible label, so the visible button carries no text at all.
    await expect(page.locator('.settings-button')).toBeVisible();
    expect((await page.locator('.settings-button').textContent()).trim()).toBe('');
    await expect(page.locator('.settings-button svg')).toHaveCount(1);

    const previous = panel.locator('.prayer-previous');
    const next = panel.locator('.prayer-next');
    expect((await previous.textContent()).trim()).toBe('');
    expect((await next.textContent()).trim()).toBe('');
    await expect(previous).toHaveAttribute('aria-label', STRINGS.ar.previousPrayer);
    await expect(next).toHaveAttribute('aria-label', STRINGS.ar.nextPrayer);

    // The two arrows must point apart. Each button renders its own glyph, so the
    // path data itself has to differ.
    const paths = await panel.locator('.prayer-navigation svg path').evaluateAll(nodes =>
        nodes.map(node => node.getAttribute('d')));
    expect(paths).toHaveLength(2);
    expect(paths[0]).not.toBe(paths[1]);
});

test('the offline controls are reached through settings', async ({ page }) => {
    await seed(page, { autoplay: false });
    await page.goto('/?autoplay=morning');
    await ready(page);
    // Nothing to download inside the player itself any more.
    await expect(page.locator('.track.open .offline-button')).toHaveCount(0);

    await page.locator('.settings-button').click();
    const rows = page.locator('.offline-row');
    await expect(rows).toHaveCount(3);
    // One row per recitation, each labelled so the identical icons differ.
    await expect(page.locator('.offline-row[data-track="morning"] .offline-name'))
        .toHaveText(STRINGS.ar.morningMeta);
    await expect(page.locator('.offline-row[data-track="morning"] .offline-button'))
        .toHaveAttribute('aria-label', STRINGS.ar.save);
    // The credit line was removed from the player.
    expect(await page.locator('.audio-source').count()).toBe(0);
});

test('the player and the cog form one docked bar in the reader', async ({ page }) => {
    await seed(page, { autoplay: false });
    await page.goto('/?autoplay=morning');
    await ready(page);
    const measured = await page.evaluate(() => {
        const player = document.querySelector('.track.open .audio-player');
        const nav = document.querySelector('.track.open .prayer-navigation');
        const cog = document.querySelector('.settings-button');
        const carousel = document.querySelector('.track.open .carousel');
        const rect = node => node.getBoundingClientRect();
        const overlaps = (a, b) => !(a.bottom <= b.top || a.top >= b.bottom || a.right <= b.left || a.left >= b.right);
        return {
            playerBottom: Math.round(rect(player).bottom),
            viewport: window.innerHeight,
            // The cog is a child of the transport row, not a separate strip.
            cogInsidePlayer: player.contains(cog),
            cogOverlapsTransport: overlaps(rect(cog), rect(document.querySelector('.track.open .next-btn'))),
            // The reading area fills the space above the dock.
            carouselBottom: Math.round(rect(carousel).bottom),
            navTop: Math.round(rect(nav).top),
            pageOverflow: document.documentElement.scrollHeight - window.innerHeight,
            horizontalOverflow: document.documentElement.scrollWidth - window.innerWidth,
        };
    });
    // The dock is pinned to the foot of the screen.
    expect(Math.abs(measured.playerBottom - measured.viewport)).toBeLessThanOrEqual(1);
    expect(measured.cogInsidePlayer).toBe(true);
    expect(measured.cogOverlapsTransport).toBe(false);
    // Nothing is left to scroll: the card area ends where the arrows begin.
    expect(measured.pageOverflow).toBeLessThanOrEqual(1);
    expect(measured.horizontalOverflow).toBeLessThanOrEqual(1);
    // The card area ends at the arrows, which paint their own surface over it,
    // so it reaches that row rather than stopping short of the dock.
    expect(measured.carouselBottom).toBeGreaterThan(measured.navTop - 40);
});

test('car mode keeps its own toolbar and is not docked', async ({ page }) => {
    await seed(page, { autoplay: false });
    await page.goto('/car.html?autoplay=morning');
    await ready(page);
    const state = await page.evaluate(() => {
        const cog = document.querySelector('.settings-button');
        const toolbar = document.querySelector('.settings-toolbar');
        const controls = document.querySelector('#morning .audio-controls');
        return {
            inToolbar: !!cog.closest('.settings-toolbar'),
            toolbarVisible: getComputedStyle(toolbar).display !== 'none',
            controlsPosition: controls ? getComputedStyle(controls).position : null,
            pageOverflow: document.documentElement.scrollHeight - window.innerHeight,
        };
    });
    expect(state.inToolbar).toBe(true);
    expect(state.toolbarVisible).toBe(true);
    // The dock rules are scoped to the reader, so car mode keeps its layout.
    expect(state.controlsPosition).not.toBe('fixed');
    expect(state.pageOverflow).toBeLessThanOrEqual(1);
});
