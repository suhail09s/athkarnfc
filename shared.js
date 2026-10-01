(function (root) {
    'use strict';
    // `artist` and `artistAr` are only set where the recording's provenance is
    // documented in assets/audio/SOURCES.md. Do not guess the others: the app
    // must not credit a reciter it cannot substantiate.
    const TRACKS = [
        { id: 'travel', title: 'دعاء السفر', audio: 'assets/audio/track1.mp3',
          data: 'assets/athkar/travel.json', artist: null, artistAr: null, source: null },
        { id: 'morning', title: 'أذكار الصباح', audio: 'assets/audio/track2.mp3',
          data: 'assets/athkar/morning_audio.json', fallback: 'assets/athkar/morning.json',
          artist: 'Mishary Alafasy', artistAr: 'مشاري العفاسي',
          source: 'https://islamhouse.com/ar/audios/327603/' },
        { id: 'evening', title: 'أذكار المساء', audio: 'assets/audio/track3.mp3',
          data: 'assets/athkar/evening_audio.json', fallback: 'assets/athkar/evening.json',
          artist: 'Mishary Alafasy', artistAr: 'مشاري العفاسي',
          source: 'https://islamhouse.com/ar/audios/327603/' }
    ];
    const SPEEDS = [1, 1.25, 1.5, 2];
    const LANGUAGES = ['ar', 'en'];
    const THEMES = ['dark', 'light'];
    const ACCENTS = ['violet', 'teal', 'amber', 'rose'];
    const TEXT_SIZES = ['small', 'normal', 'large', 'xlarge'];
    const FONTS = ['amiri', 'naskh', 'system'];
    const STARTUPS = ['auto', 'last', 'travel', 'morning', 'evening'];
    const DEFAULT_PREFERENCES = Object.freeze({
        // The app is Arabic first; English is available from Settings.
        language: 'ar',
        theme: 'dark',
        accent: 'violet',
        textSize: 'normal',
        font: 'amiri',
        // The hour when evening prayers begin, using the device's local time.
        switchHour: 12,
        startup: 'auto',
        autoplay: true,
        speed: 1,
        keepAwake: true,
        haptics: true,
        autoScroll: true
    });
    // One flat dictionary per language. Every key must exist in both languages;
    // the unit tests enforce that, and that the pages only ask for known keys.
    const STRINGS = {
        ar: {
            appTitle: 'أذكار — AthkarNFC',
            carPageTitle: 'أذكار السيارة',
            tagline: 'اضغط على ذكر لعرضه، ثم شغّل للاستماع',
            carModeLink: 'الوضع في السيارة',
            exitCarMode: 'الخروج من وضع السيارة',
            noscript: 'يتطلب AthkarNFC تشغيل JavaScript لعرض الأذكار وتشغيل الصوت.',
            travelMeta: 'دعاء السفر',
            morningMeta: 'أذكار الصباح',
            eveningMeta: 'أذكار المساء',
            settings: 'الإعدادات',
            settingsClose: 'إغلاق',
            groupAppearance: 'المظهر',
            groupPlayback: 'القراءة والاستماع',
            groupOpening: 'عند الفتح',
            language: 'اللغة',
            theme: 'المظهر العام',
            themeDark: 'داكن',
            themeLight: 'فاتح',
            accent: 'اللون المميز',
            accentViolet: 'بنفسجي',
            accentTeal: 'فيروزي',
            accentAmber: 'عنبري',
            accentRose: 'وردي',
            textSize: 'حجم خط الأذكار',
            sizeSmall: 'صغير',
            sizeNormal: 'عادي',
            sizeLarge: 'كبير',
            sizeXlarge: 'كبير جدًا',
            font: 'نوع خط الأذكار',
            fontAmiri: 'أميري',
            fontNaskh: 'نسخ',
            fontSystem: 'خط النظام',
            switchHour: 'تبدأ أذكار المساء عند',
            startup: 'الذكر الذي يُفتح عند التشغيل',
            startupAuto: 'حسب وقت اليوم',
            startupLast: 'آخر ذكر مفتوح',
            settingsSchedule: 'قبل {time}: أذكار الصباح، ومن {time}: أذكار المساء، حسب توقيت جهازك.',
            settingsHint: 'تُحفظ الإعدادات في هذا المتصفح وتُستخدم في الوضعين. وقد يتطلب بدء الصوت الضغط على تشغيل.',
            settingsSaved: 'تم حفظ الإعدادات.',
            settingsUnsaved: 'تعذر حفظ الإعدادات؛ ستُستخدم لهذه الجلسة فقط.',
            settingsReset: 'إعادة الإعدادات الافتراضية',
            settingsResetDone: 'تمت إعادة الإعدادات الافتراضية.',
            autoplay: 'التشغيل التلقائي عند الفتح',
            speed: 'سرعة التشغيل',
            keepAwake: 'إبقاء الشاشة مضاءة أثناء التشغيل',
            haptics: 'اهتزاز عند العد',
            autoScroll: 'متابعة النص تلقائيًا',
            play: 'تشغيل',
            pause: 'إيقاف مؤقت',
            ready: 'جاهز',
            playing: 'قيد التشغيل',
            paused: 'متوقف مؤقتًا',
            failed: 'تعذر تشغيل الصوت. تحقق من اتصالك ثم حاول مجددًا.',
            loadFailed: 'تعذر تحميل الأذكار.',
            retry: 'إعادة المحاولة',
            save: 'حفظ للاستماع دون اتصال',
            remove: 'حذف النسخة المحفوظة',
            saving: 'جارٍ الحفظ…',
            saved: 'الصوت متاح دون اتصال',
            saveFailed: 'تعذر الحفظ. تحقق من الاتصال والمساحة المتاحة.',
            unavailable: 'الحفظ دون اتصال غير متاح حاليًا.',
            count: 'تسجيل تكرار',
            complete: 'مكتمل',
            reset: 'إعادة العد',
            remaining: 'متبقي',
            manual: 'تستخدم أزرار التنقل توقيتًا تقديريًا لهذا التسجيل.',
            tap: 'اضغط تشغيل لبدء الاستماع.',
            fallback: 'تعذر تحميل النص المتزامن مع التسجيل، لذا تُعرض قائمة القراءة. وقد لا يتطابق ترتيبها وأعداد التكرار مع هذا التسجيل.',
            previousPrayer: 'الذكر السابق',
            nextPrayer: 'الذكر التالي',
            prayerPages: 'صفحات الأذكار',
            back10: 'رجوع ١٠ ثوانٍ',
            forward10: 'تقديم ١٠ ثوانٍ',
            playbackPosition: 'موضع التشغيل',
            playbackSpeed: 'سرعة التشغيل',
            audioCredit: 'مصدر التسجيل: IslamHouse — {artist}'
        },
        en: {
            appTitle: 'AthkarNFC',
            carPageTitle: 'Athkar Car Mode',
            tagline: 'Tap a track to view prayer, tap play to listen',
            carModeLink: 'Switch to Car Mode',
            exitCarMode: 'Exit Car Mode',
            noscript: 'AthkarNFC needs JavaScript to load the prayers and play audio.',
            travelMeta: 'Travel Prayer',
            morningMeta: 'Morning Remembrances',
            eveningMeta: 'Evening Remembrances',
            settings: 'Settings',
            settingsClose: 'Close',
            groupAppearance: 'Appearance',
            groupPlayback: 'Reading and playback',
            groupOpening: 'When opening',
            language: 'Language',
            theme: 'Theme',
            themeDark: 'Dark',
            themeLight: 'Light',
            accent: 'Accent colour',
            accentViolet: 'Violet',
            accentTeal: 'Teal',
            accentAmber: 'Amber',
            accentRose: 'Rose',
            textSize: 'Prayer text size',
            sizeSmall: 'Small',
            sizeNormal: 'Normal',
            sizeLarge: 'Large',
            sizeXlarge: 'Extra large',
            font: 'Prayer font',
            fontAmiri: 'Amiri',
            fontNaskh: 'Naskh',
            fontSystem: 'System',
            switchHour: 'Evening prayers begin at',
            startup: 'Prayer to open',
            startupAuto: 'By time of day',
            startupLast: 'Last opened',
            settingsSchedule: 'Before {time}: morning prayers. From {time}: evening prayers, using your device’s local time.',
            settingsHint: 'Settings are saved in this browser and shared by both modes. Your browser may still require a tap on Play.',
            settingsSaved: 'Settings saved.',
            settingsUnsaved: 'Could not save settings; changes apply to this session only.',
            settingsReset: 'Reset to defaults',
            settingsResetDone: 'Settings restored to their defaults.',
            autoplay: 'Autoplay when opening',
            speed: 'Playback speed',
            keepAwake: 'Keep screen awake while playing',
            haptics: 'Vibrate when counting',
            autoScroll: 'Follow prayer text automatically',
            play: 'Play track',
            pause: 'Pause track',
            ready: 'Ready',
            playing: 'Playing',
            paused: 'Paused',
            failed: 'Playback failed. Check your connection and try again.',
            loadFailed: 'Could not load prayers.',
            retry: 'Retry',
            save: 'Save offline',
            remove: 'Remove offline audio',
            saving: 'Saving…',
            saved: 'Audio available offline',
            saveFailed: 'Could not save audio. Check your connection and available storage.',
            unavailable: 'Offline saving is unavailable right now.',
            count: 'Count repetition',
            complete: 'Complete',
            reset: 'Reset count',
            remaining: 'Remaining',
            manual: 'Prayer navigation uses estimated positions for this recording.',
            tap: 'Tap Play to start listening.',
            fallback: 'Synchronized text is unavailable, so the reading list is shown. Its order and repetition counts may not match this recording.',
            previousPrayer: 'Previous prayer',
            nextPrayer: 'Next prayer',
            prayerPages: 'Prayer pages',
            back10: 'Back 10 seconds',
            forward10: 'Forward 10 seconds',
            playbackPosition: 'Playback position',
            playbackSpeed: 'Playback speed',
            audioCredit: 'Audio: {artist} · IslamHouse'
        }
    };
    function formatText(template, values) {
        return String(template).replace(/\{(\w+)\}/g, (match, key) =>
            (values && key in values ? values[key] : match));
    }
    function stringsFor(language) {
        return STRINGS[language] || STRINGS[DEFAULT_PREFERENCES.language];
    }
    function normalizePreferences(value) {
        const result = { ...DEFAULT_PREFERENCES };
        if (!value || typeof value !== 'object' || Array.isArray(value)) return result;
        for (const key of ['autoplay', 'keepAwake', 'haptics', 'autoScroll']) {
            if (typeof value[key] === 'boolean') result[key] = value[key];
        }
        if (SPEEDS.includes(value.speed)) result.speed = value.speed;
        for (const [key, allowed] of [
            ['language', LANGUAGES], ['theme', THEMES], ['accent', ACCENTS],
            ['textSize', TEXT_SIZES], ['font', FONTS], ['startup', STARTUPS]
        ]) {
            if (allowed.includes(value[key])) result[key] = value[key];
        }
        if (Number.isInteger(value.switchHour) && value.switchHour >= 0 && value.switchHour <= 23) {
            result.switchHour = value.switchHour;
        }
        return result;
    }
    function timeTrack(date = new Date(), switchHour = 12) {
        const hour = Number.isInteger(switchHour) ? switchHour : 12;
        return date.getHours() < hour ? 'morning' : 'evening';
    }
    // Precedence: an explicit track in the URL always wins, then ?autoplay=auto,
    // then the saved "prayer to open" preference. `auto` keeps the documented
    // behaviour of using the clock when autoplay is on and restoring the last
    // opened prayer when autoplay is off.
    function startupTrack(requested, preferences = {}, lastTrack, date = new Date()) {
        const settings = preferences || {};
        if (TRACKS.some(track => track.id === requested)) return requested;
        if (requested === 'auto') return timeTrack(date, settings.switchHour);
        if (TRACKS.some(track => track.id === settings.startup)) return settings.startup;
        if (settings.startup === 'last' || settings.autoplay === false) {
            if (TRACKS.some(track => track.id === lastTrack)) return lastTrack;
        }
        return timeTrack(date, settings.switchHour);
    }
    function normalizeData(data) {
        if (!Array.isArray(data) || !data.length) throw new Error('Empty prayer data');
        const items = data.flatMap(page => {
            if (!Array.isArray(page.dhikr_items)) throw new Error('Invalid prayer page');
            return page.dhikr_items;
        });
        if (!items.length) throw new Error('Empty prayer data');
        return items.map(item => {
            if (typeof item.text !== 'string' || !item.text.trim() ||
                !Number.isInteger(item.repeatCount) || item.repeatCount < 1) {
                throw new Error('Invalid prayer item');
            }
            // Optional citation printed under the card, for example
            // "[آية الكرسي - البقرة ٢٥٥]".
            if (item.reference !== undefined && (typeof item.reference !== 'string' || !item.reference.trim())) {
                throw new Error('Invalid prayer reference');
            }
            const segments = item.segments || [];
            let end = 0;
            for (const segment of segments) {
                if (!Number.isFinite(segment.start) || !Number.isFinite(segment.end) ||
                    segment.start < end || segment.end <= segment.start || typeof segment.text !== 'string') {
                    throw new Error('Invalid transcript segment');
                }
                // A segment marked `opening` is not part of the prayer text: the
                // card shows it on its own, for example the refuge phrase.
                if (segment.opening !== undefined && typeof segment.opening !== 'boolean') {
                    throw new Error('Invalid transcript segment');
                }
                end = segment.end;
            }
            return { ...item, segments };
        });
    }
    // Resolves with the synchronized dataset, or with the reading-only fallback
    // when that dataset fails. The two lists are not interchangeable, so the
    // caller is told which one it received and can say so in the UI.
    async function loadTrack(track, fetcher = fetch) {
        for (const path of [track.data, track.fallback].filter(Boolean)) {
            try {
                const response = await fetcher(path);
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                return { items: normalizeData(await response.json()), usedFallback: path !== track.data, path };
            } catch (error) {
                if (path === (track.fallback || track.data)) throw error;
            }
        }
    }
    function seekTime(current, offset, duration) {
        if (!Number.isFinite(duration) || duration <= 0) return null;
        return Math.max(0, Math.min(duration, current + offset));
    }
    function formatTime(value) {
        if (!Number.isFinite(value) || value < 0) return '0:00';
        return `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, '0')}`;
    }
    function prayerCues(items, duration) {
        if (!Array.isArray(items) || !items.length || !Number.isFinite(duration) || duration <= 0) return [];
        if (items.every(item => item.segments?.length && Number.isFinite(item.segments[0].start))) {
            return items.map(item => Math.max(0, Math.min(duration, item.segments[0].start)));
        }
        const weights = items.map(item => Math.max(1, Array.from(item.text || '').length));
        const total = weights.reduce((sum, weight) => sum + weight, 0);
        let elapsed = 0;
        return weights.map(weight => {
            const cue = duration * elapsed / total;
            elapsed += weight;
            return cue;
        });
    }
    // Only a single byte range is needed by the audio elements. Unsupported
    // multi-range headers fall back to the complete representation (HTTP 200).
    function parseRange(header, size) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(header || '');
        if (!match || (!match[1] && !match[2])) return null;
        const suffix = !match[1];
        const start = suffix ? Math.max(0, size - Number(match[2])) : Number(match[1]);
        const end = suffix || !match[2] ? size - 1 : Math.min(Number(match[2]), size - 1);
        if (start >= size || end < start || (suffix && Number(match[2]) === 0)) return { unsatisfiable: true };
        return { start, end };
    }
    const api = { TRACKS, SPEEDS, LANGUAGES, THEMES, ACCENTS, TEXT_SIZES, FONTS, STARTUPS,
        DEFAULT_PREFERENCES, STRINGS, stringsFor, formatText, normalizePreferences, timeTrack, startupTrack,
        normalizeData, loadTrack, seekTime, formatTime, prayerCues, parseRange };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.Athkar = api;
})(typeof globalThis !== 'undefined' ? globalThis : self);
