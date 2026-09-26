const STORAGE_KEY = "medstudy.cards.v1";
const REVIEW_KEY = "medstudy.reviewed.v1";
const $ = (selector) => document.querySelector(selector);
const form = $("#card-form");
const dialog = $("#card-dialog");
let cards = loadCards();
let queue = [];
let queueIndex = 0;
let revealed = false;
let reviewed = Number(localStorage.getItem(REVIEW_KEY)) || 0;
let editingId = null;
let toastTimer;

function loadCards() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(saved) ? saved.filter((card) => card && card.id && card.front && card.back) : [];
  } catch {
    return [];
  }
}
function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(cards)); }
function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2300);
}
function startQueue() {
  queue = cards.map((card) => card.id);
  queueIndex = 0;
  renderStudy();
}
function currentCard() {
  while (queueIndex < queue.length && !cards.some((card) => card.id === queue[queueIndex])) queueIndex++;
  return cards.find((card) => card.id === queue[queueIndex]);
}
function updateStats() {
  $("#stat-total").textContent = cards.length;
  $("#stat-reviewed").textContent = reviewed;
  $("#stat-due").textContent = cards.length;
  $("#nav-total").textContent = cards.length;
  $("#session-count").textContent = `${cards.length} ${cards.length === 1 ? "cartão" : "cartões"}`;
  $("#library-count").textContent = `${cards.length} ${cards.length === 1 ? "cartão" : "cartões"}`;
}
function renderStudy() {
  updateStats();
  const card = currentCard();
  const front = $("#card-front");
  const answer = $("#card-back-wrap");
  $("#rating-row").hidden = true;
  $("#reveal-button").hidden = false;
  answer.hidden = true;
  revealed = false;
  if (!card) {
    $("#card-topic").textContent = cards.length ? "Sessão concluída" : "Comece por aqui";
    front.textContent = cards.length ? "Você revisou todos os cartões desta sessão. Bom trabalho!" : "Seu próximo passo é criar o primeiro flashcard.";
    $("#card-back").textContent = "";
    $("#card-position").textContent = cards.length ? "✓" : "—";
    $("#card-kicker").textContent = cards.length ? "MUITO BEM" : "PERGUNTA";
    $("#reveal-button").textContent = cards.length ? "Estudar novamente ↻" : "Criar meu primeiro cartão ＋";
    $("#progress-fill").style.width = cards.length ? "100%" : "0%";
    $("#empty-note").hidden = !!cards.length;
    return;
  }
  $("#card-topic").textContent = card.topic || "Geral";
  front.textContent = card.front;
  $("#card-back").textContent = card.back;
  $("#card-position").textContent = `${queueIndex + 1} / ${queue.length}`;
  $("#card-kicker").textContent = "PERGUNTA";
  $("#progress-fill").style.width = `${Math.min(100, (queueIndex / queue.length) * 100)}%`;
  $("#empty-note").hidden = false;
  $("#empty-note").innerHTML = "<span>✦</span> Seus cartões ficam salvos neste dispositivo.";
}
function renderLibrary() {
  updateStats();
  const list = $("#card-list");
  list.replaceChildren();
  const topics = [...new Set(cards.map((card) => card.topic?.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const filter = $("#filter-topic");
  const previous = filter.value;
  filter.replaceChildren(new Option("Todos os temas", ""));
  topics.forEach((topic) => filter.add(new Option(topic, topic)));
  if (topics.includes(previous)) filter.value = previous;
  const query = $("#search-cards").value.trim().toLocaleLowerCase("pt-BR");
  const visible = cards.filter((card) => {
    const text = (card.topic || "Geral") + " " + card.front + " " + card.back;
    return (!query || text.toLocaleLowerCase("pt-BR").includes(query)) && (!filter.value || (card.topic || "") === filter.value);
  });
  $("#library-empty").hidden = cards.length > 0;
  $("#results-note").textContent = cards.length ? visible.length + " de " + cards.length + " cartões" : "";
  if (cards.length && !visible.length) {
    const empty = document.createElement("div");
    empty.className = "no-results";
    empty.textContent = "Nenhum cartão corresponde à busca. Tente outro termo ou tema.";
    list.append(empty);
  }
  visible.forEach((card) => {
    const item = document.createElement("article");
    item.className = "library-card";
    const content = document.createElement("div");
    content.className = "library-card-main";
    const topic = document.createElement("span");
    topic.className = "topic-pill";
    topic.textContent = card.topic || "Geral";
    const question = document.createElement("h3");
    question.textContent = card.front;
    const answer = document.createElement("p");
    answer.textContent = card.back;
    content.append(topic, question, answer);
    const actions = document.createElement("div");
    actions.className = "card-actions";
    const edit = document.createElement("button");
    edit.className = "edit-button";
    edit.type = "button";
    edit.textContent = "Editar";
    edit.setAttribute("aria-label", "Editar cartão: " + card.front);
    edit.addEventListener("click", () => openForm(card));
    const remove = document.createElement("button");
    remove.className = "delete-button";
    remove.type = "button";
    remove.textContent = "×";
    remove.setAttribute("aria-label", "Excluir cartão: " + card.front);
    remove.addEventListener("click", () => {
      cards = cards.filter((entry) => entry.id !== card.id);
      save();
      queue = queue.filter((id) => id !== card.id);
      renderLibrary();
      renderStudy();
      showToast("Cartão excluído.");
    });
    actions.append(edit, remove);
    item.append(content, actions);
    list.append(item);
  });
}
function openForm(card = null) {
  form.reset();
  editingId = card ? card.id : null;
  $("#dialog-title").textContent = card ? "Editar flashcard" : "O que você quer estudar?";
  $("#save-label").textContent = card ? "Salvar alterações" : "Salvar cartão";
  if (card) {
    $("#topic-input").value = card.topic || "";
    $("#front-input").value = card.front;
    $("#back-input").value = card.back;
  }
  dialog.showModal();
  setTimeout(() => $("#front-input").focus(), 0);
}
function switchView(view) {
  const study = view === "study";
  $("#study-view").hidden = !study;
  $("#cards-view").hidden = study;
  document.querySelectorAll(".nav-item").forEach((button) => button.classList.toggle("active", button.dataset.view === view));
  $("#page-title").textContent = study ? "Vamos estudar?" : "Seu acervo";
  $("#page-subtitle").textContent = study ? "Revise seus cartões e avance um passo de cada vez." : "Tudo o que você criou, organizado em um só lugar.";
  if (!study) renderLibrary();
}
document.querySelectorAll(".nav-item").forEach((button) => button.addEventListener("click", () => switchView(button.dataset.view)));
$("#new-card-top").addEventListener("click", openForm);
$("#new-card-empty").addEventListener("click", openForm);
$("#close-dialog").addEventListener("click", () => dialog.close());
$("#cancel-dialog").addEventListener("click", () => dialog.close());
dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); });
form.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  const values = {
    topic: $("#topic-input").value.trim(),
    front: $("#front-input").value.trim(),
    back: $("#back-input").value.trim()
  };
  if (editingId) {
    const card = cards.find((entry) => entry.id === editingId);
    if (card) Object.assign(card, values);
    save();
    dialog.close();
    renderLibrary();
    renderStudy();
    showToast("Cartão atualizado.");
    return;
  }
  const card = { id: crypto.randomUUID ? crypto.randomUUID() : "card-" + Date.now(), ...values, createdAt: new Date().toISOString() };
  cards.unshift(card);
  save();
  queue.unshift(card.id);
  if (queueIndex >= queue.length - 1) queueIndex = 0;
  dialog.close();
  renderStudy();
  renderLibrary();
  showToast("Flashcard salvo. Bora estudar!");
});
$("#reveal-button").addEventListener("click", () => {
  if (!cards.length) { openForm(); return; }
  if (queueIndex >= queue.length) { startQueue(); return; }
  revealed = true;
  $("#card-back-wrap").hidden = false;
  $("#card-kicker").textContent = "PERGUNTA";
  $("#reveal-button").hidden = true;
  $("#rating-row").hidden = false;
});
document.querySelectorAll(".rating-button").forEach((button) => button.addEventListener("click", () => {
  if (!revealed) return;
  reviewed += 1;
  localStorage.setItem(REVIEW_KEY, String(reviewed));
  queueIndex += 1;
  renderStudy();
}));
dialog.addEventListener("close", () => { editingId = null; });
$("#search-cards").addEventListener("input", renderLibrary);
$("#filter-topic").addEventListener("change", renderLibrary);
$("#export-button").addEventListener("click", () => {
  if (!cards.length) { showToast("Crie um cartão antes de exportar."); return; }
  const file = new Blob([JSON.stringify({ version: 1, cards }, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = "medstudy-cartoes.json";
  link.click();
  URL.revokeObjectURL(url);
  showToast("Backup baixado.");
});
$("#import-button").addEventListener("click", () => $("#import-file").click());
$("#import-file").addEventListener("change", async (event) => {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    const imported = Array.isArray(data) ? data : data.cards;
    if (!Array.isArray(imported)) throw new Error("Formato inválido");
    const existing = new Set(cards.map((card) => card.id));
    const valid = imported.filter((card) => card && typeof card.front === "string" && card.front.trim() && typeof card.back === "string" && card.back.trim());
    const clean = valid.map((card) => ({
      id: card.id && !existing.has(card.id) ? card.id : (crypto.randomUUID ? crypto.randomUUID() : "card-" + Date.now() + Math.random()),
      topic: typeof card.topic === "string" ? card.topic.trim().slice(0, 40) : "",
      front: card.front.trim().slice(0, 300),
      back: card.back.trim().slice(0, 600),
      createdAt: card.createdAt || new Date().toISOString()
    }));
    if (!clean.length) throw new Error("Sem cartões válidos");
    cards = clean.concat(cards);
    save();
    startQueue();
    renderLibrary();
    showToast(clean.length + (clean.length === 1 ? " cartão importado." : " cartões importados."));
  } catch {
    showToast("Não foi possível importar. Selecione um backup JSON válido.");
  } finally { event.target.value = ""; }
});
$("#date-label").textContent = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long" }).format(new Date()).toUpperCase();
startQueue();
