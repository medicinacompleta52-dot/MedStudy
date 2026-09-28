const ADMIN_TOKEN_KEY = "medstudy.admin_token";
const TRIAL_KEY = "medstudy.trial_remaining_seconds";
const TRIAL_START_KEY = "medstudy.trial_started_at";

let adminToken = localStorage.getItem(ADMIN_TOKEN_KEY);
let allCourses = [];
let currentCycleFilter = "all";

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

async function adminApi(endpoint, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(adminToken ? { Authorization: "Bearer " + adminToken } : {}),
    ...(options.headers || {})
  };

  const res = await fetch(endpoint, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.error || "Erro na comunicação com o servidor.");
    error.status = res.status;
    throw error;
  }
  return data;
}

// ==========================================
// AUTENTICAÇÃO DO ADMINISTRADOR
// ==========================================
async function checkAuth() {
  if (!adminToken) {
    showLoginView();
    return;
  }

  try {
    await adminApi("/api/admin/verify");
    showDashboardView();
    loadDashboardData();
  } catch (err) {
    console.warn("Sessão administrativa expirada:", err.message);
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    adminToken = null;
    showLoginView();
  }
}

function showLoginView() {
  $("#login-view").hidden = false;
  $("#dashboard-view").hidden = true;
}

function showDashboardView() {
  $("#login-view").hidden = true;
  $("#dashboard-view").hidden = false;
}

function setupLoginForm() {
  const form = $("#admin-login-form");
  const alertEl = $("#login-alert");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    alertEl.hidden = true;
    const btn = $("#btn-login");
    btn.disabled = true;
    btn.innerHTML = `<span>Entrando...</span>`;

    const email = $("#admin-email").value.trim();
    const password = $("#admin-password").value.trim();

    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Credenciais inválidas.");
      }

      adminToken = data.token;
      localStorage.setItem(ADMIN_TOKEN_KEY, adminToken);
      showDashboardView();
      loadDashboardData();
    } catch (err) {
      alertEl.textContent = err.message;
      alertEl.hidden = false;
    } finally {
      btn.disabled = false;
      btn.innerHTML = `<span>Entrar no Painel</span> <span>→</span>`;
    }
  });

  $("#btn-logout")?.addEventListener("click", () => {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    adminToken = null;
    showLoginView();
  });
}

// ==========================================
// CARREGAMENTO DE DADOS DO DASHBOARD
// ==========================================
async function loadDashboardData() {
  try {
    await Promise.all([loadStats(), loadCourses(), loadSiteConfig(), loadManualSubscribers(), loadTrialLeads()]);
  } catch (err) {
    console.error("Erro ao carregar dados do painel:", err);
  }
}

async function loadStats() {
  try {
    const stats = await adminApi("/api/admin/stats");
    $("#stat-courses").textContent = stats.totalCourses || 0;
    $("#stat-modules").textContent = stats.totalModules || 0;
    $("#stat-lessons").textContent = stats.totalLessons || 0;
  } catch (err) {
    console.warn("Não foi possível carregar estatísticas:", err.message);
  }
}

async function loadCourses() {
  try {
    const data = await adminApi("/api/admin/courses");
    allCourses = data.courses || [];
    $("#courses-counter").textContent = allCourses.length;
    renderCoursesTable();
  } catch (err) {
    console.error("Erro ao carregar lista de cursos:", err);
  }
}

// ==========================================
// RENDERIZAÇÃO DA TABELA DE CURSOS
// ==========================================
function renderCoursesTable() {
  const tbody = $("#courses-table-body");
  const searchInput = $("#course-filter-input");
  const query = (searchInput?.value || "").trim().toLowerCase();

  const filtered = allCourses.filter((course) => {
    const matchesCycle =
      currentCycleFilter === "all" ||
      (course.category && course.category.toLowerCase().includes(currentCycleFilter.toLowerCase()));

    const matchesSearch =
      !query ||
      course.title.toLowerCase().includes(query) ||
      (course.area && course.area.toLowerCase().includes(query)) ||
      (course.category && course.category.toLowerCase().includes(query));

    return matchesCycle && matchesSearch;
  });

  tbody.replaceChildren();

  if (filtered.length === 0) {
    const emptyRow = document.createElement("tr");
    emptyRow.innerHTML = `<td colspan="6" style="text-align:center; padding: 28px; color: var(--muted);">Nenhum curso encontrado para este filtro.</td>`;
    tbody.appendChild(emptyRow);
    return;
  }

  filtered.forEach((course) => {
    const tr = document.createElement("tr");

    let cycleClass = "cycle-basico";
    if (course.category?.includes("Clínico")) cycleClass = "cycle-clinico";
    else if (course.category?.includes("Internato") || course.category?.includes("Prática")) cycleClass = "cycle-internato";
    else if (course.category?.includes("Residência") || course.category?.includes("Revalida")) cycleClass = "cycle-residencia";

    const modulesTotal = (course.modules && course.modules.length) || course.modulesCount || 1;
    const driveUrl = course.driveUrl || "https://drive.google.com/drive/my-drive";

    tr.innerHTML = `
      <td>
        <div class="course-icon-badge">${course.icon || "◈"}</div>
      </td>
      <td>
        <strong>${course.title}</strong>
        <div style="font-size: 11px; color: var(--muted); margin-top: 2px;">ID: ${course.id} · ${course.area || "Geral"}</div>
      </td>
      <td>
        <span class="cycle-badge ${cycleClass}">${course.category}</span>
      </td>
      <td>
        <strong>${modulesTotal}</strong> módulos
      </td>
      <td class="drive-url-cell">
        <a href="${driveUrl}" target="_blank" rel="noopener noreferrer" title="${driveUrl}">${driveUrl}</a>
      </td>
      <td class="actions-cell">
        <button class="btn-action-small btn-edit" data-id="${course.id}" title="Editar informações do curso">✏️ Editar</button>
        <a href="sala.html?curso=${course.id}" target="_blank" class="btn-action-small" title="Ver aula no player">▶ Sala</a>
        <button class="btn-action-small btn-action-delete" data-id="${course.id}" title="Excluir curso">🗑️</button>
      </td>
    `;

    // Eventos
    tr.querySelector(".btn-edit").addEventListener("click", () => {
      openEditModal(course);
    });

    tr.querySelector(".btn-action-delete").addEventListener("click", () => {
      deleteCourse(course.id, course.title);
    });

    tbody.appendChild(tr);
  });
}

function setupFilters() {
  $("#course-filter-input")?.addEventListener("input", renderCoursesTable);

  $$(".filter-pill").forEach((pill) => {
    pill.addEventListener("click", () => {
      $$(".filter-pill").forEach((p) => p.classList.remove("active"));
      pill.classList.add("active");
      currentCycleFilter = pill.dataset.cycle;
      renderCoursesTable();
    });
  });
}

// ==========================================
// ATUALIZAÇÃO EM MASSA DO GOOGLE DRIVE
// ==========================================
function setupBulkDriveUpdate() {
  const btn = $("#btn-update-all-drive");
  const input = $("#master-drive-url");
  const statusMsg = $("#drive-bulk-status");

  btn.addEventListener("click", async () => {
    const newDriveUrl = input.value.trim();
    if (!newDriveUrl || !newDriveUrl.startsWith("http")) {
      alert("Por favor, digite uma URL válida do Google Drive começando com https://");
      return;
    }

    if (!confirm(`Tem certeza que deseja atualizar o link do Google Drive de TODOS os ${allCourses.length} cursos para:\n${newDriveUrl}?`)) {
      return;
    }

    btn.disabled = true;
    btn.textContent = "Atualizando em massa...";
    statusMsg.hidden = true;

    try {
      const res = await adminApi("/api/admin/drive-bulk", {
        method: "POST",
        body: JSON.stringify({ newDriveUrl })
      });

      statusMsg.className = "drive-status-msg success";
      statusMsg.textContent = `✓ Sucesso! ${res.updatedCount} cursos foram atualizados com o novo link mestre do Google Drive.`;
      statusMsg.hidden = false;

      // Recarrega lista
      await loadCourses();
    } catch (err) {
      alert("Erro ao atualizar cursos: " + err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = "Atualizar Todos os Cursos";
    }
  });
}

// ==========================================
// FERRAMENTAS DE TESTE & TESTE GRÁTIS (30 MIN)
// ==========================================
function setupTestingTools() {
  $("#btn-reset-my-trial")?.addEventListener("click", () => {
    localStorage.removeItem(TRIAL_KEY);
    localStorage.removeItem(TRIAL_START_KEY);
    localStorage.removeItem("medstudy.trial_user");
    alert("✓ Teste grátis resetado com sucesso! Ao abrir a sala de aula, você poderá se cadastrar novamente e terá os 30 minutos completos de teste grátis.");
  });

  $("#btn-force-expire-trial")?.addEventListener("click", () => {
    localStorage.setItem(TRIAL_KEY, "0");
    alert("✓ Teste grátis configurado como EXPIRADO (00:00). Ao abrir a sala de aula como visitante, o modal de bloqueio anticópia será exibido imediatamente.");
  });

  $("#btn-enable-admin-bypass")?.addEventListener("click", () => {
    alert("✓ O token de administrador está ativo neste navegador. O teste de 30 minutos e os bloqueios de perda de foco foram desativados para você navegar livremente como Administrador.");
    window.open("sala.html", "_blank");
  });

  $("#btn-refresh-leads")?.addEventListener("click", () => {
    loadTrialLeads();
  });
}

// ==========================================
// MODAL: CADASTRAR OU EDITAR CURSO
// ==========================================
const modal = $("#course-modal");
const courseForm = $("#course-form");

function openCreateModal() {
  $("#modal-title").textContent = "Cadastrar Novo Curso";
  $("#edit-course-id").value = "";
  $("#course-title").value = "";
  $("#course-category").value = "Ciclo Clínico";
  $("#course-area").value = "";
  $("#course-modules").value = "3";
  $("#course-color").value = "red";
  $("#course-drive-url").value = $("#master-drive-url").value || "https://drive.google.com/drive/my-drive";
  $("#course-description").value = "";
  $("#course-materials").value = "Videoaulas em HD + Apostilas em PDF + Caderno de Casos Clínicos";
  modal.hidden = false;
}

function openEditModal(course) {
  $("#modal-title").textContent = `Editar Curso: ${course.title}`;
  $("#edit-course-id").value = course.id;
  $("#course-title").value = course.title || "";
  $("#course-category").value = course.category || "Ciclo Clínico";
  $("#course-area").value = course.area || "";
  $("#course-modules").value = course.modulesCount || (course.modules ? course.modules.length : 1);
  $("#course-color").value = course.color || "red";
  $("#course-drive-url").value = course.driveUrl || "";
  $("#course-description").value = course.description || "";
  $("#course-materials").value = course.materials || "";
  modal.hidden = false;
}

function closeModal() {
  modal.hidden = true;
}

function setupCourseModal() {
  $("#btn-open-create-modal")?.addEventListener("click", openCreateModal);
  $("#btn-close-modal")?.addEventListener("click", closeModal);
  $("#btn-cancel-modal")?.addEventListener("click", closeModal);

  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });

  courseForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = $("#edit-course-id").value;
    const isEdit = Boolean(id);

    const payload = {
      title: $("#course-title").value.trim(),
      category: $("#course-category").value,
      area: $("#course-area").value.trim(),
      modulesCount: Number($("#course-modules").value) || 1,
      color: $("#course-color").value,
      driveUrl: $("#course-drive-url").value.trim(),
      description: $("#course-description").value.trim(),
      materials: $("#course-materials").value.trim()
    };

    const saveBtn = $("#btn-save-course");
    saveBtn.disabled = true;
    saveBtn.textContent = "Salvando...";

    try {
      if (isEdit) {
        await adminApi(`/api/admin/courses/${id}`, {
          method: "PUT",
          body: JSON.stringify(payload)
        });
      } else {
        await adminApi("/api/admin/courses", {
          method: "POST",
          body: JSON.stringify(payload)
        });
      }

      closeModal();
      await loadDashboardData();
    } catch (err) {
      alert("Erro ao salvar curso: " + err.message);
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = "Salvar Curso";
    }
  });
}

async function deleteCourse(id, title) {
  if (!confirm(`Tem certeza que deseja excluir o curso "${title}" permanentemente do acervo?`)) {
    return;
  }

  try {
    await adminApi(`/api/admin/courses/${id}`, { method: "DELETE" });
    await loadDashboardData();
  } catch (err) {
    alert("Erro ao excluir curso: " + err.message);
  }
}

// ==========================================
// VENDAS WHATSAPP & PIX DIRETO & MERCADO PAGO
// ==========================================
async function loadSiteConfig() {
  try {
    const config = await adminApi("/api/site-config");
    if ($("#cfg-whatsapp")) $("#cfg-whatsapp").value = config.whatsappNumber || "5554996318816";
    if ($("#cfg-pix")) $("#cfg-pix").value = config.pixKey || "54996318816";
    if ($("#cfg-mp-token")) $("#cfg-mp-token").value = config.mpAccessToken || "";
    if ($("#cfg-mp-webhook")) $("#cfg-mp-webhook").value = config.mpWebhookSecret || "";
    if ($("#cfg-mp-link-monthly")) $("#cfg-mp-link-monthly").value = config.mpLinkMonthly || "";
    if ($("#cfg-mp-link-annual")) $("#cfg-mp-link-annual").value = config.mpLinkAnnual || "";
    if ($("#cfg-mp-link-lifetime")) $("#cfg-mp-link-lifetime").value = config.mpLinkLifetime || "";
  } catch (e) {}
}

function setupSiteConfigForm() {
  const form = $("#site-config-form");
  const statusMsg = $("#site-config-status");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const whatsappNumber = $("#cfg-whatsapp").value.trim();
    const pixKey = $("#cfg-pix").value.trim();
    const btn = $("#btn-save-site-config");

    btn.disabled = true;
    btn.textContent = "Salvando...";

    try {
      await adminApi("/api/admin/site-config", {
        method: "POST",
        body: JSON.stringify({ whatsappNumber, pixKey })
      });
      statusMsg.className = "drive-status-msg success";
      statusMsg.textContent = "✓ Dados de WhatsApp e Chave Pix atualizados com sucesso no site!";
      statusMsg.hidden = false;
    } catch (err) {
      alert("Erro ao salvar: " + err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = "Salvar WhatsApp & Chave Pix";
    }
  });
}

function setupMpConfigForm() {
  const form = $("#mp-config-form");
  const statusMsg = $("#mp-config-status");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const mpAccessToken = $("#cfg-mp-token")?.value.trim() || "";
    const mpWebhookSecret = $("#cfg-mp-webhook")?.value.trim() || "";
    const mpLinkMonthly = $("#cfg-mp-link-monthly")?.value.trim() || "";
    const mpLinkAnnual = $("#cfg-mp-link-annual")?.value.trim() || "";
    const mpLinkLifetime = $("#cfg-mp-link-lifetime")?.value.trim() || "";
    const btn = $("#btn-save-mp-config");

    btn.disabled = true;
    btn.textContent = "Salvando configurações...";

    try {
      await adminApi("/api/admin/site-config", {
        method: "POST",
        body: JSON.stringify({
          mpAccessToken,
          mpWebhookSecret,
          mpLinkMonthly,
          mpLinkAnnual,
          mpLinkLifetime
        })
      });
      statusMsg.className = "drive-status-msg success";
      statusMsg.textContent = "✓ Configurações do Mercado Pago salvas com sucesso! A opção de pagamento foi atualizada no site.";
      statusMsg.hidden = false;
    } catch (err) {
      alert("Erro ao salvar dados do Mercado Pago: " + err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = "Salvar Configurações do Mercado Pago";
    }
  });
}

// ==========================================
// LIBERAÇÃO MANUAL DE ASSINATURAS (PIX)
// ==========================================
async function loadManualSubscribers() {
  const tbody = $("#subscribers-table-body");
  if (!tbody) return;

  try {
    const data = await adminApi("/api/admin/manual-subscribers");
    const list = data.subscribers || [];

    tbody.replaceChildren();

    if (list.length === 0) {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td colspan="6" style="text-align:center; padding:20px; color:var(--muted);">Nenhum aluno liberado manualmente ainda.</td>`;
      tbody.appendChild(tr);
      return;
    }

    list.forEach((sub) => {
      const tr = document.createElement("tr");

      let planLabel = "Anual (365 dias)";
      if (sub.planId === "monthly") planLabel = "Mensal (30 dias)";
      else if (sub.planId === "lifetime") planLabel = "Vitalício (Permanente)";

      const expiryText = sub.planId === "lifetime"
        ? "<strong style='color:#68d391;'>Sem expiração</strong>"
        : (sub.current_period_end ? new Date(sub.current_period_end).toLocaleDateString("pt-BR") : "Indeterminado");

      const grantedDate = sub.granted_at ? new Date(sub.granted_at).toLocaleDateString("pt-BR") : "Hoje";

      tr.innerHTML = `
        <td><strong>${sub.email}</strong></td>
        <td>${planLabel}</td>
        <td><span class="cycle-badge cycle-basico">● Ativo</span></td>
        <td>${expiryText}</td>
        <td>${grantedDate}</td>
        <td style="text-align:right;">
          <button class="btn-action-small btn-action-delete btn-revoke" data-email="${encodeURIComponent(sub.email)}">Revogar</button>
        </td>
      `;

      tr.querySelector(".btn-revoke").addEventListener("click", async () => {
        if (confirm(`Tem certeza que deseja revogar o acesso do aluno ${sub.email}?`)) {
          await adminApi(`/api/admin/manual-subscribers/${encodeURIComponent(sub.email)}`, { method: "DELETE" });
          await loadManualSubscribers();
        }
      });

      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error("Erro ao carregar assinantes manuais:", err);
  }
}

// ==========================================
// LEADS DO TESTE GRÁTIS (CADASTROS OBRIGATÓRIOS)
// ==========================================
async function loadTrialLeads() {
  const tbody = $("#leads-table-body");
  const counter = $("#leads-counter");
  if (!tbody) return;

  try {
    const data = await adminApi("/api/admin/trial-leads");
    const leads = data.leads || [];

    if (counter) counter.textContent = leads.length;
    tbody.replaceChildren();

    if (leads.length === 0) {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td colspan="5" style="text-align:center; padding:20px; color:var(--muted);">Nenhum lead cadastrado ainda no teste grátis.</td>`;
      tbody.appendChild(tr);
      return;
    }

    leads.forEach((lead) => {
      const tr = document.createElement("tr");
      const cleanPhone = String(lead.whatsapp || "").replace(/\D/g, "");
      const waLink = `https://wa.me/55${cleanPhone}?text=${encodeURIComponent(`Olá ${lead.name}! Vi que você iniciou o teste grátis no MedStudy. Gostaria de tirar dúvidas ou assinar o acesso completo aos 36 cursos via Pix?`)}`;
      const registeredDate = lead.registeredAt ? new Date(lead.registeredAt).toLocaleString("pt-BR") : "Recentemente";

      tr.innerHTML = `
        <td><strong>${lead.name}</strong></td>
        <td><a href="mailto:${lead.email}" style="color:#60a5fa; text-decoration:none;">${lead.email}</a></td>
        <td>
          <a href="${waLink}" target="_blank" rel="noopener noreferrer" style="color:#38bdf8; text-decoration:none; font-weight:700; display:inline-flex; align-items:center; gap:4px;">
            <span>💬</span> <span>${lead.whatsapp}</span> <span>↗</span>
          </a>
        </td>
        <td><small style="color:var(--muted);">${registeredDate}</small></td>
        <td style="text-align:right; white-space:nowrap;">
          <button type="button" class="btn-action-small btn-quick-grant" style="background:#2563eb; color:#fff; border:none; padding:5px 12px; border-radius:4px; font-weight:700; cursor:pointer; margin-right:6px;" data-email="${encodeURIComponent(lead.email)}">
            ⚡ Liberar Assinatura
          </button>
          <button type="button" class="btn-action-small btn-action-delete btn-delete-lead" data-email="${encodeURIComponent(lead.email)}">
            Excluir
          </button>
        </td>
      `;

      tr.querySelector(".btn-quick-grant")?.addEventListener("click", () => {
        $("#grant-email").value = lead.email;
        const targetForm = $("#grant-access-form");
        if (targetForm) {
          window.scrollTo({ top: targetForm.offsetTop - 80, behavior: "smooth" });
          $("#grant-email").focus();
        }
      });

      tr.querySelector(".btn-delete-lead")?.addEventListener("click", async () => {
        if (confirm(`Excluir lead de ${lead.name} (${lead.email})?`)) {
          await adminApi(`/api/admin/trial-leads/${encodeURIComponent(lead.email)}`, { method: "DELETE" });
          await loadTrialLeads();
        }
      });

      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error("Erro ao carregar leads do teste grátis:", err);
  }
}

function setupGrantAccessForm() {
  const form = $("#grant-access-form");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = $("#grant-email").value.trim();
    const planId = $("#grant-plan").value;
    const btn = $("#btn-grant-access");

    btn.disabled = true;
    btn.textContent = "Liberando...";

    try {
      await adminApi("/api/admin/manual-subscribers", {
        method: "POST",
        body: JSON.stringify({ email, planId })
      });
      alert(`✓ Acesso liberado com sucesso para o aluno: ${email}!`);
      form.reset();
      await loadManualSubscribers();
    } catch (err) {
      alert("Erro ao liberar acesso: " + err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = "✓ Liberar Acesso Agora";
    }
  });
}

// ==========================================
// INICIALIZAÇÃO
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
  setupLoginForm();
  setupFilters();
  setupBulkDriveUpdate();
  setupTestingTools();
  setupCourseModal();
  setupSiteConfigForm();
  setupMpConfigForm();
  setupGrantAccessForm();
  checkAuth();
});
