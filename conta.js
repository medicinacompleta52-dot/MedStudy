const $ = (s) => document.querySelector(s);
const notice = $("#notice");
const TOKEN = "medstudy.access-token";
let mode = "login";
let config = null;
let account = null;
function message(text, error = false) { notice.textContent = text; notice.hidden = false; notice.classList.toggle("error", error); }
function token() { return localStorage.getItem(TOKEN); }
async function api(path, options = {}) {
  const response = await fetch(path, { ...options, headers: { "Content-Type": "application/json", ...(token() ? { Authorization: "Bearer " + token() } : {}), ...(options.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) { const err = new Error(data.error || "Não foi possível concluir a solicitação."); err.status = response.status; throw err; }
  return data;
}
async function refresh() {
  if (!token()) return showAuth();
  try {
    account = await api("/api/me");
    $("#auth-panel").hidden = true; $("#account-panel").hidden = false;
    $("#account-email").textContent = account.user.email;
    $("#subscription-status").textContent = !account.active ? "Sem assinatura ativa." : account.subscription.plan_id === "lifetime" ? "Acesso vitalício ativo." : "Assinatura ativa até " + new Date(account.subscription.current_period_end).toLocaleDateString("pt-BR");
    $("#library-lock").hidden = account.active;
    document.querySelectorAll(".checkout").forEach((button) => button.hidden = account.active);
    if (account.active) await loadFiles();
  } catch (err) { if (err.status === 401) localStorage.removeItem(TOKEN); showAuth(); if (err.status !== 401) message(err.message, true); }
}
function showAuth() { $("#auth-panel").hidden = false; $("#account-panel").hidden = true; }
document.querySelectorAll(".tab").forEach((button) => button.addEventListener("click", () => {
  mode = button.dataset.mode;
  document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab === button));
  $("#auth-submit").textContent = mode === "login" ? "Entrar" : "Criar conta";
  $("#password").autocomplete = mode === "login" ? "current-password" : "new-password";
}));
$("#auth-form").addEventListener("submit", async (event) => {
  event.preventDefault(); const button = $("#auth-submit"); button.disabled = true;
  try {
    if (!config?.supabaseUrl || !config?.supabaseAnonKey) throw new Error("Autenticação ainda não configurada.");
    const response = await fetch(config.supabaseUrl + "/auth/v1/" + (mode === "login" ? "token?grant_type=password" : "signup"), { method: "POST", headers: { "Content-Type": "application/json", apikey: config.supabaseAnonKey }, body: JSON.stringify({ email: $("#email").value.trim(), password: $("#password").value }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.msg || data.message || data.error_description || "Não foi possível autenticar.");
    if (!data.access_token) { message("Conta criada. Confirme seu e-mail e depois entre."); return; }
    localStorage.setItem(TOKEN, data.access_token); message("Login realizado."); await refresh();
  } catch (err) { message(err.message, true); }
  finally { button.disabled = false; }
});
$("#logout").addEventListener("click", () => { localStorage.removeItem(TOKEN); account = null; showAuth(); });
document.querySelectorAll(".checkout").forEach((button) => button.addEventListener("click", async () => {
  button.disabled = true;
  try { const result = await api("/api/checkout", { method: "POST", body: JSON.stringify({ plan: button.dataset.plan }) }); location.assign(result.url); }
  catch (err) { message(err.message, true); }
  finally { button.disabled = false; }
}));
async function loadFiles() {
  const { files } = await api("/api/files"); const list = $("#file-list"); list.replaceChildren();
  files.forEach((file) => {
    const row = document.createElement("div"); row.className = "file";
    const label = document.createElement("span"); label.textContent = file.name;
    const actions = document.createElement("div");
    const open = document.createElement("button"); open.className = "secondary"; open.textContent = "Abrir"; open.addEventListener("click", async () => { try { const r = await api("/api/files/download-link", { method: "POST", body: JSON.stringify({ key: file.key }) }); window.open(r.url, "_blank", "noopener"); } catch (e) { message(e.message, true); } });
    const remove = document.createElement("button"); remove.className = "secondary"; remove.textContent = "Excluir"; remove.addEventListener("click", async () => { try { await api("/api/files", { method: "DELETE", body: JSON.stringify({ key: file.key }) }); await loadFiles(); } catch (e) { message(e.message, true); } });
    actions.append(open, remove); row.append(label, actions); list.append(row);
  });
  if (!files.length) { const empty = document.createElement("p"); empty.className = "muted"; empty.textContent = "Sua biblioteca privada ainda está vazia."; list.append(empty); }
}
$("#file-input").addEventListener("change", async (event) => {
  const files = [...event.target.files]; event.target.value = "";
  for (const file of files) {
    try {
      const ticket = await api("/api/files/upload-ticket", { method: "POST", body: JSON.stringify({ name: file.name, contentType: file.type }) });
      const response = await fetch(ticket.signedUrl, { method: "PUT", headers: { "Content-Type": ticket.contentType, "x-upsert": "false" }, body: file });
      if (!response.ok) throw new Error("Falha ao enviar " + file.name);
    } catch (err) { message(err.message, true); return; }
  }
  message(files.length + (files.length === 1 ? " arquivo enviado." : " arquivos enviados."));
  await loadFiles();
});
(async () => {
  try {
    config = await api("/api/config");
    for (const id of ["monthly", "annual"]) {
      const plan = config.plans[id];
      $("#" + id + "-name").textContent = plan.name; $("#" + id + "-price").textContent = plan.price;
      document.querySelector('[data-plan="' + id + '"]').disabled = !plan.available;
    }
    if (new URLSearchParams(location.search).get("checkout") === "success") message("Pagamento recebido. A assinatura aparecerá após a confirmação do Stripe.");
    if (new URLSearchParams(location.search).get("checkout") === "cancel") message("Checkout cancelado.");
    await refresh();
  } catch (err) { message(err.message, true); }
})();
