(function () {
    'use strict';

    const tracks = document.querySelectorAll('.track');
    const statusDot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');
    const appContainer = document.getElementById('appContainer');

    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./sw.js').catch(err => {
                console.warn('SW registration failed:', err);
            });
        });
    }

    function setStatus(active, text, error = false) {
        statusDot.className = 'status-dot' + (active ? ' active' : '') + (error ? ' error' : '');
        statusText.textContent = text;
        statusText.className = 'status-text' + (active ? ' active' : '');
    }

    function formatTime(seconds) {
        if (isNaN(seconds)) return "0:00";
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return m + ":" + (s < 10 ? "0" : "") + s;
    }

    // --- Prayer Data & Carousel Logic ---
    const travelTranscript = [
        { s: 0.0, e: 2.4, t: "الله أكبر" },
        { s: 2.4, e: 5.1, t: "الله أكبر" },
        { s: 5.1, e: 7.8, t: "الله أكبر" },
        { s: 8.0, e: 16.169, t: "سُبْحَانَ الَّذِي سَخَّرَ لَنَا هَذَا وَمَا كُنَّا لَهُ مُقْرِنِينَ" },
        { s: 16.564, e: 22.124, t: "وَإِنَّا إِلَى رَبِّنَا لَمُنْقَلِبُونَ" },
        { s: 22.5, e: 28.7, t: "اللَّهُمَّ إِنَّا نَسْأَلُكَ فِي سَفَرِنَا هَذَا الْبِرَّ وَالتَّقْوَى" },
        { s: 28.85, e: 32.0, t: "وَمِنَ الْعَمَلِ مَا تَرْضَى" },
        { s: 32.1, e: 38.55, t: "اللَّهُمَّ هَوِّنْ عَلَيْنَا سَفَرَنَا هَذَا وَاطْوِ عَنَّا بُعْدَهُ" },
        { s: 38.8, e: 42.08, t: "اللَّهُمَّ أَنْتَ الصَّاحِبُ فِي السَّفَرِ" },
        { s: 42.3, e: 44.2, t: "وَالْخَلِيفَةُ فِي الأَهْلِ" },
        { s: 44.5, e: 49.46, t: "اللَّهُمَّ إِنِّي أَعُوذُ بِكَ مِنْ وَعْثَاءِ السَّفَرِ" },
        { s: 49.8, e: 52.26, t: "وَكَآبَةِ الْمَنْظَرِ" },
        { s: 52.6, e: 57.25, t: "وَسُوءِ الْمُنْقَلَبِ فِي الْمَالِ وَالأَهْلِ" }
    ];
    const travelHtml = travelTranscript.map(c => `<span class="sync-span" data-start="${c.s}" data-end="${c.e}">${c.t}</span>`).join('، ');
    const travelPrayerChunks = [
        { text: travelHtml, repeat: "مرة واحدة" }
    ];

    function getRepeatCount(str) {
        if (!str) return 1;
        if (str.includes('١٠٠') || str.includes('100')) return 100;
        if (str.includes('١٠') || str.includes('10')) return 10;
        if (str.includes('٤') || str.includes('4')) return 4;
        if (str.includes('٣') || str.includes('3')) return 3;
        if (str.includes('مرة واحدة') || str.includes('1')) return 1;
        return 1;
    }

    function createSlideHtml(text, repeat, currentIndex, total) {
        const count = getRepeatCount(repeat);
        return `
            <div class="slide tap-to-count" data-count="${count}" style="cursor: pointer; transition: opacity 0.3s;">
                <div class="slide-content">${text}</div>
                <div class="slide-meta">
                    <span class="repeat-badge" style="transition: all 0.3s;">${repeat}</span>
                    <span class="slide-counter">${currentIndex + 1} / ${total}</span>
                </div>
            </div>
        `;
    }

    let isDragging = false;
    function enableMouseDrag(carousel) {
        let isDown = false;
        let startX;
        let scrollLeft;

        carousel.addEventListener('mousedown', (e) => {
            isDown = true;
            isDragging = false;
            carousel.style.cursor = 'grabbing';
            carousel.style.scrollSnapType = 'none';
            startX = e.pageX - carousel.offsetLeft;
            scrollLeft = carousel.scrollLeft;
        });
        
        const resetDrag = () => {
            isDown = false;
            carousel.style.cursor = 'grab';
            carousel.style.scrollSnapType = 'x mandatory';
            setTimeout(() => isDragging = false, 50);
        };

        carousel.addEventListener('mouseleave', resetDrag);
        carousel.addEventListener('mouseup', resetDrag);

        carousel.addEventListener('mousemove', (e) => {
            if (!isDown) return;
            e.preventDefault();
            const x = e.pageX - carousel.offsetLeft;
            const walk = (x - startX) * 2; 
            if (Math.abs(walk) > 5) isDragging = true;
            carousel.scrollLeft = scrollLeft - walk;
        });
    }

    function renderCarousel(trackIndex, items) {
        const carousel = document.getElementById('carousel-' + trackIndex);
        if (!carousel) return;
        
        let html = '';
        items.forEach((item, index) => {
            html += createSlideHtml(item.text, item.repeat, index, items.length);
        });
        carousel.innerHTML = html;
        enableMouseDrag(carousel);
    }

    async function loadData() {
        renderCarousel(0, travelPrayerChunks);

        try {
            const evRes = await fetch('./assets/athkar/evening.json');
            const evData = await evRes.json();
            const eveningItems = [];
            const morningFallbackItems = [];
            evData.forEach(page => {
                page.dhikr_items.forEach(item => {
                    eveningItems.push({ text: item.text, repeat: item.repeat_count });
                    let mText = item.text.replace(/أَمْسَيْنَا/g, 'أَصْبَحْنَا').replace(/أَمْسَى/g, 'أَصْبَحَ').replace(/المساء/g, 'الصباح');
                    morningFallbackItems.push({ text: mText, repeat: item.repeat_count });
                });
            });
            renderCarousel(2, eveningItems);
            
            try {
                const morningRes = await fetch('./assets/athkar/morning_v2.json');
                const t = await morningRes.text();
                if(t.trim()) {
                    const morningData = JSON.parse(t);
                    const morningItems = [];
                    morningData.forEach(page => {
                        page.dhikr_items.forEach(item => {
                            morningItems.push({ text: item.text, repeat: item.repeat_count });
                        });
                    });
                    renderCarousel(1, morningItems);
                } else { throw new Error("empty"); }
            } catch(e) {
                renderCarousel(1, morningFallbackItems);
            }
        } catch (e) {
            console.error("Failed to load JSON", e);
        }
    }

    document.addEventListener('click', (e) => {
        if (isDragging) return;
        const slide = e.target.closest('.tap-to-count');
        if (!slide) return;
        
        let count = parseInt(slide.dataset.count);
        if (count > 0) {
            count--;
            slide.dataset.count = count;
            if (navigator.vibrate) navigator.vibrate(50);
            
            const badge = slide.querySelector('.repeat-badge');
            if (count === 0) {
                badge.textContent = "✅ مكتمل";
                badge.style.background = "rgba(52, 199, 89, 0.2)";
                badge.style.color = "#34c759";
                slide.style.opacity = "0.4";
                
                setTimeout(() => {
                    const next = slide.nextElementSibling;
                    if (next) next.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' });
                }, 400);
            } else {
                badge.textContent = `متبقي: ${count}`;
            }
        }
    });

    loadData();

    // --- Interaction & Speed Logic ---
    const LAST_OPENED_KEY = 'athkarnfc_last_opened';
    const AUDIO_SPEED_KEY = 'athkarnfc_audio_speed';
    
    const SPEEDS = [1, 1.25, 1.5, 2];
    let currentSpeedIndex = SPEEDS.indexOf(parseFloat(localStorage.getItem(AUDIO_SPEED_KEY)));
    if (currentSpeedIndex === -1) currentSpeedIndex = 0;

    function setupMediaSession(audioEl, trackName) {
        if (!('mediaSession' in navigator)) return;
        let titleMap = {
            '0': 'دعاء السفر',
            '1': 'أذكار الصباح',
            '2': 'أذكار المساء'
        };
        navigator.mediaSession.metadata = new MediaMetadata({
            title: titleMap[trackName] || 'Athkar',
            artist: 'Mishary Alafasy',
            album: 'Athkar Normal Mode'
        });
        navigator.mediaSession.setActionHandler('play', () => audioEl.play());
        navigator.mediaSession.setActionHandler('pause', () => audioEl.pause());
        navigator.mediaSession.setActionHandler('seekbackward', () => { audioEl.currentTime = Math.max(audioEl.currentTime - 10, 0); });
        navigator.mediaSession.setActionHandler('seekforward', () => { audioEl.currentTime = Math.min(audioEl.currentTime + 10, audioEl.duration); });
    }

    let wakeLock = null;
    async function requestWakeLock() {
        if ('wakeLock' in navigator) {
            try { wakeLock = await navigator.wakeLock.request('screen'); } catch (err) {}
        }
    }
    document.addEventListener('visibilitychange', async () => {
        if (wakeLock !== null && document.visibilityState === 'visible') {
            await requestWakeLock();
        }
    });

    tracks.forEach((track, index) => {
        const btn = track.querySelector('.track-btn');
        const audio = track.querySelector('audio');
        const playPauseBtn = track.querySelector('.play-pause-btn');
        const speedBtn = track.querySelector('.speed-btn');
        const playIcon = '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
        const pauseIcon = '<svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>';
        const progressFill = track.querySelector('.progress-fill');
        const progressBar = track.querySelector('.progress-bar');
        const currentTimeEl = track.querySelector('.current-time');
        const durationEl = track.querySelector('.duration');

        audio.playbackRate = SPEEDS[currentSpeedIndex];
        if(speedBtn) speedBtn.textContent = SPEEDS[currentSpeedIndex] + 'x';

        btn.addEventListener('click', () => {
            const isOpen = track.classList.contains('open');
            
            tracks.forEach(t => {
                t.classList.remove('open');
                t.querySelector('.track-btn').setAttribute('aria-expanded', 'false');
                const tAudio = t.querySelector('audio');
                if (tAudio && !tAudio.paused) {
                    tAudio.pause();
                }
            });

            if (!isOpen) {
                track.classList.add('open');
                btn.setAttribute('aria-expanded', 'true');
                appContainer.classList.add('focus-mode');
                document.body.classList.add('focus-active');
                localStorage.setItem(LAST_OPENED_KEY, index.toString());
                window.scrollTo({ top: 0, behavior: 'smooth' });
                setupMediaSession(audio, index.toString());
                requestWakeLock();
            } else {
                appContainer.classList.remove('focus-mode');
                document.body.classList.remove('focus-active');
                localStorage.removeItem(LAST_OPENED_KEY);
            }
        });

        if (speedBtn) {
            speedBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                currentSpeedIndex = (currentSpeedIndex + 1) % SPEEDS.length;
                const newSpeed = SPEEDS[currentSpeedIndex];
                
                document.querySelectorAll('audio').forEach(a => a.playbackRate = newSpeed);
                document.querySelectorAll('.speed-btn').forEach(btn => btn.textContent = newSpeed + 'x');
                
                localStorage.setItem(AUDIO_SPEED_KEY, newSpeed.toString());
            });
        }

        playPauseBtn.addEventListener('click', (e) => {
            e.stopPropagation(); 
            tracks.forEach(t => {
                if (t !== track) {
                    const tAudio = t.querySelector('audio');
                    if (tAudio && !tAudio.paused) tAudio.pause();
                }
            });

            if (audio.paused) {
                audio.play().catch(err => {
                    console.warn(err);
                    setStatus(false, 'Playback failed', true);
                });
            } else {
                audio.pause();
            }
        });

        audio.addEventListener('play', () => {
            playPauseBtn.innerHTML = pauseIcon;
            setStatus(true, 'Playing');
            setupMediaSession(audio, index.toString());
        });

        audio.addEventListener('pause', () => {
            playPauseBtn.innerHTML = playIcon;
            if (audio.currentTime === 0 || audio.ended) setStatus(false, 'Ready');
            else setStatus(false, 'Paused');
        });

        let lastActiveSlide = null;
        audio.addEventListener('timeupdate', () => {
            const percent = (audio.currentTime / audio.duration) * 100 || 0;
            progressFill.style.width = percent + '%';
            currentTimeEl.textContent = formatTime(audio.currentTime);
            
            const trackContent = track.querySelector('.track-content');
            if (trackContent) {
                const spans = trackContent.querySelectorAll('.sync-span');
                if(spans.length > 0 && !audio.paused) {
                    const ct = audio.currentTime;
                    spans.forEach(s => {
                        const start = parseFloat(s.dataset.start);
                        const end = parseFloat(s.dataset.end);
                        if(ct >= start && ct <= end) {
                            s.classList.add('active-sync');
                            const slide = s.closest('.slide');
                            if (slide && slide !== lastActiveSlide) {
                                slide.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' });
                                lastActiveSlide = slide;
                            }
                        } else {
                            s.classList.remove('active-sync');
                        }
                    });
                } else if (audio.paused) {
                    spans.forEach(s => s.classList.remove('active-sync'));
                }
            }
        });

        function jumpToPart(direction) {
            const parts = Array.from(track.querySelectorAll('.slide'));
            if (!parts.length) return;
            const ct = audio.currentTime;
            let activeIndex = -1;
            for (let i = 0; i < parts.length; i++) {
                const spans = parts[i].querySelectorAll('.sync-span');
                if (spans.length === 0) continue;
                const start = parseFloat(spans[0].dataset.start);
                const end = parseFloat(spans[spans.length - 1].dataset.end);
                if (ct >= start && ct <= end) {
                    activeIndex = i; break;
                } else if (ct < start) {
                    activeIndex = i - 1; break;
                }
            }
            if (activeIndex === -1 && ct > 0) activeIndex = parts.length - 1;
            
            let target = activeIndex + direction;
            if (target < 0) target = 0;
            if (target >= parts.length) target = parts.length - 1;
            
            const targetSpans = parts[target].querySelectorAll('.sync-span');
            if (targetSpans.length > 0) {
                audio.currentTime = parseFloat(targetSpans[0].dataset.start) + 0.05;
                if(audio.paused) audio.play();
            }
        }

        const prevBtn = track.querySelector('.prev-btn');
        const nextBtn = track.querySelector('.next-btn');
        if (prevBtn) prevBtn.addEventListener('click', (e) => { e.stopPropagation(); jumpToPart(-1); });
        if (nextBtn) nextBtn.addEventListener('click', (e) => { e.stopPropagation(); jumpToPart(1); });

        audio.addEventListener('loadedmetadata', () => {
            durationEl.textContent = formatTime(audio.duration);
        });

        audio.addEventListener('ended', () => {
            playPauseBtn.innerHTML = playIcon;
            progressFill.style.width = '0%';
            currentTimeEl.textContent = "0:00";
            setStatus(false, 'Ready');
        });

        progressBar.addEventListener('click', (e) => {
            e.stopPropagation();
            const rect = progressBar.getBoundingClientRect();
            const pos = (e.clientX - rect.left) / rect.width;
            if (!isNaN(audio.duration)) {
                audio.currentTime = pos * audio.duration;
            }
        });
    });

    const lastOpened = localStorage.getItem(LAST_OPENED_KEY);
    const urlParams = new URLSearchParams(window.location.search);
    const autoplay = urlParams.get('autoplay');
    
    if (autoplay) {
        let trackIndex = -1;
        if (autoplay === 'travel') trackIndex = 0;
        else if (autoplay === 'morning') trackIndex = 1;
        else if (autoplay === 'evening') trackIndex = 2;
        else if (autoplay === 'auto') {
            const hour = new Date().getHours();
            trackIndex = (hour >= 5 && hour < 12) ? 1 : 2;
        }
        
        if (trackIndex !== -1 && tracks[trackIndex]) {
            setTimeout(() => {
                if(!tracks[trackIndex].classList.contains('open')) {
                    tracks[trackIndex].querySelector('.track-btn').click();
                }
                const audio = tracks[trackIndex].querySelector('audio');
                audio.play().catch(() => {
                    document.body.addEventListener('click', () => {
                        if(audio.paused) audio.play();
                    }, { once: true });
                });
            }, 300);
        }
    } else if (lastOpened !== null && tracks[lastOpened]) {
        tracks[lastOpened].classList.add('open');
        tracks[lastOpened].querySelector('.track-btn').setAttribute('aria-expanded', 'true');
        appContainer.classList.add('focus-mode');
        document.body.classList.add('focus-active');
        setupMediaSession(tracks[lastOpened].querySelector('audio'), lastOpened.toString());
        requestWakeLock();
    }

})();
