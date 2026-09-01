(() => {
  "use strict";

  const STORAGE_KEY = "band-daw-settings-v1";

  // AudioContext is created lazily so simply opening the page does not
  // immediately create an audio device/context.
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  const audioSupported = Boolean(AudioCtx);

  const els = {
    fileInput: document.querySelector("#fileInput"),
    songName: document.querySelector("#songName"),
    status: document.querySelector("#status"),
    playBtn: document.querySelector("#playBtn"),
    pauseBtn: document.querySelector("#pauseBtn"),
    stopBtn: document.querySelector("#stopBtn"),
    currentTime: document.querySelector("#currentTime"),
    totalTime: document.querySelector("#totalTime"),
    seekBar: document.querySelector("#seekBar"),
    speedSelect: document.querySelector("#speedSelect"),
    setABtn: document.querySelector("#setABtn"),
    setBBtn: document.querySelector("#setBBtn"),
    clearLoopBtn: document.querySelector("#clearLoopBtn"),
    loopToggleBtn: document.querySelector("#loopToggleBtn"),
    loopReadout: document.querySelector("#loopReadout"),
    clearAllBtn: document.querySelector("#clearAllBtn"),
    stemCount: document.querySelector("#stemCount"),
    trackList: document.querySelector("#trackList"),
    audioSupport: document.querySelector("#audioSupport")
  };

  const state = {
    ctx: null,
    masterGain: null,
    tracks: [],
    isPlaying: false,
    playbackStartedAt: 0,
    playbackOffset: 0,
    rafId: null,
    speed: 1,
    loopEnabled: false,
    loopA: null,
    loopB: null,
    songDuration: 0,
    settings: loadSettings()
  };

  els.audioSupport.textContent = audioSupported
    ? "Web Audio API disponibile"
    : "Web Audio API non disponibile";

  if (!audioSupported) {
    setStatus("Questo browser non supporta la Web Audio API.", true);
    els.playBtn.disabled = true;
  }

  // ---------- Persistence ----------

  function loadSettings() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      return {
        tracks: saved.tracks || {},
        speed: Number.isFinite(saved.speed) ? saved.speed : 1,
        loopEnabled: Boolean(saved.loopEnabled),
        loopA: Number.isFinite(saved.loopA) ? saved.loopA : null,
        loopB: Number.isFinite(saved.loopB) ? saved.loopB : null
      };
    } catch {
      return {
        tracks: {},
        speed: 1,
        loopEnabled: false,
        loopA: null,
        loopB: null
      };
    }
  }

  function saveSettings() {
    const tracks = {};
    for (const track of state.tracks) {
      tracks[track.key] = {
        volume: track.volume,
        muted: track.muted,
        solo: track.solo
      };
    }

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        tracks,
        speed: state.speed,
        loopEnabled: state.loopEnabled,
        loopA: state.loopA,
        loopB: state.loopB
      }));
    } catch {
      // localStorage can be disabled/full; audio playback should still work.
    }
  }

  // ---------- Audio graph ----------

  async function ensureAudioContext() {
    if (!audioSupported) throw new Error("Web Audio API non supportata.");

    if (!state.ctx) {
      state.ctx = new AudioCtx();
      state.masterGain = state.ctx.createGain();
      state.masterGain.gain.value = 1;
      state.masterGain.connect(state.ctx.destination);
    }

    if (state.ctx.state === "suspended") {
      await state.ctx.resume();
    }
  }

  function createSourceForTrack(track, offset) {
    const source = state.ctx.createBufferSource();
    source.buffer = track.buffer;
    source.playbackRate.value = state.speed;
    source.connect(track.gain);
    source.start(0, clamp(offset, 0, track.buffer.duration));
    track.source = source;
  }

  function applyTrackGain(track) {
    if (!state.ctx || !track.gain) return;

    const anySolo = state.tracks.some(t => t.solo);
    const audibleBySolo = !anySolo || track.solo;
    const effective = (!track.muted && audibleBySolo) ? track.volume : 0;

    // A tiny smoothing avoids clicks when a button is pressed.
    const now = state.ctx.currentTime;
    track.gain.gain.cancelScheduledValues(now);
    track.gain.gain.setTargetAtTime(effective, now, 0.008);
  }

  function updateAllGains() {
    state.tracks.forEach(applyTrackGain);
  }

  // ---------- Playback clock ----------

  function getPosition() {
    if (!state.isPlaying || !state.ctx) return state.playbackOffset;
    return state.playbackOffset + (state.ctx.currentTime - state.playbackStartedAt) * state.speed;
  }

  function updateTransportUI() {
    const position = getPosition();
    const bounded = clamp(position, 0, state.songDuration);

    els.currentTime.textContent = formatTime(bounded);
    els.totalTime.textContent = formatTime(state.songDuration);
    els.seekBar.max = String(state.songDuration);
    els.seekBar.value = String(bounded);

    if (state.isPlaying) {
      handleEndAndLoop(bounded);
    }

    state.rafId = requestAnimationFrame(updateTransportUI);
  }

  function handleEndAndLoop(position) {
    if (state.loopEnabled && validLoop() && position >= state.loopB - 0.02) {
      restartAt(state.loopA);
      return;
    }

    if (position >= state.songDuration) {
      stop(false);
    }
  }

  function restartAt(offset) {
    if (!state.isPlaying) {
      state.playbackOffset = offset;
      return;
    }

    const target = clamp(offset, 0, state.songDuration);
    stopSourcesOnly();
    state.playbackOffset = target;
    state.playbackStartedAt = state.ctx.currentTime;

    for (const track of state.tracks) {
      if (target < track.buffer.duration - 0.0001) {
        createSourceForTrack(track, target);
      }
    }
  }

  async function play() {
    if (!state.tracks.length) {
      setStatus("Carica almeno uno stem prima di premere Play.", true);
      return;
    }

    try {
      await ensureAudioContext();

      if (state.playbackOffset >= state.songDuration) {
        state.playbackOffset = validLoop() && state.loopEnabled ? state.loopA : 0;
      }

      stopSourcesOnly();
      state.playbackStartedAt = state.ctx.currentTime;
      state.isPlaying = true;

      for (const track of state.tracks) {
        // A shorter stem naturally ends before the global maximum duration.
        if (state.playbackOffset < track.buffer.duration - 0.0001) {
          createSourceForTrack(track, state.playbackOffset);
        }
      }

      updateAllGains();
      setStatus("In riproduzione.");
    } catch (error) {
      console.error(error);
      setStatus(`Impossibile avviare l'audio: ${error.message}`, true);
    }
  }

  function pause() {
    if (!state.isPlaying) return;

    state.playbackOffset = clamp(getPosition(), 0, state.songDuration);
    stopSourcesOnly();
    state.isPlaying = false;
    setStatus("In pausa.");
  }

  function stop(announce = true) {
    stopSourcesOnly();
    state.isPlaying = false;
    state.playbackOffset = 0;
    els.seekBar.value = "0";
    if (announce) setStatus("Fermato.");
  }

  function stopSourcesOnly() {
    for (const track of state.tracks) {
      if (track.source) {
        try {
          track.source.stop();
        } catch {
          // Source may already have ended.
        }
        try {
          track.source.disconnect();
        } catch {}
        track.source = null;
      }
    }
  }

  // ---------- Loading ----------

  async function loadFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) {
      setStatus("Nessun file selezionato.", true);
      return;
    }

    if (!audioSupported) {
      setStatus("Il browser non supporta la Web Audio API.", true);
      return;
    }

    stop(false);
    destroyTracks();

    setStatus(`Caricamento di ${files.length} stem…`);

    try {
      await ensureAudioContext();

      const loaded = [];
      const errors = [];

      // Decode sequentially to reduce memory pressure when many stems are selected.
      for (let i = 0; i < files.length; i++) {
        const file = files[i];

        if (!looksLikeAudio(file)) {
          errors.push(`${file.name}: formato non riconosciuto`);
          continue;
        }

        setStatus(`Decodifica ${i + 1}/${files.length}: ${file.name}`);

        try {
          const arrayBuffer = await file.arrayBuffer();
          const buffer = await state.ctx.decodeAudioData(arrayBuffer);
          loaded.push({ file, buffer });
        } catch (error) {
          console.error(`Errore decodifica ${file.name}`, error);
          errors.push(`${file.name}: file corrotto o codec non supportato`);
        }
      }

      if (!loaded.length) {
        renderTracks();
        setStatus("Nessuno stem è stato caricato. Controlla formato e integrità dei file.", true);
        return;
      }

      const baseName = commonSongName(loaded.map(item => item.file.name));
      els.songName.textContent = baseName || "Brano senza nome";

      state.tracks = loaded.map(({ file, buffer }, index) => {
        const key = makeTrackKey(file);
        const saved = state.settings.tracks[key] || {};

        const gain = state.ctx.createGain();
        gain.connect(state.masterGain);

        const track = {
          id: cryptoSafeId(index),
          key,
          name: stripExtension(file.name),
          fileName: file.name,
          buffer,
          duration: buffer.duration,
          volume: Number.isFinite(saved.volume) ? clamp(saved.volume, 0, 1) : 1,
          muted: Boolean(saved.muted),
          solo: Boolean(saved.solo),
          gain,
          source: null,
          elements: null
        };

        return track;
      });

      state.songDuration = Math.max(...state.tracks.map(t => t.duration), 0);
      state.speed = normalizeSpeed(state.settings.speed);
      state.loopEnabled = Boolean(state.settings.loopEnabled);
      state.loopA = state.settings.loopA;
      state.loopB = state.settings.loopB;

      // Restore loop points only if they fit this song.
      if (!Number.isFinite(state.loopA) || state.loopA < 0 || state.loopA > state.songDuration) state.loopA = null;
      if (!Number.isFinite(state.loopB) || state.loopB < 0 || state.loopB > state.songDuration) state.loopB = null;
      if (!validLoop()) state.loopEnabled = false;

      els.speedSelect.value = String(state.speed);
      updateLoopUI();
      updateAllGains();
      renderTracks();
      updateSongStatus();

      saveSettings();

      if (errors.length) {
        setStatus(`${loaded.length} stem caricati. ${errors.length} file ignorati.`, true);
      }
    } catch (error) {
      console.error(error);
      setStatus(`Errore durante il caricamento: ${error.message}`, true);
    }
  }

  function destroyTracks() {
    stopSourcesOnly();

    for (const track of state.tracks) {
      try { track.gain.disconnect(); } catch {}
    }

    state.tracks = [];
    state.songDuration = 0;
    state.playbackOffset = 0;
    state.loopA = null;
    state.loopB = null;
    state.loopEnabled = false;
    renderTracks();
    updateLoopUI();
  }

  function looksLikeAudio(file) {
    if (file.type && file.type.startsWith("audio/")) return true;
    return /\.(wav|mp3|ogg|m4a|aac)$/i.test(file.name);
  }

  // ---------- Mixer UI ----------

  function renderTracks() {
    els.stemCount.textContent = `${state.tracks.length} ${state.tracks.length === 1 ? "traccia" : "tracce"}`;

    if (!state.tracks.length) {
      els.trackList.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">♫</div>
          <h3>Nessuno stem</h3>
          <p>Carica più file audio insieme. Ogni file diventerà automaticamente una traccia sincronizzata.</p>
        </div>`;
      return;
    }

    els.trackList.innerHTML = "";

    state.tracks.forEach((track, index) => {
      const row = document.createElement("article");
      row.className = "track";
      row.dataset.trackId = track.id;

      const main = document.createElement("div");
      main.className = "track-main";
      main.innerHTML = `
        <span class="track-name" title="${escapeHtml(track.name)}">${escapeHtml(track.name)}</span>
        <span class="track-duration">${formatTime(track.duration)}</span>`;

      const volumeCell = document.createElement("div");
      volumeCell.className = "volume-cell";

      const volume = document.createElement("input");
      volume.type = "range";
      volume.min = "0";
      volume.max = "1";
      volume.step = "0.01";
      volume.value = String(track.volume);
      volume.setAttribute("aria-label", `Volume ${track.name}`);

      const value = document.createElement("span");
      value.className = "volume-value";
      value.textContent = `${Math.round(track.volume * 100)}%`;

      volume.addEventListener("input", () => {
        track.volume = Number(volume.value);
        value.textContent = `${Math.round(track.volume * 100)}%`;
        applyTrackGain(track);
        saveSettings();
      });

      volumeCell.append(volume, value);

      const mute = document.createElement("button");
      mute.type = "button";
      mute.className = "button mute";
      mute.textContent = "Mute";
      mute.setAttribute("aria-pressed", String(track.muted));
      mute.addEventListener("click", () => {
        track.muted = !track.muted;
        mute.classList.toggle("active", track.muted);
        mute.setAttribute("aria-pressed", String(track.muted));
        applyTrackGain(track);
        saveSettings();
      });

      const solo = document.createElement("button");
      solo.type = "button";
      solo.className = "button solo";
      solo.textContent = "Solo";
      solo.setAttribute("aria-pressed", String(track.solo));
      solo.addEventListener("click", () => {
        track.solo = !track.solo;
        solo.classList.toggle("active", track.solo);
        solo.setAttribute("aria-pressed", String(track.solo));
        updateAllGains();
        updateSoloButtons();
        saveSettings();
      });

      row.append(main, volumeCell, mute, solo);
      els.trackList.append(row);

      track.elements = { row, volume, value, mute, solo };
      syncTrackButtons(track);
    });

    updateSoloButtons();
  }

  function syncTrackButtons(track) {
    if (!track.elements) return;
    track.elements.mute.classList.toggle("active", track.muted);
    track.elements.mute.setAttribute("aria-pressed", String(track.muted));
    track.elements.solo.classList.toggle("active", track.solo);
    track.elements.solo.setAttribute("aria-pressed", String(track.solo));
  }

  function updateSoloButtons() {
    for (const track of state.tracks) syncTrackButtons(track);
  }

  // ---------- Loop ----------

  function validLoop() {
    return Number.isFinite(state.loopA) &&
      Number.isFinite(state.loopB) &&
      state.loopA >= 0 &&
      state.loopB > state.loopA &&
      state.loopB <= state.songDuration;
  }

  function setA() {
    if (!state.songDuration) return;
    const position = clamp(getPosition(), 0, state.songDuration);

    // If B already exists, A must remain before B.
    if (Number.isFinite(state.loopB) && position >= state.loopB) {
      setStatus("Il punto A deve essere prima di B.", true);
      return;
    }

    state.loopA = position;
    if (!validLoop()) state.loopEnabled = false;
    updateLoopUI();
    saveSettings();
  }

  function setB() {
    if (!state.songDuration) return;
    const position = clamp(getPosition(), 0, state.songDuration);

    if (Number.isFinite(state.loopA) && position <= state.loopA) {
      setStatus("Il punto B deve essere dopo A.", true);
      return;
    }

    state.loopB = position;
    if (!validLoop()) state.loopEnabled = false;
    updateLoopUI();
    saveSettings();
  }

  function clearLoop() {
    state.loopA = null;
    state.loopB = null;
    state.loopEnabled = false;
    updateLoopUI();
    saveSettings();
  }

  function toggleLoop() {
    if (!validLoop()) {
      setStatus("Imposta prima A e B, con B dopo A.", true);
      return;
    }

    state.loopEnabled = !state.loopEnabled;
    updateLoopUI();
    saveSettings();
  }

  function updateLoopUI() {
    els.loopReadout.textContent =
      `A: ${Number.isFinite(state.loopA) ? formatTime(state.loopA) : "—"}   B: ${Number.isFinite(state.loopB) ? formatTime(state.loopB) : "—"}`;

    els.loopToggleBtn.textContent = state.loopEnabled ? "Loop ON" : "Loop OFF";
    els.loopToggleBtn.setAttribute("aria-pressed", String(state.loopEnabled));
  }

  // ---------- Seek / speed ----------

  function seekTo(position) {
    const target = clamp(Number(position), 0, state.songDuration);

    if (state.isPlaying) {
      restartAt(target);
    } else {
      state.playbackOffset = target;
    }

    els.seekBar.value = String(target);
  }

  function changeSpeed(value) {
    const newSpeed = normalizeSpeed(Number(value));
    const current = clamp(getPosition(), 0, state.songDuration);

    state.speed = newSpeed;

    if (state.isPlaying) {
      restartAt(current);
    }

    els.speedSelect.value = String(newSpeed);
    saveSettings();
  }

  // ---------- Helpers ----------

  function updateSongStatus() {
    const durations = state.tracks.map(t => t.duration);
    if (!durations.length) return;

    const shortest = Math.min(...durations);
    const longest = Math.max(...durations);
    const difference = longest - shortest;

    if (difference > 0.05) {
      setStatus(`${state.tracks.length} stem caricati · durata massima ${formatTime(longest)} · alcuni stem sono più corti.`);
    } else {
      setStatus(`${state.tracks.length} stem caricati · sincronizzazione comune · ${formatTime(longest)}.`);
    }
  }

  function setStatus(message, isError = false) {
    els.status.textContent = message;
    els.status.style.color = isError ? "#ff9c9f" : "";
  }

  function formatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
    const total = Math.floor(seconds);
    const minutes = Math.floor(total / 60);
    const secs = total % 60;
    return `${minutes}:${String(secs).padStart(2, "0")}`;
  }

  function stripExtension(name) {
    return name.replace(/\.[^/.]+$/, "");
  }

  function commonSongName(names) {
    if (!names.length) return "";
    const stripped = names.map(stripExtension);
    const first = stripped[0];

    // Common prefix is useful for files such as "Song - Guitar", "Song - Bass".
    let prefix = first;
    for (const name of stripped.slice(1)) {
      let i = 0;
      while (i < prefix.length && i < name.length && prefix[i].toLowerCase() === name[i].toLowerCase()) i++;
      prefix = prefix.slice(0, i);
    }

    prefix = prefix.replace(/[\s_-]+$/, "").trim();
    return prefix.length >= 2 ? prefix : "Brano";
  }

  function makeTrackKey(file) {
    // Name + size + lastModified avoids collisions while remaining local.
    return `${file.name}|${file.size}|${file.lastModified}`;
  }

  function cryptoSafeId(index) {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return `track-${Date.now()}-${index}-${Math.random().toString(36).slice(2)}`;
  }

  function normalizeSpeed(value) {
    const allowed = [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2];
    return allowed.includes(value) ? value : 1;
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function escapeHtml(value) {
    return value.replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[char]));
  }

  // ---------- Events ----------

  els.fileInput.addEventListener("change", event => {
    loadFiles(event.target.files);
    // Allows selecting the same files again later.
    event.target.value = "";
  });

  els.playBtn.addEventListener("click", play);
  els.pauseBtn.addEventListener("click", pause);
  els.stopBtn.addEventListener("click", () => stop(true));

  els.seekBar.addEventListener("input", event => {
    // Seeking while dragging intentionally restarts sources only on release
    // so many rapid AudioBufferSourceNode creations are avoided.
    els.currentTime.textContent = formatTime(Number(event.target.value));
  });

  els.seekBar.addEventListener("change", event => {
    seekTo(event.target.value);
  });

  els.speedSelect.addEventListener("change", event => changeSpeed(event.target.value));
  els.setABtn.addEventListener("click", setA);
  els.setBBtn.addEventListener("click", setB);
  els.clearLoopBtn.addEventListener("click", clearLoop);
  els.loopToggleBtn.addEventListener("click", toggleLoop);

  els.clearAllBtn.addEventListener("click", () => {
    if (!state.tracks.length) return;
    destroyTracks();
    els.songName.textContent = "Nessun brano caricato";
    els.currentTime.textContent = "0:00";
    els.totalTime.textContent = "0:00";
    els.seekBar.max = "0";
    els.seekBar.value = "0";
    setStatus("Stem rimossi dalla sessione.");
  });

  // Keep the visual clock alive even while stopped/paused.
  requestAnimationFrame(updateTransportUI);

  // Restore global preferences before any audio is loaded.
  state.speed = normalizeSpeed(state.settings.speed);
  state.loopEnabled = state.settings.loopEnabled;
  state.loopA = state.settings.loopA;
  state.loopB = state.settings.loopB;
  els.speedSelect.value = String(state.speed);
  updateLoopUI();

  // Persist before leaving; audio files themselves are never persisted.
  window.addEventListener("beforeunload", saveSettings);
})();
