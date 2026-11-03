import OBR from "@owlbear-rodeo/sdk";
import {
  ELEMENTS,
  ELEMENT_IDS,
  FX_PANEL_ID,
  FX_ROOM_KEY,
  MAX_FAVORITES,
  SIZE_IDS,
  STYLES,
  STYLE_IDS,
  addFavorite,
  loadChoice,
  loadFavorites,
  matchesFavorite,
  playersAllowedIn,
  saveChoice,
  saveFavorites,
  type FxCast,
  type Rgb,
} from "./fx";
import "./panel.css";

const app = document.querySelector<HTMLDivElement>("#app")!;
let choice = loadChoice(localStorage);
let favorites = loadFavorites(localStorage);
let isGm = false;
let playersAllowed = false;
let unit = "cases";

const css = ([r, g, b]: Rgb) => `rgb(${r * 255} ${g * 255} ${b * 255})`;

const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

function hint() {
  if (choice.gmOnly) {
    return choice.style === "teleportation"
      ? "MJ seulement : les joueurs ne voient rien et le token ne bouge pas."
      : "MJ seulement : les joueurs ne voient rien.";
  }
  if (choice.style === "chaine") return "Clique sur le lanceur, puis sur chaque cible. Échap pour finir.";
  if (choice.style === "mur") return "Clique sur le début du mur, puis sur sa fin.";
  if (choice.style === "teleportation") return "Clique sur le token, puis sur son arrivée.";
  return STYLES[choice.style].directed
    ? "Clique sur le lanceur, puis sur la cible."
    : "Clique sur la carte pour lancer l'effet.";
}

const usesExact = () => choice.exact !== null && STYLES[choice.style].exactZone;

function button(group: keyof FxCast, value: string, content: string, label: string) {
  return `<button type="button" data-group="${group}" data-value="${value}" aria-label="${label}" aria-pressed="${choice[group] === value}">${content}</button>`;
}

function favoritesSection() {
  const list = favorites
    .map(
      (favorite, index) => `
        <span class="favorite">
          <button type="button" data-favorite="${index}" aria-pressed="${matchesFavorite(favorite, choice)}">${escapeHtml(favorite.name)}</button>
          <button type="button" class="remove" data-remove="${index}" aria-label="Retirer ${escapeHtml(favorite.name)}" title="Retirer">✕</button>
        </span>`,
    )
    .join("");
  const full = favorites.length >= MAX_FAVORITES;
  return `
    <section>
      <h2>Favoris</h2>
      ${list ? `<div class="favorites">${list}</div>` : ""}
      <form class="save" id="save">
        <input id="favorite-name" type="text" maxlength="30" aria-label="Nom du favori" placeholder="${full ? "Liste pleine : un nom existant le remplace" : "Nom, ex. Boule de feu"}" />
        <button type="submit">Enregistrer</button>
      </form>
    </section>`;
}

function exactRow() {
  if (!STYLES[choice.style].exactZone) return "";
  const what = choice.style === "cone" ? "Longueur" : "Rayon";
  return `
    <label class="exact">
      ${what} exact
      <input id="exact" type="number" min="0" step="any" value="${choice.exact ?? ""}" />
      <span>${escapeHtml(unit)}</span>
    </label>`;
}

function optionsSection() {
  if (!isGm) return "";
  return `
    <section>
      <h2>Options</h2>
      <label class="option"><input id="gm-only" type="checkbox" ${choice.gmOnly ? "checked" : ""} /> Visible par le MJ seulement</label>
      <label class="option"><input id="players" type="checkbox" ${playersAllowed ? "checked" : ""} /> Les joueurs peuvent lancer des effets</label>
    </section>`;
}

function update(next: Partial<typeof choice>) {
  choice = { ...choice, ...next };
  saveChoice(localStorage, choice);
}

function render() {
  app.innerHTML = `
    <header class="bar">
      <strong>Effets</strong>
      <button type="button" class="close" id="close" title="Fermer">✕</button>
    </header>
    ${favoritesSection()}
    <section>
      <h2>Élément</h2>
      <div class="choices elements">
        ${ELEMENT_IDS.map((id) => {
          const { label, palette } = ELEMENTS[id];
          const swatch = `<span class="swatch" style="background: radial-gradient(${css(palette[2])}, ${css(palette[1])} 55%, ${css(palette[0])})"></span>`;
          return button("element", id, `${swatch}${label}`, label);
        }).join("")}
      </div>
    </section>
    <section>
      <h2>Style</h2>
      <div class="choices styles">
        ${STYLE_IDS.map((id) => button("style", id, STYLES[id].label, STYLES[id].label)).join("")}
      </div>
    </section>
    <section>
      <h2>Taille</h2>
      <div class="choices sizes ${usesExact() ? "off" : ""}" id="sizes">
        ${SIZE_IDS.map((id) => button("size", id, id, `Taille ${id}`)).join("")}
      </div>
      ${exactRow()}
    </section>
    ${optionsSection()}
    <p class="hint" id="hint">${hint()}</p>`;

  app.querySelector<HTMLButtonElement>("#close")!.onclick = () => OBR.popover.close(FX_PANEL_ID);
  app.querySelectorAll<HTMLButtonElement>("[data-group]").forEach((element) => {
    element.onclick = () => {
      update({ [element.dataset.group!]: element.dataset.value! });
      render();
      app.querySelector<HTMLButtonElement>(
        `[data-group="${element.dataset.group}"][data-value="${element.dataset.value}"]`,
      )?.focus();
    };
  });
  app.querySelectorAll<HTMLButtonElement>("[data-favorite]").forEach((element) => {
    element.onclick = () => {
      const { element: fxElement, style, size, exact } = favorites[Number(element.dataset.favorite)];
      update({ element: fxElement, style, size, exact });
      render();
    };
  });
  app.querySelectorAll<HTMLButtonElement>("[data-remove]").forEach((element) => {
    element.onclick = () => {
      favorites = favorites.filter((_, index) => index !== Number(element.dataset.remove));
      saveFavorites(localStorage, favorites);
      render();
    };
  });
  app.querySelector<HTMLFormElement>("#save")!.onsubmit = (event) => {
    event.preventDefault();
    const name = app.querySelector<HTMLInputElement>("#favorite-name")!.value;
    favorites = addFavorite(favorites, name, choice);
    saveFavorites(localStorage, favorites);
    render();
  };
  // Pas de nouveau rendu ici : le champ perdrait le curseur à chaque chiffre tapé, et un rendu à
  // la sortie du champ remplacerait le bouton sur lequel on est en train de cliquer.
  const exact = app.querySelector<HTMLInputElement>("#exact");
  if (exact) {
    exact.oninput = () => {
      const value = Number(exact.value);
      update({ exact: exact.value !== "" && Number.isFinite(value) && value > 0 ? value : null });
      app.querySelector("#sizes")!.classList.toggle("off", usesExact());
      app.querySelectorAll<HTMLButtonElement>("[data-favorite]").forEach((element) => {
        const favorite = favorites[Number(element.dataset.favorite)];
        element.setAttribute("aria-pressed", String(matchesFavorite(favorite, choice)));
      });
    };
  }
  const gmOnly = app.querySelector<HTMLInputElement>("#gm-only");
  if (gmOnly) {
    gmOnly.onchange = () => {
      update({ gmOnly: gmOnly.checked });
      app.querySelector("#hint")!.textContent = hint();
    };
  }
  const players = app.querySelector<HTMLInputElement>("#players");
  if (players) {
    players.onchange = () => {
      playersAllowed = players.checked;
      OBR.room.setMetadata({ [FX_ROOM_KEY]: { players: players.checked } }).catch((error) => {
        console.warn("Effets :", error);
        playersAllowed = !players.checked;
        players.checked = playersAllowed;
      });
    };
  }
}

OBR.onReady(async () => {
  const [role, metadata] = await Promise.all([OBR.player.getRole(), OBR.room.getMetadata()]);
  isGm = role === "GM";
  playersAllowed = playersAllowedIn(metadata);
  if (!isGm && !playersAllowed) {
    await OBR.popover.close(FX_PANEL_ID);
    return;
  }
  if (await OBR.scene.isReady()) unit = (await OBR.scene.grid.getScale()).parsed.unit || unit;
  render();
});
