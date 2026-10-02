(function () {
    'use strict';
    const { TRACKS, SPEEDS, THEMES, ACCENTS, TEXT_SIZES, FONTS, STARTUPS,
        stringsFor, formatText, normalizePreferences, startupTrack, loadTrack, seekTime, formatTime, prayerCues } = Athkar;
    const carMode = Boolean(document.querySelector('.car-content'));
    // Interface strings follow the saved language rather than the mode. Arabic
    // is used until the saved preferences below have been read.
    let labels = stringsFor('ar');
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
    labels = stringsFor(preferences.language);
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
            speedButton: panel.querySelector('.speed-btn'), lastChunk: null, scrollTarget: null };
    });
    const playIcon = '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
    const pauseIcon = '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>';
    // Chevron arrows for card navigation. Each button gets its own glyph rather
    // than a mirrored copy, so the direction is explicit: `back` points towards
    // the start of the reading order and `forward` towards its end.
    const chevronBack = '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M15.4 7.4 14 6l-6 6 6 6 1.4-1.4L10.8 12z"/></svg>';
    const chevronForward = '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M8.6 7.4 10 6l6 6-6 6-1.4-1.4L13.2 12z"/></svg>';
    const gearIcon = '<svg aria-hidden="true" viewBox="0 0 24 24">'
        + '<path fill-rule="evenodd" d="M10.6 2h2.8l.5 2.3 1.7.7 2-1.2 2 2-1.2 2 .7 1.7 2.3.5v2.8l-2.3.5-.7 1.7 1.2 2-2 2-2-1.2-1.7.7-.5 2.3h-2.8l-.5-2.3-1.7-.7-2 1.2-2-2 1.2-2-.7-1.7L2 13.4v-2.8l2.3-.5.7-1.7-1.2-2 2-2 2 1.2 1.7-.7z"/>'
        + '<circle cx="12" cy="12" r="3.1" class="gear-hub"/>'
        + '</svg>';
    const downloadIcon = '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 3a1 1 0 0 1 1 1v8.6l2.8-2.8 1.4 1.4-5.2 5.2-5.2-5.2 1.4-1.4L11 12.6V4a1 1 0 0 1 1-1zM5 18h14v2H5z"/></svg>';
    const trashIcon = '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M9 3h6l1 2h4v2H4V5h4zM6 8h12l-.8 12.1a2 2 0 0 1-2 1.9H8.8a2 2 0 0 1-2-1.9z"/></svg>';
    function element(tag, className, text) {
        const el = document.createElement(tag);
        if (className) el.className = className;
        if (text !== undefined) el.textContent = text;
        return el;
    }
    // Splits a segment into text nodes so the end-of-ayah sign stays glued to the
    // word before it. The concatenated text is byte-for-byte the stored text; a
    // non-breaking space is added only where a number would otherwise be able to
    // start a line on its own.
    function segmentText(text) {
        return String(text).split(/(?= \u06DD)/).map((part, index) =>
            index === 0 ? part : `\u00A0${part.slice(1)}`);
    }
    // The key is remembered so a language change can re-apply the current
    // status without knowing why it was set.
    function status(state, key, error = false) {
        state.statusKey = key;
        state.statusError = error;
        state.status.textContent = labels[key];
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
            title: state.title,
            // Only credit a reciter where the provenance is documented.
            ...(state.artist ? { artist: state.artist } : {}),
            album: 'AthkarNFC'
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
            // The cog follows whichever track is open, and returns to the top bar
            // when the reader closes every track.
            placeSettingsButton();
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
            if (error.name !== 'AbortError') status(state, 'failed', true);
        }
    }
    // Cues depend only on the dataset and the media duration, so recomputing
    // them on every timeupdate is wasted work.
    function updateCues(state) {
        if (state.cues && state.cueDuration === state.audio.duration) return;
        state.cueDuration = state.audio.duration;
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
        // The scroll animates through the neighbouring cards, so remember the
        // card that was asked for: intermediate positions must not move the
        // selection while it settles.
        state.scrollTarget = preferences.autoScroll ? index : null;
        if (preferences.autoScroll) chunk.scrollIntoView({
            behavior: smooth ? 'smooth' : 'auto', block: 'nearest', inline: 'start'
        });
        state.updateNavigation?.(index);
    }
    async function jumpToPrayer(state, index) {
        if (!state.items?.length) return;
        index = Math.max(0, Math.min(state.items.length - 1, index));
        // Tapping an arrow while paused moves the reader to another card without
        // starting playback: the position moves, the transport state does not.
        // Playback is only carried over when the recording was already running.
        const wasPlaying = !state.audio.paused && !state.audio.ended;
        select(state);
        state.pendingPrayer = index;
        // The card is selected first and the scroll catches up. Because the
        // selection stays authoritative while it animates, a quick second tap
        // moves on from the requested prayer instead of repeating the first.
        showPrayer(state, index);
        if (!Number.isFinite(state.audio.duration) || state.audio.duration <= 0) state.audio.load();
        else {
            updateCues(state);
            state.audio.currentTime = state.cues[index] || 0;
            state.pendingPrayer = null;
        }
        if (wasPlaying) await play(state);
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
        // A requested prayer, or a seek, reports the old position until the
        // media is ready, so the follower must not move the selection yet.
        const settling = (state.pendingPrayer ?? null) !== null || audio.seeking;
        if (!audio.paused && !settling && prayerIndex !== state.activePrayer) showPrayer(state, prayerIndex);
        for (const span of state.content.querySelectorAll('.sync-span')) {
            const active = !audio.paused && audio.currentTime >= Number(span.dataset.start) && audio.currentTime < Number(span.dataset.end);
            span.classList.toggle('active-sync', active);
            if (active) {
                const chunk = span.closest('.prayer-chunk, .slide');
                // Only follow the text inside the selected prayer. A segment
                // left over from the previous card would otherwise scroll the
                // carousel back right after Next or Previous was tapped.
                const selected = chunk === state.content.children[state.activePrayer];
                if (preferences.autoScroll && selected && chunk !== state.lastChunk) {
                    chunk.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' });
                    state.lastChunk = chunk;
                }
            }
        }
    }
    function renderPrayers(state, items) {
        state.items = items;
        // Force the cues to be rebuilt for this dataset even if the duration
        // has not changed (for example when a retry succeeds).
        state.cues = null;
        // Language-dependent text is refreshed through these closures, so a
        // language change never rebuilds the cards and never resets a count.
        state.countUpdaters = [];
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
                const ayah = element('div', 'prayer-ayah');
                let ayahStarted = false;
                for (const segment of item.segments) {
                    const span = element('span', 'sync-span');
                    // The end-of-ayah sign is wrapped with the word it follows so a
                    // narrow screen cannot push the bare number onto its own line.
                    // The text itself is unchanged, only the break opportunity.
                    span.append(...segmentText(segment.text));
                    span.dataset.start = segment.start;
                    span.dataset.end = segment.end;
                    if (segment.opening) {
                        // Not part of the prayer text: centred above it, in its own
                        // colour, while its sync span still follows the recording.
                        const opening = element('div', 'prayer-opening');
                        opening.append(span);
                        text.append(opening);
                        continue;
                    }
                    if (ayahStarted) ayah.append(' ');
                    ayahStarted = true;
                    ayah.append(span);
                }
                text.append(ayah);
                if (item.reference) text.append(element('div', 'prayer-reference', item.reference));
            } else text.textContent = item.text;
            const meta = element('div', 'slide-meta');
            const count = element('button', 'repeat-badge');
            count.type = 'button';
            count.setAttribute('aria-live', 'polite');
            const reset = element('button', 'reset-count', labels.reset);
            reset.dataset.i18n = 'reset';
            reset.type = 'button';
            reset.lang = carMode ? 'ar' : 'en';
            let remaining = item.repeatCount;
            function updateCount() {
                count.textContent = remaining ? `${labels.remaining}: ${remaining}` : `✓ ${labels.complete}`;
                count.setAttribute('aria-label', remaining
                    ? `${labels.count}: ${remaining} ${labels.remaining}`
                    : `${labels.complete} ${labels.count}`);
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
            state.countUpdaters.push(updateCount);
            updateCount();
            meta.append(count, reset, element('span', 'slide-counter', `${index + 1} / ${items.length}`));
            chunk.append(text, meta);
            state.content.append(chunk);
        }
        state.note.hidden = items.some(item => item.segments.length);
        state.sourceNote.hidden = !state.usedFallback;
        if (!carMode) {
            state.navigation?.remove();
            const navigation = element('nav', 'prayer-navigation');
            navigation.setAttribute('aria-label', labels.prayerPages);
            navigation.dataset.i18nAria = 'prayerPages';
            const previous = element('button', 'prayer-previous icon-button');
            const next = element('button', 'prayer-next icon-button');
            // Icon-only buttons need a text alternative, since the arrow itself
            // carries no accessible name.
            previous.setAttribute('aria-label', labels.previousPrayer);
            next.setAttribute('aria-label', labels.nextPrayer);
            previous.title = labels.previousPrayer;
            next.title = labels.nextPrayer;
            // The glyphs are swapped by CSS for the writing direction, so the
            // same two icons always point away from each other and towards the
            // card the button actually opens.
            previous.innerHTML = chevronBack;
            next.innerHTML = chevronForward;
            previous.classList.add('arrow-back');
            next.classList.add('arrow-forward');
            previous.dataset.i18nAria = 'previousPrayer';
            next.dataset.i18nAria = 'nextPrayer';
            previous.dataset.i18nTitle = 'previousPrayer';
            next.dataset.i18nTitle = 'nextPrayer';
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
            // Navigate from the selected prayer, not from the live scroll
            // position, which lags behind while a scroll is animating.
            previous.addEventListener('click', () => jumpToPrayer(state, (state.activePrayer ?? nearest()) - 1));
            next.addEventListener('click', () => jumpToPrayer(state, (state.activePrayer ?? nearest()) + 1));
            for (const event of ['pointerdown', 'wheel', 'keydown']) {
                // The reader taking over may scroll anywhere, so the requested
                // card stops being authoritative.
                state.content.addEventListener(event, () => { state.scrollTarget = null; }, { passive: true });
            }
            state.content.onscroll = () => {
                const index = nearest();
                if (state.scrollTarget !== null && index !== state.scrollTarget) return;
                state.scrollTarget = null;
                // Reading the text by hand moves the selection too, so the
                // buttons continue from the card the reader is looking at.
                state.activePrayer = index;
                updateNavigation(index);
            };
            navigation.append(previous, next);
            navigation.hidden = items.length < 2;
            state.content.after(navigation);
            state.navigation = navigation;
            state.updateNavigation = updateNavigation;
            updateNavigation();
        }
    }
    async function loadPrayers(state) {
        try {
            const { items, usedFallback } = await loadTrack(state);
            state.usedFallback = usedFallback;
            renderPrayers(state, items);
        } catch (_) {
            const message = element('div', 'load-error', labels.loadFailed);
            message.dataset.i18n = 'loadFailed';
            const retry = element('button', 'retry-button', labels.retry);
            retry.dataset.i18n = 'retry';
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
    // Re-applied on a language change, and after a save or removal.
    function updateOfflineText(state) {
        // Icon-only: the accessible name and tooltip carry the meaning, and the
        // glyph itself changes between saving and removing.
        const label = state.saved ? labels.remove : labels.save;
        state.offline.setAttribute('aria-label', label);
        state.offline.title = label;
        state.offline.innerHTML = state.saved ? trashIcon : downloadIcon;
        state.offlineStatus.textContent = state.saved ? labels.saved : '';
    }
    async function refreshOffline() {
        if (!offlineWorker) return;
        await Promise.all(states.map(async state => {
            try {
                const { saved } = await workerRequest(offlineWorker, 'AUDIO_STATUS', state.audio.getAttribute('src'));
                state.saved = saved;
                state.offline.disabled = false;
                updateOfflineText(state);
            } catch (_) { state.offlineStatus.textContent = labels.unavailable; }
        }));
    }
    for (const state of states) {
        const { panel, audio } = state;
        state.status = element('p', 'player-status', labels.ready);
        state.status.setAttribute('role', 'status');
        state.statusKey = 'ready';
        state.note = element('p', 'transcript-note', labels.manual);
        state.note.dataset.i18n = 'manual';
        state.note.hidden = true;
        state.sourceNote = element('p', 'transcript-note fallback-note', labels.fallback);
        state.sourceNote.dataset.i18n = 'fallback';
        state.sourceNote.hidden = true;
        state.content.before(state.sourceNote, state.note);
        // The offline control lives in the settings dialog so the player stays
        // compact on a phone. It is built here, where the per-track state is
        // known, and appended to the dialog further down.
        state.offline = element('button', 'offline-button icon-button');
        state.saved = false;
        state.offline.type = 'button';
        state.offline.disabled = true;
        state.offline.innerHTML = downloadIcon;
        state.offlineStatus = element('span', 'offline-status');
        state.offlineStatus.setAttribute('role', 'status');
        state.offlineActions = element('div', 'offline-actions');
        state.offlineActions.append(state.offline, state.offlineStatus);
        const host = carMode ? panel : panel.querySelector('.track-content');
        if (carMode) host.append(state.status);
        else {
            // In the reader the status belongs to the dock, under the transport
            // row, where it cannot collide with the arrows above it.
            const dockStatus = element('div', 'dock-status');
            dockStatus.append(state.status);
            state.dockStatus = dockStatus;
            panel.querySelector('.audio-player').after(dockStatus);
        }
        audio.preload = 'none';
        applyRate(audio);
        state.speedButton.textContent = `${speed}x`;
        for (const type of ['loadedmetadata', 'canplay', 'playing', 'seeked']) {
            audio.addEventListener(type, () => keepRate(state));
        }
        audio.addEventListener('ratechange', () => {
            // Re-assert only while playing: a paused element can ignore the
            // setter, and that also keeps this from looping.
            if (!audio.paused) keepRate(state);
        });
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
            status(state, 'playing'); updatePlayer(state); updateWakeLock();
            if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
        });
        audio.addEventListener('pause', () => {
            status(state, audio.ended ? 'ready' : 'paused'); updatePlayer(state); updateWakeLock();
            if (selected === state && 'mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
        });
        audio.addEventListener('ended', () => { status(state, 'ready'); updatePlayer(state); updateWakeLock(); });
        audio.addEventListener('error', () => { status(state, 'failed', true); updatePlayer(state); updateWakeLock(); });
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
    // Settings are described once and built from that description, so every
    // option is stored, validated and re-applied in the same way.
    const capitalize = value => String(value).charAt(0).toUpperCase() + String(value).slice(1);
    const enumOptions = (values, prefix) => values.map(value => ({ value, labelKey: prefix + capitalize(value) }));
    const STARTUP_LABELS = { auto: 'startupAuto', last: 'startupLast', travel: 'travelMeta', morning: 'morningMeta', evening: 'eveningMeta' };
    const SETTINGS = [
        { heading: 'groupAppearance', rows: [
            { key: 'language', options: [{ value: 'ar', label: 'العربية' }, { value: 'en', label: 'English' }] },
            { key: 'theme', options: enumOptions(THEMES, 'theme') },
            { key: 'accent', options: enumOptions(ACCENTS, 'accent') },
            { key: 'textSize', options: enumOptions(TEXT_SIZES, 'size') },
            { key: 'font', options: enumOptions(FONTS, 'font') }
        ] },
        { heading: 'groupPlayback', rows: [
            { key: 'speed', options: SPEEDS.map(value => ({ value, label: `${value}x` })) },
            { key: 'keepAwake' }, { key: 'haptics' }, { key: 'autoScroll' }
        ] },
        { heading: 'groupOpening', rows: [
            { key: 'autoplay' },
            { key: 'switchHour', options: Array.from({ length: 24 }, (unused, hour) =>
                ({ value: hour, label: `${String(hour).padStart(2, '0')}:00` })) },
            { key: 'startup', options: STARTUPS.map(value => ({ value, labelKey: STARTUP_LABELS[value] })) }
        ] }
    ];
    const toolbar = element('div', 'settings-toolbar');
    const settingsButton = element('button', 'settings-button icon-button');
    settingsButton.type = 'button';
    settingsButton.dataset.i18nAria = 'settings';
    settingsButton.dataset.i18nTitle = 'settings';
    settingsButton.setAttribute('aria-haspopup', 'dialog');
    // The gear is the only visible cue, so the name comes from aria-label.
    settingsButton.setAttribute('aria-label', labels.settings);
    settingsButton.title = labels.settings;
    settingsButton.innerHTML = gearIcon;
    toolbar.append(settingsButton);
    document.body.prepend(toolbar);
    // In the reader the cog belongs to the open track's transport row, so it is
    // moved there once that row exists rather than floating in a strip of its
    // own. Car mode keeps the toolbar where it is.
    function placeSettingsButton() {
        if (carMode) return;
        const openPlayer = document.querySelector('.track.open .audio-player');
        if (openPlayer) openPlayer.append(settingsButton);
        else toolbar.append(settingsButton);
    }
    const dialog = element('dialog', 'settings-dialog');
    dialog.setAttribute('aria-labelledby', 'settings-title');
    const heading = element('h2', '', labels.settings);
    heading.id = 'settings-title';
    heading.dataset.i18n = 'settings';
    const closeButton = element('button', 'settings-close', labels.settingsClose);
    closeButton.type = 'button';
    closeButton.dataset.i18n = 'settingsClose';
    const scheduleHint = element('p', 'settings-hint');
    dialog.append(heading, scheduleHint);
    const settingsInputs = {};
    function addRow(row) {
        const label = element('label', 'settings-row');
        const name = element('span', '', labels[row.key]);
        name.dataset.i18n = row.key;
        const input = element(row.options ? 'select' : 'input');
        input.id = `preference-${row.key}`;
        if (row.options) {
            for (const option of row.options) {
                const node = element('option', '', option.labelKey ? labels[option.labelKey] : option.label);
                node.value = option.value;
                if (option.labelKey) node.dataset.i18n = option.labelKey;
                input.append(node);
            }
        } else input.type = 'checkbox';
        label.append(name, input);
        dialog.append(label);
        settingsInputs[row.key] = input;
        input.addEventListener('change', () => savePreferences({
            [row.key]: row.options
                ? (typeof row.options[0].value === 'number' ? Number(input.value) : input.value)
                : input.checked
        }));
    }
    for (const group of SETTINGS) {
        const groupHeading = element('h3', 'settings-group', labels[group.heading]);
        groupHeading.dataset.i18n = group.heading;
        dialog.append(groupHeading);
        group.rows.forEach(addRow);
    }
    // Offline saving for each recitation, kept beside the settings so the
    // player itself does not have to carry the buttons on a phone.
    const offlineHeading = element('h3', 'settings-group', labels.offlineHeading);
    offlineHeading.dataset.i18n = 'offlineHeading';
    dialog.append(offlineHeading);
    for (const state of states) {
        const row = element('div', 'offline-row');
        row.dataset.track = state.id;
        // The download itself is the button; the label names the recitation so
        // the three identical icons stay distinguishable in the dialog.
        const name = element('span', 'offline-name', state.title);
        name.dataset.i18n = `${state.id}Meta`;
        row.append(name, state.offlineActions);
        dialog.append(row);
    }
    const resetButton = element('button', 'settings-reset', labels.settingsReset);
    resetButton.type = 'button';
    resetButton.dataset.i18n = 'settingsReset';
    const settingsStatus = element('p', 'settings-status');
    settingsStatus.setAttribute('role', 'status');
    dialog.append(element('p', 'settings-hint', labels.settingsHint), settingsStatus, resetButton, closeButton);
    document.body.append(dialog);
    settingsButton.addEventListener('click', () => dialog.showModal());
    closeButton.addEventListener('click', () => dialog.close());
    resetButton.addEventListener('click', () => {
        storage.set(PREFERENCES_KEY, null);
        storage.set('athkarnfc_audio_speed', null); // do not re-import the legacy value
        preferences = normalizePreferences(null);
        settingsStatus.dataset.i18n = 'settingsResetDone';
        settingsStatus.textContent = labels.settingsResetDone;
        applyPreferences();
    });
    function applyRate(audio) {
        // defaultPlaybackRate is what a reload resets playbackRate to, so both
        // have to carry the preference.
        audio.defaultPlaybackRate = speed;
        audio.playbackRate = speed;
    }
    // Safari and iOS discard playbackRate when the browser takes over playback
    // (after loading or a stall), which silently returns audio to 1x even
    // though the preference is saved. Re-assert it wherever that can happen.
    function keepRate(state) {
        const { audio } = state;
        if (audio.playbackRate === speed && audio.defaultPlaybackRate === speed) return;
        applyRate(audio);
    }
    // Language, appearance and every piece of state-dependent text. Everything
    // here is driven by the saved preferences, so one call re-applies them all.
    function applyLanguage() {
        labels = stringsFor(preferences.language);
        document.documentElement.lang = preferences.language;
        document.documentElement.dir = preferences.language === 'ar' ? 'rtl' : 'ltr';
        document.title = carMode ? labels.carPageTitle : labels.appTitle;
        for (const node of document.querySelectorAll('[data-i18n]')) node.textContent = labels[node.dataset.i18n];
        for (const node of document.querySelectorAll('[data-i18n-aria]')) node.setAttribute('aria-label', labels[node.dataset.i18nAria]);
        // Icon-only buttons also carry a tooltip, so it needs translating too.
        for (const node of document.querySelectorAll('[data-i18n-title]')) node.title = labels[node.dataset.i18nTitle];
    }
    function applyAppearance() {
        const root = document.documentElement;
        root.dataset.theme = preferences.theme;
        root.dataset.accent = preferences.accent;
        root.dataset.textSize = preferences.textSize;
        root.dataset.font = preferences.font;
        const meta = document.querySelector('meta[name="theme-color"]');
        if (meta) {
            const light = preferences.theme === 'light';
            meta.setAttribute('content', carMode
                ? (light ? '#ffffff' : '#000000')
                : (light ? '#eef0f6' : '#1a1a24'));
        }
    }
    function updateScheduleHint() {
        const time = `${String(preferences.switchHour).padStart(2, '0')}:00`;
        scheduleHint.textContent = formatText(labels.settingsSchedule, { time });
    }
    function refreshOfflineText(state) {
        if (!offlineWorker) { state.offlineStatus.textContent = labels.unavailable; return; }
        updateOfflineText(state);
    }
    function refreshStateText(state) {
        status(state, state.statusKey || 'ready', state.statusError);
        state.countUpdaters?.forEach(update => update());
        refreshOfflineText(state);
        updatePlayer(state);
    }
    function applyPreferences() {
        speed = preferences.speed;
        states.forEach(state => {
            applyRate(state.audio);
            state.speedButton.textContent = `${speed}x`;
            if (!preferences.autoScroll) state.lastChunk = null;
        });
        for (const [key, input] of Object.entries(settingsInputs)) {
            if (input.type === 'checkbox') input.checked = preferences[key];
            else input.value = String(preferences[key]);
        }
        applyLanguage();
        applyAppearance();
        updateScheduleHint();
        states.forEach(refreshStateText);
        updateWakeLock();
    }
    function savePreferences(changes) {
        preferences = normalizePreferences({ ...preferences, ...changes });
        const saved = storage.set(PREFERENCES_KEY, JSON.stringify(preferences));
        settingsStatus.dataset.i18n = saved ? 'settingsSaved' : 'settingsUnsaved';
        settingsStatus.textContent = labels[settingsStatus.dataset.i18n];
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
                status(initial, error.name === 'NotAllowedError' ? 'tap' : 'failed', error.name !== 'NotAllowedError');
            }
        });
    }
    if ('serviceWorker' in navigator) {
        // 'none' keeps sw.js and the scripts it imports out of the HTTP cache, so a
        // new deployment is picked up on the next visit instead of waiting out a
        // cache lifetime that a static host controls.
        navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then(() => navigator.serviceWorker.ready).then(registration => {
            offlineWorker = registration.active;
            refreshOffline();
        }).catch(() => states.forEach(state => { state.offlineStatus.textContent = labels.unavailable; }));
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            offlineWorker = navigator.serviceWorker.controller;
            refreshOffline();
        });
    } else states.forEach(state => { state.offlineStatus.textContent = labels.unavailable; });
})();
