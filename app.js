(() => {
  const $ = (id) => document.getElementById(id);
  const left = $('leftVideo'), right = $('rightVideo'), videos = [left, right];
  const stage = $('stage'), splitter = $('splitter'), progress = $('progress');
  const playButton = $('playButton'), muteButton = $('muteButton'), volume = $('volume');
  const currentTime = $('currentTime'), duration = $('duration');
  const states = [
    { video:left, file:$('leftFile'), name:$('leftFileName'), empty:$('leftEmpty'), fit:$('leftFit'), url:null },
    { video:right, file:$('rightFile'), name:$('rightFileName'), empty:$('rightEmpty'), fit:$('rightFit'), url:null }
  ];
  let dragging = false, seeking = false, lastSync = 0, controlsTimer;
  const loaded = () => videos.filter((video) => video.src);

  function showControls() {
    stage.classList.add('controls-visible');
    clearTimeout(controlsTimer);

    controlsTimer = setTimeout(() => {
      if (!dragging) stage.classList.remove('controls-visible');
    }, 2500);
  }

  const leader = () => left.src ? left : right;

  const fmt = (seconds) => {
    if (!Number.isFinite(seconds)) return '0:00';

    const h = Math.floor(seconds / 3600);
    const m = Math.floor(seconds % 3600 / 60);
    const s = Math.floor(seconds % 60);

    return h
    ? `${h}:${String(m)
      .padStart(2,'0')}:${String(s)
      .padStart(2,'0')}`
    : `${m}:${String(s)
      .padStart(2,'0')}`;
  };

  const setPausedUI = () => {
    const isPlaying = loaded().some((v) => !v.paused && !v.ended);

    stage.classList.toggle('paused', !isPlaying);
    playButton.classList.toggle('is-playing', isPlaying);
    playButton.setAttribute('aria-label', isPlaying ? 'Pausar' : 'Reproduzir');
  };

  const updateTimeline = () => {
    const v = leader();
    const max = v.duration || 0;

    if (!seeking) progress.value = max ? Math.round((v.currentTime / max) * 1000) : 0;

    currentTime.textContent = fmt(v.currentTime);
    duration.textContent = fmt(max);

    setPausedUI();
  };

  const align = (time, force = false) => {
    const now = performance.now();

    if (!force && now - lastSync < 700) return;

    lastSync = now;

    const reference = leader();

    loaded().forEach((v) => {
      if (v === reference) return;

      // Se o vídeo já terminou nesse ponto, mantém parado.
      if (Number.isFinite(v.duration) && time >= v.duration) {
        v.pause();
        return;
      }

      // Se estamos dentro da duração, sincroniza normalmente.
      if (Math.abs(v.currentTime - time) > .18) {
        v.currentTime = time;
      }

      // Se o vídeo principal está reproduzindo,
      // garante que o secundário também esteja.
      if (!reference.paused && v.paused) {
        v.play().catch(() => {});
      }
    });
  };

  async function playAll() {
    const clips = loaded();

    if (!clips.length) return;

    const reference = leader();

    align(reference.currentTime, true);

    try {
      await Promise.all(
        clips.map(
          (v) => v.play()
        )
      );
    } catch { /* browser may require another direct interaction */ }

    setPausedUI();
  }

  function pauseAll() {
    loaded().forEach((v) => v.pause());
    setPausedUI();
  }

  function seekBy(seconds) {
    const v = leader();

    if (!v.src) return;

    const time = Math.max(0, Math.min(v.duration || Infinity, v.currentTime + seconds));

    loaded().forEach((clip) => { clip.currentTime = time; });
    updateTimeline();
  }

  function loadFile(state, file) {
    if (!file) return;

    if (state.url) URL.revokeObjectURL(state.url);

    state.url = URL.createObjectURL(file);
    state.video.src = state.url;
    state.video.load();
    state.name.textContent = file.name;
    state.empty.hidden = true;
    state.video.muted = true;
    state.video.volume = Number(volume.value);
    state.video.addEventListener('loadedmetadata', updateTimeline, { once:true });
  }

  states.forEach((state) => {
    state.file.addEventListener('change', () => loadFile(state, state.file.files[0]));

    state.fit.addEventListener('change', () => {
      state.video.style.objectFit = state.fit.value;
    });
  });

  videos.forEach((video) => {
    video.addEventListener('timeupdate', () => {
      if (video === leader()) {
        align(video.currentTime);
        updateTimeline();
      }
    });

    video.addEventListener('play', setPausedUI);
    video.addEventListener('pause', setPausedUI);
    
    video.addEventListener('ended', () => {
      video.pause();
      setPausedUI();
    });

    video.addEventListener('seeking', () => {
      if (video === leader()) align(video.currentTime, true);
    });
  });

  playButton.addEventListener(
    'click',
    () => loaded().some((v) => !v.paused) ? pauseAll() : playAll()
  );

  $('backButton').addEventListener('click', () => seekBy(-5));
  $('forwardButton').addEventListener('click', () => seekBy(5));

  progress.addEventListener('input', () => {
    seeking = true;

    const v = leader();

    if (!v.duration) return;

    const time = v.duration * (Number(progress.value) / 1000);

    currentTime.textContent = fmt(time);
  });

  progress.addEventListener('change', () => {
    const v = leader();

    if (v.duration) {
      const time = v.duration * (Number(progress.value) / 1000);

      loaded().forEach((clip) => clip.currentTime = time);
    }

    seeking = false;
  });

  volume.addEventListener('input', () => {
    const value = Number(volume.value);

    loaded().forEach((v) => {
      v.volume = value;
      v.muted = false;
    });

    muteButton.textContent = value ? '🔊' : '🔇';
  });

  muteButton.addEventListener('click', () => {
    const muted = !loaded().every((v) => v.muted);

    loaded().forEach((v) => v.muted = muted);

    muteButton.textContent = muted ? '🔇' : '🔊';
  });

  $('fullscreenButton').addEventListener('click', async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen(); else await $('stage').requestFullscreen();
    } catch {}
  });

  function setSplit(clientX) {
    const rect = stage.getBoundingClientRect();
    const value = Math.max(15, Math.min(85, ((clientX - rect.left) / rect.width) * 100));

    stage.style.setProperty('--split', `${value}%`);
    splitter.setAttribute('aria-valuenow', Math.round(value));
  }

  splitter.addEventListener('pointerdown', (event) => {
    dragging = true;

    showControls();
    splitter.setPointerCapture(event.pointerId);
    setSplit(event.clientX);
  });

  splitter.addEventListener('pointermove', (event) => {
    if (dragging) setSplit(event.clientX);
  });

  splitter.addEventListener('pointerup', () => {
    dragging = false;

    showControls();
  });

  splitter.addEventListener('keydown', (event) => {
    if (!['ArrowLeft','ArrowRight'].includes(event.key)) return;

    event.preventDefault();
    showControls();

    const current = Number(splitter.getAttribute('aria-valuenow'));
    const next = current + (event.key === 'ArrowLeft' ? -2 : 2);
    const rect = stage.getBoundingClientRect();

    setSplit(rect.left + rect.width * next / 100);
  });

  stage.addEventListener('pointermove', showControls);
  stage.addEventListener('pointerdown', showControls);
  stage.addEventListener('pointerenter', showControls);

  document.addEventListener('keydown', (event) => {
    showControls();

    const tag = document.activeElement.tagName;

    if (
      event.defaultPrevented
      || ['INPUT','SELECT','BUTTON'].includes(tag)
      || event.altKey
      || event.ctrlKey
      || event.metaKey
    ) return;

    if (event.code === 'Space') {
      event.preventDefault();
      loaded().some((v) => !v.paused) ? pauseAll() : playAll();
    }

    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      seekBy(-5);
    } 

    if (event.key === 'ArrowRight') {
      event.preventDefault();
      seekBy(5);
    }

    if (event.key.toLowerCase() === 'f') $('fullscreenButton').click();
  });

  window.addEventListener(
    'beforeunload',
    () => states.forEach((state) => state.url && URL.revokeObjectURL(state.url))
  );

  setPausedUI();
  showControls();
})();
