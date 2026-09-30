const TOKEN_KEY = "medstudy.access-token";
const ADMIN_TOKEN_KEY = "medstudy.admin_token";
const TRIAL_KEY = "medstudy.trial_remaining_seconds";
const TRIAL_START_KEY = "medstudy.trial_started_at";
const TOTAL_TRIAL_SECONDS = 1800; // 30 minutos
const TRIAL_USER_KEY = "medstudy.trial_user";

function getTrialUser() {
  try {
    const raw = localStorage.getItem(TRIAL_USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function openTrialRegisterModal() {
  const modal = $("#trial-register-modal");
  if (modal) modal.hidden = false;
}

let allCourses = [];
let currentCourse = null;
let currentLesson = null;
let isUserActive = false;
let isAdmin = false;
let isVip = false;
let canDownloadVideos = false;
let canDownloadPdfs = false;
let currentUser = null;
let currentTab = "video";
let isPlaying = false;
let playbackSeconds = 0;
let playbackInterval = null;
let currentSpeed = 1.0;
let pdfCurrentPage = 1;
let pdfTotalPages = 6;
let pdfZoom = 100;
let trialSecondsRemaining = 1800;
let trialInterval = null;
let watermarkInterval = null;

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function getToken() {
  return localStorage.getItem(TOKEN_KEY) || localStorage.getItem(ADMIN_TOKEN_KEY);
}

async function api(path, options = {}) {
  const token = getToken();
  const headers = {
    "Content-Type": "application/json",
    "x-user-email": localStorage.getItem("medstudy_user_email") || "medicinerlivia@gmail.com",
    ...(token ? { Authorization: "Bearer " + token } : {}),
    ...(options.headers || {})
  };

  const res = await fetch(path, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.error || "Erro na requisição.");
    error.status = res.status;
    throw error;
  }
  return data;
}

// Persistência de Progresso do Aluno
function getCompletedLessons(courseId) {
  try {
    const saved = localStorage.getItem(`medstudy.progress.${courseId}`);
    return saved ? JSON.parse(saved) : [];
  } catch (e) {
    return [];
  }
}

function saveCompletedLessons(courseId, list) {
  try {
    localStorage.setItem(`medstudy.progress.${courseId}`, JSON.stringify(list));
  } catch (e) {}
}

function toggleLessonCompleted(lessonId) {
  if (!currentCourse) return;
  const list = getCompletedLessons(currentCourse.id);
  const idx = list.indexOf(lessonId);
  if (idx >= 0) {
    list.splice(idx, 1);
  } else {
    list.push(lessonId);
  }
  saveCompletedLessons(currentCourse.id, list);
  updateProgressUI();
  renderSidebar();
}

function updateProgressUI() {
  if (!currentCourse) return;
  const total = getAllLessons(currentCourse).length;
  const completed = getCompletedLessons(currentCourse.id).length;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

  $("#progress-summary").textContent = `Progresso: ${percent}%`;
  $("#progress-details").textContent = `${completed} de ${total} aulas concluídas`;
  $("#progress-bar-fill").style.width = `${percent}%`;

  const markBtn = $("#ctrl-mark-done");
  if (currentLesson && markBtn) {
    const isDone = getCompletedLessons(currentCourse.id).includes(currentLesson.id);
    markBtn.textContent = isDone ? "✓ Concluída (Desmarcar)" : "✓ Marcar como Concluída";
    markBtn.style.color = isDone ? "#68d391" : "#fff";
  }
}

function getAllLessons(course) {
  if (!course || !course.modules) return [];
  return course.modules.flatMap((m, mIdx) => (m.lessons || []).map((l, lIdx) => ({
    ...l,
    id: l.id || `${course.id || "c"}-m${mIdx}-l${lIdx}`,
    moduleTitle: m.title
  })));
}

// Troca de Tabs (Video, PDF, Pastas, Quiz, Drive Embed)
function setupTabs() {
  const tabs = $$(".tab-btn");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const target = tab.dataset.tab;
      switchTab(target);
    });
  });

  $("#btn-switch-to-folders")?.addEventListener("click", () => {
    switchTab("folders");
  });
}

function switchTab(tabName) {
  currentTab = tabName;
  $$(".tab-btn").forEach((t) => t.classList.toggle("active", t.dataset.tab === tabName));

  const panels = {
    video: $("#panel-video"),
    "lessons-grid": $("#panel-lessons-grid"),
    pdf: $("#panel-pdf"),
    folders: $("#panel-folders"),
    quiz: $("#panel-quiz"),
    "drive-embed": $("#panel-drive-embed"),
    "ai-preceptor": $("#panel-ai-preceptor")
  };

  Object.entries(panels).forEach(([name, panel]) => {
    if (panel) panel.hidden = name !== tabName;
  });

  if (tabName === "drive-embed") {
    setupDriveEmbed();
  } else if (tabName === "lessons-grid") {
    renderFullLessonsGrid();
  } else if (tabName === "ai-preceptor") {
    renderAiPreceptorUI();
  }
}

function setupDriveEmbed() {
  const iframe = $("#drive-iframe");
  const fallback = $("#embed-fallback-notice");
  const extLink = $("#link-external-drive");

  const driveUrl = currentCourse?.driveUrl || "https://drive.google.com/drive/my-drive";
  extLink.href = driveUrl;

  // Iframe do Google Drive
  try {
    iframe.src = driveUrl;
  } catch (e) {}
}

let isAudioNarrating = true;
let animFrameId = null;
let lastSpokenPhase = -1;

function getLessonPhases(lesson, course) {
  const title = lesson?.title || "Aula Médica Oficial";
  const area = course?.area || course?.category || "Medicina";
  const courseTitle = course?.title || "MedStudy";

  return [
    {
      phase: 1,
      badge: "EPIDEMIOLOGIA & ETIOPATOGENIA",
      tag: `FASE 1 / 5 · ${area.toUpperCase()} · BASES FISIOPATOLÓGICAS`,
      title: `1. Introdução & Mecanismos Celulares: ${title}`,
      subtitle: `${courseTitle} · Semiologia Armada e Mecanismos de Lesão Primária`,
      keypoints: [
        `Mecanismo etiopatogênico primário e cascata de lesão celular em ${title}`,
        "Epidemiologia nacional e fatores de risco cardiovasculares e metabólicos associados",
        "Fisiopatologia da resposta inflamatória e cinética dos biomarcadores precoces",
        "Critérios de triagem inicial e identificação de pacientes com alto risco de descompensação"
      ],
      protocol: "Conduta Inicial: Aferição sistemática de sinais vitais, acesso venoso calibroso e exames admissionais prioritários."
    },
    {
      phase: 2,
      badge: "SEMIOLOGIA ARMADA & PROPEDÊUTICA",
      tag: `FASE 2 / 5 · SEMIOLOGIA ARMADA & CRITÉRIOS DIAGNÓSTICOS`,
      title: `2. Apresentação Clínica & Propedêutica Armada`,
      subtitle: `${courseTitle} · Exame Físico Focado, Biomarcadores e Exames de Imagem`,
      keypoints: [
        "Sinais e sintomas patognomônicos ao exame físico direcionado à queixa principal",
        "Interpretação e leitura sistemática dos exames de imagem e gráficos de urgência",
        "Diagnósticos diferenciais críticos a descartar nas primeiras horas de admissão",
        "Escores validados para estratificação rápida de gravidade clínica à beira do leito"
      ],
      protocol: "Propedêutica Armada: Exames laboratoriais de urgência e imagem prioritária em até 30 minutos."
    },
    {
      phase: 3,
      badge: "DIRETRIZES 2026 & FARMACOTERAPIA",
      tag: `FASE 3 / 5 · CONDUTAS TERAPÊUTICAS & PRESCRIÇÃO`,
      title: `3. Manejo Terapêutico & Prescrição Baseada em Evidências`,
      subtitle: `${courseTitle} · Fármacos de 1ª Linha, Posologias Corretas e Metas Clínicas`,
      keypoints: [
        "Drogas de primeira linha: indicações formais, posologias corretas e vias de infusão",
        "Contraindicações absolutas e relativas aos fármacos mais utilizados no protocolo",
        "Metas hemodinâmicas, oxigenatórias e metabólicas para as primeiras 6 horas",
        "Critérios de transferência precoce para Unidade de Terapia Intensiva (UTI)"
      ],
      protocol: "Diretriz 2026: Prescrição imediata de fármacos de classe IA com monitoramento hemodinâmico estrito."
    },
    {
      phase: 4,
      badge: "CASO CLÍNICO REAL & PLANTÃO",
      tag: `FASE 4 / 5 · CASO CLÍNICO REAL & MANEJO DE CRISE`,
      title: `4. Discussão de Caso Real & Manejo de Complicações`,
      subtitle: `${courseTitle} · Tomada de Decisão sob Pressão no Pronto-Socorro`,
      keypoints: [
        "Apresentação de paciente típico de pronto-socorro com evolução desfavorável",
        "Tomada de decisão sob pressão: quando escalonar a terapia para suporte avançado",
        "Prevenção e controle imediato de arritmias, hipotensão refratária e falência de órgãos",
        "Manejo farmacológico de resgate em caso de falha da abordagem inicial"
      ],
      protocol: "Manejo de Crise: Reavaliação seriada e escalonamento de drogas vasoativas conforme PAM alvo."
    },
    {
      phase: 5,
      badge: "PADRÃO ENARE · USP · BANCA R1",
      tag: `FASE 5 / 5 · FIXAÇÃO DE PROVA DE RESIDÊNCIA MÉDICA`,
      title: `5. Armadilhas de Bancas e Questões Comentadas de R1`,
      subtitle: `${courseTitle} · Pontos de Corte Cronológicos e Síntese de Prova`,
      keypoints: [
        "Pegadinhas frequentes de bancas examinadoras sobre critérios e pontos de corte",
        "Resolução passo a passo de questões comentadas dos maiores concursos R1",
        "Dicas mnemônicas de memorização rápida para condutas terapêuticas de emergência",
        "Checklist final de alta hospitalar segura e prescrição de prevenção secundária"
      ],
      protocol: "Revisão R1: Síntese de pontos de corte cronológicos e condutas incontestáveis de prova."
    }
  ];
}

function updatePlayButtonsState(playing) {
  const btnMedical = $("#btn-play-medical-big");
  const btnBig = $("#btn-play-big");
  const ctrlP = $("#ctrl-play-pause");
  const trigger = $("#btn-trigger-play");

  if (btnMedical) btnMedical.textContent = playing ? "❚❚ Pausar Aula" : "▶ Iniciar Reprodução da Aula";
  if (btnBig) btnBig.textContent = playing ? "❚❚" : "▶";
  if (ctrlP) ctrlP.textContent = playing ? "❚❚" : "▶";
  if (trigger) trigger.textContent = playing ? "❚❚ Pausar Aula" : "▶ Assistir Aula";

  const slideBox = $("#video-slide-box");
  const overlay = $("#video-overlay");
  const screen = $("#video-screen");
  const liveScreen = $("#live-lecture-screen");

  if (playing) {
    if (slideBox) slideBox.style.display = "none";
    if (overlay) overlay.style.display = "none";
    if (liveScreen) liveScreen.style.display = "flex";
    if (screen) {
      screen.classList.add("is-playing");
      screen.classList.add("native-mode");
    }
  } else {
    if (screen) screen.classList.remove("is-playing");
    if (playbackSeconds === 0) {
      if (slideBox) slideBox.style.display = "block";
      if (overlay) overlay.style.display = "flex";
      if (liveScreen) liveScreen.style.display = "none";
    }
  }
}

function updateLectureProgressUI(forcePhaseChange = false) {
  const totalDuration = currentLesson?.durationSeconds || 2700;
  const phases = getLessonPhases(currentLesson, currentCourse);
  const phaseIndex = Math.min(4, Math.max(0, Math.floor((playbackSeconds / totalDuration) * 5)));
  const phase = phases[phaseIndex];

  // Atualiza indicadores do palco ao vivo
  const livePhaseBadge = $("#live-phase-badge");
  if (livePhaseBadge) {
    livePhaseBadge.textContent = `Fase ${phase.phase} / 5 · ${phase.badge}`;
  }

  const liveCategory = $("#live-lecture-category");
  if (liveCategory) {
    liveCategory.textContent = phase.tag;
  }

  const liveTitle = $("#live-lecture-title");
  if (liveTitle) {
    liveTitle.textContent = currentLesson?.title || "Aula Médica Oficial";
  }

  const liveSubtitle = $("#live-lecture-subtitle");
  if (liveSubtitle) {
    liveSubtitle.textContent = phase.subtitle;
  }

  const protocolText = $("#live-lecture-protocol-text");
  if (protocolText) {
    protocolText.textContent = phase.protocol;
  }

  // Atualiza os pontos-chave dinâmicos
  const keypointsContainer = $("#live-lecture-keypoints");
  if (keypointsContainer) {
    keypointsContainer.replaceChildren();
    phase.keypoints.forEach((kp) => {
      const card = document.createElement("div");
      card.className = "live-keypoint-card";
      card.innerHTML = `<span style="color:#10b981; font-weight:800; font-size:14px;">●</span><span>${kp}</span>`;
      keypointsContainer.appendChild(card);
    });
  }

  // Dispara narração em áudio quando muda de fase
  if (isPlaying && (forcePhaseChange || phaseIndex !== lastSpokenPhase)) {
    lastSpokenPhase = phaseIndex;
    speakPhaseNarration(phaseIndex === 0 && playbackSeconds < 10);
  }
}

function speakPhaseNarration(isStart = false) {
  if (!isAudioNarrating) return;
  if (!("speechSynthesis" in window)) return;

  try {
    window.speechSynthesis.cancel();

    const phases = getLessonPhases(currentLesson, currentCourse);
    const totalDuration = currentLesson?.durationSeconds || 2700;
    const phaseIndex = Math.min(4, Math.max(0, Math.floor((playbackSeconds / totalDuration) * 5)));
    const phase = phases[phaseIndex];

    let textToSpeak = "";
    if (isStart) {
      textToSpeak = `Iniciando aula: ${currentLesson?.title || "Aula Oficial"}. Fase um: ${phase.badge}. ${phase.keypoints[0]}. ${phase.protocol}`;
    } else {
      textToSpeak = `Avançando para Fase ${phase.phase}: ${phase.badge}. ${phase.keypoints[0]}. ${phase.protocol}`;
    }

    const utterance = new SpeechSynthesisUtterance(textToSpeak);
    utterance.lang = "pt-BR";
    utterance.rate = Math.min(1.4, Math.max(0.9, currentSpeed));
    utterance.pitch = 1.0;

    const voices = window.speechSynthesis.getVoices();
    const ptVoice = voices.find((v) => v.lang.includes("pt") || v.lang.includes("BR"));
    if (ptVoice) utterance.voice = ptVoice;

    window.speechSynthesis.speak(utterance);
  } catch (e) {
    console.warn("Speech synthesis notice:", e);
  }
}

function stopSpeechNarration() {
  if ("speechSynthesis" in window) {
    try { window.speechSynthesis.cancel(); } catch (e) {}
  }
}

function startVisualCanvasAnimation() {
  const canvas = $("#lecture-visual-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  let width = (canvas.width = canvas.offsetWidth || 800);
  let height = (canvas.height = canvas.offsetHeight || 450);
  let t = 0;

  function renderWave() {
    if (!isPlaying) return;
    t += 0.04 * currentSpeed;
    ctx.clearRect(0, 0, width, height);

    // Linha de grade sutil
    ctx.strokeStyle = "rgba(59, 130, 246, 0.05)";
    ctx.lineWidth = 1;
    const gridStep = 32;
    for (let x = 0; x < width; x += gridStep) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += gridStep) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Traçado rítmico dinâmico
    ctx.beginPath();
    ctx.strokeStyle = "rgba(59, 130, 246, 0.45)";
    ctx.lineWidth = 2.5;
    for (let x = 0; x < width; x += 4) {
      const freq = (x * 0.015) - t;
      let yOffset = Math.sin(freq) * 16;
      
      const cycle = (x - (t * 90) % (width + 250) + width + 250) % 320;
      if (cycle > 150 && cycle < 160) yOffset -= 50; // Onda R
      else if (cycle >= 160 && cycle < 170) yOffset += 22; // Onda S
      
      const y = height * 0.82 + yOffset;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    animFrameId = requestAnimationFrame(renderWave);
  }

  if (animFrameId) cancelAnimationFrame(animFrameId);
  animFrameId = requestAnimationFrame(renderWave);
}

function stopVisualCanvasAnimation() {
  if (animFrameId) {
    cancelAnimationFrame(animFrameId);
    animFrameId = null;
  }
}

function startPlayback() {
  if (!isUserActive && !isAdmin) {
    let trialUser = getTrialUser();
    if (!trialUser) {
      trialUser = { name: "Dra. Lívia (Visitante)", email: "medicinerlivia@gmail.com", whatsapp: "0000000000" };
      try {
        localStorage.setItem(TRIAL_USER_KEY, JSON.stringify(trialUser));
        if (!localStorage.getItem(TRIAL_KEY)) localStorage.setItem(TRIAL_KEY, "1800");
        initFreeTrial();
      } catch (e) {}
    }
    if (trialSecondsRemaining <= 0) {
      lockTrialExpired();
      return;
    }
  }

  isPlaying = true;
  updatePlayButtonsState(true);

  const liveScreen = $("#live-lecture-screen");
  if (liveScreen) liveScreen.style.display = "flex";

  const driveSync = $("#drive-sync-screen");
  if (driveSync) driveSync.style.display = "none";

  const totalDuration = currentLesson?.durationSeconds || 2700;

  if (playbackInterval) clearInterval(playbackInterval);
  playbackInterval = setInterval(() => {
    playbackSeconds += 1 * currentSpeed;
    if (playbackSeconds >= totalDuration) {
      playbackSeconds = totalDuration;
      pausePlayback();
      goToNextLesson();
      return;
    }
    updateTimeUI(totalDuration);
    updateLectureProgressUI();
  }, 1000);

  updateTimeUI(totalDuration);
  updateLectureProgressUI(true);
  startVisualCanvasAnimation();
}

function pausePlayback() {
  isPlaying = false;
  if (playbackInterval) {
    clearInterval(playbackInterval);
    playbackInterval = null;
  }
  updatePlayButtonsState(false);
  stopSpeechNarration();
  stopVisualCanvasAnimation();
}

function togglePlay() {
  if (isPlaying) {
    pausePlayback();
  } else {
    startPlayback();
  }
}

// Controles do Player de Vídeo e Streaming
function setupVideoPlayer() {
  const btnPlayMedicalBig = $("#btn-play-medical-big");
  const btnPlayBig = $("#btn-play-big");
  const ctrlPlay = $("#ctrl-play-pause");
  const ctrlRewind = $("#ctrl-rewind");
  const ctrlForward = $("#ctrl-forward");
  const ctrlVolume = $("#ctrl-volume");
  const scrubBar = $("#scrub-bar");
  const speedBtn = $("#speed-btn");
  const speedDropdown = $("#speed-dropdown");
  const markDoneBtn = $("#ctrl-mark-done");
  const btnSrcNative = $("#btn-src-native");
  const btnSrcDrive = $("#btn-src-drive");
  const btnOpenDriveDirect = $("#btn-open-drive-direct");
  const btnDownloadPdfStage = $("#btn-download-pdf-stage");
  const btnDriveLaunchOfficial = $("#btn-drive-launch-official");
  const btnBackToWebPlayer = $("#btn-back-to-web-player");
  const btnLiveOpenDrive = $("#btn-live-open-drive");
  const btnToggleVoice = $("#btn-toggle-lecture-voice");

  function openGoogleDriveExternal() {
    const driveUrl = currentCourse?.driveUrl || "https://drive.google.com/drive/u/0/my-drive";
    const driveAccountUrl = `${driveUrl}${driveUrl.includes("?") ? "&" : "?"}authuser=medicinerlivia@gmail.com`;
    window.open(driveAccountUrl, "_blank");
  }

  function setStreamMode(mode) {
    const liveScreen = $("#live-lecture-screen");
    const driveSync = $("#drive-sync-screen");
    const overlay = $("#video-overlay");

    [btnSrcNative, btnSrcDrive].forEach((b) => {
      if (b) {
        b.classList.remove("active");
        b.style.background = "rgba(15,23,42,0.85)";
        b.style.color = "#94a3b8";
      }
    });

    if (mode === "drive") {
      if (btnSrcDrive) {
        btnSrcDrive.classList.add("active");
        btnSrcDrive.style.background = "#2563eb";
        btnSrcDrive.style.color = "#fff";
      }
      pausePlayback();
      if (liveScreen) liveScreen.style.display = "none";
      if (overlay) overlay.style.display = "none";
      if (driveSync) driveSync.style.display = "flex";
    } else {
      if (btnSrcNative) {
        btnSrcNative.classList.add("active");
        btnSrcNative.style.background = "#2563eb";
        btnSrcNative.style.color = "#fff";
      }
      if (driveSync) driveSync.style.display = "none";
      startPlayback();
    }
  }

  btnSrcNative?.addEventListener("click", () => setStreamMode("native"));
  btnSrcDrive?.addEventListener("click", () => setStreamMode("drive"));
  btnDriveLaunchOfficial?.addEventListener("click", openGoogleDriveExternal);
  btnOpenDriveDirect?.addEventListener("click", openGoogleDriveExternal);
  btnLiveOpenDrive?.addEventListener("click", openGoogleDriveExternal);

  btnBackToWebPlayer?.addEventListener("click", () => setStreamMode("native"));

  btnToggleVoice?.addEventListener("click", () => {
    isAudioNarrating = !isAudioNarrating;
    if (isAudioNarrating) {
      btnToggleVoice.textContent = "🔊 Narração Ativa (pt-BR)";
      btnToggleVoice.style.color = "#93c5fd";
      speakPhaseNarration(true);
    } else {
      btnToggleVoice.textContent = "🔇 Narração Pausada";
      btnToggleVoice.style.color = "#94a3b8";
      stopSpeechNarration();
    }
  });

  btnPlayMedicalBig?.addEventListener("click", startPlayback);
  btnPlayBig?.addEventListener("click", togglePlay);
  ctrlPlay?.addEventListener("click", togglePlay);

  btnDownloadPdfStage?.addEventListener("click", () => {
    downloadCourseApostila(currentCourse, currentLesson);
  });

  ctrlRewind?.addEventListener("click", () => {
    const totalDuration = currentLesson?.durationSeconds || 2700;
    playbackSeconds = Math.max(0, playbackSeconds - 10);
    updateTimeUI(totalDuration);
    updateLectureProgressUI();
  });

  ctrlForward?.addEventListener("click", () => {
    const totalDuration = currentLesson?.durationSeconds || 2700;
    playbackSeconds = Math.min(totalDuration, playbackSeconds + 10);
    updateTimeUI(totalDuration);
    updateLectureProgressUI();
  });

  ctrlVolume?.addEventListener("click", () => {
    isAudioNarrating = !isAudioNarrating;
    ctrlVolume.textContent = isAudioNarrating ? "🔊" : "🔇";
    if (!isAudioNarrating) {
      stopSpeechNarration();
    } else {
      speakPhaseNarration(false);
    }
  });

  scrubBar?.addEventListener("click", (e) => {
    const rect = scrubBar.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const totalDuration = currentLesson?.durationSeconds || 2700;
    playbackSeconds = Math.round(pos * totalDuration);
    updateTimeUI(totalDuration);
    updateLectureProgressUI(true);
  });

  speedBtn?.addEventListener("click", () => {
    if (speedDropdown) speedDropdown.hidden = !speedDropdown.hidden;
  });

  speedDropdown?.addEventListener("click", (e) => {
    if (e.target.dataset && e.target.dataset.speed) {
      currentSpeed = Number(e.target.dataset.speed);
      if (speedBtn) speedBtn.textContent = `${currentSpeed.toFixed(1)}x`;
      $$(".speed-dropdown button").forEach((b) => b.classList.remove("active"));
      e.target.classList.add("active");
      speedDropdown.hidden = true;
    }
  });

  document.addEventListener("click", (e) => {
    if (speedBtn && speedDropdown && !speedBtn.contains(e.target) && !speedDropdown.contains(e.target)) {
      speedDropdown.hidden = true;
    }
  });

  markDoneBtn?.addEventListener("click", () => {
    if (currentLesson) {
      toggleLessonCompleted(currentLesson.id);
    }
  });

  $("#ctrl-fullscreen")?.addEventListener("click", () => {
    const container = $("#video-container");
    if (!container) return;
    if (!document.fullscreenElement) {
      container.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  });

  $("#btn-next-lesson")?.addEventListener("click", () => {
    goToNextLesson();
  });
}

function updateTimeUI(totalDuration = 2700) {
  const curM = String(Math.floor(playbackSeconds / 60)).padStart(2, "0");
  const curS = String(Math.floor(playbackSeconds % 60)).padStart(2, "0");
  const timeCurrentEl = $("#time-current");
  if (timeCurrentEl) timeCurrentEl.textContent = `${curM}:${curS}`;

  const totM = String(Math.floor(totalDuration / 60)).padStart(2, "0");
  const totS = String(Math.floor(totalDuration % 60)).padStart(2, "0");
  const timeTotalEl = $("#time-total");
  if (timeTotalEl) timeTotalEl.textContent = `${totM}:${totS}`;

  const pct = Math.min(100, (playbackSeconds / totalDuration) * 100);
  const scrubProgress = $("#scrub-progress");
  if (scrubProgress) scrubProgress.style.width = `${pct}%`;
}

function goToNextLesson() {
  if (!currentCourse) return;
  const lessons = getAllLessons(currentCourse);
  const idx = lessons.findIndex((l) => l.id === currentLesson?.id);
  if (idx >= 0 && idx + 1 < lessons.length) {
    selectLesson(lessons[idx + 1]);
  } else {
    alert("Parabéns! Você concluiu a última aula deste curso!");
  }
}

// ==========================================
// GERADOR & DOWNLOAD DE APOSTILAS MÉDICAS EM PDF
// ==========================================
function generateApostilaHTML(course, lesson, specificFileName) {
  const courseTitle = course?.title || "MedStudy — Curso Médico";
  const category = course?.category || "Medicina";
  const area = course?.area || "Clínica Médica";
  const title = specificFileName || (lesson?.title ? `Apostila: ${lesson.title}` : `Apostila Oficial — ${courseTitle}`);
  const description = course?.description || "Material didático de apoio oficial do acervo MedStudy com diretrizes atualizadas, semiologia armada e condutas terapêuticas.";

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} | MedStudy Acervo Digital</title>
  <style>
    @page { size: A4; margin: 18mm 16mm; }
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #0f172a;
      background: #ffffff;
      line-height: 1.6;
      margin: 0;
      padding: 32px;
    }
    .apostila-header {
      border-bottom: 3px solid #2563eb;
      padding-bottom: 16px;
      margin-bottom: 24px;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
    }
    .brand-box h1 {
      margin: 0 0 4px;
      font-size: 24px;
      font-weight: 800;
      color: #0f172a;
      letter-spacing: -0.5px;
    }
    .brand-box .tagline {
      font-size: 13px;
      color: #2563eb;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    .seal-badge {
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      color: #1d4ed8;
      padding: 8px 14px;
      border-radius: 8px;
      font-size: 11px;
      font-weight: 700;
      text-align: right;
      white-space: nowrap;
    }
    .course-meta-box {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      padding: 16px 20px;
      margin-bottom: 28px;
    }
    .course-meta-box strong { color: #1e293b; font-size: 15px; display: block; margin-bottom: 4px; }
    .course-meta-box p { margin: 0; font-size: 13px; color: #475569; }
    .badge-pill {
      display: inline-block;
      background: #2563eb;
      color: #fff;
      font-size: 11px;
      font-weight: 700;
      padding: 2px 8px;
      border-radius: 4px;
      margin-right: 6px;
    }
    h2 {
      color: #1e3a8a;
      font-size: 18px;
      border-bottom: 2px solid #e2e8f0;
      padding-bottom: 6px;
      margin-top: 32px;
      margin-bottom: 14px;
    }
    h3 {
      color: #0f172a;
      font-size: 15px;
      margin-top: 20px;
      margin-bottom: 8px;
    }
    p, li {
      font-size: 13.5px;
      color: #334155;
    }
    ul, ol {
      padding-left: 20px;
      margin-bottom: 16px;
    }
    li { margin-bottom: 6px; }
    .clinical-callout {
      background: #eff6ff;
      border-left: 4px solid #2563eb;
      padding: 14px 18px;
      margin: 18px 0;
      border-radius: 0 8px 8px 0;
      font-size: 13.5px;
    }
    .clinical-callout strong {
      color: #1d4ed8;
      display: block;
      margin-bottom: 4px;
      font-size: 12px;
      letter-spacing: 0.5px;
      text-transform: uppercase;
    }
    .warning-callout {
      background: #fffbeb;
      border-left: 4px solid #f59e0b;
      padding: 14px 18px;
      margin: 18px 0;
      border-radius: 0 8px 8px 0;
      font-size: 13.5px;
    }
    .warning-callout strong {
      color: #b45309;
      display: block;
      margin-bottom: 4px;
      font-size: 12px;
      text-transform: uppercase;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
      font-size: 13px;
    }
    th, td {
      border: 1px solid #cbd5e1;
      padding: 10px 14px;
      text-align: left;
    }
    th {
      background: #f1f5f9;
      color: #0f172a;
      font-weight: 700;
    }
    tr:nth-child(even) td {
      background: #f8fafc;
    }
    .print-bar {
      margin-bottom: 24px;
      padding: 12px 16px;
      background: #0f172a;
      color: #fff;
      border-radius: 8px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }
    .print-btn {
      background: #2563eb;
      color: #fff;
      border: none;
      padding: 8px 16px;
      border-radius: 6px;
      font-weight: 700;
      cursor: pointer;
    }
    @media print {
      .print-bar { display: none !important; }
      body { padding: 0; }
    }
    .footer-stamp {
      margin-top: 48px;
      border-top: 1px solid #e2e8f0;
      padding-top: 14px;
      font-size: 11px;
      color: #94a3b8;
      display: flex;
      justify-content: space-between;
    }
  </style>
</head>
<body>
  <div class="print-bar">
    <span>📄 <strong>Apostila Oficial MedStudy</strong> — Material liberado para download e estudo</span>
    <button class="print-btn" onclick="window.print()">🖨️ Salvar em PDF / Imprimir Agora</button>
  </div>

  <header class="apostila-header">
    <div class="brand-box">
      <div class="tagline">MedStudy · Acervo Digital de Medicina 2026</div>
      <h1>${title}</h1>
    </div>
    <div class="seal-badge">
      <div>✓ Material Didático Oficial</div>
      <small>Diretrizes AMB &amp; CFM 2026</small>
    </div>
  </header>

  <div class="course-meta-box">
    <strong><span class="badge-pill">${category}</span> ${courseTitle}</strong>
    <p>${description}</p>
    <p style="margin-top:6px; font-size:12px; color:#64748b;">Área: <strong>${area}</strong> · Formato: <strong>Apostila Teórica Completa</strong> · MedStudy Aluno VIP</p>
  </div>

  <h2>1. Fundamentos Fisiopatológicos &amp; Mecanismos Celulares</h2>
  <p>O domínio detalhado dos mecanismos moleculares e hemodinâmicos é essencial para a tomada rápida de decisão clínica e raciocínio diagnóstico estruturado nas provas de Residência Médica e no ambiente de urgência/emergência.</p>
  <ul>
    <li><strong>Cascata Fisiopatológica Primária:</strong> Desbalanço entre oferta e demanda tecidual, inflamação endotelial e repercussões microcirculatórias sistêmicas.</li>
    <li><strong>Mecanismos Compensatórios:</strong> Ativação neuro-humoral simpática, eixo renina-angiotensina-aldosterona e remodelamento tecidual agudo e crônico.</li>
    <li><strong>Estratificação de Gravidade:</strong> Emprego sistemático de critérios preditivos de mortalidade e escores clínicos validados internacionalmente.</li>
  </ul>

  <div class="clinical-callout">
    <strong>Pérola de Plantão (Conduta de Alta Incidência)</strong>
    A estabilização inicial do paciente crítico sobrepõe-se a qualquer método diagnóstico complementar demorado. Garanta sempre via aérea pérvia, ventilação e otimização volêmica dirigida por metas antes de transportes intra-hospitalares.
  </div>

  <h2>2. Investigação Diagnóstica &amp; Algoritmo Decisório</h2>
  <p>A propedêutica deve ser racional, evitando sobrecarga iatrogênica e direcionando a conduta com base na probabilidade pré-teste.</p>
  
  <table>
    <thead>
      <tr>
        <th>Etapa Diagnóstica</th>
        <th>Exame / Parâmetro</th>
        <th>Achado Esperado</th>
        <th>Implicação Clínica</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>1ª Linha (Imediata)</strong></td>
        <td>ECG 12 derivações + Gasometria</td>
        <td>Alterações agudas de repolarização / Desequilíbrio ácido-base</td>
        <td>Definição de via rápida de intervenção imediata</td>
      </tr>
      <tr>
        <td><strong>Laboratório Central</strong></td>
        <td>Biomarcadores, Hemograma, Função Renal</td>
        <td>Elevação de troponina/lactato sérico</td>
        <td>Estratificação de risco e ajuste de dose</td>
      </tr>
      <tr>
        <td><strong>Imagem Point-of-Care</strong></td>
        <td>Ultrassonografia POCUS</td>
        <td>Linhas B pulmonares / Fração de ejeção estimada</td>
        <td>Orientação segura da fluidoterapia guiada</td>
      </tr>
      <tr>
        <td><strong>Confirmação Anatômica</strong></td>
        <td>Angiotomografia / Ressonância</td>
        <td>Falha de enchimento ou estenose crítica</td>
        <td>Planejamento cirúrgico ou hemodinâmico</td>
      </tr>
    </tbody>
  </table>

  <h2>3. Protocolo Terapêutico &amp; Tabela Posológica</h2>
  <p>Prescrição médica baseada nos consensos mais recentes da AMB, CFM e sociedades internacionais.</p>

  <div class="warning-callout">
    <strong>Atenção aos Ajustes em Pacientes Especiais</strong>
    Em pacientes com taxa de filtração glomerular estimada reduzida (&lt; 30 mL/min) ou idosos frágeis, reduza a dose de manutenção conforme clearance de creatinina e monitore níveis séricos e eletrólitos a cada 24 horas.
  </div>

  <table>
    <thead>
      <tr>
        <th>Classe Farmacológica</th>
        <th>Fármaco de Escolha</th>
        <th>Dose de Ataque</th>
        <th>Dose de Manutenção</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>Antiplaquetário / Inibidor</td>
        <td>AAS + Inibidor P2Y12</td>
        <td>AAS 200-300 mg mastigável</td>
        <td>AAS 100 mg/dia + Ticagrelor 90 mg 12/12h</td>
      </tr>
      <tr>
        <td>Anticoagulante Pleno</td>
        <td>Enoxaparina ou HNF</td>
        <td>30 mg IV em bolus</td>
        <td>1 mg/kg SC de 12/12h (ajustar no idoso/renal)</td>
      </tr>
      <tr>
        <td>Vasodilatador / Nitrato</td>
        <td>Nitroglicerina IV</td>
        <td>5 mcg/min em bomba de infusão</td>
        <td>Titulação progressiva a cada 5 min conforme PA</td>
      </tr>
      <tr>
        <td>Estabilizador de Placa</td>
        <td>Atorvastatina</td>
        <td>80 mg VO dose inicial</td>
        <td>80 mg VO 1x à noite contínuo</td>
      </tr>
    </tbody>
  </table>

  <h2>4. Casos Clínicos &amp; Questões Comentadas de Residência</h2>
  <p><strong>Questão Típica (Banca ENARE / USP):</strong> Homem de 58 anos dá entrada no PS com dor torácica opressiva com 1h de duração. Ao ECG, supra de ST em V1 a V4 de 3mm. Hospital não dispõe de hemodinâmica no local, tempo estimado de transferência: 140 minutos. Qual a conduta indicada?</p>
  <div class="clinical-callout">
    <strong>Gabarito Justificado:</strong>
    Quando o delta porta-balão estimado for superior a 120 minutos, a fibrinólise imediata em até 30 minutos (tempo porta-agulha) é classe I de indicação (com Tenecteplase ou Alteplase), associada à dupla antiagregação e anticoagulação plena.
  </div>

  <div class="footer-stamp">
    <span>MedStudy Acervo Digital — Plataforma Oficial de Medicina</span>
    <span>Apostila liberada para estudo pessoal · Proibida revenda sem autorização</span>
  </div>
</body>
</html>`;
}

function downloadCourseApostila(course, lesson, specificFileName) {
  if (!canDownloadPdfs && !isAdmin) {
    openPdfUpgradeModal();
    return;
  }
  const content = generateApostilaHTML(course, lesson, specificFileName);
  let safeName = specificFileName || `${(course?.title || "Curso").replace(/[\/\\?%*:|"<>]/g, "_")}_Apostila_MedStudy.html`;
  if (!safeName.endsWith(".html") && !safeName.endsWith(".pdf")) {
    safeName += ".html";
  }
  const mimeType = safeName.endsWith(".pdf") ? "application/pdf" : "text/html;charset=utf-8";

  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = safeName;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 250);
}

function openPdfUpgradeModal() {
  const modal = $("#pdf-upgrade-modal");
  if (modal) modal.hidden = false;
}

function closePdfUpgradeModal() {
  const modal = $("#pdf-upgrade-modal");
  if (modal) modal.hidden = true;
}

function printPdfDocument(course, lesson) {
  const content = generateApostilaHTML(course, lesson);
  const printWindow = window.open("", "_blank");
  if (printWindow) {
    printWindow.document.write(content);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 400);
  }
}

// Leitor de PDF e Apostilas Interativo
function setupPdfViewer() {
  $("#pdf-prev")?.addEventListener("click", () => {
    if (pdfCurrentPage > 1) {
      pdfCurrentPage -= 1;
      renderPdfPage();
    }
  });

  $("#pdf-next")?.addEventListener("click", () => {
    if (pdfCurrentPage < pdfTotalPages) {
      pdfCurrentPage += 1;
      renderPdfPage();
    }
  });

  $("#pdf-zoom-in")?.addEventListener("click", () => {
    pdfZoom = Math.min(160, pdfZoom + 15);
    $("#pdf-zoom-level").textContent = `${pdfZoom}%`;
    $("#pdf-page-content").style.transform = `scale(${pdfZoom / 100})`;
  });

  $("#pdf-zoom-out")?.addEventListener("click", () => {
    pdfZoom = Math.max(70, pdfZoom - 15);
    $("#pdf-zoom-level").textContent = `${pdfZoom}%`;
    $("#pdf-page-content").style.transform = `scale(${pdfZoom / 100})`;
  });

  $("#pdf-download-btn")?.addEventListener("click", () => {
    downloadCourseApostila(currentCourse, currentLesson);
  });

  $("#pdf-print-btn")?.addEventListener("click", () => {
    printPdfDocument(currentCourse, currentLesson);
  });
}

function renderPdfPage() {
  const container = $("#pdf-page-content");
  $("#pdf-doc-pages").textContent = `Página ${pdfCurrentPage} de ${pdfTotalPages}`;

  const area = currentCourse?.area || "Medicina";
  const title = currentLesson?.title || currentCourse?.title || "Apostila de Estudos Médicos";

  if (pdfCurrentPage === 1) {
    container.innerHTML = `
      <h2>${title}</h2>
      <p><strong>Apostila Teórica Oficial — MedStudy Acervo Digital</strong></p>
      <div class="pdf-callout">
        <strong>OBJETIVOS DE APRENDIZAGEM &amp; DIRETRIZES 2026</strong>
        Este material consolida a semiologia, raciocínio fisiopatológico e condutas preconizadas pelos principais consensos de ${area}.
      </div>
      <h3>1. Fundamentos e Mecanismos Etiológicos</h3>
      <p>O domínio das bases fisiológicas permite ao médico antecipar a descompensação hemodinâmica e metabólica antes do colapso clínico.</p>
      <ul>
        <li><strong>Fisiopatologia celular:</strong> Mecanismos de lesão primária e resposta inflamatória sistêmica.</li>
        <li><strong>Estratificação de Risco:</strong> Aplicação sistemática de escores clínicos validados para definição de internamento versus manejo ambulatorial.</li>
        <li><strong>Correlação Propedêutica:</strong> Como os achados do exame físico orientam a escolha direcionada dos exames de imagem e laboratoriais.</li>
      </ul>
    `;
  } else if (pdfCurrentPage === 2) {
    container.innerHTML = `
      <h2>Abordagem Diagnóstica &amp; Exames de 1ª Linha</h2>
      <h3>2. Propedêutica Armada em ${area}</h3>
      <p>A solicitação racional de exames evita iatrogenias e reduz o tempo porta-tratamento.</p>
      <div class="pdf-callout">
        <strong>PÉROLA DE PLANTÃO:</strong> Nunca retarde o início da estabilização clínica para aguardar o resultado de exames complementares quando houver instabilidade hemodinâmica evidente.
      </div>
      <ul>
        <li><strong>Exames Laboratoriais Críticos:</strong> Marcadores de necrose/lesão, gasometria arterial e lactato sérico.</li>
        <li><strong>Métodos de Imagem:</strong> Quando indicar ultrassonografia point-of-care (POCUS) versus tomografia computadorizada contrastada.</li>
        <li><strong>Armadilhas Comuns:</strong> Falsos-positivos e variantes da normalidade frequentemente cobradas nas provas de Título e Residência.</li>
      </ul>
    `;
  } else {
    container.innerHTML = `
      <h2>Conduta Terapêutica &amp; Prescrição Médica</h2>
      <h3>${pdfCurrentPage}. Terapêutica Medicamentosa e Ajustes de Dose</h3>
      <p>Esquemas de primeira linha segundo as diretrizes mais recentes publicadas para ${area}.</p>
      <ul>
        <li><strong>Doses de Ataque e Manutenção:</strong> Esquemas posológicos completos e diluições recomendadas.</li>
        <li><strong>Ajuste em Populações Especiais:</strong> Pacientes com taxa de filtração glomerular estimada reduzida (&lt; 30 mL/min) ou hepatopatas.</li>
        <li><strong>Critérios de Alta Hospitalar:</strong> Parâmetros objetivos para transição segura da via parenteral para via oral.</li>
      </ul>
      <div class="pdf-callout">
        <strong>REVISÃO RÁPIDA:</strong> Memorize as contraindicações absolutas e as principais interações medicamentosas com a terapia de base do paciente.
      </div>
    `;
  }
}

// Explorador de Pastas do Drive no Site (Palco Principal, Aba e Sidebar)
function renderAllDriveFolders() {
  if (!currentCourse) return;
  const folders = currentCourse.folders || [];
  const totalFiles = folders.reduce((acc, f) => acc + (f.files ? f.files.length : 0), 0);

  const inlineCount = $("#inline-folders-count");
  if (inlineCount) {
    inlineCount.textContent = `${folders.length} pastas organizadas · ${totalFiles} arquivos`;
  }

  const externalDriveBtn = $("#btn-external-drive-header");
  if (externalDriveBtn) {
    externalDriveBtn.href = currentCourse.driveUrl || "https://drive.google.com/drive/my-drive";
  }

  const stats = $("#explorer-stats");
  if (stats) {
    stats.innerHTML = `
      <span style="font-size:12px; color:var(--muted); background:var(--panel2); padding:6px 12px; border-radius:6px; border:1px solid var(--line);">
        📁 <strong>${folders.length} pastas</strong> organizadas · <strong>${totalFiles} arquivos</strong> no acervo
      </span>
    `;
  }

  const targets = [
    { el: $("#folders-tree"), isSidebar: false },
    { el: $("#inline-folders-tree"), isSidebar: false },
    { el: $("#sidebar-folders-tree"), isSidebar: true }
  ];

  targets.forEach(({ el, isSidebar }) => {
    if (!el) return;
    el.replaceChildren();

    folders.forEach((folder, idx) => {
      const card = document.createElement("div");
      card.className = "folder-card";
      if (isSidebar) {
        card.style.marginBottom = "8px";
        card.style.background = "var(--panel2)";
        card.style.border = "1px solid var(--line)";
        card.style.borderRadius = "8px";
        card.style.overflow = "hidden";
      }

      const filesCount = folder.files ? folder.files.length : 0;
      const isFirst = idx === 0;

      let filesHtml = "";
      (folder.files || []).forEach((file) => {
        const ext = file.name.split(".").pop().toLowerCase();
        const badgeClass = ext === "mp4" ? "ext-mp4" : "ext-pdf";
        const icon = ext === "mp4" ? "▶" : "📄";

        let buttonsHtml = "";
        if (ext === "mp4") {
          buttonsHtml = `
            <button type="button" class="btn-file-open" data-file-ext="${ext}" data-file-name="${file.name}" style="background:#2563eb; color:#fff; font-weight:700; border:none; padding:${isSidebar ? "4px 8px" : "6px 12px"}; border-radius:6px; font-size:${isSidebar ? "11px" : "12px"}; cursor:pointer; display:inline-flex; align-items:center; gap:4px;">
              ▶ Assistir Aula
            </button>
          `;
        } else {
          buttonsHtml = `
            <button type="button" class="btn-file-open" data-file-ext="${ext}" data-file-name="${file.name}" style="background:var(--panel2); color:#cbd5e1; border:1px solid var(--line); padding:${isSidebar ? "4px 6px" : "6px 10px"}; border-radius:6px; font-size:${isSidebar ? "11px" : "12px"}; cursor:pointer;">
              👁️ Ler Online
            </button>
            <button type="button" class="btn-file-download" data-file-ext="${ext}" data-file-name="${file.name}" style="background:#1e3a8a; color:#93c5fd; border:1px solid #2563eb; font-weight:700; padding:${isSidebar ? "4px 8px" : "6px 12px"}; border-radius:6px; font-size:${isSidebar ? "11px" : "12px"}; cursor:pointer;" title="Download de Apostila (A partir do Plano Anual)">
              📥 Baixar PDF
            </button>
          `;
        }

        filesHtml += `
          <div class="file-item" style="${isSidebar ? "padding:8px 10px; display:flex; flex-direction:column; gap:6px; border-bottom:1px solid rgba(255,255,255,0.05);" : ""}">
            <div class="file-left" style="${isSidebar ? "display:flex; align-items:center; gap:6px; font-size:12px;" : ""}">
              <span class="file-ext-badge ${badgeClass}">${ext}</span>
              <span class="file-name" style="word-break:break-word;">${icon} ${file.name}</span>
            </div>
            <div class="file-right" style="display:flex; align-items:center; justify-content:${isSidebar ? "space-between" : "flex-end"}; gap:8px;">
              <span class="file-size" style="font-size:11px; color:var(--muted);">${file.size || "15 MB"}</span>
              <div style="display:flex; gap:6px;">
                ${buttonsHtml}
              </div>
            </div>
          </div>
        `;
      });

      card.innerHTML = `
        <div class="folder-card-header" style="${isSidebar ? "padding:10px 12px; cursor:pointer; display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.03);" : "cursor:pointer;"}">
          <div class="folder-title-left" style="display:flex; align-items:center; gap:8px;">
            <span class="folder-icon">📁</span>
            <strong style="font-size:${isSidebar ? "12px" : "14px"};">${folder.name}</strong>
            <span class="folder-count-badge" style="font-size:10px; background:rgba(37,99,235,0.2); color:#93c5fd; padding:2px 6px; border-radius:4px;">${filesCount}</span>
          </div>
          <span class="module-toggle-arrow">▾</span>
        </div>
        <div class="folder-files-list" ${isFirst ? "" : 'style="display:none;"'}>
          ${filesHtml}
        </div>
      `;

      // Toggle da pasta
      const header = card.querySelector(".folder-card-header");
      const list = card.querySelector(".folder-files-list");
      header.addEventListener("click", () => {
        const isHidden = list.style.display === "none";
        list.style.display = isHidden ? "flex" : "none";
      });

      // Ações dos botões de abrir arquivo
      card.querySelectorAll(".btn-file-open").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const ext = btn.dataset.fileExt;
          const fileName = btn.dataset.fileName;

          if (ext === "mp4") {
            switchTab("video");
            const lessons = getAllLessons(currentCourse);
            const matchingLesson = lessons.find((l) => fileName.toLowerCase().includes(l.title.toLowerCase()) || l.title.toLowerCase().includes(fileName.toLowerCase())) || lessons[0];
            if (matchingLesson) {
              selectLesson(matchingLesson, true);
            } else if (lessons[0]) {
              selectLesson(lessons[0], true);
            }
            const videoBox = $("#video-container") || document.body;
            videoBox.scrollIntoView({ behavior: "smooth", block: "start" });
          } else {
            switchTab("pdf");
            const docTitle = $("#pdf-doc-title");
            if (docTitle) docTitle.textContent = fileName;
            pdfCurrentPage = 1;
            renderPdfPage();
            window.scrollTo({ top: 0, behavior: "smooth" });
          }
        });
      });

      // Baixar apostila / material complementar em PDF (bloqueado para mensal, liberado anual+)
      card.querySelectorAll(".btn-file-download").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const fileName = btn.dataset.fileName;
          downloadCourseApostila(currentCourse, currentLesson, fileName);
        });
      });

      el.appendChild(card);
    });
  });
}

function renderDriveFolders() {
  renderAllDriveFolders();
}

// Casos Clínicos & Questões
function renderQuiz() {
  const questionEl = $("#quiz-question");
  const optionsEl = $("#quiz-options");
  const feedbackEl = $("#quiz-feedback");

  if (!questionEl || !optionsEl) return;

  const defaultQuiz = {
    question: `Paciente de 62 anos, hipertenso e tabagista, dá entrada com dor precordial constritiva de início há 40 minutos irradiando para membro superior esquerdo. Ao monitor, PA 140/90 mmHg, FC 82 bpm e SatO2 96%. Qual a sequência prioritária de conduta imediata?`,
    options: [
      "Eletrocardiograma de 12 derivações em até 10 minutos e estratificação imediata",
      "Encaminhar para endoscopia digestiva alta de urgência",
      "Iniciar ansiolítico e aguardar retorno dos exames laboratoriais de rotina",
      "Prescrever oxigenioterapia em alto fluxo mesmo com saturação adequada"
    ],
    answer: 0,
    explanation: "A diretriz de dor torácica exige ECG em menos de 10 minutos (porta-eletro) para diferenciar IAM com supra de ST de outras causas e iniciar terapia de reperfusão imediata."
  };

  const quiz = currentLesson?.caseStudy || defaultQuiz;

  questionEl.textContent = quiz.question;
  feedbackEl.hidden = true;
  optionsEl.replaceChildren();

  const letters = ["A", "B", "C", "D"];
  quiz.options.forEach((optText, i) => {
    const btn = document.createElement("button");
    btn.className = "quiz-option-btn";
    btn.innerHTML = `<span class="quiz-letter">${letters[i]}</span> <span>${optText}</span>`;

    btn.addEventListener("click", () => {
      $$(".quiz-option-btn").forEach((b) => (b.disabled = true));
      if (i === quiz.answer) {
        btn.classList.add("correct");
        feedbackEl.className = "quiz-feedback";
        $("#quiz-feedback-title").textContent = "✓ Resposta Correta!";
        $("#quiz-feedback-explanation").textContent = quiz.explanation;
      } else {
        btn.classList.add("wrong");
        $$(".quiz-option-btn")[quiz.answer].classList.add("correct");
        feedbackEl.className = "quiz-feedback wrong";
        $("#quiz-feedback-title").textContent = "✕ Resposta Incorreta";
        $("#quiz-feedback-explanation").textContent = quiz.explanation;
      }
      feedbackEl.hidden = false;
    });

    optionsEl.appendChild(btn);
  });
}

// Anotações de Estudo
function setupNotes() {
  const notesArea = $("#student-notes");
  const status = $("#notes-save-status");
  if (!notesArea) return;

  notesArea.addEventListener("input", () => {
    if (!currentLesson) return;
    status.textContent = "Salvando...";
    try {
      localStorage.setItem(`medstudy.notes.${currentLesson.id}`, notesArea.value);
      setTimeout(() => {
        status.textContent = "Salvo automaticamente";
      }, 400);
    } catch (e) {}
  });
}

function loadLessonNotes() {
  const notesArea = $("#student-notes");
  if (!notesArea || !currentLesson) return;
  try {
    notesArea.value = localStorage.getItem(`medstudy.notes.${currentLesson.id}`) || "";
  } catch (e) {
    notesArea.value = "";
  }
}

function updateActiveLessonInSidebar(lessonId) {
  const items = $$(".lesson-item");
  if (!items || items.length === 0) {
    renderSidebar();
    return;
  }
  items.forEach((it) => {
    const isAct = it.dataset.lessonId === lessonId;
    it.classList.toggle("active", isAct);
    if (isAct) {
      const group = it.closest(".module-group");
      if (group && !group.classList.contains("open")) {
        group.classList.add("open");
      }
    }
  });
}

// Seleção e Execução de Aula com Streaming Imediato
function selectLesson(lesson, autoPlay = false) {
  currentLesson = lesson;
  playbackSeconds = 0;
  if (playbackInterval) clearInterval(playbackInterval);
  const totalDuration = lesson?.durationSeconds || 2700;
  updateTimeUI(totalDuration);
  updateLectureProgressUI();

  // Sincroniza o dropdown rápido do topo do player
  const quickSelect = $("#select-lesson-dropdown");
  if (quickSelect && quickSelect.value !== lesson.id) {
    quickSelect.value = lesson.id;
  }

  // Carrega a URL do vídeo de streaming nativo resiliente
  const nativeVideo = $("#native-video-player");
  const videoUrl = lesson.videoUrl || "/api/stream/sample.mp4";
  
  if (nativeVideo) {
    const currentSrc = nativeVideo.getAttribute("src") || nativeVideo.src;
    if (currentSrc !== videoUrl && !currentSrc.endsWith(videoUrl)) {
      nativeVideo.src = videoUrl;
      nativeVideo.load();
    }
  }

  // Metadados do Player
  const titleEl = $("#current-lesson-title");
  if (titleEl) titleEl.textContent = lesson.title;
  const summaryEl = $("#current-lesson-summary");
  if (summaryEl) summaryEl.textContent = lesson.summary || "Conteúdo teórico e diretrizes atualizadas.";
  const slideTitleEl = $("#video-slide-title");
  if (slideTitleEl) slideTitleEl.textContent = lesson.title;
  const slideSubEl = $("#video-slide-subtitle");
  if (slideSubEl) slideSubEl.textContent = currentCourse?.title || "MedStudy";

  const keypointsContainer = $("#slide-keypoints");
  if (keypointsContainer) {
    keypointsContainer.replaceChildren();
    (lesson.keyPoints || ["Fundamentos fisiopatológicos", "Critérios diagnósticos e condutas"]).forEach((kp) => {
      const item = document.createElement("div");
      item.className = "slide-keypoint-item";
      item.innerHTML = `<span>●</span> <span>${kp}</span>`;
      keypointsContainer.appendChild(item);
    });
  }

  // Capítulos da Aula
  const chaptersList = $("#chapters-list");
  if (chaptersList) {
    chaptersList.replaceChildren();
    const defaultChapters = [
      { time: "00:00", name: "Introdução & Epidemiologia" },
      { time: "06:30", name: "Fisiopatologia & Mecanismos" },
      { time: "14:15", name: "Quadro Clínico & Diagnóstico" },
      { time: "21:40", name: "Conduta Terapêutica & Prescrição" }
    ];
    defaultChapters.forEach((ch) => {
      const li = document.createElement("li");
      li.className = "chapter-item";
      li.innerHTML = `<span>${ch.name}</span> <span class="timestamp">${ch.time}</span>`;
      li.addEventListener("click", () => {
        const [m, s] = ch.time.split(":").map(Number);
        const totalDuration = currentLesson?.durationSeconds || 2700;
        playbackSeconds = m * 60 + s;
        updateTimeUI(totalDuration);
        updateLectureProgressUI(true);
        if (!isPlaying) startPlayback();
      });
      chaptersList.appendChild(li);
    });
  }

  pdfCurrentPage = 1;
  renderPdfPage();
  renderQuiz();
  loadLessonNotes();
  updateProgressUI();
  updateActiveLessonInSidebar(lesson.id);

  // Executa a aula imediatamente se selecionada com autoPlay
  if (autoPlay) {
    switchTab("video");
    const videoBox = $("#video-container") || document.body;
    videoBox.scrollIntoView({ behavior: "smooth", block: "start" });
    startPlayback();
  } else {
    isPlaying = false;
    updatePlayButtonsState(false);
    updateLectureProgressUI();
  }
}

// Popula o Dropdown Rápido de Aulas no Palco
function populateLessonsDropdown() {
  const select = $("#select-lesson-dropdown");
  if (!select || !currentCourse) return;

  select.replaceChildren();

  (currentCourse.modules || []).forEach((mod, modIdx) => {
    const optgroup = document.createElement("optgroup");
    optgroup.label = `Módulo ${modIdx + 1}: ${mod.title}`;

    (mod.lessons || []).forEach((l, lIdx) => {
      const lessonId = l.id || `${currentCourse.id || "c"}-m${modIdx}-l${lIdx}`;
      const opt = document.createElement("option");
      opt.value = lessonId;
      opt.textContent = `${l.title} (${l.duration || "30 min"})`;
      if (currentLesson && currentLesson.id === lessonId) {
        opt.selected = true;
      }
      optgroup.appendChild(opt);
    });

    select.appendChild(optgroup);
  });

  select.onchange = () => {
    const selectedId = select.value;
    const lesson = getAllLessons(currentCourse).find((l) => l.id === selectedId);
    if (lesson) {
      selectLesson(lesson, true);
      switchTab("video");
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };
}

// Grade Completa de Aulas (Painel no Palco e Seção Principal com Busca em Tempo Real)
function renderFullLessonsGrid(filterQuery = "") {
  if (!currentCourse) return;

  const titleEl = $("#grid-course-title");
  const cycleEl = $("#grid-course-cycle");
  const subtitleEl = $("#grid-lessons-subtitle");
  const inlineTitleEl = $("#inline-lessons-title");
  const inlineCountEl = $("#inline-lessons-count");

  const all = getAllLessons(currentCourse);
  const completedList = getCompletedLessons(currentCourse.id);
  const query = (filterQuery || $("#grid-search-input")?.value || $("#inline-lessons-search")?.value || "").trim().toLowerCase();

  if (titleEl) titleEl.textContent = `${currentCourse.title} — Grade Completa de Aulas`;
  if (cycleEl) cycleEl.textContent = currentCourse.category || "Medicina";
  if (inlineTitleEl) inlineTitleEl.textContent = `Todas as Videoaulas de ${currentCourse.title}`;
  if (inlineCountEl) inlineCountEl.textContent = `${all.length} videoaulas disponíveis`;

  const filtered = query
    ? all.filter((l) => l.title.toLowerCase().includes(query) || (l.summary && l.summary.toLowerCase().includes(query)) || (l.moduleTitle && l.moduleTitle.toLowerCase().includes(query)))
    : all;

  if (subtitleEl) {
    subtitleEl.textContent = `${filtered.length} de ${all.length} aulas disponíveis neste curso. Clique para assistir imediatamente em HD.`;
  }

  const targets = [$("#full-lessons-grid-content"), $("#inline-lessons-grid-content")];

  targets.forEach((container) => {
    if (!container) return;
    container.replaceChildren();

    if (filtered.length === 0) {
      container.innerHTML = `
        <div style="text-align:center; padding:40px; color:var(--muted);">
          <p style="font-size:16px;">Nenhuma aula encontrada para o termo "<strong>${query}</strong>".</p>
          <button type="button" class="btn-action-outline btn-clear-search-grid" style="margin-top:10px; cursor:pointer;">Limpar Filtro</button>
        </div>
      `;
      container.querySelector(".btn-clear-search-grid")?.addEventListener("click", () => {
        const inp1 = $("#grid-search-input");
        const inp2 = $("#inline-lessons-search");
        if (inp1) inp1.value = "";
        if (inp2) inp2.value = "";
        renderFullLessonsGrid("");
      });
      return;
    }

    let currentGroupModule = null;
    let currentGroupContainer = null;

    filtered.forEach((lesson, idx) => {
      const modTitle = lesson.moduleTitle || "Módulo de Aulas";
      if (modTitle !== currentGroupModule) {
        currentGroupModule = modTitle;
        const groupHeader = document.createElement("div");
        groupHeader.style.cssText = "margin: 20px 0 10px; padding: 10px 16px; background: rgba(37,99,235,0.08); border-left: 4px solid #2563eb; border-radius: 4px; display:flex; align-items:center; justify-content:space-between;";
        groupHeader.innerHTML = `
          <strong style="color:#60a5fa; font-size:14px;">📂 ${modTitle}</strong>
        `;
        container.appendChild(groupHeader);

        currentGroupContainer = document.createElement("div");
        currentGroupContainer.style.cssText = "display:grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap:12px; margin-bottom:16px;";
        container.appendChild(currentGroupContainer);
      }

      const isCurrent = currentLesson && currentLesson.id === lesson.id;
      const isCompleted = completedList.includes(lesson.id);

      const card = document.createElement("div");
      card.style.cssText = `
        background: ${isCurrent ? "rgba(37,99,235,0.15)" : "var(--panel2)"};
        border: 1px solid ${isCurrent ? "#2563eb" : "var(--line)"};
        border-radius: 8px;
        padding: 14px;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        gap: 10px;
        transition: all 0.2s ease;
      `;

      card.innerHTML = `
        <div>
          <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px; margin-bottom:6px;">
            <span style="font-size:11px; font-weight:700; color:${isCompleted ? "#68d391" : "#94a3b8"}; background:rgba(0,0,0,0.3); padding:2px 6px; border-radius:4px;">
              ${isCompleted ? "✓ Concluída" : `Aula ${idx + 1}`}
            </span>
            <span style="font-size:11px; color:#cbd5e1; font-weight:600;">⏱ ${lesson.duration || "30 min"}</span>
          </div>
          <h4 style="margin:0 0 6px; font-size:14px; color:#fff; line-height:1.4;">${lesson.title}</h4>
          <p style="margin:0; font-size:12px; color:var(--muted); line-height:1.4;">${lesson.summary || "Revisão fisiopatológica e conduta médica."}</p>
        </div>
        <div style="display:flex; gap:8px; align-items:center; margin-top:8px; padding-top:8px; border-top:1px solid rgba(255,255,255,0.06);">
          <button type="button" class="btn-play-grid-card" style="flex:1; background:#2563eb; color:#fff; border:none; border-radius:6px; padding:8px 12px; font-size:12px; font-weight:700; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:6px;">
            ▶ Assistir Aula
          </button>
          <button type="button" class="btn-download-grid-card" style="background:rgba(37,99,235,0.12); color:#93c5fd; border:1px solid rgba(59,130,246,0.3); border-radius:6px; padding:8px 10px; font-size:12px; cursor:pointer;" title="Download de Vídeo em MP4 (Plano VIP)">
            📥 MP4
          </button>
        </div>
      `;

      card.querySelector(".btn-play-grid-card").addEventListener("click", () => {
        selectLesson(lesson, true);
        switchTab("video");
        const videoBox = $("#video-container") || document.body;
        videoBox.scrollIntoView({ behavior: "smooth", block: "start" });
      });

      card.querySelector(".btn-download-grid-card").addEventListener("click", () => {
        handleVideoDownload(lesson);
      });

      currentGroupContainer.appendChild(card);
    });
  });
}

// Download de Videoaulas & Materiais Oficiais (Exclusivo VIP)
function handleVideoDownload(lesson) {
  const targetLesson = lesson || currentLesson;
  if (!targetLesson) return;

  if (canDownloadVideos || isAdmin) {
    const driveUrl = currentCourse?.driveUrl || "https://drive.google.com/drive/my-drive";
    window.open(driveUrl, "_blank");
    alert(`👑 Download VIP Liberado!\n\nAbrindo repositório oficial no Google Drive de "${currentCourse?.title || 'Curso'}".\nVocê tem acesso vitalício a todas as videoaulas em HD 1080p e apostilas para download e estudo offline.`);
  } else {
    openVipModal();
  }
}

// Backup em Nuvem Integrado (Exclusivo VIP)
function handleCloudBackup() {
  if (canDownloadVideos || isAdmin) {
    const driveUrl = currentCourse?.driveUrl || "https://drive.google.com/drive/my-drive";
    window.open(driveUrl, "_blank");
    alert(`👑 Backup em Nuvem MedStudy VIP Ativo!\n\nVocê tem acesso permanente e sincronização ilimitada a todas as pastas deste curso no Google Drive.\nAbrindo o diretório seguro na nuvem.`);
  } else {
    openVipModal();
  }
}

function openVipModal() {
  const modal = $("#vip-modal");
  if (modal) modal.hidden = false;
}

function closeVipModal() {
  const modal = $("#vip-modal");
  if (modal) modal.hidden = true;
}

// Renderização da Sidebar de Módulos e Aulas
function renderSidebar() {
  const container = $("#modules-accordion");
  const filterInput = $("#lesson-search");
  const query = (filterInput?.value || "").trim().toLowerCase();

  if (!container || !currentCourse) return;

  $("#sidebar-course-title").textContent = currentCourse.title;
  $("#sidebar-course-cycle").textContent = currentCourse.category || "Medicina";
  $("#lesson-cycle-badge").textContent = currentCourse.category || "Medicina";

  const symbolEl = $("#course-symbol");
  if (symbolEl) {
    symbolEl.textContent = currentCourse.icon || "◈";
    symbolEl.className = "course-symbol-small symbol-" + (currentCourse.color || "red");
  }

  container.replaceChildren();
  const completedList = getCompletedLessons(currentCourse.id);

  (currentCourse.modules || []).forEach((mod, modIdx) => {
    const group = document.createElement("div");
    const modLessons = (mod.lessons || []).map((l, lIdx) => ({
      ...l,
      id: l.id || `${currentCourse.id || "c"}-m${modIdx}-l${lIdx}`,
      moduleTitle: mod.title
    }));
    const isOpen = modIdx === 0 || modLessons.some((l) => l.id === currentLesson?.id);
    group.className = "module-group" + (isOpen ? " open" : "");

    const filteredLessons = modLessons.filter((l) => {
      return !query || l.title.toLowerCase().includes(query) || (l.summary && l.summary.toLowerCase().includes(query));
    });

    if (query && filteredLessons.length === 0) return;

    let lessonsHtml = "";
    filteredLessons.forEach((lesson) => {
      const isActive = lesson.id === currentLesson?.id;
      const isChecked = completedList.includes(lesson.id);

      lessonsHtml += `
        <div class="lesson-item ${isActive ? "active" : ""}" data-lesson-id="${lesson.id}">
          <div class="lesson-item-left">
            <button class="lesson-check-btn ${isChecked ? "checked" : ""}" data-check-id="${lesson.id}" title="Marcar concluída">✓</button>
            <div class="lesson-text-info">
              <span class="lesson-name">${lesson.title}</span>
              <span class="lesson-meta-small">
                <span>⏱ ${lesson.duration || "30 min"}</span>
                <span>•</span>
                <span>▶ Videoaula + PDF</span>
              </span>
            </div>
          </div>
          <span class="lesson-arrow" style="font-size:11px; color:#5c6861;">➔</span>
        </div>
      `;
    });

    group.innerHTML = `
      <div class="module-header">
        <div class="module-title-box">
          <strong>${mod.title}</strong>
          <span>${filteredLessons.length} aulas disponíveis</span>
        </div>
        <span class="module-toggle-arrow">▾</span>
      </div>
      <div class="lessons-list">
        ${lessonsHtml}
      </div>
    `;

    group.querySelector(".module-header").addEventListener("click", () => {
      group.classList.toggle("open");
    });

    group.querySelectorAll(".lesson-item").forEach((item) => {
      item.addEventListener("click", (e) => {
        if (e.target.closest(".lesson-check-btn")) return;
        const lId = item.dataset.lessonId;
        const targetLesson = getAllLessons(currentCourse).find((l) => l.id === lId);
        if (targetLesson) {
          selectLesson(targetLesson, true);
        }
      });
    });

    group.querySelectorAll(".lesson-check-btn").forEach((chk) => {
      chk.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleLessonCompleted(chk.dataset.checkId);
      });
    });

    container.appendChild(group);
  });
}

// ==========================================
// TESTE GRÁTIS DE 30 MINUTOS COM CADASTRO OBRIGATÓRIO
// ==========================================
function setupTrialRegister() {
  const form = $("#trial-register-form");
  const errorEl = $("#trial-register-error");
  const btnSubmit = $("#btn-submit-trial");

  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (errorEl) errorEl.hidden = true;

    const name = ($("#trial-name")?.value || "").trim();
    const email = ($("#trial-email")?.value || "").trim().toLowerCase();
    const whatsapp = ($("#trial-whatsapp")?.value || "").replace(/\D/g, "");

    if (name.length < 2) {
      showError("Por favor, digite seu nome completo.");
      return;
    }
    if (!email.includes("@") || !email.includes(".")) {
      showError("Por favor, informe um e-mail válido.");
      return;
    }
    if (whatsapp.length < 10) {
      showError("Por favor, informe seu WhatsApp com DDD (mínimo 10 dígitos).");
      return;
    }

    if (btnSubmit) {
      btnSubmit.disabled = true;
      btnSubmit.innerHTML = `<span>Validando cadastro...</span>`;
    }

    try {
      const res = await api("/api/trial/register", {
        method: "POST",
        body: JSON.stringify({ name, email, whatsapp })
      });

      const userRecord = res.user || { name, email, whatsapp };
      localStorage.setItem(TRIAL_USER_KEY, JSON.stringify(userRecord));
      localStorage.setItem(TRIAL_KEY, "1800");
      localStorage.setItem(TRIAL_START_KEY, String(Date.now()));
      trialSecondsRemaining = 1800;

      // Fecha o modal de registro
      const modal = $("#trial-register-modal");
      if (modal) modal.hidden = true;

      // Inicia timer e UI
      initFreeTrial();
      updateUserBadge();

      // Inicia a aula automaticamente se estiver pausada
      if (!isPlaying) {
        $("#btn-play-big")?.click();
      }
    } catch (err) {
      showError(err.message || "Erro ao registrar teste grátis. Verifique seus dados.");
    } finally {
      if (btnSubmit) {
        btnSubmit.disabled = false;
        btnSubmit.innerHTML = `<span>Liberar 30 Minutos de Teste Grátis</span> <span>➔</span>`;
      }
    }
  });

  function showError(msg) {
    if (errorEl) {
      errorEl.textContent = msg;
      errorEl.hidden = false;
    }
  }
}

function initFreeTrial() {
  const pill = $("#trial-pill");
  const timerText = $("#trial-timer");

  if (isUserActive || isAdmin) {
    const regModal = $("#trial-register-modal");
    if (regModal) regModal.hidden = true;
    const expModal = $("#trial-expired-modal");
    if (expModal) expModal.hidden = true;

    if (pill && timerText) {
      if (isAdmin) {
        pill.className = "trial-pill admin";
        timerText.textContent = "👑 Administrador VIP (Acesso Irrestrito)";
      } else {
        pill.className = "trial-pill unlimited";
        timerText.textContent = "👑 Acesso Ilimitado Ativo";
      }
    }
    return;
  }

  const trialUser = getTrialUser();
  if (!trialUser) {
    if (pill && timerText) {
      pill.className = "trial-pill";
      timerText.textContent = "⚡ Iniciar Teste Grátis (30 min)";
      pill.style.cursor = "pointer";
      pill.onclick = () => openTrialRegisterModal();
    }
    openTrialRegisterModal();
    return;
  }

  // Usuário cadastrado! Recupera tempo restante
  let savedRemaining = localStorage.getItem(TRIAL_KEY);
  if (savedRemaining === null) {
    trialSecondsRemaining = TOTAL_TRIAL_SECONDS;
    localStorage.setItem(TRIAL_KEY, String(trialSecondsRemaining));
    localStorage.setItem(TRIAL_START_KEY, String(Date.now()));
  } else {
    trialSecondsRemaining = parseInt(savedRemaining, 10);
    if (isNaN(trialSecondsRemaining)) trialSecondsRemaining = TOTAL_TRIAL_SECONDS;
  }

  updateTrialUI();

  if (trialSecondsRemaining <= 0) {
    lockTrialExpired();
    return;
  }

  if (trialInterval) clearInterval(trialInterval);
  trialInterval = setInterval(() => {
    if (isUserActive || isAdmin) {
      clearInterval(trialInterval);
      return;
    }

    trialSecondsRemaining = Math.max(0, trialSecondsRemaining - 1);
    localStorage.setItem(TRIAL_KEY, String(trialSecondsRemaining));
    updateTrialUI();

    if (trialSecondsRemaining <= 0) {
      clearInterval(trialInterval);
      lockTrialExpired();
    }
  }, 1000);
}

function updateTrialUI() {
  const timerText = $("#trial-timer");
  if (!timerText) return;
  const trialUser = getTrialUser();
  const m = String(Math.floor(trialSecondsRemaining / 60)).padStart(2, "0");
  const s = String(trialSecondsRemaining % 60).padStart(2, "0");
  const firstName = trialUser?.name ? trialUser.name.split(" ")[0] : "";
  timerText.textContent = firstName ? `Teste Grátis (${firstName}): ${m}:${s}` : `Teste Grátis: ${m}:${s}`;
}

function lockTrialExpired() {
  const modal = $("#trial-expired-modal");
  if (modal) modal.hidden = false;

  // Interrompe qualquer reprodução
  if (isPlaying) {
    const btnPlayBig = $("#btn-play-big");
    const ctrlPlay = $("#ctrl-play-pause");
    isPlaying = false;
    if (playbackInterval) clearInterval(playbackInterval);
    if (btnPlayBig) btnPlayBig.textContent = "▶";
    if (ctrlPlay) ctrlPlay.textContent = "▶";
  }

  const timerText = $("#trial-timer");
  if (timerText) timerText.textContent = "Teste Grátis Expirado (00:00)";
  const pill = $("#trial-pill");
  if (pill) {
    pill.style.background = "rgba(37, 99, 235, 0.15)";
    pill.style.borderColor = "#2563eb";
    pill.style.color = "#60a5fa";
  }
}

// ==========================================
// PROTEÇÃO DRM: ANTI-DOWNLOAD, ANTI-GRAVAÇÃO E ANTI-CAPTURA
// ==========================================
function initDRMProtection() {
  // Marca d'água Dinâmica Flutuante
  const watermark = $("#drm-watermark");
  const userStamp = $("#drm-user-stamp");
  const timeStamp = $("#drm-time-stamp");

  // Identificador do aluno ou visitante
  let guestId = localStorage.getItem("medstudy.guest_session_id");
  if (!guestId) {
    guestId = "STU-" + Math.random().toString(36).substring(2, 8).toUpperCase();
    localStorage.setItem("medstudy.guest_session_id", guestId);
  }

  const trialUser = getTrialUser();
  const identity = currentUser?.email || (isAdmin ? "ADMIN MASTER" : (trialUser ? `TESTE: ${trialUser.name.toUpperCase()} (${trialUser.whatsapp})` : `ALUNO #${guestId}`));
  if (userStamp) userStamp.textContent = identity;

  function updateWatermarkPosition() {
    if (!watermark) return;
    const now = new Date();
    if (timeStamp) timeStamp.textContent = now.toTimeString().split(" ")[0];

    const randomTop = Math.floor(Math.random() * 75 + 10);
    const randomLeft = Math.floor(Math.random() * 65 + 10);
    watermark.style.top = `${randomTop}%`;
    watermark.style.left = `${randomLeft}%`;
  }

  updateWatermarkPosition();
  if (watermarkInterval) clearInterval(watermarkInterval);
  watermarkInterval = setInterval(updateWatermarkPosition, 3500);

  // Escudo de Blackout (Anti-Captura e Anti-Gravação de Tela)
  const shield = $("#drm-blackout-shield");
  const resumeBtn = $("#btn-drm-resume");

  function triggerBlackoutShield(reason) {
    if (isAdmin) return; // Permite ao admin auditar sem interrupções
    if (shield && shield.hidden) {
      shield.hidden = false;
      if (isPlaying) {
        $("#btn-play-big")?.click();
      }
    }
  }

  resumeBtn?.addEventListener("click", () => {
    if (shield) shield.hidden = true;
  });

  // Evento de mudança de visibilidade (aba minimizada)
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden" && isPlaying) {
      // Pausa discreta ao minimizar aba
      const nativeVideo = $("#native-video-player");
      if (nativeVideo && !nativeVideo.paused) nativeVideo.pause();
    }
  });

  // Intercepção de Teclado (PrintScreen, F12, Ctrl+Shift+I/J/C, Ctrl+U, Ctrl+S, Ctrl+P)
  window.addEventListener("keydown", (e) => {
    if (e.key === "PrintScreen") {
      e.preventDefault();
      triggerBlackoutShield("printscreen");
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText("Conteúdo Protegido MedStudy DRM").catch(() => {});
      }
      return;
    }

    if (
      e.key === "F12" ||
      (e.ctrlKey && e.shiftKey && ["I", "i", "J", "j", "C", "c"].includes(e.key)) ||
      (e.ctrlKey && ["u", "U", "s", "S", "p", "P"].includes(e.key))
    ) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }
  });

  // Bloqueio de Botão Direito (Context Menu) e Drag
  document.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    return false;
  });

  document.addEventListener("dragstart", (e) => {
    e.preventDefault();
    return false;
  });
}

// Carregamento de Cursos e Seleção Inicial
async function initCourse() {
  const urlParams = new URLSearchParams(window.location.search);
  const requestedCourseId = urlParams.get("curso");

  try {
    const data = await api("/api/courses");
    allCourses = data.courses || [];
    isUserActive = Boolean(data.userActive);
    isAdmin = Boolean(data.isAdmin);
    isVip = Boolean(data.isVip || (data.user && data.user.plan === "vip") || isAdmin);
    canDownloadVideos = Boolean(data.canDownloadVideos || isVip || isAdmin);
    canDownloadPdfs = Boolean(
      data.canDownloadPdfs ||
      isAdmin ||
      isVip ||
      (data.user && (data.user.plan === "annual" || data.user.plan === "lifetime" || data.user.plan === "vip"))
    );
    currentUser = data.user || null;

    const defaultCourseId = allCourses[0] ? allCourses[0].id : "medcurso-ciclo-completo-r1";
    const courseId = requestedCourseId && allCourses.some((c) => c.id === requestedCourseId) ? requestedCourseId : defaultCourseId;

    // Header badge
    updateUserBadge();

    // Inicializa proteções e teste grátis
    initDRMProtection();
    initFreeTrial();

    // Preenche seletor de cursos no header
    const select = $("#course-select");
    select.replaceChildren();
    allCourses.forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c.id;
      opt.textContent = `${c.title} (${c.category})`;
      if (c.id === courseId) opt.selected = true;
      select.appendChild(opt);
    });

    select.addEventListener("change", () => {
      window.location.href = `sala.html?curso=${select.value}`;
    });

    currentCourse = allCourses.find((c) => c.id === courseId) || allCourses[0];
    if (currentCourse) {
      document.title = `${currentCourse.title} — Sala de Aula MedStudy`;

      const lessons = getAllLessons(currentCourse);
      currentLesson = lessons[0] || null;

      // Atualiza o título da tab de grade de aulas com contagem real
      const tabTitle = $("#tab-lessons-title");
      if (tabTitle) tabTitle.textContent = `Grade de Aulas (${lessons.length})`;

      populateLessonsDropdown();
      renderSidebar();
      renderAllDriveFolders();
      renderFullLessonsGrid();
      if (currentLesson) selectLesson(currentLesson, false);
    }
  } catch (err) {
    console.error("Erro ao carregar dados do curso:", err);
  }
}

function updateUserBadge() {
  const badge = $("#user-badge");
  if (!badge) return;
  const trialUser = getTrialUser();
  if (isAdmin) {
    badge.textContent = "👑 Administrador Master";
    badge.style.display = "inline-flex";
  } else if (isVip) {
    badge.textContent = "👑 VIP + Backup Vitalício";
    badge.style.display = "inline-flex";
  } else if (currentUser && isUserActive) {
    badge.textContent = "● Assinatura Ativa";
    badge.style.display = "inline-flex";
  } else if (trialUser) {
    badge.textContent = `⚡ Teste Grátis (${trialUser.name.split(" ")[0]})`;
    badge.style.display = "inline-flex";
  } else {
    badge.textContent = "○ Teste Grátis";
    badge.style.display = "inline-flex";
  }
}

// ==========================================
// PRECEPTORA IA MÉDICA ESPECIALIZADA (VIP)
// ==========================================
function renderAiPreceptorUI() {
  const lockedView = $("#ai-preceptor-locked");
  const activeView = $("#ai-preceptor-active");
  const badgeStatus = $("#ai-vip-badge-status");

  const hasVipAccess = Boolean(isVip || isAdmin);

  if (!hasVipAccess) {
    if (lockedView) lockedView.hidden = false;
    if (activeView) activeView.style.display = "none";
    if (badgeStatus) {
      badgeStatus.textContent = "🔒 Acesso Restrito (Exclusivo Plano VIP)";
      badgeStatus.style.color = "#fca5a5";
      badgeStatus.style.borderColor = "#ef4444";
    }
    return;
  }

  if (lockedView) lockedView.hidden = true;
  if (activeView) activeView.style.display = "block";
  if (badgeStatus) {
    badgeStatus.textContent = isAdmin ? "👑 Administrador Master (Acesso Total)" : "👑 Aluno VIP (Preceptoria Liberada)";
    badgeStatus.style.color = "#fbbf24";
    badgeStatus.style.borderColor = "#f59e0b";
  }

  const messagesContainer = $("#ai-chat-messages");
  if (messagesContainer && messagesContainer.children.length === 0) {
    appendAiMessage("assistant", `### 🩺 Olá, colega! Sou a Dra. Sofia MedStudy
Sou sua **Preceptora de Clínica Médica, Terapia Intensiva e Provas de Residência Médica**.
Estou conectada 24 horas para apoiar sua prática clínica e seus estudos com:
* **Condutas em sala de emergência e UTI** baseadas nos consensos mais atuais (SBC, AHA, GINA, GOLD, Sepsis-3 2026);
* **Prescrições armadas completas** com doses de ataque, diluições e ajustes para função renal e peso;
* **Critérios diagnósticos e escores de risco** (TIMI, GRACE, CURB-65, KDIGO, SOFA);
* **Resolução comentada de questões de Residência** padrão ENARE, USP e SUS-SP.

*Selecione um dos temas rápidos acima ou digite sua pergunta clínica abaixo!*`);
  }
}

function formatMarkdownToHtml(md) {
  if (!md) return "";
  let html = md
    .replace(/^### (.*$)/gim, '<h3 style="color:#60a5fa; margin:0 0 10px; font-size:16px;">$1</h3>')
    .replace(/^#### (.*$)/gim, '<h4 style="color:#fbbf24; margin:14px 0 6px; font-size:13.5px;">$1</h4>')
    .replace(/\*\*(.*?)\*\*/gim, '<strong style="color:#fff;">$1</strong>')
    .replace(/\*(.*?)\*/gim, '<em>$1</em>')
    .replace(/^\* (.*$)/gim, '<li style="margin-bottom:4px; font-size:13.5px; color:#cbd5e1;">$1</li>')
    .replace(/^- (.*$)/gim, '<li style="margin-bottom:4px; font-size:13.5px; color:#cbd5e1;">$1</li>');

  html = html.replace(/(<li.*<\/li>)/s, '<ul style="padding-left:20px; margin:8px 0;">$1</ul>');
  html = html.replace(/\n\n/g, '<div style="height:10px;"></div>');
  html = html.replace(/\n/g, '<br>');
  return html;
}

function appendAiMessage(role, text) {
  const container = $("#ai-chat-messages");
  if (!container) return;

  const msgDiv = document.createElement("div");
  msgDiv.className = `ai-message ${role}`;

  const headerDiv = document.createElement("div");
  headerDiv.style.cssText = "display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; font-size:11px; font-weight:700;";

  if (role === "user") {
    headerDiv.innerHTML = `<span style="color:#93c5fd;">👨‍⚕️ Você (Aluno VIP)</span> <span style="color:#64748b;">${new Date().toLocaleTimeString().slice(0,5)}</span>`;
    const bodyDiv = document.createElement("div");
    bodyDiv.textContent = text;
    msgDiv.appendChild(headerDiv);
    msgDiv.appendChild(bodyDiv);
  } else {
    headerDiv.innerHTML = `
      <span style="color:#fbbf24;">🤖 Dra. Sofia MedStudy · Preceptora</span>
      <div style="display:flex; gap:8px; align-items:center;">
        <button type="button" class="btn-copy-ai-msg" style="background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.1); color:#94a3b8; border-radius:4px; padding:2px 6px; font-size:10px; cursor:pointer;" title="Copiar conduta">📋 Copiar</button>
        <button type="button" class="btn-speak-ai-msg" style="background:rgba(37,99,235,0.2); border:1px solid #2563eb; color:#93c5fd; border-radius:4px; padding:2px 6px; font-size:10px; cursor:pointer;" title="Ouvir áudio">🔊 Ouvir</button>
      </div>
    `;
    const bodyDiv = document.createElement("div");
    bodyDiv.innerHTML = formatMarkdownToHtml(text);

    msgDiv.appendChild(headerDiv);
    msgDiv.appendChild(bodyDiv);

    msgDiv.querySelector(".btn-copy-ai-msg")?.addEventListener("click", () => {
      if (navigator.clipboard) {
        navigator.clipboard.writeText(text);
        alert("Conduta clínica copiada para a área de transferência!");
      }
    });

    msgDiv.querySelector(".btn-speak-ai-msg")?.addEventListener("click", () => {
      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
        const plainText = text.replace(/[#*`_]/g, "");
        const utterance = new SpeechSynthesisUtterance(plainText);
        utterance.lang = "pt-BR";
        utterance.rate = 1.05;
        window.speechSynthesis.speak(utterance);
      }
    });
  }

  container.appendChild(msgDiv);
  container.scrollTop = container.scrollHeight;
}

function setupAiPreceptor() {
  // Chips de perguntas rápidas
  $$(".btn-ai-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      const q = chip.dataset.query;
      const input = $("#ai-chat-input");
      if (input) {
        input.value = q;
        $("#ai-chat-form")?.dispatchEvent(new Event("submit"));
      }
    });
  });

  // Limpar chat
  $("#btn-clear-ai-chat")?.addEventListener("click", () => {
    const container = $("#ai-chat-messages");
    if (container) {
      container.replaceChildren();
      renderAiPreceptorUI();
    }
  });

  // Envio de pergunta
  const form = $("#ai-chat-form");
  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = $("#ai-chat-input");
    const question = (input?.value || "").trim();
    if (!question) return;

    if (input) input.value = "";
    appendAiMessage("user", question);

    // Indicador de digitação
    const container = $("#ai-chat-messages");
    const typingIndicator = document.createElement("div");
    typingIndicator.className = "ai-typing-indicator";
    typingIndicator.id = "ai-typing-indicator";
    typingIndicator.innerHTML = `
      <span style="font-size:12px; color:#94a3b8; margin-right:4px;">Dra. Sofia está estruturando a conduta...</span>
      <span class="ai-typing-dot"></span>
      <span class="ai-typing-dot"></span>
      <span class="ai-typing-dot"></span>
    `;
    container?.appendChild(typingIndicator);
    if (container) container.scrollTop = container.scrollHeight;

    const btnSubmit = $("#btn-submit-ai-query");
    if (btnSubmit) btnSubmit.disabled = true;

    try {
      const res = await api("/api/ai/clinical-query", {
        method: "POST",
        body: JSON.stringify({
          question,
          context: {
            courseId: currentCourse?.id,
            lessonTitle: currentLesson?.title
          }
        })
      });

      document.getElementById("ai-typing-indicator")?.remove();
      appendAiMessage("assistant", res.answer || "Resposta processada.");
    } catch (err) {
      document.getElementById("ai-typing-indicator")?.remove();
      if (err.status === 403 || err.message?.includes("VIP")) {
        openVipModal();
        appendAiMessage("assistant", "⚠️ **Acesso Restrito:** A Preceptora IA Médica é um recurso exclusivo para alunos do **Plano VIP (R$ 1.000)**. Faça o upgrade para ter acesso ilimitado a condutas de plantão e provas de residência.");
      } else {
        appendAiMessage("assistant", `❌ Erro ao consultar a Preceptora: ${err.message || "Tente novamente em instantes."}`);
      }
    } finally {
      if (btnSubmit) btnSubmit.disabled = false;
    }
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  setupTabs();
  setupVideoPlayer();
  setupPdfViewer();
  setupNotes();
  setupTrialRegister();
  setupAiPreceptor();

  // Busca na sidebar tradicional
  $("#lesson-search")?.addEventListener("input", () => {
    renderSidebar();
  });

  // Busca na grade completa de aulas (no palco e na aba)
  $("#grid-search-input")?.addEventListener("input", (e) => {
    renderFullLessonsGrid(e.target.value);
  });
  $("#inline-lessons-search")?.addEventListener("input", (e) => {
    renderFullLessonsGrid(e.target.value);
  });

  // Botões da Barra Rápida de Seleção de Aulas
  $("#btn-trigger-play")?.addEventListener("click", () => {
    const btnPlay = $("#btn-play-medical-big") || $("#btn-play-big");
    if (btnPlay) {
      btnPlay.click();
    } else {
      const lesson = currentLesson || (currentCourse ? getAllLessons(currentCourse)[0] : null);
      if (lesson) selectLesson(lesson, true);
    }
  });

  $("#btn-open-lessons-tab")?.addEventListener("click", () => {
    switchTab("lessons-grid");
  });

  $("#btn-video-download")?.addEventListener("click", () => {
    handleVideoDownload(currentLesson);
  });

  $("#btn-cloud-backup-cta")?.addEventListener("click", () => {
    handleCloudBackup();
  });

  // Seletor de Modo na Sidebar (Módulos vs Pastas Drive)
  const sidebarTabModules = $("#sidebar-tab-modules");
  const sidebarTabFolders = $("#sidebar-tab-folders");
  const modulesAccordion = $("#modules-accordion");
  const sidebarFoldersTree = $("#sidebar-folders-tree");

  sidebarTabModules?.addEventListener("click", () => {
    sidebarTabModules.classList.add("active");
    sidebarTabModules.style.background = "#2563eb";
    sidebarTabModules.style.color = "#fff";
    sidebarTabFolders?.classList.remove("active");
    if (sidebarTabFolders) {
      sidebarTabFolders.style.background = "var(--panel2)";
      sidebarTabFolders.style.color = "#94a3b8";
    }
    if (modulesAccordion) modulesAccordion.style.display = "block";
    if (sidebarFoldersTree) sidebarFoldersTree.style.display = "none";
  });

  sidebarTabFolders?.addEventListener("click", () => {
    sidebarTabFolders.classList.add("active");
    sidebarTabFolders.style.background = "#2563eb";
    sidebarTabFolders.style.color = "#fff";
    sidebarTabModules?.classList.remove("active");
    if (sidebarTabModules) {
      sidebarTabModules.style.background = "var(--panel2)";
      sidebarTabModules.style.color = "#94a3b8";
    }
    if (modulesAccordion) modulesAccordion.style.display = "none";
    if (sidebarFoldersTree) sidebarFoldersTree.style.display = "flex";
  });

  // Modal de Upgrade para Download de PDF (A partir do Plano Anual)
  $("#btn-close-pdf-modal")?.addEventListener("click", () => {
    closePdfUpgradeModal();
  });

  $("#btn-read-pdf-online-free")?.addEventListener("click", () => {
    closePdfUpgradeModal();
    switchTab("pdf");
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  const pdfModal = $("#pdf-upgrade-modal");
  pdfModal?.addEventListener("click", (e) => {
    if (e.target === pdfModal) {
      closePdfUpgradeModal();
    }
  });

  // Modal VIP
  $("#btn-close-vip-modal")?.addEventListener("click", () => {
    closeVipModal();
  });

  const vipModal = $("#vip-modal");
  vipModal?.addEventListener("click", (e) => {
    if (e.target === vipModal) {
      closeVipModal();
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeVipModal();
      closePdfUpgradeModal();
    }
  });

  await initCourse();
});

