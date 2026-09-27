const $ = (s) => document.querySelector(s);
const notice = $("#notice");
const TOKEN = "medstudy.access-token";
let mode = "login";
let config = null;
let account = null;

function message(text, error = false) {
  notice.textContent = text;
  notice.hidden = false;
  notice.classList.toggle("error", error);
}

function token() {
  return localStorage.getItem(TOKEN);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token() ? { Authorization: "Bearer " + token() } : {}),
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(data.error || "Não foi possível concluir a solicitação.");
    err.status = response.status;
    throw err;
  }
  return data;
}

async function refresh() {
  if (!token()) return showAuth();
  try {
    account = await api("/api/me");
    $("#auth-panel").hidden = true;
    $("#account-panel").hidden = false;
    $("#account-email").textContent = account.user.email;

    if (!account.active) {
      $("#subscription-status").innerHTML = `<span style="color:#f2666d;">●</span> <strong>Sem assinatura ativa.</strong> Selecione um plano abaixo para liberar o Catálogo de Cursos no Google Drive.`;
    } else if (account.subscription.plan_id === "lifetime") {
      $("#subscription-status").innerHTML = `<span style="color:#58b58b;">●</span> <strong>Acesso Vitalício Ativo!</strong> Você possui liberação permanente a todos os cursos do Google Drive.`;
    } else {
      const dateFormatted = new Date(account.subscription.current_period_end).toLocaleDateString("pt-BR");
      $("#subscription-status").innerHTML = `<span style="color:#58b58b;">●</span> <strong>Assinatura Ativa</strong> até ${dateFormatted}. Acesso liberado a todas as pastas do Google Drive.`;
    }

    document.querySelectorAll(".checkout").forEach((button) => {
      button.hidden = account.active;
    });
  } catch (err) {
    if (err.status === 401) localStorage.removeItem(TOKEN);
    showAuth();
    if (err.status !== 401) message(err.message, true);
  }
}

function showAuth() {
  $("#auth-panel").hidden = false;
  $("#account-panel").hidden = true;
}

document.querySelectorAll(".tab").forEach((button) => button.addEventListener("click", () => {
  mode = button.dataset.mode;
  document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab === button));
  $("#auth-submit").textContent = mode === "login" ? "Entrar no MedStudy" : "Criar conta no MedStudy";
  $("#password").autocomplete = mode === "login" ? "current-password" : "new-password";
}));

$("#auth-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = $("#auth-submit");
  button.disabled = true;
  try {
    if (!config?.supabaseUrl || !config?.supabaseAnonKey) {
      throw new Error("Autenticação do Supabase ainda não configurada no servidor.");
    }

    const endpoint = config.supabaseUrl + "/auth/v1/" + (mode === "login" ? "token?grant_type=password" : "signup");
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: config.supabaseAnonKey },
      body: JSON.stringify({ email: $("#email").value.trim(), password: $("#password").value })
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.msg || data.message || data.error_description || "Não foi possível autenticar.");
    }
    if (!data.access_token) {
      message("Conta criada com sucesso! Verifique seu e-mail caso a confirmação esteja ativada no Supabase.");
      return;
    }
    localStorage.setItem(TOKEN, data.access_token);
    message("Login realizado com sucesso!");
    await refresh();
  } catch (err) {
    message(err.message, true);
  } finally {
    button.disabled = false;
  }
});

$("#logout").addEventListener("click", () => {
  localStorage.removeItem(TOKEN);
  account = null;
  message("Você saiu da conta.");
  showAuth();
});

document.querySelectorAll(".checkout").forEach((button) => button.addEventListener("click", async () => {
  button.disabled = true;
  try {
    const result = await api("/api/checkout", { method: "POST", body: JSON.stringify({ plan: button.dataset.plan }) });
    location.assign(result.url);
  } catch (err) {
    message(err.message, true);
  } finally {
    button.disabled = false;
  }
}));

// Formulário para adicionar cursos do Drive diretamente pela tela de Conta
const addCourseForm = $("#add-course-account-form");
if (addCourseForm) {
  addCourseForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const title = $("#acc-course-title").value.trim();
      const category = $("#acc-course-category").value;
      const driveUrl = $("#acc-course-url").value.trim();
      const description = $("#acc-course-desc").value.trim();

      await api("/api/courses", {
        method: "POST",
        body: JSON.stringify({
          title,
          category,
          area: title.split(" ")[0] || "Medicina",
          driveUrl,
          description,
          modulesCount: 20,
          materials: "Videoaulas e Apostilas no Google Drive"
        })
      });

      message("Curso adicionado ao Catálogo com sucesso!");
      addCourseForm.reset();
    } catch (err) {
      message(err.message, true);
    }
  });
}

(async () => {
  try {
    config = await api("/api/config");
    for (const id of ["monthly", "annual", "lifetime"]) {
      const plan = config.plans[id];
      if (plan) {
        if ($("#" + id + "-name")) $("#" + id + "-name").textContent = plan.name;
        if ($("#" + id + "-price")) $("#" + id + "-price").textContent = plan.price;
        const btn = document.querySelector('[data-plan="' + id + '"]');
        if (btn) btn.disabled = !plan.available;
      }
    }
    const checkoutStatus = new URLSearchParams(location.search).get("checkout");
    if (checkoutStatus === "return") {
      message("Voltando do Mercado Pago. O acesso será liberado assim que o pagamento for aprovado.");
    }
    if (checkoutStatus === "cancel") {
      message("Checkout cancelado.");
    }
    await refresh();
  } catch (err) {
    message(err.message, true);
  }
})();
