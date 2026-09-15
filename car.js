document.addEventListener('DOMContentLoaded', () => {
    
    // 1. Time-Based Routing
    const hour = new Date().getHours();
    // 05:00 AM - 11:59 AM -> Morning
    let defaultTab = 'evening';
    if (hour >= 5 && hour < 12) {
        defaultTab = 'morning';
    }

    // 2. Tab Logic
    const tabs = document.querySelectorAll('.tab-btn');
    const panels = document.querySelectorAll('.tab-panel');
    let activeAudio = null;

    function switchTab(targetId) {
        tabs.forEach(t => t.classList.toggle('active', t.dataset.target === targetId));
        panels.forEach(p => {
            const isActive = p.id === targetId;
            p.classList.toggle('active', isActive);
            
            // Pause inactive audio tracks automatically
            if (!isActive) {
                const aud = p.querySelector('audio');
                if (aud && !aud.paused) aud.pause();
            }
        });
        
        // Register Media Session for the newly active tab's audio
        const activePanel = document.getElementById(targetId);
        activeAudio = activePanel.querySelector('audio');
        setupMediaSession(activeAudio, targetId);
    }

    tabs.forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.target));
    });

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

    // Auto-route on load
    switchTab(defaultTab);
    requestWakeLock();

    // 3. Audio UI logic
    const playIcon = '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
    const pauseIcon = '<svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>';

    function formatTime(sec) {
        if(isNaN(sec)) return "0:00";
        const m = Math.floor(sec/60);
        const s = Math.floor(sec%60);
        return `${m}:${s<10?'0':''}${s}`;
    }

    panels.forEach(panel => {
        const audio = panel.querySelector('audio');
        const playBtn = panel.querySelector('.play-pause-btn');
        const speedBtn = panel.querySelector('.speed-btn');
        const fill = panel.querySelector('.progress-fill');
        const pBar = panel.querySelector('.progress-bar');
        const timeEl = panel.querySelector('.current-time');
        const durEl = panel.querySelector('.duration');
        const fwdBtn = panel.querySelector('.next-btn');
        const backBtn = panel.querySelector('.prev-btn');
        const textContainer = panel.querySelector('.prayer-text-container');

        // Play/Pause
        playBtn.addEventListener('click', () => {
            if (audio.paused) audio.play();
            else audio.pause();
        });

        audio.addEventListener('play', () => playBtn.innerHTML = pauseIcon);
        audio.addEventListener('pause', () => playBtn.innerHTML = playIcon);
        
        // Speed Cycle
        const SPEEDS = [1, 1.25, 1.5, 2];
        let sIdx = 0;
        speedBtn.addEventListener('click', () => {
            sIdx = (sIdx + 1) % SPEEDS.length;
            audio.playbackRate = SPEEDS[sIdx];
            speedBtn.textContent = SPEEDS[sIdx] + 'x';
        });

        function jumpToChunk(direction) {
            const chunks = Array.from(textContainer.querySelectorAll('.prayer-chunk'));
            if (!chunks.length) return;
            const ct = audio.currentTime;
            let activeIndex = -1;
            for (let i = 0; i < chunks.length; i++) {
                const spans = chunks[i].querySelectorAll('.sync-span');
                if (spans.length === 0) continue;
                const start = parseFloat(spans[0].dataset.start);
                const end = parseFloat(spans[spans.length - 1].dataset.end);
                if (ct >= start && ct <= end) {
                    activeIndex = i; break;
                } else if (ct < start) {
                    activeIndex = i - 1; break;
                }
            }
            if (activeIndex === -1 && ct > 0) activeIndex = chunks.length - 1;
            
            let target = activeIndex + direction;
            if (target < 0) target = 0;
            if (target >= chunks.length) target = chunks.length - 1;
            
            const targetSpans = chunks[target].querySelectorAll('.sync-span');
            if (targetSpans.length > 0) {
                audio.currentTime = parseFloat(targetSpans[0].dataset.start) + 0.05;
                if(audio.paused) audio.play();
            }
        }
        fwdBtn.addEventListener('click', () => jumpToChunk(1));
        backBtn.addEventListener('click', () => jumpToChunk(-1));

        let lastActiveChunk = null;
        // Progress & Text Sync Scaffold
        audio.addEventListener('timeupdate', () => {
            const pct = (audio.currentTime / audio.duration) * 100 || 0;
            fill.style.width = pct + '%';
            timeEl.textContent = formatTime(audio.currentTime);

            /* Scaffold: Text Sync Logic */
            const spans = textContainer.querySelectorAll('.sync-span');
            if(spans.length > 0 && !audio.paused) {
                const ct = audio.currentTime;
                spans.forEach(s => {
                    const start = parseFloat(s.dataset.start);
                    const end = parseFloat(s.dataset.end);
                    if(ct >= start && ct <= end) {
                        s.classList.add('active-sync');
                        const chunk = s.closest('.prayer-chunk');
                        if (chunk && chunk !== lastActiveChunk) {
                            chunk.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            lastActiveChunk = chunk;
                        }
                    } else {
                        s.classList.remove('active-sync');
                    }
                });
            } else if (audio.paused) {
                spans.forEach(s => s.classList.remove('active-sync'));
            }
        });

        audio.addEventListener('loadedmetadata', () => {
            durEl.textContent = formatTime(audio.duration);
        });

        pBar.addEventListener('click', (e) => {
            const rect = pBar.getBoundingClientRect();
            audio.currentTime = ((e.clientX - rect.left) / rect.width) * audio.duration;
        });
    });

    // 4. Media Session API
    function setupMediaSession(audioEl, trackName) {
        if (!('mediaSession' in navigator)) return;

        let titleMap = {
            'morning': 'أذكار الصباح',
            'evening': 'أذكار المساء',
            'travel': 'دعاء السفر'
        };

        navigator.mediaSession.metadata = new MediaMetadata({
            title: titleMap[trackName] || 'Athkar',
            artist: 'Mishary Alafasy',
            album: 'Athkar Car Mode',
            artwork: [
                { src: 'assets/icons/icon.svg', sizes: '512x512', type: 'image/svg+xml' }
            ]
        });

        navigator.mediaSession.setActionHandler('play', () => audioEl.play());
        navigator.mediaSession.setActionHandler('pause', () => audioEl.pause());
        navigator.mediaSession.setActionHandler('seekbackward', () => { audioEl.currentTime = Math.max(audioEl.currentTime - 10, 0); });
        navigator.mediaSession.setActionHandler('seekforward', () => { audioEl.currentTime = Math.min(audioEl.currentTime + 10, audioEl.duration); });
    }

    // 5. Data Loading
    function getRepeatCount(str) {
        if (!str) return 1;
        if (str.includes('١٠٠') || str.includes('100')) return 100;
        if (str.includes('١٠') || str.includes('10')) return 10;
        if (str.includes('٤') || str.includes('4')) return 4;
        if (str.includes('٣') || str.includes('3')) return 3;
        if (str.includes('مرة واحدة') || str.includes('1')) return 1;
        return 1;
    }

    async function loadData() {
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
        document.getElementById('travel-text').innerHTML = `<div class="prayer-chunk tap-to-count" data-count="1" style="cursor: pointer; transition: opacity 0.3s;">
            <div class="chunk-text">${travelHtml}</div>
            <div class="repeat-badge" style="display:inline-block; font-size:14px; font-weight:600; padding:6px 12px; border-radius:20px; background:rgba(255,255,255,0.1); color:#fff; margin-top:10px; transition: all 0.3s;">مرة واحدة</div>
        </div>`;

        try {
            const evRes = await fetch('./assets/athkar/evening.json');
            const evData = await evRes.json();
            
            let htmlE = '';
            let htmlMFallback = '';
            
            evData.forEach(page => {
                page.dhikr_items.forEach(item => {
                    const c = getRepeatCount(item.repeat_count || item.repeat);
                    const badge = `<div class="repeat-badge" style="display:inline-block; font-size:14px; font-weight:600; padding:6px 12px; border-radius:20px; background:rgba(255,255,255,0.1); color:#fff; margin-top:10px; transition: all 0.3s;">${item.repeat_count}</div>`;
                    htmlE += `<div class="prayer-chunk tap-to-count" data-count="${c}" style="cursor: pointer; transition: opacity 0.3s;">${item.text} ${badge}</div>`;
                    let mText = item.text.replace(/أَمْسَيْنَا/g, 'أَصْبَحْنَا').replace(/أَمْسَى/g, 'أَصْبَحَ').replace(/المساء/g, 'الصباح');
                    htmlMFallback += `<div class="prayer-chunk tap-to-count" data-count="${c}" style="cursor: pointer; transition: opacity 0.3s;">${mText} ${badge}</div>`;
                });
            });
            document.getElementById('evening-text').innerHTML = htmlE;
            
            try {
                const mRes = await fetch('./assets/athkar/morning_v2.json');
                const t = await mRes.text();
                if(t.trim()) {
                    const mData = JSON.parse(t);
                    let mReal = '';
                    mData.forEach(p => p.dhikr_items.forEach(i => {
                        const c = getRepeatCount(i.repeat_count || i.repeat);
                        const badge = `<div class="repeat-badge" style="display:inline-block; font-size:14px; font-weight:600; padding:6px 12px; border-radius:20px; background:rgba(255,255,255,0.1); color:#fff; margin-top:10px; transition: all 0.3s;">${i.repeat_count}</div>`;
                        mReal += `<div class="prayer-chunk tap-to-count" data-count="${c}" style="cursor: pointer; transition: opacity 0.3s;">${i.text} ${badge}</div>`;
                    }));
                    document.getElementById('morning-text').innerHTML = mReal;
                } else { throw new Error('empty'); }
            } catch(e) {
                document.getElementById('morning-text').innerHTML = htmlMFallback;
            }

        } catch (e) { console.error(e); }

        const urlParams = new URLSearchParams(window.location.search);
        const autoplayParam = urlParams.get('autoplay');
        if (autoplayParam) {
            let targetId = null;
            if (autoplayParam === 'travel') targetId = 'travel';
            else if (autoplayParam === 'morning') targetId = 'morning';
            else if (autoplayParam === 'evening') targetId = 'evening';
            else if (autoplayParam === 'auto') {
                const hour = new Date().getHours();
                targetId = (hour >= 5 && hour < 12) ? 'morning' : 'evening';
            }
            if (targetId) {
                switchTab(targetId);
                setTimeout(() => {
                    if (activeAudio) {
                        activeAudio.play().catch(() => {
                            document.body.addEventListener('click', () => {
                                if (activeAudio && activeAudio.paused) activeAudio.play();
                            }, { once: true });
                        });
                    }
                }, 300);
            }
        }
    }
    
    document.addEventListener('click', (e) => {
        const chunk = e.target.closest('.tap-to-count');
        if (!chunk) return;
        
        let count = parseInt(chunk.dataset.count);
        if (count > 0) {
            count--;
            chunk.dataset.count = count;
            if (navigator.vibrate) navigator.vibrate(50);
            
            const badge = chunk.querySelector('.repeat-badge');
            if (count === 0) {
                badge.textContent = "✅ مكتمل";
                badge.style.background = "rgba(52, 199, 89, 0.2)";
                badge.style.color = "#34c759";
                chunk.style.opacity = "0.4";
                
                setTimeout(() => {
                    const next = chunk.nextElementSibling;
                    if (next) next.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 400);
            } else {
                badge.textContent = `متبقي: ${count}`;
            }
        }
    });

    loadData();

    // 6. Service Worker Registration
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js');
});
