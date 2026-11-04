import OBR, { type Metadata } from "@owlbear-rodeo/sdk";
import {
  ELEMENTS,
  ELEMENT_IDS,
  FX_DURABLE_KEY,
  FX_PANEL_ID,
  FX_ROOM_KEY,
  MAX_DURABLE,
  MAX_FAVORITES,
  SIZE_IDS,
  STYLES,
  STYLE_IDS,
  addFavorite,
  canBeDurable,
  durablesIn,
  exactZoneLabel,
  isDurable,
  startsOnFace,
  loadChoice,
  loadFavorites,
  matchesFavorite,
  playersAllowedIn,
  saveChoice,
  saveFavorites,
  type DurableEntry,
  type FxCast,
  type Rgb,
} from "./fx";
import { FX_PROGRAM_CHANNEL } from "./fx-programs";
import { bindResize, fitCompactHeight, resizeButton, setupWindowDrag, windowPrefs } from "./window-drag";
import { watchSceneUnit } from "./scene-unit";
import "./panel.css";

const app = document.querySelector<HTMLDivElement>("#app")!;
let choice = loadChoice(localStorage);
let favorites = loadFavorites(localStorage);
let isGm = false;
let playersAllowed = false;
let unit = "cases";
let running: DurableEntry[] = [];
const compact = windowPrefs.compact;
/** La fenêtre est rechargée quand elle bouge ou change de format : le nom en cours de saisie y survit. */
const TYPING_KEY = `${FX_PANEL_ID}/saisie`;

const css = ([r, g, b]: Rgb) => `rgb(${r * 255} ${g * 255} ${b * 255})`;

const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

function hint() {
  if (startsOnFace(choice)) {
    return `Clique sur le token, puis dans la direction où poser le cube${isDurable(choice) ? " (reclique sur le token pour l'éteindre)" : ""}. Sur la carte, il se centre sur le clic.${choice.gmOnly ? " Caché aux joueurs." : ""}`;
  }
  if (isDurable(choice)) {
    const where =
      choice.style === "mur"
        ? "Clique sur le début du mur, puis sur sa fin."
        : "Clique sur un token pour l'y attacher (reclique pour l'éteindre), ou sur la carte pour l'y poser.";
    return choice.gmOnly ? `${where} Caché aux joueurs.` : where;
  }
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
  const what = exactZoneLabel(choice.style);
  return `
    <label class="exact">
      ${what} exact
      <input id="exact" type="number" min="0" step="any" value="${choice.exact ?? ""}" />
      <span data-unit>${escapeHtml(unit)}</span>
    </label>`;
}

function originRow() {
  if (choice.style !== "cube") return "";
  const face = choice.onFace === true;
  return `
    <div class="origin" role="radiogroup" aria-label="Origine sur un token">
      <span>Sur un token :</span>
      <label><input type="radio" name="origin" value="centre" ${face ? "" : "checked"} /> au centre</label>
      <label><input type="radio" name="origin" value="face" ${face ? "checked" : ""} /> sur une face</label>
    </div>`;
}

function durableRow() {
  if (!canBeDurable(choice.style)) return "";
  return `<label class="option durable"><input id="durable" type="checkbox" ${choice.durable ? "checked" : ""} /> Durable : reste jusqu'à ce qu'on le retire</label>`;
}

function runningList() {
  if (!running.length) return "";
  return `
    <section>
      <h2>Effets durables (${running.length}/${MAX_DURABLE})</h2>
      ${running
        .map(
          ({ id, name, carrier }) => `
            <div class="running">
              <span>${escapeHtml(name)} <small>${carrier ? `sur ${escapeHtml(carrier.name)}` : "sur la carte"}</small></span>
              <button type="button" data-stop="${escapeHtml(id)}" aria-label="Retirer ${escapeHtml(name)}" title="Retirer">✕</button>
            </div>`,
        )
        .join("")}
      ${running.length > 1 ? `<button type="button" class="stop-all" id="stop-all">Tout retirer</button>` : ""}
    </section>`;
}

const warn = (error: unknown) => console.warn("Effets :", error);

/** Retire de la liste à jour : un autre joueur a pu y toucher depuis son affichage. */
async function stopDurables(ids: string[]) {
  const entries = durablesIn(await OBR.scene.getMetadata());
  await OBR.scene.setMetadata({ [FX_DURABLE_KEY]: entries.filter(({ id }) => !ids.includes(id)) });
}

/** La liste change sans redessiner le reste du panneau, où un champ peut être en cours de saisie. */
function renderRunning() {
  const container = app.querySelector<HTMLDivElement>("#running");
  if (!container) return;
  container.innerHTML = runningList();
  if (compact) fitCompactHeight("panel", FX_PANEL_ID, app);
  container.querySelectorAll<HTMLButtonElement>("[data-stop]").forEach((element) => {
    element.onclick = () => stopDurables([element.dataset.stop!]).catch(warn);
  });
  const stopAll = container.querySelector<HTMLButtonElement>("#stop-all");
  if (stopAll) stopAll.onclick = () => stopDurables(running.map(({ id }) => id)).catch(warn);
}

function readRunning(metadata: Metadata) {
  running = durablesIn(metadata).filter(({ owner }) => isGm || owner === OBR.player.id);
  renderRunning();
}

function optionsSection() {
  if (!isGm) return "";
  return `
    <section>
      <h2>Options</h2>
      <label class="option"><input id="gm-only" type="checkbox" ${choice.gmOnly ? "checked" : ""} /> Visible par le MJ seulement</label>
      <label class="option"><input id="players" type="checkbox" ${playersAllowed ? "checked" : ""} /> Les joueurs peuvent lancer des effets</label>
      <button type="button" class="stop-all programs" id="programs">Programmes…</button>
    </section>`;
}

function update(next: Partial<typeof choice>) {
  choice = { ...choice, ...next };
  saveChoice(localStorage, choice);
}

function saveTyping() {
  try {
    const typed = {
      name: app.querySelector<HTMLInputElement>("#favorite-name")?.value ?? "",
      scroll: document.scrollingElement?.scrollTop ?? 0,
    };
    sessionStorage.setItem(TYPING_KEY, JSON.stringify(typed));
  } catch (error) {
    warn(error);
  }
}

function restoreTyping() {
  try {
    const saved = sessionStorage.getItem(TYPING_KEY);
    sessionStorage.removeItem(TYPING_KEY);
    if (!saved) return;
    const { name, scroll } = JSON.parse(saved) as { name: string; scroll: number };
    const input = app.querySelector<HTMLInputElement>("#favorite-name");
    if (input) input.value = name;
    document.scrollingElement?.scrollTo(0, scroll);
  } catch (error) {
    warn(error);
  }
}

const titleBar = () => `
  <header class="bar" title="Glisser pour déplacer">
    <strong>Effets</strong>
    <span class="bar-buttons">
      ${resizeButton("close")}
      <button type="button" class="close" id="close" title="Fermer">✕</button>
    </span>
  </header>`;

function bindTitleBar() {
  app.querySelector<HTMLButtonElement>("#close")!.onclick = () => OBR.popover.close(FX_PANEL_ID);
  bindResize("panel", app, saveTyping);
}

function bindFavoriteChoices() {
  app.querySelectorAll<HTMLButtonElement>("[data-favorite]").forEach((element) => {
    element.onclick = () => {
      const { element: fxElement, style, size, exact, durable, onFace } =
        favorites[Number(element.dataset.favorite)];
      update({ element: fxElement, style, size, exact, durable: durable === true, onFace: onFace === true });
      render();
    };
  });
}

/** L'essentiel pour jouer : ce qui partira au prochain clic, et de quoi changer d'effet ou en retirer un. */
function renderCompact() {
  const { label, palette } = ELEMENTS[choice.element];
  const measure = usesExact() ? `${choice.exact} <span data-unit>${escapeHtml(unit)}</span>` : choice.size;
  const extras = [isDurable(choice) ? "durable" : "", choice.gmOnly ? "MJ seul" : ""].filter(Boolean);
  const chips = favorites
    .map(
      (favorite, index) => `
        <span class="favorite">
          <button type="button" data-favorite="${index}" aria-pressed="${matchesFavorite(favorite, choice)}">${escapeHtml(favorite.name)}</button>
        </span>`,
    )
    .join("");
  app.innerHTML = `
    ${titleBar()}
    <p class="current">
      <span class="swatch" style="background: radial-gradient(${css(palette[2])}, ${css(palette[1])} 55%, ${css(palette[0])})"></span>
      <span>${[label, STYLES[choice.style].label, measure, ...extras].join(" · ")}</span>
    </p>
    ${chips ? `<div class="favorites compact-favorites">${chips}</div>` : ""}
    <div id="running"></div>
    <p class="hint" id="hint">${hint()}</p>`;
  bindTitleBar();
  bindFavoriteChoices();
  renderRunning();
  fitCompactHeight("panel", FX_PANEL_ID, app);
}

function render() {
  if (compact) {
    renderCompact();
    return;
  }
  app.innerHTML = `
    ${titleBar()}
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
      ${durableRow()}
      ${originRow()}
    </section>
    <section>
      <h2>Taille</h2>
      <div class="choices sizes ${usesExact() ? "off" : ""}" id="sizes">
        ${SIZE_IDS.map((id) => button("size", id, id, `Taille ${id}`)).join("")}
      </div>
      ${exactRow()}
    </section>
    <div id="running"></div>
    ${optionsSection()}
    <p class="hint" id="hint">${hint()}</p>`;

  bindTitleBar();
  app.querySelectorAll<HTMLButtonElement>("[data-group]").forEach((element) => {
    element.onclick = () => {
      update({ [element.dataset.group!]: element.dataset.value! });
      render();
      app.querySelector<HTMLButtonElement>(
        `[data-group="${element.dataset.group}"][data-value="${element.dataset.value}"]`,
      )?.focus();
    };
  });
  bindFavoriteChoices();
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
  const programs = app.querySelector<HTMLButtonElement>("#programs");
  if (programs) {
    programs.onclick = () =>
      OBR.broadcast
        .sendMessage(FX_PROGRAM_CHANNEL, { type: "open-window" }, { destination: "LOCAL" })
        .catch(warn);
  }
  app.querySelectorAll<HTMLInputElement>('input[name="origin"]').forEach((input) => {
    input.onchange = () => {
      update({ onFace: input.value === "face" });
      render();
    };
  });
  const durable = app.querySelector<HTMLInputElement>("#durable");
  if (durable) {
    durable.onchange = () => {
      update({ durable: durable.checked });
      render();
    };
  }
  renderRunning();
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
        warn(error);
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
  await watchSceneUnit((next) => {
    unit = next;
  });
  if (await OBR.scene.isReady()) readRunning(await OBR.scene.getMetadata());
  OBR.scene.onMetadataChange(readRunning);
  document.documentElement.classList.toggle("compact", compact);
  render();
  restoreTyping();
  setupWindowDrag("panel", app, saveTyping);
});
