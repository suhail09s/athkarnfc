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

    // Auto-route on load
    switchTab(defaultTab);

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

        // Skip logic (10 seconds)
        fwdBtn.addEventListener('click', () => audio.currentTime = Math.min(audio.duration, audio.currentTime + 10));
        backBtn.addEventListener('click', () => audio.currentTime = Math.max(0, audio.currentTime - 10));

        // Progress & Text Sync Scaffold
        audio.addEventListener('timeupdate', () => {
            const pct = (audio.currentTime / audio.duration) * 100 || 0;
            fill.style.width = pct + '%';
            timeEl.textContent = formatTime(audio.currentTime);

            /* Scaffold: Text Sync Logic */
            // Since we lack precise timestamps in the JSON, we simulate active sync for the first item
            // while audio is playing. Once JSON has `startTime` and `endTime`, this logic would filter chunks.
            const chunks = textContainer.querySelectorAll('.prayer-chunk');
            if(chunks.length > 0) {
                chunks.forEach(c => c.classList.remove('active-sync'));
                if(!audio.paused && audio.currentTime > 0) {
                    chunks[0].classList.add('active-sync'); // Dummy sync highlight
                }
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
    // Maps physical device buttons (lock screen, steering wheel) to the active audio
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
    async function loadData() {
        // Hardcoded Travel Prayer
        const travelText = "الله أكبر، الله أكبر، الله أكبر، سُبْحانَ الَّذِي سَخَّرَ لَنَا هَذَا وَمَا كُنَّا لَهُ مُقْرِنِينَ، وَإِنَّا إِلَى رَبِّنَا لَمُنقَلِبُونَ. اللَّهُمَّ إِنَّا نَسْأَلُكَ فِي سَفَرِنَا هَذَا الْبِرَّ وَالتَّقْوَى، وَمِنَ الْعَمَلِ مَا تَرْضَى. اللَّهُمَّ هَوِّنْ عَلَيْنَا سَفَرَنَا هَذَا، وَاطْوِ عَنَّا بُعْدَهُ. اللَّهُمَّ أَنْتَ الصَّاحِبُ فِي السَّفَرِ، وَالْخَلِيفَةُ فِي الأَهْلِ. اللَّهُمَّ إِنِّي أَعُوذُ بِكَ مِنْ وَعْثَاءِ السَّفَرِ، وَكَآبَةِ الْمَنْظَرِ، وَسُوءِ الْمُنْقَلَبِ فِي الْمَالِ وَالأَهْلِ.";
        document.getElementById('travel-text').innerHTML = `<div class="prayer-chunk">${travelText}</div>`;

        // Load JSON Data
        try {
            const evRes = await fetch('./assets/athkar/evening.json');
            const evData = await evRes.json();
            
            let htmlE = '';
            let htmlMFallback = '';
            
            evData.forEach(page => {
                page.dhikr_items.forEach(item => {
                    const badge = `<div class="repeat-badge" style="font-size:16px; color:#888; margin-top:10px;">${item.repeat_count}</div>`;
                    htmlE += `<div class="prayer-chunk">${item.text} ${badge}</div>`;
                    let mText = item.text.replace(/أَمْسَيْنَا/g, 'أَصْبَحْنَا').replace(/أَمْسَى/g, 'أَصْبَحَ').replace(/المساء/g, 'الصباح');
                    htmlMFallback += `<div class="prayer-chunk">${mText} ${badge}</div>`;
                });
            });
            document.getElementById('evening-text').innerHTML = htmlE;
            
            try {
                const mRes = await fetch('./assets/athkar/morning.json');
                const t = await mRes.text();
                if(t.trim()) {
                    const mData = JSON.parse(t);
                    let mReal = '';
                    mData.forEach(p => p.dhikr_items.forEach(i => {
                        const badge = `<div class="repeat-badge" style="font-size:16px; color:#888; margin-top:10px;">${i.repeat_count}</div>`;
                        mReal += `<div class="prayer-chunk">${i.text} ${badge}</div>`;
                    }));
                    document.getElementById('morning-text').innerHTML = mReal;
                } else { throw new Error('empty'); }
            } catch(e) {
                document.getElementById('morning-text').innerHTML = htmlMFallback;
            }

        } catch (e) { console.error(e); }
    }
    
    loadData();

    // 6. Service Worker Registration
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js');
});
