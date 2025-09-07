 <script>
        const contentDisplay = document.getElementById('content-display');
        const tabButtons = document.querySelectorAll('.tab-button');
        const videoPlayerContainer = document.getElementById('video-player-container');
        const shakaVideoContainer = document.getElementById('shaka-video-player').parentNode;
        const shakaVideoElement = document.getElementById('shaka-video-player');
        const hlsVideoElement = document.getElementById('hls-video-player');
        
        const qualitySelector = document.getElementById('quality-selector');

        let shakaPlayerInstance = null;
        let hlsPlayer = null;
        let currentLoadedChannels = [];
        let isShakaUINotReady = true;

        // N Stream elements
        const nStreamPlayerSection = document.getElementById('n-stream-player-section');
        const streamTypeSelect = document.getElementById('stream-type-select');
        const streamUrlInput = document.getElementById('stream-url-input');
        const drmControls = document.getElementById('drm-controls');
        const clearkeyIdInput = document.getElementById('clearkey-id-input');
        const clearkeyKeyInput = document.getElementById('clearkey-key-input');
        const drmLicenseUrlInput = document.getElementById('drm-license-url-input');
        const playNStreamBtn = document.getElementById('play-n-stream-btn');

        // GitHub Raw JSON URLs
        const tabDataUrls = {
            'zee-network': 'https://raw.githubusercontent.com/greenhck/batball/main/zee.json',
            'fancode': 'https://raw.githubusercontent.com/Odfinity/live-events/refs/heads/main/fancode/data.json',
            'pirates-tv': 'https://raw.githubusercontent.com/FunctionError/PiratesTv/main/combined_playlist.m3u',
            'jio-tv': 'https://raw.githubusercontent.com/rocket12-18/dineshbhai/refs/heads/main/jd.m3u',
            'others': 'https://raw.githubusercontent.com/FunctionError/PiratesTv/main/combine_playlist.m3u',
            'jiostar': 'https://raw.githubusercontent.com/alex4528/m3u/refs/heads/main/jtv.m3u',
            'n-stream': null,
        };
        
        // Initialize Shaka Player UI once it's loaded
        document.addEventListener('shaka-ui-loaded', () => {
            console.log('Shaka UI Loaded, initializing Shaka Player instance...');
            shaka.polyfill.installAll(); // Install polyfills once

            const ui = shakaVideoElement['ui'];
            const controls = ui.getControls();
            shakaPlayerInstance = controls.getPlayer();

            shakaPlayerInstance.addEventListener('error', onErrorEvent);
            shakaPlayerInstance.configure({
                streaming: {
                    bufferingGoal: 1,
                    rebufferingGoal: 0.5
                }
            });
            isShakaUINotReady = false;
            console.log('Shaka Player instance initialized via UI.');
        });

        // Channel display functions
        function displayChannels(channels) {
            currentLoadedChannels = channels;
            contentDisplay.innerHTML = '';
            if (channels.length === 0) {
                contentDisplay.innerHTML = `<p class="text-center text-gray-400 p-4">कोई चैनल/मैच नहीं मिला।</p>`;
                return;
            }
            channels.forEach(channel => {
                const channelCard = document.createElement('div');
                channelCard.classList.add('channel-card', 'bg-gray-800', 'rounded-lg', 'overflow-hidden', 'shadow-lg', 'cursor-pointer', 'transform', 'transition-transform', 'duration-200', 'hover:-translate-y-1', 'hover:shadow-2xl');
                channelCard.innerHTML = `
                    <img src="${channel.logo || 'https://placehold.co/200x150/2d3748/a0aec0?text=No+Image'}" alt="${channel.name}" class="w-full h-32 sm:h-40 object-cover">
                    <h3 class="p-2 sm:p-3 text-sm sm:text-base font-semibold text-center truncate">${channel.name}</h3>
                `;
                channelCard.addEventListener('click', () => playChannel(channel));
                contentDisplay.appendChild(channelCard);
            });
        }

        async function parseM3U(m3uContent) {
            const lines = m3uContent.split('\n').map(line => line.trim()).filter(line => line.length > 0);
            const channels = [];
            let currentChannel = {};

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];

                if (line.startsWith('#EXTINF:')) {
                    currentChannel = {
                        name: 'Unknown Channel',
                        logo: '',
                        mpd: null,
                        m3u8: null,
                        clearkey: null,
                        cookie: null
                    };

                    const nameMatch = line.match(/,(.+)$/);
                    currentChannel.name = nameMatch ? nameMatch[1].trim() : 'Unknown Channel';
                    const logoMatch = line.match(/tvg-logo="([^"]+)"/);
                    currentChannel.logo = logoMatch ? logoMatch[1] : '';

                    // Parse subsequent lines for metadata until a URL is found
                    let urlFound = false;
                    let j = i + 1;
                    while (j < lines.length && !urlFound) {
                        const subLine = lines[j];
                        if (subLine.startsWith('#KODIPROP:inputstream.adaptive.license_key=')) {
                            const clearkeyMatch = subLine.match(/license_key=([^:]+):([a-f0-9]+)/);
                            if (clearkeyMatch) {
                                currentChannel.clearkey = {
                                    keyId: clearkeyMatch[1],
                                    key: clearkeyMatch[2]
                                };
                            }
                        } else if (subLine.startsWith('#EXTHTTP:')) {
                            const cookieMatch = subLine.match(/"cookie":"([^"]+)"/);
                            if (cookieMatch) {
                                currentChannel.cookie = cookieMatch[1];
                            }
                        } else if (!subLine.startsWith('#')) {
                            // This is the stream URL
                            if (subLine.includes('.mpd')) {
                                // Clean up URL and remove extra parameters
                                const mpdUrl = subLine.split('&xxx=')[0];
                                currentChannel.mpd = mpdUrl;
                            } else if (subLine.includes('.m3u8')) {
                                currentChannel.m3u8 = subLine;
                            }
                            urlFound = true;
                            i = j; // Advance main loop
                        }
                        j++;
                    }
                    if (currentChannel.mpd || currentChannel.m3u8) {
                        channels.push(currentChannel);
                    }
                }
            }
            return channels;
        }

        async function loadAndDisplayChannels(tabName) {
            // Hide all special sections by default
            nStreamPlayerSection.classList.add('hidden');
            nStreamPlayerSection.classList.remove('flex');
            contentDisplay.style.display = 'grid'; // Show grid for regular tabs
            videoPlayerContainer.classList.add('hidden');
            videoPlayerContainer.classList.remove('flex');

            if (tabName === 'n-stream') {
                contentDisplay.style.display = 'none';
                nStreamPlayerSection.classList.remove('hidden');
                nStreamPlayerSection.classList.add('flex');
                return;
            }

            // Update loading message with spinner
            contentDisplay.innerHTML = `
                <div class="flex items-center justify-center p-4">
                    <div class="loading-spinner mr-3"></div>
                    <p class="text-center text-gray-400 font-semibold">Loading channels...</p>
                </div>
            `;

            const dataUrl = tabDataUrls[tabName];

            if (!dataUrl || dataUrl.includes('YOUR_')) {
                contentDisplay.innerHTML = `<p class="text-center text-red-400 p-4 font-semibold">कृपया **${tabName}** टैब के लिए GitHub Raw JSON/M3U URL को कोड में अपडेट करें।</p>`;
                return;
            }

            try {
                const response = await fetch(dataUrl);
                if (!response.ok) {
                    throw new Error(`HTTP त्रुटि! स्थिति: ${response.status}`);
                }
                let channelsToDisplay = [];

                if (tabName === 'zee-network') {
                    const data = await response.json();
                    if (data && data.channels) {
                        channelsToDisplay = data.channels;
                    } else {
                        console.warn('Zee Network JSON में "channels" key नहीं मिला:', data);
                        contentDisplay.innerHTML = `<p class="text-center text-gray-400 p-4">Zee Network के लिए अमान्य डेटा संरचना।</p>`;
                        return;
                    }
                } else if (tabName === 'fancode') {
                    const data = await response.json();
                    if (data && data.matches) {
                        channelsToDisplay = data.matches.map(match => ({
                            name: `${match.event_name}: ${match.match_name}`,
                            logo: match.src || 'https://placehold.co/200x150/2d3748/a0aec0?text=No+Image',
                            mpd: match.dai_url,
                            m3u8: match.adfree_url,
                            clearkey: null
                        }));
                    } else {
                        console.warn('FanCode JSON में "matches" key नहीं मिला:', data);
                        contentDisplay.innerHTML = `<p class="text-center text-gray-400 p-4">FanCode के लिए अमान्य डेटा संरचना।</p>`;
                        return;
                    }
                } else {
                    const m3uContent = await response.text();
                    channelsToDisplay = await parseM3U(m3uContent);
                }

                displayChannels(channelsToDisplay);

            } catch (error) {
                console.error('डेटा लोड करने में त्रुटि:', error);
                contentDisplay.innerHTML = `<p class="text-center text-gray-400 p-4">सामग्री लोड करने में त्रुटि हुई। कृपया बाद में पुनः प्रयास करें।</p>`;
            }
        }

        // Player functions
        function resetPlayers() {
            shakaVideoContainer.style.display = 'none';
            hlsVideoElement.style.display = 'none';

            if (shakaPlayerInstance) {
                shakaPlayerInstance.unload().catch(e => console.warn("Shaka Player unload failed:", e));
            }
            if (hlsPlayer) {
                hlsPlayer.destroy();
                hlsPlayer = null;
            }

            shakaVideoElement.pause();
            shakaVideoElement.removeAttribute('src');
            shakaVideoElement.load();

            hlsVideoElement.pause();
            hlsVideoElement.removeAttribute('src');
            hlsVideoElement.load();

            qualitySelector.innerHTML = '<option value="auto">स्वचालित</option>';
            qualitySelector.classList.add('hidden');
        }

        async function playChannel(channel) {
            videoPlayerContainer.classList.remove('hidden');
            videoPlayerContainer.classList.add('flex');
            resetPlayers();

            shaka.polyfill.installAll();

            try {
                // Prioritize HLS streams for Fancode matches
                if (channel.m3u8) {
                    shakaVideoContainer.style.display = 'none';
                    hlsVideoElement.style.display = 'block';

                    if (Hls.isSupported()) {
                        hlsPlayer = new Hls();
                        hlsPlayer.loadSource(channel.m3u8);
                        hlsPlayer.attachMedia(hlsVideoElement);
                        hlsPlayer.on(Hls.Events.MANIFEST_PARSED, function() {
                            console.log('HLS मैनिफेस्ट पार्स हो गया है (hls.js)!');
                            hlsVideoElement.play().catch(e => console.warn('HLS video play failed:', e));
                        });
                        hlsPlayer.on(Hls.Events.ERROR, function(event, data) {
                            console.error('HLS.js त्रुटि:', data);
                            if (data.fatal) {
                                switch(data.type) {
                                case Hls.ErrorTypes.NETWORK_ERROR:
                                    console.error("fatal network error, trying to recover");
                                    hlsPlayer.startLoad();
                                    break;
                                case Hls.ErrorTypes.MEDIA_ERROR:
                                    console.error("fatal media error, trying to recover");
                                    hlsPlayer.recoverMediaError();
                                    break;
                                default:
                                    resetPlayers();
                                    alert('HLS वीडियो चलाने में एक गंभीर त्रुटि हुई।');
                                    closePlayer();
                                    break;
                                }
                            }
                        });
                        console.log('HLS M3U8 URL लोड हो रहा है (hls.js):', channel.m3u8);
                    } else if (hlsVideoElement.canPlayType('application/vnd.apple.mpegurl')) {
                        hlsVideoElement.src = channel.m3u8;
                        hlsVideoElement.addEventListener('loadedmetadata', () => hlsVideoElement.play().catch(e => console.warn('Native HLS play failed:', e)));
                        console.log('ब्राउज़र के मूल HLS समर्थन का उपयोग किया जा रहा है।');
                    } else {
                        alert('आपका ब्राउज़र HLS वीडियो चलाने का समर्थन नहीं करता है।');
                        closePlayer();
                    }
                } else if (channel.mpd) {
                    shakaVideoContainer.style.display = 'block';
                    hlsVideoElement.style.display = 'none';

                    if (!shaka.Player.isBrowserSupported()) {
                        console.error('ब्राउज़र Shaka Player को सपोर्ट नहीं करता है!');
                        // Using a simple alert for now as per the original code
                        alert('आपका ब्राउज़र DRM-संरक्षित वीडियो चलाने के लिए आवश्यक सुविधाओं का समर्थन नहीं करता है।');
                        closePlayer();
                        return;
                    }
                    if (isShakaUINotReady || !shakaPlayerInstance) {
                        console.warn('Shaka UI not yet fully ready, or instance not acquired. Retrying acquisition.');
                        const ui = shakaVideoElement['ui'];
                        if (ui) {
                            const controls = ui.getControls();
                            shakaPlayerInstance = controls.getPlayer();
                            shakaPlayerInstance.addEventListener('error', onErrorEvent);
                            shakaPlayerInstance.configure({
                                streaming: { bufferingGoal: 1, rebufferingGoal: 0.5 }
                            });
                            isShakaUINotReady = false;
                        } else {
                            console.error("Shaka UI object is still undefined even after retry.");
                            alert('Shaka Player आरंभ करने में त्रुटि हुई।');
                            closePlayer();
                            return;
                        }
                    }

                    // Handle Cookie header for some DRM streams
                    shakaPlayerInstance.getNetworkingEngine().registerRequestFilter(async (type, request) => {
                        if (channel.cookie) {
                            request.headers['Cookie'] = channel.cookie;
                        }
                    });

                    if (channel.clearkey && channel.clearkey.keyId && channel.clearkey.key) {
                        const keyId = channel.clearkey.keyId.replace(/-/g, '');
                        const key = channel.clearkey.key.replace(/-/g, '');
                        shakaPlayerInstance.configure({
                            drm: { clearKeys: { [keyId]: key } }
                        });
                        console.log('ClearKey DRM कॉन्फ़िगर किया गया (Shaka Player)।');
                    } else if (channel.drm && channel.drm.licenseUrl) {
                        const servers = {};
                        if (channel.drm.type === 'widevine') {
                            servers['com.widevine.alpha'] = channel.drm.licenseUrl;
                        }
                        shakaPlayerInstance.configure({
                            drm: {
                                servers: servers,
                                advanced: {}
                            }
                        });
                        console.log(`${channel.drm.type || 'Generic'} DRM कॉन्फ़िगर किया गया (Shaka Player) लाइसेंस URL: ${channel.drm.licenseUrl}`);
                    } else {
                        shakaPlayerInstance.configure({ drm: {} });
                        console.log('इस DASH चैनल के लिए कोई ClearKey या DRM कॉन्फ़िगरेशन नहीं है।');
                    }

                    console.log('DASH MPD URL लोड हो रहा है (Shaka Player):', channel.mpd);
                    await shakaPlayerInstance.load(channel.mpd);
                    console.log('वीडियो लोड हो गया है (Shaka Player)!');
                } else {
                    alert('इस चैनल के लिए कोई मान्य स्ट्रीम URL (MPD या M3U8) नहीं मिला।');
                    closePlayer();
                }
            } catch (e) {
                onError(e);
            }
        }

        // Shaka Player error handler
        function onErrorEvent(event) {
            onError(event.detail);
        }

        function onError(error) {
            console.error('त्रुटि:', error);
            alert('वीडियो चलाने में त्रुटि हुई। कृपया बाद में पुनः प्रयास करें।');
            closePlayer();
        }

        function closePlayer() {
            videoPlayerContainer.classList.add('hidden');
            videoPlayerContainer.classList.remove('flex');
            resetPlayers();
        }

        // Event listeners
        
        tabButtons.forEach(button => {
            button.addEventListener('click', (event) => {
                tabButtons.forEach(btn => {
                    btn.classList.remove('active');
                    btn.classList.remove('bg-gray-600', 'hover:bg-gray-500', 'shadow-inner');
                    btn.classList.add('bg-gray-700', 'hover:bg-gray-600', 'shadow-md');
                });
                event.target.classList.add('active', 'bg-gray-600', 'hover:bg-gray-500', 'shadow-inner');
                event.target.classList.remove('bg-gray-700', 'hover:bg-gray-600');

                const tab = event.target.dataset.tab;
                localStorage.setItem('activeTab', tab);
                loadAndDisplayChannels(tab);
            });
        });

        const searchBar = document.querySelector('.search-bar');
        searchBar.addEventListener('input', (event) => {
            const searchTerm = event.target.value.toLowerCase();
            if (nStreamPlayerSection.classList.contains('flex')) {
                return;
            }
            const filteredChannels = currentLoadedChannels.filter(channel =>
                channel.name.toLowerCase().includes(searchTerm)
            );
            displayChannels(filteredChannels);
        });

        // N Stream specific logic
        streamTypeSelect.addEventListener('change', () => {
            if (streamTypeSelect.value === 'DASH') {
                drmControls.classList.remove('hidden');
                drmControls.classList.add('flex');
            } else {
                drmControls.classList.add('hidden');
                drmControls.classList.remove('flex');
                clearkeyIdInput.value = '';
                clearkeyKeyInput.value = '';
                drmLicenseUrlInput.value = '';
            }
        });

        playNStreamBtn.addEventListener('click', () => {
            const streamUrl = streamUrlInput.value.trim();
            const streamType = streamTypeSelect.value;
            let channelConfig = {
                name: 'N Stream Custom Playback',
                logo: '',
                mpd: null,
                m3u8: null,
                clearkey: null,
                drm: null
            };

            if (!streamUrl) {
                alert('कृपया स्ट्रीम URL डालें।');
                return;
            }

            if (streamType === 'HLS') {
                channelConfig.m3u8 = streamUrl;
            } else if (streamType === 'DASH') {
                channelConfig.mpd = streamUrl;
                const clearkeyId = clearkeyIdInput.value.trim();
                const clearkeyKey = clearkeyKeyInput.value.trim();
                const drmLicenseUrl = drmLicenseUrlInput.value.trim();

                if (clearkeyId && clearkeyKey) {
                    channelConfig.clearkey = {
                        keyId: clearkeyId,
                        key: clearkeyKey
                    };
                }
                if (drmLicenseUrl) {
                    channelConfig.drm = {
                        type: 'widevine',
                        licenseUrl: drmLicenseUrl
                    };
                }
            }
            playChannel(channelConfig);
        });

        document.addEventListener('DOMContentLoaded', () => {
            const savedTab = localStorage.getItem('activeTab');
            let tabToActivate = savedTab || 'jio-tv'; // Default to jio-tv

            const urlParams = new URLSearchParams(window.location.search);
            const nParam = urlParams.get('n');

            if (nParam) {
                tabToActivate = 'n-stream';
                let streamUrl = nParam;
                let clearkeyId = '';
                let clearkeyKey = '';
                let drmLicenseUrl = '';
                let streamType = 'HLS';

                const dashClearKeyPattern = /^([^|]+)\|drmScheme=clearkey&drmLicense=([^:]+):(.+)$/;
                const matchClearKey = nParam.match(dashClearKeyPattern);

                if (matchClearKey) {
                    streamType = 'DASH';
                    streamUrl = matchClearKey[1];
                    clearkeyId = matchClearKey[2];
                    clearkeyKey = matchClearKey[3];
                    drmLicenseUrl = '';
                }
                else if (streamUrl.includes('.mpd')) {
                    streamType = 'DASH';
                    clearkeyId = '';
                    clearkeyKey = '';
                    drmLicenseUrl = '';
                } else if (streamUrl.includes('.m3u8')) {
                    streamType = 'HLS';
                    clearkeyId = '';
                    clearkeyKey = '';
                    drmLicenseUrl = '';
                }

                const nStreamTabButton = document.querySelector('.tab-button[data-tab="n-stream"]');
                if (nStreamTabButton) {
                    nStreamTabButton.click();
                    setTimeout(() => {
                        streamUrlInput.value = streamUrl;
                        streamTypeSelect.value = streamType;
                        const changeEvent = new Event('change');
                        streamTypeSelect.dispatchEvent(changeEvent);
                        if (streamType === 'DASH') {
                            clearkeyIdInput.value = clearkeyId;
                            clearkeyKeyInput.value = clearkeyKey;
                            drmLicenseUrlInput.value = drmLicenseUrl;
                        } else {
                            drmControls.classList.add('hidden');
                            drmControls.classList.remove('flex');
                            clearkeyIdInput.value = '';
                            clearkeyKeyInput.value = '';
                            drmLicenseUrlInput.value = '';
                        }
                        playNStreamBtn.click();
                    }, 100);
                }
            } else {
                const defaultButton = document.querySelector(`.tab-button[data-tab="${tabToActivate}"]`);
                if (defaultButton) {
                    defaultButton.click();
                } else {
                    document.querySelector('.tab-button[data-tab="jio-tv"]').click();
                }
            }
        });
    </script>
