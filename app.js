// =====================================================
// BAND DAW - PUBLIC PLAYER
// =====================================================

let audioContext = null;
let masterGain = null;

let currentSong = null;
let tracks = [];

let isPlaying = false;
let startedAt = 0;
let pausedAt = 0;

let playbackSpeed = 1;

let animationFrame = null;

let loopEnabled = false;
let loopA = null;
let loopB = null;

let audioReadyCount = 0;
let audioTotalCount = 0;
let audioLoadToken = 0;

function ensureAudioContext() {
    if (!audioContext) {
        audioContext = new AudioContext();
        masterGain = audioContext.createGain();
        masterGain.connect(audioContext.destination);
    }
}

function createMediaTrackAudio(track) {
    ensureAudioContext();

    if (track.audioElement) {
        return;
    }

    const audio = new Audio();
    audio.preload = "auto";
    audio.src = track.url;
    audio.crossOrigin = "anonymous";
    audio.playsInline = true;
    audio.playbackRate = playbackSpeed;

    const source =
        audioContext.createMediaElementSource(audio);

    const gainNode =
        audioContext.createGain();

    source.connect(gainNode);
    gainNode.connect(masterGain);

    track.audioElement = audio;
    track.mediaSource = source;
    track.gainNode = gainNode;

    audio.addEventListener("loadedmetadata", () => {
        if (audio.duration && Number.isFinite(audio.duration)) {
            calculateDuration();
        }
    });

    audio.addEventListener("canplay", () => {
        if (track._loadToken !== audioLoadToken) return;

        track.ready = true;
        audioReadyCount++;

        const loading = document.querySelector(
            "#tracks .loading"
        );

        if (loading) {
            loading.textContent =
                `Caricamento audio: ${audioReadyCount} / ${audioTotalCount}`;
        }
    });

    audio.addEventListener("error", () => {
        console.error(
            "Errore caricamento audio:",
            track.name,
            audio.error
        );
    });
}




// =====================================================
// ELEMENTI
// =====================================================

const librarySection = document.getElementById("librarySection");
const mixerSection = document.getElementById("mixerSection");

const songList = document.getElementById("songList");
const tracksElement = document.getElementById("tracks");

const playBtn = document.getElementById("playBtn");
const pauseBtn = document.getElementById("pauseBtn");
const stopBtn = document.getElementById("stopBtn");

const seekBar = document.getElementById("seekBar");

const currentTimeElement =
    document.getElementById("currentTime");

const totalTimeElement =
    document.getElementById("totalTime");

const speedSelect =
    document.getElementById("speed");


// =====================================================
// CARICA ARCHIVIO
// =====================================================

async function loadSongs() {

    songList.innerHTML =
        `<div class="loading">Caricamento...</div>`;

    const { data, error } =
        await supabaseClient
            .from("songs")
            .select("*")
            .order("created_at", {
                ascending: false
            });

    if (error) {

        console.error(error);

        songList.innerHTML =
            `<div class="error">
                Errore caricamento archivio.
            </div>`;

        return;
    }

    if (!data.length) {

        songList.innerHTML =
            `<div class="empty">
                Nessun brano presente.
            </div>`;

        return;
    }

    songList.innerHTML = "";

    data.forEach(song => {

        const card =
            document.createElement("button");

        card.className = "song-card";

        card.innerHTML = `
            <strong>${escapeHtml(song.title)}</strong>
            <span>${escapeHtml(song.artist || "")}</span>
        `;

        card.addEventListener(
            "click",
            () => openSong(song)
        );

        songList.appendChild(card);

    });
}


// =====================================================
// APRI BRANO
// =====================================================

async function openSong(song) {

    currentSong = song;

    librarySection.classList.add("hidden");
    mixerSection.classList.remove("hidden");

    document.getElementById("songTitle").textContent =
        song.title;

    document.getElementById("songArtist").textContent =
        song.artist || "";

    await loadStems(song);

}


// =====================================================
// AUDIO CACHE
// =====================================================

const AUDIO_CACHE_DB = "band-daw-cache";
const AUDIO_CACHE_STORE = "audio";
const AUDIO_CACHE_VERSION = 1;


function openAudioCache() {

    return new Promise(
        (resolve, reject) => {

            const request =
                indexedDB.open(
                    AUDIO_CACHE_DB,
                    AUDIO_CACHE_VERSION
                );


            request.onupgradeneeded =
                event => {

                    const db =
                        event.target.result;

                    if (
                        !db.objectStoreNames.contains(
                            AUDIO_CACHE_STORE
                        )
                    ) {

                        db.createObjectStore(
                            AUDIO_CACHE_STORE
                        );

                    }

                };


            request.onsuccess =
                () => {

                    resolve(
                        request.result
                    );

                };


            request.onerror =
                () => {

                    reject(
                        request.error
                    );

                };

        }
    );

}


async function getCachedAudio(key) {

    try {

        const db =
            await openAudioCache();


        return await new Promise(
            resolve => {

                const transaction =
                    db.transaction(
                        AUDIO_CACHE_STORE,
                        "readonly"
                    );


                const store =
                    transaction.objectStore(
                        AUDIO_CACHE_STORE
                    );


                const request =
                    store.get(key);


                request.onsuccess =
                    () => {

                        resolve(
                            request.result || null
                        );

                    };


                request.onerror =
                    () => {

                        resolve(null);

                    };

            }
        );

    } catch (error) {

        console.warn(
            "Cache audio non disponibile:",
            error
        );

        return null;

    }

}


async function setCachedAudio(
    key,
    arrayBuffer
) {

    try {

        const db =
            await openAudioCache();


        await new Promise(
            resolve => {

                const transaction =
                    db.transaction(
                        AUDIO_CACHE_STORE,
                        "readwrite"
                    );


                const store =
                    transaction.objectStore(
                        AUDIO_CACHE_STORE
                    );


                const request =
                    store.put(
                        arrayBuffer,
                        key
                    );


                request.onsuccess =
                    () => resolve();


                request.onerror =
                    () => resolve();

            }
        );

    } catch (error) {

        console.warn(
            "Impossibile salvare audio in cache:",
            error
        );

    }

}


// =====================================================
// CARICA STEM
// =====================================================

async function loadStems(song) {
    tracksElement.innerHTML =
        `<div class="loading">Caricamento stem...</div>`;

    const { data, error } =
        await supabaseClient
            .from("stems")
            .select("*")
            .eq("song_id", song.id)
            .order("created_at", {
                ascending: true
            });

    if (error) {
        console.error(error);

        tracksElement.innerHTML =
            `<div class="error">
                Errore caricamento stem.
            </div>`;

        return;
    }

    tracks = [];

    if (!data || data.length === 0) {
        tracksElement.innerHTML =
            `<div class="empty">
                Nessuno stem presente.
            </div>`;
        return;
    }

    audioLoadToken++;
    audioReadyCount = 0;
    audioTotalCount = data.length;

    // IMPORTANT:
    // We only fetch metadata here. We do NOT fetch the MP3
    // with fetch(), do NOT create an ArrayBuffer, and do NOT
    // call decodeAudioData().
    tracks = data.map(stem => ({
        id: stem.id,
        name: stem.name,
        url: window.eclipseR2AudioUrl(stem.file_path),
        gain: 1,
        muted: false,
        solo: false,
        source: null,
        mediaSource: null,
        gainNode: null,
        audioElement: null,
        ready: false,
        _loadToken: audioLoadToken
    }));

    renderTracks();
    calculateDuration();

    // Start browser-side buffering/streaming.
    // This does not wait for complete files.
    tracks.forEach(track => {
        try {
            createMediaTrackAudio(track);
        } catch (error) {
            console.error(
                "Errore inizializzazione stem:",
                track.name,
                error
            );
        }
    });

    calculateDuration();
}


    async function loadSingleStem(stem) {

        // Gli audio non passano più da Supabase Storage.
        // Supabase resta il database; R2 serve i file audio.
        const publicUrl =
            window.eclipseR2AudioUrl(
                stem.file_path
            );


        const cacheKey =
            stem.file_path;


        let arrayBuffer =
            await getCachedAudio(
                cacheKey
            );


        if (!arrayBuffer) {

            const response =
                await fetch(
                    publicUrl,
                    {
                        cache: "force-cache"
                    }
                );


            if (!response.ok) {

                throw new Error(
                    `Errore HTTP ${response.status}`
                );

            }


            arrayBuffer =
                await response.arrayBuffer();


            await setCachedAudio(
                cacheKey,
                arrayBuffer
            );

        }


        const audioBuffer =
            await decodeAudio(
                arrayBuffer
            );


        return {

            id: stem.id,

            name: stem.name,

            buffer: audioBuffer,

            gain: 1,

            muted: false,

            solo: false,

            source: null,

            gainNode: null

        };

    }


    // Massimo 4 stem contemporaneamente.
    const maxConcurrent = 4;

    let completed = 0;


    tracksElement.innerHTML =
        `<div class="loading">
            Caricamento stem: 0 / ${data.length}
        </div>`;


    for (
        let start = 0;
        start < data.length;
        start += maxConcurrent
    ) {

        const batch =
            data.slice(
                start,
                start + maxConcurrent
            );


        const results =
            await Promise.all(

                batch.map(
                    async stem => {

                        try {

                            const track =
                                await loadSingleStem(
                                    stem
                                );


                            completed++;


                            tracksElement.innerHTML =
                                `<div class="loading">
                                    Caricamento stem:
                                    ${completed} / ${data.length}
                                </div>`;


                            return {
                                success: true,
                                track
                            };

                        } catch (error) {

                            console.error(
                                "Errore caricamento stem:",
                                stem.name,
                                error
                            );


                            completed++;


                            return {
                                success: false,
                                track: null
                            };

                        }

                    }
                )

            );


        for (const result of results) {

            if (result.success) {

                tracks.push(
                    result.track
                );

            }

        }

    }


    if (tracks.length === 0) {

        tracksElement.innerHTML =
            `<div class="error">
                Impossibile caricare gli stem.
            </div>`;

        return;
    }


    renderTracks();

    calculateDuration();

}


// =====================================================
// DECODE AUDIO
// =====================================================

async function decodeAudio(arrayBuffer) {

    if (!audioContext) {

        audioContext =
            new AudioContext();

        masterGain =
            audioContext.createGain();

        masterGain.connect(
            audioContext.destination
        );
    }

    return await audioContext.decodeAudioData(
        arrayBuffer.slice(0)
    );
}


// =====================================================
// DURATA
// =====================================================

function calculateDuration() {
    let maxDuration = 0;

    tracks.forEach(track => {
        const duration =
            track.audioElement?.duration;

        if (
            Number.isFinite(duration) &&
            duration > maxDuration
        ) {
            maxDuration = duration;
        }
    });

    if (!maxDuration) {
        // Metadata may not have arrived yet.
        return;
    }

    currentSong.duration = maxDuration;

    totalTimeElement.textContent =
        formatTime(maxDuration);

    seekBar.max = maxDuration;
}


// =====================================================
// RENDER TRACKS
// =====================================================

function renderTracks() {

    tracksElement.innerHTML = "";

    tracks.forEach((track, index) => {

        const element =
            document.createElement("div");

        element.className =
            "track";

        element.innerHTML = `

            <div class="track-name">
                ${escapeHtml(track.name)}
            </div>

            <div class="track-controls">

                <button
                    class="mute"
                    data-index="${index}">
                    M
                </button>

                <button
                    class="solo"
                    data-index="${index}">
                    S
                </button>

            </div>

            <input
                class="volume"
                data-index="${index}"
                type="range"
                min="0"
                max="1"
                step="0.01"
                value="${track.gain}"
            >

            <span class="volume-value">
                ${Math.round(track.gain * 100)}%
            </span>
        `;

        tracksElement.appendChild(element);

    });


    tracksElement
        .querySelectorAll(".volume")
        .forEach(input => {

            input.addEventListener(
                "input",
                event => {

                    const index =
                        Number(event.target.dataset.index);

                    tracks[index].gain =
                        Number(event.target.value);

                    event.target
                        .closest(".track")
                        .querySelector(".volume-value")
                        .textContent =
                        Math.round(
                            tracks[index].gain * 100
                        ) + "%";

                    updateMix();

                }
            );

        });


    tracksElement
        .querySelectorAll(".mute")
        .forEach(button => {

            button.addEventListener(
                "click",
                () => {

                    const index =
                        Number(button.dataset.index);

                    tracks[index].muted =
                        !tracks[index].muted;

                    button.classList.toggle(
                        "active",
                        tracks[index].muted
                    );

                    updateMix();

                }
            );

        });


    tracksElement
        .querySelectorAll(".solo")
        .forEach(button => {

            button.addEventListener(
                "click",
                () => {

                    const index =
                        Number(button.dataset.index);

                    tracks[index].solo =
                        !tracks[index].solo;

                    button.classList.toggle(
                        "active",
                        tracks[index].solo
                    );

                    updateMix();

                }
            );

        });

}


// =====================================================
// MIX
// =====================================================

function updateMix() {
    const hasSolo =
        tracks.some(track => track.solo);

    tracks.forEach(track => {
        let volume = track.gain;

        if (track.muted) {
            volume = 0;
        }

        if (hasSolo && !track.solo) {
            volume = 0;
        }

        if (track.gainNode && audioContext) {
            track.gainNode.gain.setValueAtTime(
                volume,
                audioContext.currentTime
            );
        }
    });
}


// =====================================================
// PLAY
// =====================================================

async function play() {
    if (!tracks.length) return;

    ensureAudioContext();

    if (audioContext.state === "suspended") {
        await audioContext.resume();
    }

    if (isPlaying) return;

    const position = pausedAt || 0;

    tracks.forEach(track => {
        if (!track.audioElement) return;

        track.audioElement.currentTime = position;
        track.audioElement.playbackRate =
            playbackSpeed;
    });

    updateMix();

    const promises = tracks
        .filter(track => track.audioElement)
        .map(track =>
            track.audioElement.play().catch(error => {
                console.warn(
                    "Play non riuscito:",
                    track.name,
                    error
                );
            })
        );

    await Promise.all(promises);

    startedAt =
        audioContext.currentTime -
        position / playbackSpeed;

    isPlaying = true;
    updateAnimation();
}


// =====================================================
// CREA SOURCE
// =====================================================

function createSources() {
    ensureAudioContext();

    tracks.forEach(track => {
        if (!track.audioElement) return;

        track.audioElement.playbackRate =
            playbackSpeed;

        track.audioElement.currentTime =
            Math.max(
                0,
                Math.min(
                    pausedAt,
                    Number.isFinite(track.audioElement.duration)
                        ? track.audioElement.duration
                        : pausedAt
                )
            );
    });

    updateMix();
}



// =====================================================
// PAUSE
// =====================================================

function pause() {

    if (!isPlaying)
        return;

    pausedAt =
        getCurrentPosition();

    stopSources();

    isPlaying = false;

}


// =====================================================
// STOP
// =====================================================

function stop() {
    stopSources();

    isPlaying = false;
    pausedAt = 0;

    tracks.forEach(track => {
        if (track.audioElement) {
            try {
                track.audioElement.currentTime = 0;
            } catch {}
        }
    });

    updateUI();
}



// =====================================================
// STOP SOURCES
// =====================================================

function stopSources() {
    tracks.forEach(track => {
        if (!track.audioElement) return;

        track.audioElement.pause();

        // Do not destroy the MediaElementAudioSourceNode.
        // It can only be connected to one AudioContext source.
        track.source = null;
    });
}



// =====================================================
// POSIZIONE
// =====================================================

function getCurrentPosition() {
    if (!tracks.length) return pausedAt;

    const activeAudio =
        tracks.find(
            track => track.audioElement
        )?.audioElement;

    if (!activeAudio) return pausedAt;

    return activeAudio.currentTime || pausedAt;
}



// =====================================================
// SEEK
// =====================================================

function seek(position) {
    const wasPlaying = isPlaying;

    pausedAt =
        Math.max(
            0,
            Math.min(
                position,
                currentSong?.duration || position
            )
        );

    tracks.forEach(track => {
        const audio = track.audioElement;
        if (!audio) return;

        if (
            Number.isFinite(audio.duration) &&
            audio.duration > 0
        ) {
            audio.currentTime =
                Math.min(
                    pausedAt,
                    audio.duration
                );
        } else {
            audio.currentTime = pausedAt;
        }
    });

    if (wasPlaying) {
        startedAt =
            audioContext.currentTime -
            pausedAt / playbackSpeed;

        tracks.forEach(track => {
            if (
                track.audioElement &&
                track.audioElement.paused
            ) {
                track.audioElement.play().catch(() => {});
            }
        });
    }

    updateUI();
}




// =====================================================
// LOOP
// =====================================================

function checkLoop(position) {

    if (
        loopEnabled &&
        loopA !== null &&
        loopB !== null &&
        loopB > loopA &&
        position >= loopB
    ) {

        seek(loopA);

    }

}


// =====================================================
// ANIMAZIONE
// =====================================================

function updateAnimation() {

    updateUI();

    if (isPlaying) {

        const position =
            getCurrentPosition();

        if (
            position >= currentSong.duration
        ) {

            stop();

            return;

        }

        checkLoop(position);

        animationFrame =
            requestAnimationFrame(
                updateAnimation
            );

    }

}


// =====================================================
// UI
// =====================================================

function updateUI() {

    const position =
        Math.min(
            getCurrentPosition(),
            currentSong?.duration || 0
        );

    currentTimeElement.textContent =
        formatTime(position);

    seekBar.value =
        position;

}


// =====================================================
// EVENTI
// =====================================================

playBtn.onclick =
    play;

pauseBtn.onclick =
    pause;

stopBtn.onclick =
    stop;


seekBar.addEventListener(
    "input",
    event => {

        seek(
            Number(event.target.value)
        );

    }
);


speedSelect.addEventListener(
    "change",
    event => {
        const newSpeed =
            Number(event.target.value);

        playbackSpeed = newSpeed;

        tracks.forEach(track => {
            if (track.audioElement) {
                track.audioElement.playbackRate =
                    playbackSpeed;
            }
        });

        if (isPlaying && audioContext) {
            startedAt =
                audioContext.currentTime -
                getCurrentPosition() /
                    playbackSpeed;
        }
    }
);


// =====================================================
// LOOP BUTTONS
// =====================================================

document.getElementById("setA")
    .onclick = () => {

        loopA =
            getCurrentPosition();

        document.getElementById("pointA")
            .textContent =
            formatTime(loopA);

    };


document.getElementById("setB")
    .onclick = () => {

        loopB =
            getCurrentPosition();

        document.getElementById("pointB")
            .textContent =
            formatTime(loopB);

    };


document.getElementById("clearLoop")
    .onclick = () => {

        loopA = null;
        loopB = null;

        document.getElementById("pointA")
            .textContent = "--:--";

        document.getElementById("pointB")
            .textContent = "--:--";

    };


document.getElementById("loopToggle")
    .onclick = event => {

        loopEnabled =
            !loopEnabled;

        event.target.textContent =
            loopEnabled
                ? "LOOP ON"
                : "LOOP OFF";

        event.target.classList.toggle(
            "loop-on",
            loopEnabled
        );

        event.target.classList.toggle(
            "loop-off",
            !loopEnabled
        );

    };


// =====================================================
// INDIETRO
// =====================================================

document.getElementById("backLibrary")
    .onclick = () => {

        stop();

        mixerSection.classList.add("hidden");
        librarySection.classList.remove("hidden");

    };


// =====================================================
// UTILITY
// =====================================================

function formatTime(seconds) {

    if (!Number.isFinite(seconds))
        return "00:00";

    const min =
        Math.floor(seconds / 60);

    const sec =
        Math.floor(seconds % 60);

    return (
        String(min).padStart(2, "0") +
        ":" +
        String(sec).padStart(2, "0")
    );

}


function escapeHtml(value) {

    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");

}


// =====================================================
// INIT
// =====================================================

document.getElementById("refreshSongs")
    .onclick =
    loadSongs;

loadSongs();
