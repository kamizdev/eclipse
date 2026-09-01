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
// CARICA STEM
// =====================================================

async function loadStems(song) {

    tracksElement.innerHTML =
        `<div class="loading">
            Caricamento stem...
        </div>`;

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

    for (const stem of data) {

        const {
            data: publicData
        } = supabaseClient
            .storage
            .from("stems")
            .getPublicUrl(stem.file_path);

        const response =
            await fetch(publicData.publicUrl);

        const arrayBuffer =
            await response.arrayBuffer();

        const audioBuffer =
            await decodeAudio(arrayBuffer);

        tracks.push({

            id: stem.id,

            name: stem.name,

            buffer: audioBuffer,

            gain: 1,

            muted: false,

            solo: false,

            source: null,

            gainNode: null

        });

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

        maxDuration =
            Math.max(
                maxDuration,
                track.buffer.duration
            );

    });

    currentSong.duration =
        maxDuration;

    totalTimeElement.textContent =
        formatTime(maxDuration);

    seekBar.max =
        maxDuration;

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

        let volume =
            track.gain;

        if (track.muted) {

            volume = 0;

        }

        if (
            hasSolo &&
            !track.solo
        ) {

            volume = 0;

        }

        if (track.gainNode) {

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

    if (!tracks.length)
        return;

    if (!audioContext)
        await decodeAudio(
            tracks[0].buffer
        );

    if (
        audioContext.state ===
        "suspended"
    ) {

        await audioContext.resume();

    }

    if (isPlaying)
        return;

    createSources();

    startedAt =
        audioContext.currentTime -
        pausedAt / playbackSpeed;

    isPlaying = true;

    updateAnimation();

}


// =====================================================
// CREA SOURCE
// =====================================================

function createSources() {

    tracks.forEach(track => {

        const source =
            audioContext.createBufferSource();

        const gainNode =
            audioContext.createGain();

        source.buffer =
            track.buffer;

        source.playbackRate.value =
            playbackSpeed;

        source.connect(gainNode);

        gainNode.connect(masterGain);

        track.source =
            source;

        track.gainNode =
            gainNode;

    });

    updateMix();

    tracks.forEach(track => {

        track.source.start(
            0,
            pausedAt
        );

    });

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

    updateUI();

}


// =====================================================
// STOP SOURCES
// =====================================================

function stopSources() {

    tracks.forEach(track => {

        if (track.source) {

            try {
                track.source.stop();
            } catch {}

        }

        track.source = null;
        track.gainNode = null;

    });

}


// =====================================================
// POSIZIONE
// =====================================================

function getCurrentPosition() {

    if (!isPlaying)
        return pausedAt;

    return (
        audioContext.currentTime -
        startedAt
    ) * playbackSpeed;

}


// =====================================================
// SEEK
// =====================================================

function seek(position) {

    const wasPlaying =
        isPlaying;

    if (wasPlaying)
        stopSources();

    pausedAt =
        Math.max(
            0,
            Math.min(
                position,
                currentSong.duration
            )
        );

    if (wasPlaying) {

        createSources();

        startedAt =
            audioContext.currentTime -
            pausedAt / playbackSpeed;

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

        const position =
            getCurrentPosition();

        playbackSpeed =
            newSpeed;

        if (isPlaying) {

            stopSources();

            pausedAt =
                position;

            createSources();

            startedAt =
                audioContext.currentTime -
                pausedAt / playbackSpeed;

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
