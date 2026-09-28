// Gerenciamento da Seção de Áreas Médicas
const search = document.querySelector("#area-search");
const areaCards = [...document.querySelectorAll(".area-card")];
const noAreas = document.querySelector("#no-areas");

if (search) {
  search.addEventListener("input", () => {
    const query = search.value.trim().toLocaleLowerCase("pt-BR");
    let visible = 0;
    areaCards.forEach((card) => {
      const match = card.textContent.toLocaleLowerCase("pt-BR").includes(query);
      card.hidden = !match;
      if (match) visible += 1;
    });
    noAreas.hidden = visible > 0;
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "/" && !["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)) {
      event.preventDefault();
      search.focus();
    }
  });
}

// Gerenciamento do Catálogo de Cursos & Pastas na Landing Page
let landingCourses = [];
let landingFilter = "all";

async function loadLandingCourses() {
  try {
    const res = await fetch("/api/courses");
    const data = await res.json();
    landingCourses = data.courses || [];
    renderLandingCatalog();
    renderLandingFoldersTree();
  } catch (err) {
    console.error("Erro ao carregar catálogo da landing page:", err);
    const countEl = document.querySelector("#landing-courses-count");
    if (countEl) countEl.textContent = "Erro ao carregar acervo.";
  }
}

function renderLandingCatalog() {
  const grid = document.querySelector("#landing-courses-grid");
  const countEl = document.querySelector("#landing-courses-count");
  const searchInput = document.querySelector("#landing-course-search");
  if (!grid) return;

  const query = (searchInput?.value || "").trim().toLowerCase();

  const filtered = landingCourses.filter((course) => {
    const matchesFilter =
      landingFilter === "all" ||
      course.category.toLowerCase() === landingFilter.toLowerCase() ||
      course.area.toLowerCase() === landingFilter.toLowerCase();

    const matchesSearch =
      !query ||
      course.title.toLowerCase().includes(query) ||
      course.area.toLowerCase().includes(query) ||
      (course.description && course.description.toLowerCase().includes(query)) ||
      (course.category && course.category.toLowerCase().includes(query));

    return matchesFilter && matchesSearch;
  });

  if (countEl) {
    countEl.textContent = `Exibindo ${filtered.length} de ${landingCourses.length} cursos disponíveis no site`;
  }

  grid.replaceChildren();

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 40px; background: #fff; border-radius: 10px; border: 1px solid #dfe4df;">
        <p style="font-size: 14px; color: #63716a; margin: 0 0 10px;">Nenhum curso encontrado para os critérios selecionados.</p>
        <button id="btn-clear-landing-filter" style="background:#ed414b; color:#fff; border:none; padding:8px 16px; border-radius:6px; font-weight:700; cursor:pointer;">Limpar Filtros</button>
      </div>
    `;
    document.querySelector("#btn-clear-landing-filter")?.addEventListener("click", () => {
      if (searchInput) searchInput.value = "";
      landingFilter = "all";
      document.querySelectorAll(".landing-pill").forEach((p) => p.classList.toggle("active", p.dataset.filter === "all"));
      renderLandingCatalog();
    });
    return;
  }

  filtered.forEach((course) => {
    const card = document.createElement("article");
    card.className = "landing-course-card";

    const colorClass = "symbol-" + (course.color || "red");
    const icon = course.icon || "◈";
    const foldersCount = (course.folders || []).length || 4;

    card.innerHTML = `
      <div class="landing-card-top">
        <div class="landing-symbol ${colorClass}">${icon}</div>
        <span class="landing-badge-cycle">${course.category || "Medicina"}</span>
      </div>
      <div class="landing-card-area">${course.area || "Geral"}</div>
      <h3 class="landing-card-title">${course.title}</h3>
      <p class="landing-card-desc">${course.description || "Videoaulas e apostilas integradas no acervo do site."}</p>
      
      <div class="landing-card-meta">
        <span>▶ ${course.modulesCount || 1} módulos / aulas</span>
        <span>•</span>
        <span>📁 ${foldersCount} pastas de materiais</span>
      </div>

      <div class="landing-card-actions">
        <a href="sala.html?curso=${course.id}" class="landing-btn-study" title="Assistir aulas diretamente no site">
          ▶ Assistir no Site ➔
        </a>
        <a href="cursos.html?area=${encodeURIComponent(course.area)}" class="landing-btn-folder" title="Ver grade completa de pastas">
          📁 Explorar Pastas
        </a>
      </div>
    `;

    grid.appendChild(card);
  });
}

function renderLandingFoldersTree() {
  const container = document.querySelector("#landing-folders-tree");
  if (!container || landingCourses.length === 0) return;

  container.replaceChildren();

  // Agrupa os cursos por ciclo
  const cycles = [
    { name: "01 - Ciclo Básico", filter: "Ciclo Básico", icon: "◈" },
    { name: "02 - Ciclo Clínico", filter: "Ciclo Clínico", icon: "♡" },
    { name: "03 - Prática & Internato", filter: "Prática & Internato", icon: "＋" },
    { name: "04 - Residência & Revalida", filter: "Residência & Revalida", icon: "🏆" }
  ];

  cycles.forEach((cycle, idx) => {
    const coursesInCycle = landingCourses.filter((c) => c.category === cycle.filter);
    const item = document.createElement("div");
    item.className = "folders-tree-item" + (idx === 0 ? " open" : "");

    let coursesHtml = "";
    coursesInCycle.forEach((c) => {
      coursesHtml += `
        <div class="tree-course-row" data-course-id="${c.id}">
          <div class="tree-course-info">
            <span class="tree-folder-icon">📁</span>
            <strong>${c.title}</strong>
          </div>
          <a href="sala.html?curso=${c.id}" class="tree-play-link" title="Abrir sala de aula">▶ Estudar</a>
        </div>
      `;
    });

    item.innerHTML = `
      <div class="tree-folder-header">
        <div class="tree-folder-title">
          <span class="tree-cycle-symbol">${cycle.icon}</span>
          <strong>${cycle.name}</strong>
          <small class="tree-count">${coursesInCycle.length} matérias</small>
        </div>
        <span class="tree-arrow">▾</span>
      </div>
      <div class="tree-folder-body">
        ${coursesHtml}
      </div>
    `;

    item.querySelector(".tree-folder-header").addEventListener("click", () => {
      item.classList.toggle("open");
    });

    item.querySelectorAll(".tree-course-row").forEach((row) => {
      row.addEventListener("click", (e) => {
        if (e.target.classList.contains("tree-play-link")) return;
        const cId = row.dataset.courseId;
        const searchInput = document.querySelector("#landing-course-search");
        const found = landingCourses.find((c) => c.id === cId);
        if (found && searchInput) {
          searchInput.value = found.title;
          renderLandingCatalog();
          document.querySelector("#landing-courses-grid")?.scrollIntoView({ behavior: "smooth" });
        }
      });
    });

    container.appendChild(item);
  });
}

function setupLandingControls() {
  const pills = document.querySelectorAll(".landing-pill");
  pills.forEach((pill) => {
    pill.addEventListener("click", () => {
      pills.forEach((p) => p.classList.remove("active"));
      pill.classList.add("active");
      landingFilter = pill.dataset.filter;
      renderLandingCatalog();
    });
  });

  const searchInput = document.querySelector("#landing-course-search");
  if (searchInput) {
    searchInput.addEventListener("input", () => {
      renderLandingCatalog();
    });
  }
}

document.addEventListener("DOMContentLoaded", () => {
  setupLandingControls();
  loadLandingCourses();
});
