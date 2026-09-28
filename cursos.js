const TOKEN_KEY = "medstudy.access-token";
const ADMIN_TOKEN_KEY = "medstudy.admin_token";
let allCourses = [];
let isUserActive = false;
let isAdmin = false;
let currentUser = null;
let currentFilter = "all";

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
          <strong>Degustação Grátis de 30 Minutos Disponível!</strong>
          <span>Experimente a sala de aula com player de vídeo HD, leitor de PDF e pastas do Drive protegidos contra cópia.</span>
        </div>
      </div>
      <div style="display:flex; gap:10px; flex-wrap:wrap;">
        <a href="sala.html" class="status-btn" style="background: #ed414b; color: #fff; font-weight: 700; border: none;">⚡ Iniciar Teste Grátis (30 min) ➔</a>
        <a href="conta.html" class="status-btn status-btn-primary">Ver Planos de Assinatura ↗</a>
      </div>
    `;
  }
}

function renderCourses() {
  const grid = $("#courses-grid");
  const searchInput = $("#course-search");
  const query = (searchInput.value || "").trim().toLowerCase();

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

  $("#courses-count").textContent = `Exibindo ${filtered.length} de ${allCourses.length} cursos`;
  $("#no-courses").hidden = filtered.length > 0;
  grid.replaceChildren();

  filtered.forEach((course) => {
    const card = document.createElement("article");
    card.className = "course-card";

    const colorClass = "symbol-" + (course.color || "red");
    const icon = course.icon || "◈";

    let actionBtn;
    const foldersCount = (course.folders || []).length || 4;
    
    if (isUserActive) {
      actionBtn = `
        <a href="sala.html?curso=${course.id}" class="btn-study-site" title="Assistir aulas e ler apostilas diretamente no site">
          <span>▶ Estudar no Site</span> <span>➔</span>
        </a>
        <button class="btn-folder-preview" data-preview-course="${course.id}">
          📁 Ver Pastas do Drive (${foldersCount})
        </button>
        ${course.driveUrl ? `<a href="${course.driveUrl}" target="_blank" rel="noopener noreferrer" class="btn-external-subtle">Abrir pasta no Google Drive externo ↗</a>` : ""}
      `;
    } else {
      actionBtn = `
        <a href="sala.html?curso=${course.id}" class="btn-study-site" title="Acessar sala de aula do curso">
          <span>▶ Ver Aulas &amp; Conteúdo no Site</span> <span>➔</span>
        </a>
        <button class="btn-folder-preview" data-preview-course="${course.id}">
          📁 Ver Pastas do Drive (${foldersCount})
        </button>
        <a href="conta.html" class="btn-lock" style="margin-top:8px;" title="Assine para liberar todos os materiais">
          <span>🔒 Desbloquear com Assinatura</span> <span>→</span>
        </a>
      `;
    }

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
          <span>${course.modulesCount || 1} módulos / aulas no site</span>
        </div>
        <div class="meta-row">
          <span class="meta-icon">📁</span>
          <span>${course.materials || "Videoaulas + Apostilas no Google Drive"}</span>
        </div>
      </div>
      <div class="card-action">
        ${actionBtn}
      </div>
    `;

    grid.appendChild(card);
  });

  // Event listeners para botões de prévia de pastas
  $$(".btn-folder-preview").forEach((btn) => {
    btn.addEventListener("click", () => {
      const cId = btn.dataset.previewCourse;
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

  searchInput.addEventListener("input", () => {
    clearBtn.hidden = !searchInput.value;
    renderCourses();
  });

  clearBtn.addEventListener("click", () => {
    searchInput.value = "";
    clearBtn.hidden = true;
    searchInput.focus();
    renderCourses();
  });

  $("#btn-reset-filters")?.addEventListener("click", () => {
    searchInput.value = "";
    clearBtn.hidden = true;
    currentFilter = "all";
    pills.forEach((p) => p.classList.toggle("active", p.dataset.filter === "all"));
    renderCourses();
  });

  // Checa se há parâmetro ?area= na URL (ex: ?area=Cardiologia)
  const urlParams = new URLSearchParams(window.location.search);
  const areaParam = urlParams.get("area");
  if (areaParam) {
    searchInput.value = areaParam;
    clearBtn.hidden = false;
  }
}

function setupModal() {
  const modal = $("#add-course-modal");
  const openBtn = $("#open-add-modal-btn");
  const closeBtn = $("#close-add-modal-btn");
  const cancelBtn = $("#cancel-add-modal-btn");
  const form = $("#add-course-form");
  const feedback = $("#modal-feedback");

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
  closeBtn.addEventListener("click", closeModal);
  cancelBtn.addEventListener("click", closeModal);

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

  cycleEl.textContent = course.category || "Medicina";
  titleEl.textContent = `📁 Pastas do Drive: ${course.title}`;
  descEl.textContent = course.description || "Videoaulas e apostilas estruturadas no acervo do Google Drive.";
  studyBtn.href = `sala.html?curso=${course.id}`;

  listEl.replaceChildren();

  const folders = course.folders || [
    { name: "01 - Videoaulas em HD (1080p)", files: [{ name: "Aula 01 - Introdução.mp4", size: "350 MB" }] },
    { name: "02 - Apostilas em PDF", files: [{ name: "Apostila_Teorica.pdf", size: "18 MB" }] }
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

  modal.hidden = false;

  function closeModal() {
    modal.hidden = true;
  }

  closeBtn.onclick = closeModal;
  cancelBtn.onclick = closeModal;
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
    renderCourses();
  } catch (err) {
    console.error("Erro ao carregar catálogo:", err);
    $("#courses-count").textContent = "Não foi possível carregar os cursos.";
  }
}

// Inicialização
document.addEventListener("DOMContentLoaded", async () => {
  setupFilters();
  setupModal();
  await loadCoursesData();
});
