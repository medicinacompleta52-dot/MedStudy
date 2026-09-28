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
    if (noAreas) noAreas.hidden = visible > 0;
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

// Filtragem instantânea dos cards renderizados no HTML
function filterStaticCards() {
  const cards = document.querySelectorAll(".landing-course-card");
  const countEl = document.querySelector("#landing-courses-count");
  const searchInput = document.querySelector("#landing-course-search");
  const query = (searchInput?.value || "").trim().toLowerCase();

  let visibleCount = 0;
  cards.forEach((card) => {
    const category = card.dataset.category || "";
    const area = card.dataset.area || "";
    const searchData = card.dataset.search || card.textContent.toLowerCase();

    const matchesFilter =
      landingFilter === "all" ||
      category.toLowerCase() === landingFilter.toLowerCase() ||
      area.toLowerCase() === landingFilter.toLowerCase();

    const matchesSearch = !query || searchData.includes(query);

    if (matchesFilter && matchesSearch) {
      card.hidden = false;
      card.style.display = "";
      visibleCount++;
    } else {
      card.hidden = true;
      card.style.display = "none";
    }
  });

  if (countEl) {
    countEl.textContent = `Exibindo ${visibleCount} de ${cards.length} cursos disponíveis no acervo`;
  }
}

async function loadLandingCourses() {
  try {
    const res = await fetch("/api/courses");
    const data = await res.json();
    landingCourses = data.courses || [];
    // Se a API trouxer mais cursos do que os pré-renderizados, atualiza
    const existingCards = document.querySelectorAll(".landing-course-card");
    if (landingCourses.length > 0 && landingCourses.length !== existingCards.length) {
      renderLandingCatalog();
      renderLandingFoldersTree();
    }
  } catch (err) {
    console.warn("Aviso: carregando a partir dos dados locais pré-renderizados:", err);
  }
}

function renderLandingCatalog() {
  const grid = document.querySelector("#landing-courses-grid");
  const countEl = document.querySelector("#landing-courses-count");
  const searchInput = document.querySelector("#landing-course-search");
  if (!grid || landingCourses.length === 0) return;

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
    countEl.textContent = `Exibindo ${filtered.length} de ${landingCourses.length} cursos disponíveis no acervo`;
  }

  grid.replaceChildren();

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 40px; background: #0f1622; border-radius: 12px; border: 1px solid #1e293b;">
        <p style="font-size: 14px; color: #94a3b8; margin: 0 0 14px;">Nenhum curso encontrado para os critérios selecionados.</p>
        <button id="btn-clear-landing-filter" style="background:#2563eb; color:#fff; border:none; padding:9px 18px; border-radius:6px; font-weight:700; cursor:pointer;">Limpar Filtros</button>
      </div>
    `;
    document.querySelector("#btn-clear-landing-filter")?.addEventListener("click", () => {
      if (searchInput) searchInput.value = "";
      landingFilter = "all";
      document.querySelectorAll(".landing-pill").forEach((p) => p.classList.toggle("active", p.dataset.filter === "all"));
      filterStaticCards();
    });
    return;
  }

  filtered.forEach((course) => {
    const card = document.createElement("article");
    card.className = "landing-course-card";
    card.dataset.category = course.category;
    card.dataset.area = course.area;
    card.dataset.id = course.id;
    card.dataset.search = (course.title + " " + course.area + " " + (course.description || "")).toLowerCase();

    const icon = course.icon || "◈";
    const foldersCount = (course.folders || []).length || 4;

    card.innerHTML = `
      <div class="landing-card-top">
        <div class="landing-symbol">${icon}</div>
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
          ▶ Estudar no Site ➔
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

    bindFolderItemEvents(item);
    container.appendChild(item);
  });
}

function bindFolderItemEvents(item) {
  item.querySelector(".tree-folder-header")?.addEventListener("click", () => {
    item.classList.toggle("open");
  });

  item.querySelectorAll(".tree-course-row").forEach((row) => {
    row.addEventListener("click", (e) => {
      if (e.target.classList.contains("tree-play-link")) return;
      const cId = row.dataset.courseId;
      const searchInput = document.querySelector("#landing-course-search");
      const title = row.querySelector("strong")?.textContent;
      if (title && searchInput) {
        searchInput.value = title;
        filterStaticCards();
        document.querySelector("#catalogo-pastas")?.scrollIntoView({ behavior: "smooth" });
      }
    });
  });
}

function setupLandingControls() {
  const pills = document.querySelectorAll(".landing-pill");
  pills.forEach((pill) => {
    pill.addEventListener("click", () => {
      pills.forEach((p) => p.classList.remove("active"));
      pill.classList.add("active");
      landingFilter = pill.dataset.filter;
      filterStaticCards();
    });
  });

  const searchInput = document.querySelector("#landing-course-search");
  if (searchInput) {
    searchInput.addEventListener("input", () => {
      filterStaticCards();
    });
  }

  // Bind existing static folders-tree items
  document.querySelectorAll(".folders-tree-item").forEach((item) => {
    bindFolderItemEvents(item);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  setupLandingControls();
  loadLandingCourses();
});
