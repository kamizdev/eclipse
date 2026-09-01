"use strict";

/*
=========================================================
 BAND DAW
 Web Audio API
=========================================================

 Struttura audio:

 AudioBufferSourceNode
          ↓
       GainNode
          ↓
      Master Gain
          ↓
 AudioContext.destination

Gli stem vengono sincronizzati usando
AudioContext.currentTime.

IMPORTANTE:
AudioBufferSourceNode è un nodo "one shot":
dopo start() non può essere riutilizzato.

Per questo Play / Seek / Loop / cambio velocità
ricreano i source node.
*/


/* =====================================================
   CONFIGURAZIONE
===================================================== */

const SONGS_FILE = "songs.json";

const STORAGE_KEY =
  "band-daw-settings";


/* =====================================================
   ELEMENTI HTML
===================================================== */

const pageTitle =
  document.querySelector("#pageTitle");

const status =
  document.querySelector("#status");

const library =
  document.querySelector("#library");

const mixer =
  document.querySelector("#mixer");

const songGrid =
  document.querySelector("#songGrid");

const songCount =
  document.querySelector("#songCount");

const refreshButton =
  document.querySelector("#refreshButton");

const backButton =
  document.querySelector("#backButton");

const playButton =
  document.querySelector("#playButton");

const pauseButton =
  document.querySelector("#pauseButton");

const stopButton =
  document.querySelector("#stopButton");

const currentTime =
  document.querySelector("#currentTime");

const totalTime =
  document.querySelector("#totalTime");

const seekBar =
  document.querySelector("#seekBar");

const speed =
  document.querySelector("#speed");

const setAButton =
  document.querySelector("#setA");

const setBButton =
  document.querySelector("#setB");

const clearLoopButton =
  document.querySelector("#clearLoop");

const loopButton =
  document.querySelector("#loopButton");

const loopInfo =
  document.querySelector("#loopInfo");

const tracksContainer =
  document.querySelector("#tracks");

const trackCount =
  document.querySelector("#trackCount");

const audioSupport =
  document.querySelector("#audioSupport");


/* =====================================================
   WEB AUDIO
===================================================== */

const AudioContextClass =
  window.AudioContext ||
  window.webkitAudioContext;


let audioContext = null;

let masterGain = null;


/* =====================================================
   STATO
===================================================== */

const state = {

  songs: [],

  currentSong: null,

  tracks: [],

  playing: false,

  /*
  posizione logica corrente in secondi
  */
  position: 0,

  /*
  momento AudioContext in cui è partito
  l'attuale playback
  */
  startedAt: 0,

  speed: 1,

  duration: 0,

  loopEnabled: false,

  loopA: null,

  loopB: null,

  settings:
    loadSettings()

};


/* =====================================================
   SUPPORTO AUDIO
===================================================== */

if (AudioContextClass) {

  audioSupport.textContent =
    "Web Audio API disponibile";

} else {

  audioSupport.textContent =
    "Web Audio API non disponibile";

  playButton.disabled = true;

}


/* =====================================================
   STATUS
===================================================== */

function setStatus(
  message,
  error = false
) {

  status.textContent =
    message;

  status.style.color =
    error
      ? "#ff9c9f"
      : "";

}


/* =====================================================
   CARICAMENTO CATALOGO
===================================================== */

async function loadSongs() {

  songGrid.innerHTML =
    `<div class="empty card">
      Caricamento archivio...
    </div>`;

  try {

    const response =
      await fetch(
        SONGS_FILE,
        {
          cache: "no-cache"
        }
      );

    if (!response.ok) {

      throw new Error(
        `HTTP ${response.status}`
      );

    }


    const data =
      await response.json();


    if (!Array.isArray(data.songs)) {

      throw new Error(
        "songs.json non contiene l'array songs."
      );

    }


    state.songs =
      data.songs;


    renderSongs();

    setStatus(
      "Seleziona un brano per aprire il mixer."
    );


  } catch (error) {

    console.error(error);

    songGrid.innerHTML = `
      <div class="empty card">

        <h3>
          Impossibile caricare l'archivio
        </h3>

        <p>
          ${escapeHtml(error.message)}
        </p>

        <p>
          Se stai usando file://,
          avvia un piccolo server locale.
        </p>

      </div>
    `;

    songCount.textContent =
      "Archivio non disponibile";

    setStatus(
      "Errore nel caricamento di songs.json.",
      true
    );

  }

}


/* =====================================================
   RENDER BRANI
===================================================== */

function renderSongs() {

  songCount.textContent =
    `${state.songs.length} ${
      state.songs.length === 1
        ? "brano"
        : "brani"
    }`;


  if (!state.songs.length) {

    songGrid.innerHTML =
      `<div class="empty card">
        Nessun brano pubblicato.
      </div>`;

    return;

  }


  songGrid.innerHTML = "";


  state.songs.forEach(song => {

    const card =
      document.createElement("article");


    card.className =
      "song-card card";


    const numberOfStems =
      Array.isArray(song.stems)
        ? song.stems.length
        : 0;


    card.innerHTML = `

      <div>

        <div class="song-icon">
          ♫
        </div>

        <div class="song-title">
          ${escapeHtml(
            song.title || song.id
          )}
        </div>

        <div class="song-description">
          ${numberOfStems}
          ${numberOfStems === 1
            ? "stem"
            : "stem"}

          ${
            song.description
              ? " · " +
                escapeHtml(
                  song.description
                )
              : ""
          }

        </div>

      </div>


      <button
        class="button primary song-open"
        type="button">

        Apri mixer

      </button>

    `;


    card
      .querySelector(".song-open")
      .addEventListener(
        "click",
        event => {

          event.stopPropagation();

          openSong(song);

        }
      );


    card.addEventListener(
      "click",
      () => openSong(song)
    );


    songGrid.appendChild(card);

  });

}


/* =====================================================
   APRI BRANO
===================================================== */

async function openSong(song) {

  /*
  Chiudiamo eventuale playback precedente.
  */

  stop(false);

  destroyTracks();


  state.currentSong =
    song;


  state.position =
    0;


  state.duration =
    0;


  state.loopA =
    null;

  state.loopB =
    null;

  state.loopEnabled =
    false;


  /*
  Recuperiamo le impostazioni salvate
  per questo specifico brano.
  */

  const saved =
    getSongSettings(song.id);


  state.speed =
    normalizeSpeed(
      saved.speed ?? 1
    );


  speed.value =
    String(state.speed);


  showMixer();


  pageTitle.textContent =
    song.title || song.id;


  setStatus(
    `Caricamento di ${
      song.stems.length
    } stem...`
  );


  try {

    await ensureAudioContext();


    const loadedTracks = [];


    const errors = [];


    /*
    Carichiamo uno stem alla volta.
    In questo modo evitiamo picchi enormi
    di memoria quando ci sono molti WAV.
    */

    for (
      let i = 0;
      i < song.stems.length;
      i++
    ) {

      const stem =
        song.stems[i];


      const name =
        stem.name ||
        stem.file ||
        `Stem ${i + 1}`;


      setStatus(
        `Caricamento ${i + 1}/${song.stems.length}: ${name}`
      );


      try {

        const url =
          getStemURL(
            song,
            stem.file
          );


        const response =
          await fetch(url);


        if (!response.ok) {

          throw new Error(
            `HTTP ${response.status}`
          );

        }


        const arrayBuffer =
          await response.arrayBuffer();


        /*
        Conversione del file audio
        in AudioBuffer.
        */

        const audioBuffer =
          await audioContext
            .decodeAudioData(
              arrayBuffer
            );


        loadedTracks.push({

          stem,

          audioBuffer

        });


      } catch (error) {

        console.error(
          "Errore stem:",
          name,
          error
        );


        errors.push(name);

      }

    }


    if (!loadedTracks.length) {

      renderTracks();

      setStatus(
        "Nessuno stem è stato caricato.",
        true
      );

      return;

    }


    /*
    Creiamo le tracce reali.
    */

    state.tracks =
      loadedTracks.map(
        ({ stem, audioBuffer }) => {

          const key =
            createTrackKey(
              song.id,
              stem
            );


          const savedTrack =
            saved.tracks?.[key] || {};


          const gain =
            audioContext.createGain();


          gain.connect(
            masterGain
          );


          return {

            id:
              createID(),

            key,

            name:
              stem.name ||
              removeExtension(
                stem.file
              ),

            buffer:
              audioBuffer,

            duration:
              audioBuffer.duration,

            volume:
              Number.isFinite(
                savedTrack.volume
              )
                ? clamp(
                    savedTrack.volume,
                    0,
                    1
                  )
                : 1,

            muted:
              Boolean(
                savedTrack.muted
              ),

            solo:
              Boolean(
                savedTrack.solo
              ),

            gain,

            source: null,

            html: null

          };

        }
      );


    /*
    La durata totale è quella dello
    stem più lungo.
    */

    state.duration =
      Math.max(
        ...state.tracks.map(
          track =>
            track.duration
        )
      );


    /*
    Recuperiamo loop salvato.
    */

    state.loopA =
      Number.isFinite(
        saved.loopA
      )
        ? saved.loopA
        : null;


    state.loopB =
      Number.isFinite(
        saved.loopB
      )
        ? saved.loopB
        : null;


    state.loopEnabled =
      Boolean(
        saved.loopEnabled
      );


    /*
    Verifica che i valori salvati
    siano ancora validi.
    */

    if (
      !Number.isFinite(state.loopA) ||
      state.loopA < 0 ||
      state.loopA > state.duration
    ) {

      state.loopA = null;

    }


    if (
      !Number.isFinite(state.loopB) ||
      state.loopB < 0 ||
      state.loopB > state.duration
    ) {

      state.loopB = null;

    }


    if (!validLoop()) {

      state.loopEnabled =
        false;

    }


    updateLoopUI();

    updateAllGains();

    renderTracks();

    updateTransportUI();

    saveSettings();


    if (errors.length) {

      setStatus(
        `${loadedTracks.length} stem caricati. ` +
        `${errors.length} non disponibili.`,
        true
      );

    } else {

      setStatus(
        `${loadedTracks.length} stem pronti.`
      );

    }


  } catch (error) {

    console.error(error);

    setStatus(
      `Errore: ${error.message}`,
      true
    );

  }

}


/* =====================================================
   URL DEGLI STEM
===================================================== */

function getStemURL(
  song,
  filename
) {

  /*
  Se "folder" esiste nel JSON,
  utilizziamo quello.

  Altrimenti:

  songs/<id>/
  */

  const folder =
    song.folder ||
    `songs/${song.id}`;


  return (
    folder.replace(/\/+$/, "") +
    "/" +
    filename.replace(/^\/+/, "")
  );

}


/* =====================================================
   AUDIO CONTEXT
===================================================== */

async function ensureAudioContext() {

  if (!AudioContextClass) {

    throw new Error(
      "Web Audio API non supportata."
    );

  }


  if (!audioContext) {

    audioContext =
      new AudioContextClass();


    masterGain =
      audioContext.createGain();


    masterGain.gain.value =
      1;


    masterGain.connect(
      audioContext.destination
    );

  }


  /*
  Alcuni browser iniziano con
  AudioContext "suspended".
  */

  if (
    audioContext.state ===
    "suspended"
  ) {

    await audioContext.resume();

  }

}


/* =====================================================
   CREAZIONE SOURCE NODE
===================================================== */

function createSource(
  track,
  offset
) {

  /*
  IMPORTANTE:

  AudioBufferSourceNode è one-shot.

  Ogni chiamata crea un nuovo nodo.
  */

  const source =
    audioContext
      .createBufferSource();


  source.buffer =
    track.buffer;


  source.playbackRate.value =
    state.speed;


  source.connect(
    track.gain
  );


  source.start(
    0,
    clamp(
      offset,
      0,
      track.duration
    )
  );


  track.source =
    source;

}


/* =====================================================
   GAIN / MUTE / SOLO
===================================================== */

function updateTrackGain(
  track
) {

  if (!audioContext) {
    return;
  }


  /*
  Esiste almeno un Solo?
  */

  const hasSolo =
    state.tracks.some(
      track =>
        track.solo
    );


  /*
  Regola:

  nessun Solo:
      tutti udibili

  almeno un Solo:
      solo i Solo

  Mute:
      sempre priorità
  */

  const allowedBySolo =
    !hasSolo ||
    track.solo;


  const effectiveVolume =
    !track.muted &&
    allowedBySolo
      ? track.volume
      : 0;


  const now =
    audioContext.currentTime;


  /*
  Piccolo ramp per evitare click.
  */

  track.gain.gain
    .cancelScheduledValues(now);


  track.gain.gain
    .setTargetAtTime(
      effectiveVolume,
      now,
      0.008
    );

}


function updateAllGains() {

  state.tracks.forEach(
    updateTrackGain
  );

}


/* =====================================================
   POSIZIONE ATTUALE
===================================================== */

function getCurrentPosition() {

  if (
    !state.playing ||
    !audioContext
  ) {

    return state.position;

  }


  return (
    state.position +
    (
      audioContext.currentTime -
      state.startedAt
    ) *
    state.speed
  );

}


/* =====================================================
   PLAY
===================================================== */

async function play() {

  if (!state.tracks.length) {

    setStatus(
      "Nessuno stem disponibile.",
      true
    );

    return;

  }


  try {

    await ensureAudioContext();


    /*
    Se siamo arrivati alla fine,
    ripartiamo da zero oppure da A.
    */

    if (
      state.position >=
      state.duration
    ) {

      state.position =
        state.loopEnabled &&
        validLoop()
          ? state.loopA
          : 0;

    }


    stopSources();


    /*
    Questo è il riferimento comune
    per TUTTI gli stem.
    */

    state.startedAt =
      audioContext.currentTime;


    state.playing =
      true;


    /*
    Tutti i source vengono creati
    con lo stesso offset logico.
    */

    state.tracks.forEach(
      track => {

        if (
          state.position <
          track.duration
        ) {

          createSource(
            track,
            state.position
          );

        }

      }
    );


    updateAllGains();

    setStatus(
      "In riproduzione."
    );


  } catch (error) {

    console.error(error);

    setStatus(
      `Impossibile riprodurre: ${error.message}`,
      true
    );

  }

}


/* =====================================================
   PAUSE
===================================================== */

function pause() {

  if (!state.playing) {
    return;
  }


  /*
  Prima salviamo la posizione
  usando il clock audio.
  */

  state.position =
    clamp(
      getCurrentPosition(),
      0,
      state.duration
    );


  stopSources();


  state.playing =
    false;


  setStatus(
    "In pausa."
  );


  saveSettings();

}


/* =====================================================
   STOP
===================================================== */

function stop(
  showMessage = true
) {

  stopSources();


  state.playing =
    false;


  state.position =
    0;


  if (showMessage) {

    setStatus(
      "Fermato."
    );

  }

}


/* =====================================================
   FERMA SOLO I SOURCE
===================================================== */

function stopSources() {

  state.tracks.forEach(
    track => {

      if (!track.source) {
        return;
      }


      try {

        track.source.stop();

      } catch (_) {}


      try {

        track.source.disconnect();

      } catch (_) {}


      track.source =
        null;

    }
  );

}


/* =====================================================
   SEEK / RESTART
===================================================== */

function seekTo(
  newPosition
) {

  const target =
    clamp(
      Number(newPosition),
      0,
      state.duration
    );


  /*
  Se non stiamo suonando basta
  cambiare la posizione logica.
  */

  if (!state.playing) {

    state.position =
      target;

    return;

  }


  /*
  Se stiamo suonando ricreiamo
  tutti i source.
  */

  stopSources();


  state.position =
    target;


  state.startedAt =
    audioContext.currentTime;


  state.tracks.forEach(
    track => {

      if (
        target <
        track.duration
      ) {

        createSource(
          track,
          target
        );

      }

    }
  );


  updateAllGains();

}


/* =====================================================
   LOOP
===================================================== */

function validLoop() {

  return (
    Number.isFinite(state.loopA) &&
    Number.isFinite(state.loopB) &&
    state.loopA >= 0 &&
    state.loopB > state.loopA &&
    state.loopB <= state.duration
  );

}


function setA() {

  if (!state.duration) {
    return;
  }


  const position =
    clamp(
      getCurrentPosition(),
      0,
      state.duration
    );


  if (
    Number.isFinite(state.loopB) &&
    position >= state.loopB
  ) {

    setStatus(
      "A deve essere prima di B.",
      true
    );

    return;

  }


  state.loopA =
    position;


  if (!validLoop()) {

    state.loopEnabled =
      false;

  }


  updateLoopUI();

  saveSettings();

}


function setB() {

  if (!state.duration) {
    return;
  }


  const position =
    clamp(
      getCurrentPosition(),
      0,
      state.duration
    );


  if (
    Number.isFinite(state.loopA) &&
    position <= state.loopA
  ) {

    setStatus(
      "B deve essere dopo A.",
      true
    );

    return;

  }


  state.loopB =
    position;


  if (!validLoop()) {

    state.loopEnabled =
      false;

  }


  updateLoopUI();

  saveSettings();

}


function clearLoop() {

  state.loopA =
    null;

  state.loopB =
    null;

  state.loopEnabled =
    false;


  updateLoopUI();

  saveSettings();

}


function toggleLoop() {

  if (!validLoop()) {

    setStatus(
      "Imposta prima A e B.",
      true
    );

    return;

  }


  state.loopEnabled =
    !state.loopEnabled;


  updateLoopUI();

  saveSettings();

}


function updateLoopUI() {

  loopInfo.textContent =
    `A: ${
      Number.isFinite(state.loopA)
        ? formatTime(state.loopA)
        : "—"
    }   B: ${
      Number.isFinite(state.loopB)
        ? formatTime(state.loopB)
        : "—"
    }`;


  loopButton.textContent =
  