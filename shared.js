(function (root) {
    'use strict';
    const TRACKS = [
        { id: 'travel', title: 'دعاء السفر', audio: 'assets/audio/track1.mp3', data: 'assets/athkar/travel.json' },
        { id: 'morning', title: 'أذكار الصباح', audio: 'assets/audio/track2.mp3', data: 'assets/athkar/morning_v2.json', fallback: 'assets/athkar/morning.json' },
        { id: 'evening', title: 'أذكار المساء', audio: 'assets/audio/track3.mp3', data: 'assets/athkar/evening_audio.json', fallback: 'assets/athkar/evening.json' }
    ];
    const SPEEDS = [1, 1.25, 1.5, 2];
    const DEFAULT_PREFERENCES = Object.freeze({
        autoplay: true, speed: 1, keepAwake: true, haptics: true, autoScroll: true
    });
    function normalizePreferences(value) {
        const result = { ...DEFAULT_PREFERENCES };
        if (!value || typeof value !== 'object' || Array.isArray(value)) return result;
        for (const key of ['autoplay', 'keepAwake', 'haptics', 'autoScroll']) {
            if (typeof value[key] === 'boolean') result[key] = value[key];
        }
        if (SPEEDS.includes(value.speed)) result.speed = value.speed;
        return result;
    }
    function timeTrack(date = new Date()) {
        return date.getHours() < 12 ? 'morning' : 'evening';
    }
    function startupTrack(requested, preferences, lastTrack, date = new Date()) {
        if (TRACKS.some(track => track.id === requested)) return requested;
        if (requested === 'auto' || preferences.autoplay) return timeTrack(date);
        return TRACKS.some(track => track.id === lastTrack) ? lastTrack : timeTrack(date);
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
            const segments = item.segments || [];
            let end = 0;
            for (const segment of segments) {
                if (!Number.isFinite(segment.start) || !Number.isFinite(segment.end) ||
                    segment.start < end || segment.end <= segment.start || typeof segment.text !== 'string') {
                    throw new Error('Invalid transcript segment');
                }
                end = segment.end;
            }
            return { ...item, segments };
        });
    }
    async function loadTrack(track, fetcher = fetch) {
        for (const path of [track.data, track.fallback].filter(Boolean)) {
            try {
                const response = await fetcher(path);
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                return normalizeData(await response.json());
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
    const api = { TRACKS, SPEEDS, DEFAULT_PREFERENCES, normalizePreferences, timeTrack, startupTrack, normalizeData, loadTrack, seekTime, formatTime, prayerCues, parseRange };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.Athkar = api;
})(typeof globalThis !== 'undefined' ? globalThis : self);
