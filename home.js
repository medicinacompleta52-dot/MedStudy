const search = document.querySelector("#area-search");
const areaCards = [...document.querySelectorAll(".area-card")];
const noAreas = document.querySelector("#no-areas");
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
