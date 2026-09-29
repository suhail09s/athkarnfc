(function () {
    'use strict';
    const { TRACKS, SPEEDS, normalizePreferences, startupTrack, loadTrack, seekTime, formatTime, prayerCues } = Athkar;
    const carMode = Boolean(document.querySelector('.car-content'));
    const labels = carMode ? {
        play: 'تشغيل', pause: 'إيقاف مؤقت', ready: 'جاهز', playing: 'قيد التشغيل', paused: 'متوقف مؤقتًا',
        failed: 'تعذر تشغيل الصوت. تحقق من اتصالك ثم حاول مجددًا.', loadFailed: 'تعذر تحميل الأذكار.', retry: 'إعادة المحاولة',
        save: 'حفظ للاستماع دون اتصال', remove: 'حذف النسخة المحفوظة', saving: 'جارٍ الحفظ…',
        saved: 'الصوت متاح دون اتصال', saveFailed: 'تعذر الحفظ. تحقق من الاتصال والمساحة المتاحة.',
        unavailable: 'الحفظ دون اتصال غير متاح حاليًا.', count: 'تسجيل تكرار', complete: 'مكتمل', reset: 'إعادة العد',
        remaining: 'متبقي', manual: 'تستخدم أزرار التنقل توقيتًا تقديريًا لهذا التسجيل.', tap: 'اضغط تشغيل لبدء الاستماع.'
    } : {
        play: 'Play track', pause: 'Pause track', ready: 'Ready', playing: 'Playing', paused: 'Paused',
        failed: 'Playback failed. Check your connection and try again.', loadFailed: 'Could not load prayers.', retry: 'Retry',
        save: 'Save offline', remove: 'Remove offline audio', saving: 'Saving…', saved: 'Audio available offline',
        saveFailed: 'Could not save audio. Check your connection and available storage.', unavailable: 'Offline saving is unavailable right now.',
        count: 'Count repetition', complete: 'Complete', reset: 'Reset count', remaining: 'Remaining',
        manual: 'Prayer navigation uses estimated positions for this recording.', tap: 'Tap Play to start listening.'
    };
    const storage = {
        get(key) { try { return localStorage.getItem(key); } catch (_) { return null; } },
        set(key, value) {
            try { value === null ? localStorage.removeItem(key) : localStorage.setItem(key, value); return true; }
            catch (_) { return false; }
        }
    };
    const PREFERENCES_KEY = 'athkarnfc_preferences_v1';
    let storedPreferences;
    try { storedPreferences = JSON.parse(storage.get(PREFERENCES_KEY)); } catch (_) {}
    // Preserve the speed chosen in earlier versions when there is no valid new record.
    if (!storedPreferences || typeof storedPreferences !== 'object' || Array.isArray(storedPreferences)) {
        storedPreferences = { speed: Number(storage.get('athkarnfc_audio_speed')) };
    }
    let preferences = normalizePreferences(storedPreferences);
    let speed = preferences.speed;
    const speeds = SPEEDS;
    let selected = null;
    let wakeLock = null;
    let wakePending = false;
    const states = TRACKS.map((track, index) => {
        const panel = carMode ? document.getElementById(track.id) : document.querySelectorAll('.track')[index];
        return { ...track, index, panel, audio: panel.querySelector('audio'),
            content: carMode ? panel.querySelector('.prayer-text-container') : panel.querySelector('.carousel'),
            play: panel.querySelector('.play-pause-btn'), seek: panel.querySelector('.progress-bar'),
            speedButton: panel.querySelector('.speed-btn'), lastChunk: null };
    });
    const playIcon = '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
    const pauseIcon = '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>';
    function element(tag, className, text) {
        const el = document.createElement(tag);
        if (className) el.className = className;
        if (text !== undefined) el.textContent = text;
        return el;
    }
    function status(state, text, error = false) {
        state.status.textContent = text;
        state.status.classList.toggle('error', error);
    }
    async function updateWakeLock() {
        const needed = preferences.keepAwake && selected && !selected.audio.paused && document.visibilityState === 'visible';
        if (!needed) {
            if (wakeLock) { const old = wakeLock; wakeLock = null; await old.release().catch(() => {}); }
            return;
        }
        if (!('wakeLock' in navigator) || wakeLock || wakePending) return;
        wakePending = true;
        try {
            const lock = await navigator.wakeLock.request('screen');
            if (!preferences.keepAwake || !selected || selected.audio.paused || document.visibilityState !== 'visible') await lock.release();
            else {
                wakeLock = lock;
                lock.addEventListener('release', () => { if (wakeLock === lock) wakeLock = null; });
            }
        } catch (_) { /* Playback does not require a screen wake lock. */ }
        finally { wakePending = false; }
    }
    document.addEventListener('visibilitychange', updateWakeLock);
    function seekBy(state, offset) {
        const target = seekTime(state.audio.currentTime, offset, state.audio.duration);
        if (target !== null) state.audio.currentTime = target;
    }
    function mediaSession(state) {
        if (!('mediaSession' in navigator)) return;
        if ('MediaMetadata' in window) navigator.mediaSession.metadata = new MediaMetadata({
            title: state.title, artist: 'Mishary Alafasy', album: 'AthkarNFC'
        });
        const handlers = {
            play: () => play(state), pause: () => state.audio.pause(),
            seekbackward: details => seekBy(state, -(details.seekOffset || 10)),
            seekforward: details => seekBy(state, details.seekOffset || 10),
            seekto: details => {
                const time = seekTime(0, details.seekTime, state.audio.duration);
                if (time !== null) state.audio.currentTime = time;
            }
        };
        for (const [action, handler] of Object.entries(handlers)) {
            try { navigator.mediaSession.setActionHandler(action, handler); } catch (_) { /* Optional action. */ }
        }
    }
    function select(state) {
        selected = state;
        for (const other of states) {
            const active = state === other;
            if (!active) other.audio.pause();
            other.panel.classList.toggle(carMode ? 'active' : 'open', active);
            if (!carMode) other.panel.querySelector('.track-btn').setAttribute('aria-expanded', String(active));
        }
        if (carMode) {
            document.querySelectorAll('.tab-btn').forEach(button => {
                const active = state?.id === button.dataset.target;
                button.classList.toggle('active', active);
                button.setAttribute('aria-pressed', String(active));
            });
        } else {
            document.getElementById('appContainer').classList.toggle('focus-mode', Boolean(state));
            document.body.classList.toggle('focus-active', Boolean(state));
            storage.set('athkarnfc_last_opened', state ? String(state.index) : null);
        }
        if (state) {
            storage.set('athkarnfc_last_track', state.id);
            mediaSession(state);
        }
        updateWakeLock();
    }
    async function play(state) {
        if (selected !== state) select(state);
        // Pause synchronously, before awaiting play(), to avoid two active tracks.
        states.filter(other => other !== state).forEach(other => other.audio.pause());
        try { await state.audio.play(); }
        catch (error) {
            if (error.name !== 'AbortError') status(state, labels.failed, true);
        }
    }
    function updateCues(state) {
        state.cues = prayerCues(state.items || [], state.audio.duration);
    }
    function prayerAtTime(state) {
        if (!state.cues?.length) return 0;
        let index = 0;
        while (index + 1 < state.cues.length && state.audio.currentTime >= state.cues[index + 1]) index++;
        return index;
    }
    function showPrayer(state, index, smooth = true) {
        const chunk = state.content.children[index];
        if (!chunk) return;
        state.activePrayer = index;
        state.lastChunk = chunk;
        if (preferences.autoScroll) chunk.scrollIntoView({
            behavior: smooth ? 'smooth' : 'auto', block: 'nearest', inline: 'start'
        });
        state.updateNavigation?.(index);
    }
    async function jumpToPrayer(state, index) {
        if (!state.items?.length) return;
        index = Math.max(0, Math.min(state.items.length - 1, index));
        select(state);
        state.pendingPrayer = index;
        showPrayer(state, index);
        if (!Number.isFinite(state.audio.duration) || state.audio.duration <= 0) state.audio.load();
        else {
            updateCues(state);
            state.audio.currentTime = state.cues[index] || 0;
            state.pendingPrayer = null;
        }
        await play(state);
    }
    function updatePlayer(state) {
        const { audio, panel, seek } = state;
        const valid = Number.isFinite(audio.duration) && audio.duration > 0;
        seek.disabled = !valid;
        seek.max = valid ? audio.duration : 100;
        seek.value = audio.currentTime;
        seek.setAttribute('aria-valuetext', `${formatTime(audio.currentTime)} / ${formatTime(audio.duration)}`);
        panel.querySelector('.current-time').textContent = formatTime(audio.currentTime);
        panel.querySelector('.duration').textContent = formatTime(audio.duration);
        state.play.innerHTML = audio.paused ? playIcon : pauseIcon;
        state.play.setAttribute('aria-label', audio.paused ? labels.play : labels.pause);
        updateCues(state);
        const prayerIndex = prayerAtTime(state);
        if (!audio.paused && prayerIndex !== state.activePrayer) showPrayer(state, prayerIndex);
        for (const span of state.content.querySelectorAll('.sync-span')) {
            const active = !audio.paused && audio.currentTime >= Number(span.dataset.start) && audio.currentTime < Number(span.dataset.end);
            span.classList.toggle('active-sync', active);
            if (active) {
                const chunk = span.closest('.prayer-chunk, .slide');
                if (preferences.autoScroll && chunk !== state.lastChunk) {
                    chunk.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' });
                    state.lastChunk = chunk;
                }
            }
        }
    }
    function renderPrayers(state, items) {
        state.items = items;
        state.activePrayer = 0;
        state.content.replaceChildren();
        state.content.lang = 'ar';
        state.content.dir = 'rtl';
        state.content.tabIndex = 0;
        state.lastChunk = null;
        for (const [index, item] of items.entries()) {
            const chunk = element('div', carMode ? 'prayer-chunk' : 'slide');
            const text = element('div', carMode ? 'chunk-text' : 'slide-content');
            if (item.segments.length) {
                for (const [i, segment] of item.segments.entries()) {
                    if (i) text.append(' ');
                    const span = element('span', 'sync-span', segment.text);
                    span.dataset.start = segment.start;
                    span.dataset.end = segment.end;
                    text.append(span);
                }
            } else text.textContent = item.text;
            const meta = element('div', 'slide-meta');
            const count = element('button', 'repeat-badge');
            count.type = 'button';
            count.setAttribute('aria-live', 'polite');
            const reset = element('button', 'reset-count', labels.reset);
            reset.type = 'button';
            reset.lang = carMode ? 'ar' : 'en';
            let remaining = item.repeatCount;
            function updateCount() {
                count.textContent = remaining ? `متبقي: ${remaining}` : '✓ مكتمل';
                count.setAttribute('aria-label', `${labels.count}: ${remaining} ${labels.remaining}`);
                count.setAttribute('aria-disabled', String(remaining === 0));
                chunk.classList.toggle('complete', remaining === 0);
                reset.hidden = remaining === item.repeatCount;
            }
            count.addEventListener('click', () => {
                if (!remaining) return;
                remaining--;
                updateCount();
                if (preferences.haptics && navigator.vibrate) navigator.vibrate(30);
            });
            reset.addEventListener('click', () => { remaining = item.repeatCount; updateCount(); count.focus(); });
            updateCount();
            meta.append(count, reset, element('span', 'slide-counter', `${index + 1} / ${items.length}`));
            chunk.append(text, meta);
            state.content.append(chunk);
        }
        state.note.hidden = items.some(item => item.segments.length);
        if (!carMode) {
            state.navigation?.remove();
            const navigation = element('nav', 'prayer-navigation');
            navigation.setAttribute('aria-label', 'Prayer pages');
            const previous = element('button', 'prayer-previous', 'Previous prayer');
            const next = element('button', 'prayer-next', 'Next prayer');
            previous.type = next.type = 'button';
            function nearest() {
                const edge = state.content.getBoundingClientRect().right;
                return [...state.content.children].reduce((best, child, index, all) =>
                    Math.abs(child.getBoundingClientRect().right - edge) < Math.abs(all[best].getBoundingClientRect().right - edge) ? index : best, 0);
            }
            function updateNavigation(index = nearest()) {
                previous.disabled = index === 0;
                next.disabled = index === items.length - 1;
            }
            previous.addEventListener('click', () => jumpToPrayer(state, nearest() - 1));
            next.addEventListener('click', () => jumpToPrayer(state, nearest() + 1));
            state.content.onscroll = () => updateNavigation();
            navigation.append(previous, next);
            navigation.hidden = items.length < 2;
            state.content.after(navigation);
            state.navigation = navigation;
            state.updateNavigation = updateNavigation;
            updateNavigation();
        }
    }
    async function loadPrayers(state) {
        try { renderPrayers(state, await loadTrack(state)); }
        catch (_) {
            const message = element('div', 'load-error', labels.loadFailed);
            const retry = element('button', 'retry-button', labels.retry);
            retry.type = 'button';
            retry.addEventListener('click', () => loadPrayers(state));
            message.append(retry);
            state.content.replaceChildren(message);
        }
    }
    // Each request has a response port, so parallel downloads cannot mix results.
    function workerRequest(worker, type, path) {
        return new Promise((resolve, reject) => {
            const channel = new MessageChannel();
            const timer = setTimeout(() => { channel.port1.close(); reject(new Error('Download timed out')); }, 180000);
            channel.port1.onmessage = ({ data }) => {
                clearTimeout(timer);
                channel.port1.close();
                data.ok ? resolve(data) : reject(new Error(data.error));
            };
            worker.postMessage({ type, path }, [channel.port2]);
        });
    }
    let offlineWorker = null;
    async function refreshOffline() {
        if (!offlineWorker) return;
        await Promise.all(states.map(async state => {
            try {
                const { saved } = await workerRequest(offlineWorker, 'AUDIO_STATUS', state.audio.getAttribute('src'));
                state.saved = saved;
                state.offline.disabled = false;
                state.offline.textContent = saved ? labels.remove : labels.save;
                state.offlineStatus.textContent = saved ? labels.saved : '';
            } catch (_) { state.offlineStatus.textContent = labels.unavailable; }
        }));
    }
    for (const state of states) {
        const { panel, audio } = state;
        state.status = element('p', 'player-status', labels.ready);
        state.status.setAttribute('role', 'status');
        state.note = element('p', 'transcript-note', labels.manual);
        state.note.hidden = true;
        state.content.before(state.note);
        const actions = element('div', 'offline-actions');
        state.offline = element('button', 'offline-button', labels.save);
        state.offline.type = 'button';
        state.offline.disabled = true;
        state.offlineStatus = element('span', 'offline-status');
        state.offlineStatus.setAttribute('role', 'status');
        actions.append(state.offline, state.offlineStatus);
        const host = carMode ? panel : panel.querySelector('.track-content');
        host.append(state.status, actions);
        if (state.id === 'evening') {
            const source = element('a', 'audio-source', carMode ? 'مصدر التسجيل: IslamHouse — مشاري العفاسي' : 'Audio: Mishary Alafasy · IslamHouse');
            source.href = 'https://islamhouse.com/ar/audios/327603/';
            source.target = '_blank'; source.rel = 'noopener noreferrer';
            host.append(source);
        }
        audio.preload = 'none';
        audio.playbackRate = speed;
        state.speedButton.textContent = `${speed}x`;
        state.play.addEventListener('click', () => audio.paused ? play(state) : audio.pause());
        panel.querySelector('.prev-btn').addEventListener('click', () => seekBy(state, -10));
        panel.querySelector('.next-btn').addEventListener('click', () => seekBy(state, 10));
        state.seek.addEventListener('input', () => {
            const target = seekTime(0, Number(state.seek.value), audio.duration);
            if (target !== null) audio.currentTime = target;
        });
        state.speedButton.addEventListener('click', () => {
            speed = speeds[(speeds.indexOf(speed) + 1) % speeds.length];
            savePreferences({ speed });
        });
        ['timeupdate', 'durationchange', 'seeked'].forEach(event => audio.addEventListener(event, () => updatePlayer(state)));
        audio.addEventListener('loadedmetadata', () => {
            updateCues(state);
            if (state.pendingPrayer !== null && state.pendingPrayer !== undefined) {
                audio.currentTime = state.cues[state.pendingPrayer] || 0;
                state.pendingPrayer = null;
            }
            updatePlayer(state);
        });
        audio.addEventListener('play', () => {
            // A delayed play event from a deselected track must never steal playback.
            if (selected !== state) { audio.pause(); return; }
            states.filter(other => other !== state).forEach(other => other.audio.pause());
            status(state, labels.playing); updatePlayer(state); updateWakeLock();
            if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
        });
        audio.addEventListener('pause', () => {
            status(state, audio.ended ? labels.ready : labels.paused); updatePlayer(state); updateWakeLock();
            if (selected === state && 'mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
        });
        audio.addEventListener('ended', () => { status(state, labels.ready); updatePlayer(state); updateWakeLock(); });
        audio.addEventListener('error', () => { status(state, labels.failed, true); updatePlayer(state); updateWakeLock(); });
        state.offline.addEventListener('click', async () => {
            if (!offlineWorker) return;
            state.offline.disabled = true;
            state.offlineStatus.textContent = state.saved ? '' : labels.saving;
            try {
                await workerRequest(offlineWorker, state.saved ? 'REMOVE_AUDIO' : 'SAVE_AUDIO', state.audio.getAttribute('src'));
                await refreshOffline();
            } catch (_) { state.offlineStatus.textContent = labels.saveFailed; }
            finally { state.offline.disabled = false; }
        });
        if (!carMode) panel.querySelector('.track-btn').addEventListener('click', () => select(selected === state ? null : state));
        updatePlayer(state);
        loadPrayers(state); // Independent loads: evening failure cannot hide morning.
    }
    if (carMode) document.querySelectorAll('.tab-btn').forEach(button =>
        button.addEventListener('click', () => select(states.find(state => state.id === button.dataset.target))));
    const settingsText = carMode ? {
        title: 'الإعدادات', close: 'إغلاق', autoplay: 'التشغيل التلقائي عند الفتح',
        schedule: 'قبل ١٢ ظهرًا: أذكار الصباح. من ١٢ ظهرًا: أذكار المساء، حسب توقيت جهازك.',
        speed: 'سرعة التشغيل', keepAwake: 'إبقاء الشاشة مضاءة أثناء التشغيل',
        haptics: 'اهتزاز عند العد', autoScroll: 'متابعة النص تلقائيًا',
        hint: 'تُحفظ الإعدادات في هذا المتصفح وتُستخدم في الوضعين. قد يتطلب بدء الصوت الضغط على تشغيل.',
        saved: 'تم حفظ الإعدادات.', unsaved: 'تعذر حفظ الإعدادات؛ ستُستخدم لهذه الجلسة فقط.'
    } : {
        title: 'Settings', close: 'Close', autoplay: 'Autoplay when opening',
        schedule: 'Before noon: morning prayers. From noon: evening prayers, using your device’s local time.',
        speed: 'Playback speed', keepAwake: 'Keep screen awake while playing',
        haptics: 'Vibrate when counting', autoScroll: 'Follow prayer text automatically',
        hint: 'Settings are saved in this browser and shared by both modes. Your browser may still require a tap on Play.',
        saved: 'Settings saved.', unsaved: 'Could not save settings; changes apply to this session only.'
    };
    const toolbar = element('div', 'settings-toolbar');
    const settingsButton = element('button', 'settings-button', settingsText.title);
    settingsButton.type = 'button';
    settingsButton.setAttribute('aria-haspopup', 'dialog');
    toolbar.append(settingsButton);
    document.body.prepend(toolbar);
    const dialog = element('dialog', 'settings-dialog');
    dialog.setAttribute('aria-labelledby', 'settings-title');
    const heading = element('h2', '', settingsText.title);
    heading.id = 'settings-title';
    const closeButton = element('button', 'settings-close', settingsText.close);
    closeButton.type = 'button';
    dialog.append(heading, element('p', 'settings-hint', settingsText.schedule));
    const settingsInputs = {};
    for (const key of ['autoplay', 'speed', 'keepAwake', 'haptics', 'autoScroll']) {
        const label = element('label', 'settings-row');
        const input = element(key === 'speed' ? 'select' : 'input');
        input.id = `preference-${key}`;
        if (key === 'speed') {
            for (const value of speeds) {
                const option = element('option', '', `${value}x`);
                option.value = value;
                input.append(option);
            }
        } else input.type = 'checkbox';
        label.append(element('span', '', settingsText[key]), input);
        dialog.append(label);
        settingsInputs[key] = input;
        input.addEventListener('change', () => savePreferences({ [key]: key === 'speed' ? Number(input.value) : input.checked }));
    }
    const settingsStatus = element('p', 'settings-status');
    settingsStatus.setAttribute('role', 'status');
    dialog.append(element('p', 'settings-hint', settingsText.hint), settingsStatus, closeButton);
    document.body.append(dialog);
    settingsButton.addEventListener('click', () => dialog.showModal());
    closeButton.addEventListener('click', () => dialog.close());
    function applyPreferences() {
        speed = preferences.speed;
        states.forEach(state => {
            state.audio.defaultPlaybackRate = speed;
            state.audio.playbackRate = speed;
            state.speedButton.textContent = `${speed}x`;
            if (!preferences.autoScroll) state.lastChunk = null;
        });
        for (const [key, input] of Object.entries(settingsInputs)) {
            if (key === 'speed') input.value = speed;
            else input.checked = preferences[key];
        }
        updateWakeLock();
    }
    function savePreferences(changes) {
        preferences = normalizePreferences({ ...preferences, ...changes });
        const saved = storage.set(PREFERENCES_KEY, JSON.stringify(preferences));
        settingsStatus.textContent = saved ? settingsText.saved : settingsText.unsaved;
        applyPreferences();
    }
    window.addEventListener('storage', event => {
        if (event.key !== PREFERENCES_KEY && event.key !== null) return;
        try { preferences = normalizePreferences(JSON.parse(event.newValue)); }
        catch (_) { preferences = normalizePreferences(null); }
        applyPreferences(); // Never start playback because another tab changed a setting.
    });
    applyPreferences();
    const requested = new URLSearchParams(location.search).get('autoplay');
    const lastTrack = storage.get('athkarnfc_last_track') || states[Number(storage.get('athkarnfc_last_opened') ?? -1)]?.id;
    const initial = states.find(state => state.id === startupTrack(requested, preferences, lastTrack));
    select(initial);
    if (preferences.autoplay) {
        // Selecting an explicit NFC track never overrides a saved autoplay opt-out.
        // Only the Play button retries when a browser blocks automatic sound.
        initial.audio.play().catch(error => {
            if (selected === initial && error.name !== 'AbortError') {
                status(initial, error.name === 'NotAllowedError' ? labels.tap : labels.failed, error.name !== 'NotAllowedError');
            }
        });
    }
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js').then(() => navigator.serviceWorker.ready).then(registration => {
            offlineWorker = registration.active;
            refreshOffline();
        }).catch(() => states.forEach(state => { state.offlineStatus.textContent = labels.unavailable; }));
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            offlineWorker = navigator.serviceWorker.controller;
            refreshOffline();
        });
    } else states.forEach(state => { state.offlineStatus.textContent = labels.unavailable; });
})();
