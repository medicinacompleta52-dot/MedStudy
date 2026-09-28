const TOKEN_KEY = "medstudy.access-token";
let allCourses = [];
let currentCourse = null;
let currentLesson = null;
let isUserActive = false;
let currentUser = null;
let currentTab = "video";
let isPlaying = false;
let playbackSeconds = 0;
let playbackInterval = null;
let currentSpeed = 1.0;
let pdfCurrentPage = 1;
let pdfTotalPages = 6;
let pdfZoom = 100;

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

async function api(path, options = {}) {
  const token = getToken();
  const headers = {
    "Content-Type": "application/json",
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
  return course.modules.flatMap((m) => m.lessons || []);
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
    pdf: $("#panel-pdf"),
    folders: $("#panel-folders"),
    quiz: $("#panel-quiz"),
    "drive-embed": $("#panel-drive-embed")
  };

  Object.entries(panels).forEach(([name, panel]) => {
    if (panel) panel.hidden = name !== tabName;
  });

  if (tabName === "drive-embed") {
    setupDriveEmbed();
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

// Controles do Player de Vídeo
function setupVideoPlayer() {
  const btnPlayBig = $("#btn-play-big");
  const ctrlPlay = $("#ctrl-play-pause");
  const ctrlRewind = $("#ctrl-rewind");
  const ctrlForward = $("#ctrl-forward");
  const scrubBar = $("#scrub-bar");
  const speedBtn = $("#speed-btn");
  const speedDropdown = $("#speed-dropdown");
  const markDoneBtn = $("#ctrl-mark-done");

  function togglePlay() {
    isPlaying = !isPlaying;
    btnPlayBig.textContent = isPlaying ? "❚❚" : "▶";
    ctrlPlay.textContent = isPlaying ? "❚❚" : "▶";

    if (isPlaying) {
      if (playbackInterval) clearInterval(playbackInterval);
      playbackInterval = setInterval(() => {
        playbackSeconds += currentSpeed;
        if (playbackSeconds >= 1680) { // ~28 min
          playbackSeconds = 1680;
          togglePlay();
          if (currentLesson) {
            const completed = getCompletedLessons(currentCourse.id);
            if (!completed.includes(currentLesson.id)) {
              toggleLessonCompleted(currentLesson.id);
            }
          }
        }
        updateTimeUI();
      }, 1000);
    } else {
      clearInterval(playbackInterval);
    }
  }

  btnPlayBig.addEventListener("click", togglePlay);
  ctrlPlay.addEventListener("click", togglePlay);

  ctrlRewind.addEventListener("click", () => {
    playbackSeconds = Math.max(0, playbackSeconds - 10);
    updateTimeUI();
  });

  ctrlForward.addEventListener("click", () => {
    playbackSeconds = Math.min(1680, playbackSeconds + 10);
    updateTimeUI();
  });

  scrubBar.addEventListener("click", (e) => {
    const rect = scrubBar.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    playbackSeconds = Math.round(pos * 1680);
    updateTimeUI();
  });

  // Seletor de Velocidade
  speedBtn.addEventListener("click", () => {
    speedDropdown.hidden = !speedDropdown.hidden;
  });

  speedDropdown.addEventListener("click", (e) => {
    if (e.target.dataset.speed) {
      currentSpeed = Number(e.target.dataset.speed);
      speedBtn.textContent = `${currentSpeed.toFixed(1)}x`;
      $$(".speed-dropdown button").forEach((b) => b.classList.remove("active"));
      e.target.classList.add("active");
      speedDropdown.hidden = true;
    }
  });

  document.addEventListener("click", (e) => {
    if (!speedBtn.contains(e.target) && !speedDropdown.contains(e.target)) {
      speedDropdown.hidden = true;
    }
  });

  markDoneBtn.addEventListener("click", () => {
    if (currentLesson) {
      toggleLessonCompleted(currentLesson.id);
    }
  });

  $("#ctrl-fullscreen")?.addEventListener("click", () => {
    const container = $("#video-container");
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

function updateTimeUI() {
  const curM = String(Math.floor(playbackSeconds / 60)).padStart(2, "0");
  const curS = String(Math.floor(playbackSeconds % 60)).padStart(2, "0");
  $("#time-current").textContent = `${curM}:${curS}`;

  const pct = (playbackSeconds / 1680) * 100;
  $("#scrub-progress").style.width = `${pct}%`;
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
    alert(`Iniciando download da apostila completa de ${currentCourse?.title} em formato PDF...`);
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

// Explorador de Pastas do Drive no Site
function renderDriveFolders() {
  const container = $("#folders-tree");
  const stats = $("#explorer-stats");
  if (!container || !currentCourse) return;

  const folders = currentCourse.folders || [];
  const totalFiles = folders.reduce((acc, f) => acc + (f.files ? f.files.length : 0), 0);

  stats.innerHTML = `
    <span style="font-size:12px; color:var(--muted); background:var(--panel2); padding:6px 12px; border-radius:6px; border:1px solid var(--line);">
      📁 <strong>${folders.length} pastas</strong> organizadas · <strong>${totalFiles} arquivos</strong> no acervo
    </span>
  `;

  container.replaceChildren();

  folders.forEach((folder, idx) => {
    const card = document.createElement("div");
    card.className = "folder-card";

    const filesCount = folder.files ? folder.files.length : 0;
    const isFirst = idx === 0;

    let filesHtml = "";
    (folder.files || []).forEach((file) => {
      const ext = file.name.split(".").pop().toLowerCase();
      const badgeClass = ext === "mp4" ? "ext-mp4" : "ext-pdf";
      const icon = ext === "mp4" ? "▶" : "📄";

      filesHtml += `
        <div class="file-item">
          <div class="file-left">
            <span class="file-ext-badge ${badgeClass}">${ext}</span>
            <span class="file-name">${icon} ${file.name}</span>
          </div>
          <div class="file-right">
            <span class="file-size">${file.size || "15 MB"}</span>
            <button class="btn-file-open" data-file-ext="${ext}" data-file-name="${file.name}">
              ${ext === "mp4" ? "Assistir no Player" : "Ler no Site"}
            </button>
          </div>
        </div>
      `;
    });

    card.innerHTML = `
      <div class="folder-card-header">
        <div class="folder-title-left">
          <span class="folder-icon">📁</span>
          <strong>${folder.name}</strong>
          <span class="folder-count-badge">${filesCount} arquivos</span>
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

    // Abrir arquivo diretamente dentro da aba certa
    card.querySelectorAll(".btn-file-open").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const ext = btn.dataset.fileExt;
        if (ext === "mp4") {
          switchTab("video");
          window.scrollTo({ top: 0, behavior: "smooth" });
        } else {
          switchTab("pdf");
          window.scrollTo({ top: 0, behavior: "smooth" });
        }
      });
    });

    container.appendChild(card);
  });
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

// Seleção de Aula
function selectLesson(lesson) {
  currentLesson = lesson;
  playbackSeconds = 0;
  isPlaying = false;
  if (playbackInterval) clearInterval(playbackInterval);
  updateTimeUI();
  $("#btn-play-big").textContent = "▶";
  $("#ctrl-play-pause").textContent = "▶";

  // Metadados do Player
  $("#current-lesson-title").textContent = lesson.title;
  $("#current-lesson-summary").textContent = lesson.summary || "Conteúdo teórico e diretrizes atualizadas.";
  $("#video-slide-title").textContent = lesson.title;
  $("#video-slide-subtitle").textContent = currentCourse?.title || "MedStudy";

  const keypointsContainer = $("#slide-keypoints");
  keypointsContainer.replaceChildren();
  (lesson.keyPoints || ["Fundamentos fisiopatológicos", "Critérios diagnósticos e condutas"]).forEach((kp) => {
    const item = document.createElement("div");
    item.className = "slide-keypoint-item";
    item.innerHTML = `<span>●</span> <span>${kp}</span>`;
    keypointsContainer.appendChild(item);
  });

  // Capítulos da Aula
  const chaptersList = $("#chapters-list");
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
      playbackSeconds = m * 60 + s;
      updateTimeUI();
      if (!isPlaying) $("#btn-play-big").click();
    });
    chaptersList.appendChild(li);
  });

  pdfCurrentPage = 1;
  renderPdfPage();
  renderQuiz();
  loadLessonNotes();
  updateProgressUI();
  renderSidebar();
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
    const isOpen = modIdx === 0 || mod.lessons?.some((l) => l.id === currentLesson?.id);
    group.className = "module-group" + (isOpen ? " open" : "");

    const filteredLessons = (mod.lessons || []).filter((l) => {
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
        if (e.target.dataset.checkId) return;
        const lId = item.dataset.lessonId;
        const targetLesson = getAllLessons(currentCourse).find((l) => l.id === lId);
        if (targetLesson) selectLesson(targetLesson);
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

// Carregamento de Cursos e Seleção Inicial
async function initCourse() {
  const urlParams = new URLSearchParams(window.location.search);
  const courseId = urlParams.get("curso") || "cardiologia-ecg";

  try {
    const data = await api("/api/courses");
    allCourses = data.courses || [];
    isUserActive = Boolean(data.userActive);
    currentUser = data.user || null;

    // Header badge
    const badge = $("#user-badge");
    if (badge && currentUser) {
      badge.textContent = isUserActive ? "● Assinatura Ativa" : "○ Visitante";
    }

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

      renderSidebar();
      renderDriveFolders();
      if (currentLesson) selectLesson(currentLesson);
    }
  } catch (err) {
    console.error("Erro ao carregar dados do curso:", err);
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  setupTabs();
  setupVideoPlayer();
  setupPdfViewer();
  setupNotes();

  $("#lesson-search")?.addEventListener("input", () => {
    renderSidebar();
  });

  await initCourse();
});
