const $ = (s) => document.querySelector(s);
const notice = $("#notice");
const TOKEN = "medstudy.access-token";
let mode = "login";
let config = null;
let account = null;

function message(text, error = false) {
  if (!notice) return;
  notice.textContent = text;
  notice.hidden = false;
  notice.classList.toggle("error", error);
  notice.scrollIntoView({ behavior: "smooth", block: "center" });
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
  if (!token()) {
    showAuth();
    return;
  }
  try {
    account = await api("/api/me");
    if ($("#account-panel")) $("#account-panel").hidden = false;
    if ($("#account-email")) $("#account-email").textContent = account.user.email;

    if ($("#subscription-status")) {
      if (!account.active) {
        $("#subscription-status").innerHTML = `<span style="color:#f2666d;">●</span> <strong>Sem assinatura ativa no momento.</strong> Selecione um plano abaixo para liberar o Catálogo de Cursos no Google Drive.`;
      } else if (account.subscription.plan_id === "lifetime") {
        $("#subscription-status").innerHTML = `<span style="color:#58b58b;">●</span> <strong>Acesso Vitalício Ativo!</strong> Você possui liberação permanente a todos os 36 cursos do Google Drive.`;
      } else {
        const dateFormatted = new Date(account.subscription.current_period_end).toLocaleDateString("pt-BR");
        $("#subscription-status").innerHTML = `<span style="color:#58b58b;">●</span> <strong>Assinatura Ativa</strong> até ${dateFormatted}. Acesso liberado a todas as pastas do Google Drive.`;
      }
    }
  } catch (err) {
    if (err.status === 401) localStorage.removeItem(TOKEN);
    showAuth();
  }
}

function showAuth() {
  if ($("#account-panel")) $("#account-panel").hidden = true;
}

// Alternar Abas Login / Cadastro
document.querySelectorAll(".tab").forEach((button) => button.addEventListener("click", () => {
  mode = button.dataset.mode;
  document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab === button));
  $("#auth-submit").textContent = mode === "login" ? "Entrar no MedStudy" : "Criar conta no MedStudy";
  $("#password").autocomplete = mode === "login" ? "current-password" : "new-password";
}));

// Submit Formulário de Autenticação Supabase
const authForm = $("#auth-form");
if (authForm) {
  authForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = $("#auth-submit");
    button.disabled = true;
    const email = $("#email").value.trim();
    const password = $("#password").value;

    try {
      // 1. Testa se é o Administrador do MedStudy
      if (mode === "login") {
        try {
          const adminRes = await fetch("/api/admin/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password })
          });
          const adminData = await adminRes.json();
          if (adminRes.ok && adminData.ok) {
            localStorage.setItem("medstudy.admin_token", adminData.token);
            message("✓ Login de Administrador confirmado! Abrindo o Painel Administrativo...");
            setTimeout(() => {
              window.location.href = "admin.html";
            }, 500);
            return;
          }
        } catch (_) {}
      }

      if (!config?.supabaseUrl || !config?.supabaseAnonKey) {
        throw new Error("Autenticação do Supabase ainda não configurada no servidor.");
      }

      const endpoint = config.supabaseUrl + "/auth/v1/" + (mode === "login" ? "token?grant_type=password" : "signup");
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: config.supabaseAnonKey },
        body: JSON.stringify({ email, password })
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
      message("Login realizado com sucesso! Bem-vindo ao MedStudy.");
      await refresh();
    } catch (err) {
      message(err.message, true);
    } finally {
      button.disabled = false;
    }
  });
}

// Logout
const logoutBtn = $("#logout");
if (logoutBtn) {
  logoutBtn.addEventListener("click", () => {
    localStorage.removeItem(TOKEN);
    account = null;
    message("Você saiu da conta.");
    showAuth();
  });
}

// Iniciar Checkout Mercado Pago
async function triggerCheckout(planId, email = "") {
  message("Iniciando checkout seguro do Mercado Pago...", false);
  try {
    const payload = { plan: planId };
    if (email) payload.email = email;

    const result = await api("/api/checkout", {
      method: "POST",
      body: JSON.stringify(payload)
    });

    if (result.url) {
      message("Redirecionando para o Mercado Pago...", false);
      location.assign(result.url);
    } else {
      throw new Error("O servidor não retornou a URL de checkout do Mercado Pago.");
    }
  } catch (err) {
    message(err.message, true);
  }
}

// Gerenciamento dos Botões de Checkout dos Planos
document.querySelectorAll(".checkout").forEach((button) => button.addEventListener("click", async () => {
  const planId = button.dataset.plan;

  // Se já temos a conta logada, prossegue direto
  if (token() && account?.user?.email) {
    button.disabled = true;
    try {
      await triggerCheckout(planId, account.user.email);
    } finally {
      button.disabled = false;
    }
    return;
  }

  // Se for visitante, abre modal para capturar o e-mail ou avançar
  openGuestCheckoutModal(planId);
}));

// Modal de Checkout para Visitantes
function openGuestCheckoutModal(planId) {
  const modal = $("#guest-checkout-modal");
  if (!modal) return;
  modal.dataset.selectedPlan = planId;
  modal.hidden = false;

  const planInfo = config?.plans?.[planId];
  if (planInfo && $("#modal-plan-name")) {
    $("#modal-plan-name").textContent = `${planInfo.name} (${planInfo.price})`;
  }

  const emailInput = $("#guest-checkout-email");
  if (emailInput) {
    if ($("#email")?.value) emailInput.value = $("#email").value;
    setTimeout(() => emailInput.focus(), 100);
  }
}

function closeGuestCheckoutModal() {
  const modal = $("#guest-checkout-modal");
  if (modal) modal.hidden = true;
}

const btnCloseModal = $("#btn-close-guest-modal");
if (btnCloseModal) {
  btnCloseModal.addEventListener("click", closeGuestCheckoutModal);
}

const guestModal = $("#guest-checkout-modal");
if (guestModal) {
  guestModal.addEventListener("click", (e) => {
    if (e.target === guestModal) closeGuestCheckoutModal();
  });
}

// Submit do Modal de Visitante
const guestCheckoutForm = $("#guest-checkout-form");
if (guestCheckoutForm) {
  guestCheckoutForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const planId = $("#guest-checkout-modal").dataset.selectedPlan || "annual";
    const email = $("#guest-checkout-email").value.trim();
    const btn = $("#btn-submit-guest-checkout");

    if (!email || !email.includes("@")) {
      alert("Por favor, informe um e-mail válido.");
      return;
    }

    btn.disabled = true;
    btn.textContent = "Abrindo Mercado Pago...";

    try {
      await triggerCheckout(planId, email);
    } finally {
      btn.disabled = false;
      btn.innerHTML = "<span>Avançar para o Mercado Pago ➔</span>";
    }
  });
}

// Inicialização da Página
(async () => {
  try {
    config = await api("/api/config");
    for (const id of ["monthly", "annual", "lifetime"]) {
      const plan = config.plans[id];
      if (plan) {
        if ($("#" + id + "-name")) $("#" + id + "-name").textContent = plan.name;
        if ($("#" + id + "-price")) $("#" + id + "-price").textContent = plan.price;
      }
    }

    const checkoutStatus = new URLSearchParams(location.search).get("checkout");
    if (checkoutStatus === "return") {
      message("Pagamento enviado ao Mercado Pago! Seu acesso será liberado assim que o pagamento for aprovado.", false);
    }
    if (checkoutStatus === "cancel") {
      message("Checkout cancelado.", true);
    }

    // Carrega dados de WhatsApp e Pix Direto
    try {
      const siteConfig = await api("/api/site-config");
      if (siteConfig) {
        if ($("#display-pix-key") && siteConfig.pixKey) {
          $("#display-pix-key").textContent = siteConfig.pixKey;
        }
        if ($("#btn-whatsapp-link") && siteConfig.whatsappNumber) {
          const cleanNum = siteConfig.whatsappNumber.replace(/\D/g, "");
          const text = encodeURIComponent("Olá! Gostaria de assinar o MedStudy via Pix Direto. Segue meu e-mail para liberação:");
          $("#btn-whatsapp-link").href = `https://wa.me/${cleanNum}?text=${text}`;
        }
      }
    } catch (e) {}

    await refresh();
  } catch (err) {
    message(err.message, true);
  }
})();
