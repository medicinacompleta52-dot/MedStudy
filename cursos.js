const TOKEN_KEY = "medstudy.access-token";
const ADMIN_TOKEN_KEY = "medstudy.admin_token";
const TRIAL_KEY = "medstudy.trial_remaining_seconds";
const TRIAL_START_KEY = "medstudy.trial_started_at";
const TOTAL_TRIAL_SECONDS = 1800; // 30 minutos

let allCourses = [];
let isUserActive = false;
let isAdmin = false;
let currentUser = null;
let currentFilter = "all";
let trialSecondsRemaining = 1800;
let trialInterval = null;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);

function getToken() {
  return localStorage.getItem(TOKEN_KEY) || localStorage.getItem(ADMIN_TOKEN_KEY);
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
    const error = new Error(data.error || "Ocorreu um erro ao comunicar com o servidor.");
    error.status = res.status;
    throw error;
  }
  return data;
}

// ==========================================
// CONTROLE DE DEGUSTAÇÃO GRÁTIS (30 MINUTOS)
// ==========================================
function initFreeTrial() {
  if (isUserActive || isAdmin) {
    const pill = $("#trial-pill");
    if (pill) {
      pill.className = isAdmin ? "trial-pill admin" : "trial-pill unlimited";
      pill.innerHTML = `<span class="trial-dot"></span><span>${isAdmin ? "👑 Acesso Administrador" : "✓ Assinatura Ativa"}</span>`;
    }
    return;
  }

  let remaining = localStorage.getItem(TRIAL_KEY);
  if (remaining !== null) {
    trialSecondsRemaining = parseInt(remaining, 10);
    if (isNaN(trialSecondsRemaining)) trialSecondsRemaining = TOTAL_TRIAL_SECONDS;
  } else {
    trialSecondsRemaining = TOTAL_TRIAL_SECONDS;
    localStorage.setItem(TRIAL_KEY, trialSecondsRemaining);
    localStorage.setItem(TRIAL_START_KEY, Date.now());
  }

  updateTrialUI();

  if (trialInterval) clearInterval(trialInterval);
  trialInterval = setInterval(() => {
    if (trialSecondsRemaining > 0) {
      trialSecondsRemaining--;
      localStorage.setItem(TRIAL_KEY, trialSecondsRemaining);
      updateTrialUI();
      if (trialSecondsRemaining <= 0) {
        clearInterval(trialInterval);
        lockTrialExpired();
      }
    }
  }, 1000);
}

function updateTrialUI() {
  const timerEl = $("#trial-timer");
  if (!timerEl) return;
  const m = Math.floor(trialSecondsRemaining / 60).toString().padStart(2, "0");
  const s = (trialSecondsRemaining % 60).toString().padStart(2, "0");
  timerEl.textContent = `Degustação: ${m}:${s}`;
}

function lockTrialExpired() {
  const modal = $("#trial-expired-modal");
  if (modal) modal.hidden = false;
}

function updateHeaderUser(user, active) {
  const badge = $("#user-badge");
  const link = $("#header-account-link");

  if (isAdmin) {
    badge.className = "user-badge active-sub";
    badge.innerHTML = `<span>👑</span> Administrador (Acesso Total)`;
    badge.style.display = "inline-flex";
    link.innerHTML = `<span>Painel Admin</span> <span>↗</span>`;
    link.href = "admin.html";
  } else if (user) {
    badge.className = "user-badge " + (active ? "active-sub" : "inactive-sub");
    badge.innerHTML = active
      ? `<span>●</span> Assinante Ativo (${user.email.split("@")[0]})`
      : `<span>○</span> Plano Inativo (${user.email.split("@")[0]})`;
    badge.style.display = "inline-flex";
    link.innerHTML = `<span>Minha Conta</span> <span>↗</span>`;
    link.href = "conta.html";
  } else {
    badge.style.display = "none";
    link.innerHTML = `<span>Entrar / Assinar</span> <span>↗</span>`;
    link.href = "conta.html";
  }
}

function updateStatusBanner(active) {
  const banner = $("#status-banner");
  if (!banner) return;

  if (active || isAdmin) {
    banner.className = "status-banner unlocked";
    banner.innerHTML = `
      <div class="status-info">
        <div class="status-icon">✓</div>
        <div class="status-text">
          <strong>Acesso Total Liberado — Google Drive &amp; Sala de Aula</strong>
          <span>Sua assinatura está ativa. Todos os links diretos para pastas e materiais em alta resolução estão disponíveis abaixo.</span>
        </div>
      </div>
      <div style="display:flex; gap:10px; flex-wrap:wrap;">
        <a href="https://drive.google.com/drive/my-drive" target="_blank" rel="noopener noreferrer" class="status-btn" style="background: #193829; color: #67d69d; border: 1px solid #2e694c; font-weight: 700;">📂 Abrir Drive Completo ↗</a>
        <a href="sala.html" class="status-btn" style="background: #1c3c2b; color: #8be0b2; border: 1px solid #2f694b;">▶ Acessar Sala de Aula</a>
      </div>
    `;
  } else {
    banner.className = "status-banner locked";
    banner.innerHTML = `
      <div class="status-info">
        <div class="status-icon">⏱️</div>
        <div class="status-text">
          <strong>⚡ Degustação Grátis (30 Minutos) Ativa em Todos os Cursos!</strong>
          <span>Você pode testar qualquer matéria: assista às videoaulas em HD, leia as apostilas completas e explore as pastas do Google Drive.</span>
        </div>
      </div>
      <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center;">
        <a href="sala.html" class="status-btn" style="background: #ed414b; color: #fff; font-weight: 800; border: none; padding: 12px 20px; font-size:14px; text-decoration:none; border-radius:8px;">▶ Iniciar Degustação na Sala de Aula ➔</a>
        <a href="conta.html" class="status-btn status-btn-primary">💳 Ver Planos &amp; Mercado Pago ↗</a>
      </div>
    `;
  }
}

function renderCourses() {
  const grid = $("#courses-grid");
  const searchInput = $("#course-search");
  const query = (searchInput?.value || "").trim().toLowerCase();

  const filtered = allCourses.filter((course) => {
    const matchesFilter =
      currentFilter === "all" ||
      (course.category && course.category.toLowerCase().includes(currentFilter.toLowerCase())) ||
      (course.area && course.area.toLowerCase().includes(currentFilter.toLowerCase()));

    const matchesSearch =
      !query ||
      course.title.toLowerCase().includes(query) ||
      course.area.toLowerCase().includes(query) ||
      (course.description && course.description.toLowerCase().includes(query)) ||
      (course.category && course.category.toLowerCase().includes(query));

    return matchesFilter && matchesSearch;
  });

  if ($("#courses-count")) {
    $("#courses-count").textContent = `Exibindo ${filtered.length} de ${allCourses.length} cursos cadastrados`;
  }

  if ($("#no-courses")) {
    $("#no-courses").hidden = filtered.length > 0;
  }

  grid.replaceChildren();

  filtered.forEach((course) => {
    const card = document.createElement("article");
    card.className = "course-card";

    const colorClass = "symbol-" + (course.color || "red");
    const icon = course.icon || "◈";
    const foldersCount = (course.folders || []).length || 4;

    card.innerHTML = `
      <div class="card-top">
        <div class="card-symbol ${colorClass}">${icon}</div>
        <span class="badge-cycle">${course.category || "Medicina"}</span>
      </div>
      <div class="card-area">${course.area || "Geral"}</div>
      <h2 class="card-title">${course.title}</h2>
      <p class="card-description">${course.description || "Videoaulas e materiais de apoio estruturados no Google Drive."}</p>
      
      <div class="card-meta">
        <div class="meta-row">
          <span class="meta-icon">▶</span>
          <span>${course.modulesCount || 1} módulos / aulas estruturadas</span>
        </div>
        <div class="meta-row">
          <span class="meta-icon">📁</span>
          <span>${course.materials || "Videoaulas + Apostilas no Google Drive"}</span>
        </div>
      </div>

      <div class="card-action" style="display:flex; flex-direction:column; gap:8px; margin-top:16px;">
        <a href="sala.html?curso=${course.id}" class="btn-study-site" style="background:#ed414b; color:#fff; text-decoration:none; padding:11px 16px; border-radius:8px; font-weight:800; display:flex; align-items:center; justify-content:space-between; font-size:13px;" title="Assistir aulas diretamente no player HD da sala">
          <span>▶ Assistir Aula (Player HD)</span> <span>➔</span>
        </a>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px;">
          <a href="sala.html?curso=${course.id}&tab=pdf" class="btn-folder-preview" style="text-decoration:none; text-align:center; padding:8px; font-size:12px; font-weight:600;" title="Ver apostilas e diretrizes em PDF">
            📄 Apostila PDF
          </a>
          <button type="button" class="btn-folder-preview" data-preview-course="${course.id}" style="padding:8px; font-size:12px; font-weight:600;">
            📁 Pastas Drive (${foldersCount})
          </button>
        </div>
        ${isUserActive && course.driveUrl ? `
          <a href="${course.driveUrl}" target="_blank" rel="noopener noreferrer" class="btn-external-subtle" style="font-size:11px; text-align:center; color:#68d391; text-decoration:underline;">
            📂 Abrir pasta no Google Drive externo ↗
          </a>
        ` : `
          <a href="conta.html" style="font-size:11px; color:#8fa099; text-align:center; text-decoration:none; margin-top:2px;">
            🔒 Desbloquear permanente com Mercado Pago ou Pix
          </a>
        `}
      </div>
    `;

    grid.appendChild(card);
  });

  // Event listeners para botões de prévia de pastas
  $$(".btn-folder-preview").forEach((btn) => {
    btn.addEventListener("click", () => {
      const cId = btn.dataset.previewCourse;
      if (!cId) return;
      const c = allCourses.find((item) => item.id === cId);
      if (c) openFolderPreviewModal(c);
    });
  });
}

function setupFilters() {
  const pills = $$(".pill");
  pills.forEach((pill) => {
    pill.addEventListener("click", () => {
      pills.forEach((p) => p.classList.remove("active"));
      pill.classList.add("active");
      currentFilter = pill.dataset.filter;
      renderCourses();
    });
  });

  const searchInput = $("#course-search");
  const clearBtn = $("#clear-search");

  if (searchInput) {
    searchInput.addEventListener("input", () => {
      if (clearBtn) clearBtn.hidden = !searchInput.value;
      renderCourses();
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      searchInput.value = "";
      clearBtn.hidden = true;
      searchInput.focus();
      renderCourses();
    });
  }

  $("#btn-reset-filters")?.addEventListener("click", () => {
    if (searchInput) searchInput.value = "";
    if (clearBtn) clearBtn.hidden = true;
    currentFilter = "all";
    pills.forEach((p) => p.classList.toggle("active", p.dataset.filter === "all"));
    renderCourses();
  });

  const urlParams = new URLSearchParams(window.location.search);
  const areaParam = urlParams.get("area");
  if (areaParam && searchInput) {
    searchInput.value = areaParam;
    if (clearBtn) clearBtn.hidden = false;
  }
}

function setupModal() {
  const modal = $("#add-course-modal");
  const openBtn = $("#open-add-modal-btn");
  const closeBtn = $("#close-add-modal-btn");
  const cancelBtn = $("#cancel-add-modal-btn");
  const form = $("#add-course-form");
  const feedback = $("#modal-feedback");

  if (!modal || !openBtn) return;

  function openModal() {
    if (!getToken()) {
      alert("Para cadastrar novos cursos, entre com sua conta na área de login.");
      window.location.href = "conta.html";
      return;
    }
    feedback.hidden = true;
    modal.hidden = false;
  }

  function closeModal() {
    modal.hidden = true;
    form.reset();
  }

  openBtn.addEventListener("click", openModal);
  closeBtn?.addEventListener("click", closeModal);
  cancelBtn?.addEventListener("click", closeModal);

  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const saveBtn = $("#save-course-btn");
    saveBtn.disabled = true;
    feedback.hidden = false;
    feedback.className = "modal-feedback";
    feedback.textContent = "Salvando curso...";

    try {
      const payload = {
        title: $("#course-title").value.trim(),
        category: $("#course-category").value,
        area: $("#course-area").value.trim(),
        driveUrl: $("#course-drive-url").value.trim(),
        modulesCount: Number($("#course-modules").value) || 1,
        materials: $("#course-materials").value.trim(),
        description: $("#course-description").value.trim()
      };

      await api("/api/courses", {
        method: "POST",
        body: JSON.stringify(payload)
      });

      feedback.textContent = "Curso cadastrado com sucesso!";
      setTimeout(async () => {
        closeModal();
        await loadCoursesData();
      }, 700);
    } catch (err) {
      feedback.className = "modal-feedback error";
      feedback.textContent = err.message;
    } finally {
      saveBtn.disabled = false;
    }
  });
}

function openFolderPreviewModal(course) {
  const modal = $("#folder-preview-modal");
  const cycleEl = $("#preview-modal-cycle");
  const titleEl = $("#preview-modal-title");
  const descEl = $("#preview-modal-desc");
  const studyBtn = $("#preview-modal-study-btn");
  const listEl = $("#preview-modal-folders-list");
  const closeBtn = $("#close-folder-modal-btn");
  const cancelBtn = $("#cancel-folder-modal-btn");

  if (!modal) return;

  if (cycleEl) cycleEl.textContent = course.category || "Medicina";
  if (titleEl) titleEl.textContent = `📁 Pastas do Drive: ${course.title}`;
  if (descEl) descEl.textContent = course.description || "Videoaulas e apostilas estruturadas no acervo do Google Drive.";
  if (studyBtn) studyBtn.href = `sala.html?curso=${course.id}`;

  if (listEl) {
    listEl.replaceChildren();

    const folders = course.folders || [
      { name: "01 - Videoaulas em HD (1080p)", files: [{ name: "Aula 01 - Fundamentos e Diretrizes.mp4", size: "380 MB" }, { name: "Aula 02 - Propedêutica e Diagnóstico.mp4", size: "420 MB" }] },
      { name: "02 - Apostilas Teóricas em PDF", files: [{ name: "Apostila_Teorica_Completa.pdf", size: "22 MB" }, { name: "Caderno_de_Questoes.pdf", size: "14 MB" }] },
      { name: "03 - Casos Clínicos & Fluxogramas", files: [{ name: "Guia_de_Prescricao_Pratica.pdf", size: "9 MB" }, { name: "Fluxograma_de_Conduta.pdf", size: "4 MB" }] }
    ];

    folders.forEach((f) => {
      const box = document.createElement("div");
      box.style.background = "#181d1b";
      box.style.border = "1px solid #28322e";
      box.style.borderRadius = "8px";
      box.style.padding = "14px";

      let filesHtml = "";
      (f.files || []).forEach((file) => {
        filesHtml += `
          <div style="display:flex; justify-content:space-between; align-items:center; padding:6px 0; border-bottom:1px solid #222926; font-size:12px;">
            <span style="color:#d8dedb;">📄 ${file.name}</span>
            <span style="color:#788680; font-family:monospace; font-size:11px;">${file.size || ""}</span>
          </div>
        `;
      });

      box.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
          <strong style="color:#72d9a3; font-size:13px;">📁 ${f.name}</strong>
          <span style="font-size:10px; color:#84908a; background:#121614; padding:2px 8px; border-radius:10px;">${(f.files || []).length} arquivos</span>
        </div>
        <div style="display:flex; flex-direction:column;">
          ${filesHtml}
        </div>
      `;
      listEl.appendChild(box);
    });
  }

  modal.hidden = false;

  function closeModal() {
    modal.hidden = true;
  }

  if (closeBtn) closeBtn.onclick = closeModal;
  if (cancelBtn) cancelBtn.onclick = closeModal;
  modal.onclick = (e) => {
    if (e.target === modal) closeModal();
  };
}

async function loadCoursesData() {
  try {
    const data = await api("/api/courses");
    allCourses = data.courses || [];
    isUserActive = Boolean(data.userActive);
    isAdmin = Boolean(data.isAdmin);
    currentUser = data.user || null;

    updateHeaderUser(currentUser, isUserActive);
    updateStatusBanner(isUserActive);
    initFreeTrial();
    renderCourses();
  } catch (err) {
    console.error("Erro ao carregar catálogo:", err);
    if ($("#courses-count")) $("#courses-count").textContent = "Não foi possível carregar os cursos.";
  }
}

// Inicialização
document.addEventListener("DOMContentLoaded", async () => {
  setupFilters();
  setupModal();
  await loadCoursesData();
});
