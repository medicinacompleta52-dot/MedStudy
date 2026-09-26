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
  $("#library-empty").hidden = cards.length > 0;
  cards.forEach((card) => {
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
    const remove = document.createElement("button");
    remove.className = "delete-button";
    remove.type = "button";
    remove.textContent = "×";
    remove.setAttribute("aria-label", `Excluir cartão: ${card.front}`);
    remove.addEventListener("click", () => {
      cards = cards.filter((entry) => entry.id !== card.id);
      save();
      queue = queue.filter((id) => id !== card.id);
      renderLibrary();
      renderStudy();
      showToast("Cartão excluído.");
    });
    item.append(content, remove);
    list.append(item);
  });
}
function openForm() {
  form.reset();
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
  const card = {
    id: crypto.randomUUID ? crypto.randomUUID() : `card-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    topic: $("#topic-input").value.trim(),
    front: $("#front-input").value.trim(),
    back: $("#back-input").value.trim(),
    createdAt: new Date().toISOString()
  };
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
$("#date-label").textContent = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long" }).format(new Date()).toUpperCase();
startQueue();
