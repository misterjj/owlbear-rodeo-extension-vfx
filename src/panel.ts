import OBR, { type Metadata } from "@owlbear-rodeo/sdk";
import {
  ELEMENTS,
  ELEMENT_IDS,
  FX_DURABLE_KEY,
  FX_ROOM_KEY,
  FX_SPELLS_KEY,
  FX_TOOL_ID,
  FX_UI_CHANNEL,
  MAX_DURABLE,
  MAX_FAVORITES,
  MAX_NAME_LENGTH,
  MAX_SPELLS,
  SIZE_IDS,
  STYLES,
  STYLE_IDS,
  addFavorite,
  canBeDurable,
  defaultSpellName,
  durablesIn,
  editSpell,
  exactZoneLabel,
  isDurable,
  loadChoice,
  loadFavorites,
  matchesFavorite,
  saveChoice,
  saveFavorites,
  sameDurable,
  spellsOf,
  startsOnFace,
  type DurableEntry,
  type ElementId,
  type Favorite,
  type SizeId,
  type StyleId,
} from "./fx";
import { elementGrid, elementValue, pickerRow, sizeRow, styleGrid, swatch } from "./effect-fields";
import { FX_PROGRAM_CHANNEL } from "./fx-programs";
import { watchSceneUnit } from "./scene-unit";

let app: HTMLElement;
let settingsPane: HTMLElement | undefined;
let choice = loadChoice(localStorage);
let favorites = loadFavorites(localStorage);
let isGm = false;
let playersAllowed = false;
let unit = "cases";
let running: DurableEntry[] = [];
let compact = false;
let toolActive = false;
let listening = false;

/** Token dont la roue se configure, et sort de cette roue en cours de modification. */
let target: { id: string; name: string; spells: Favorite[] } | undefined;
let editing: number | undefined;
let pickingToken = false;
let targetProblem = "";

type FoldId = "options" | "wheel" | "running";
const FOLDS_KEY = "vfx:plis";
let openPicker: "element" | "style" | undefined;
let savingFavorite = false;
let folds = readFolds();

function readFolds(): Record<FoldId, boolean> {
  const closed = { options: false, wheel: false, running: false };
  try {
    return { ...closed, ...(JSON.parse(localStorage.getItem(FOLDS_KEY) ?? "{}") as Partial<Record<FoldId, boolean>>) };
  } catch {
    return closed;
  }
}

function saveFolds() {
  try {
    localStorage.setItem(FOLDS_KEY, JSON.stringify(folds));
  } catch (error) {
    console.warn("Effets :", error);
  }
}

const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

const warn = (error: unknown) => console.warn("Effets :", error);

const postUi = (type: string) =>
  OBR.broadcast.sendMessage(FX_UI_CHANNEL, { type }, { destination: "LOCAL" }).catch(warn);

const postPick = (type: string) =>
  OBR.broadcast.sendMessage(FX_PROGRAM_CHANNEL, { type }, { destination: "LOCAL" }).catch(warn);

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

/** Une fois un autre outil pris en main, le clic sur la carte ne lance plus rien : ça doit se voir. */
function bannerHtml() {
  return toolActive
    ? `<p class="hint" id="hint">${hint()}</p>`
    : `<div class="hint off-tool">
         <span>Tu as changé d'outil : la carte ne lance plus d'effet.</span>
         <button type="button" id="arm">Reprendre</button>
       </div>`;
}

function renderBanner() {
  const banner = app.querySelector<HTMLElement>("#banner");
  if (!banner) return;
  banner.innerHTML = bannerHtml();
  const rearm = banner.querySelector<HTMLButtonElement>("#arm");
  if (rearm) rearm.onclick = () => postUi("arm");
}

const usesExact = () => choice.exact !== null && STYLES[choice.style].exactZone;

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
      <div class="favorites">
        ${list}
        ${savingFavorite ? "" : `<span class="favorite"><button type="button" id="new-favorite">+ Enregistrer</button></span>`}
      </div>
      ${savingFavorite
        ? `<form class="save" id="save">
             <input id="favorite-name" type="text" maxlength="30" aria-label="Nom du favori" placeholder="${full ? "Liste pleine : un nom existant le remplace" : "Nom, ex. Boule de feu"}" />
             <button type="submit">OK</button>
           </form>`
        : ""}
    </section>`;
}

function foldHtml(id: FoldId, title: string, summary: string, content: string, forced = false) {
  const open = forced || folds[id];
  return `
    <div class="fold">
      <button type="button" class="fold-head" data-fold="${id}" aria-expanded="${open}">
        <span class="fold-title">${title}</span>
        <span class="fold-summary">${summary} ${open ? "▾" : "▸"}</span>
      </button>
      ${open ? `<div class="fold-body">${content}</div>` : ""}
    </div>`;
}

/** Ce qui change l'effet au-delà de sa taille, résumé tant que c'est replié. */
function optionsSummary() {
  const parts = [
    usesExact() ? `${exactZoneLabel(choice.style)} ${choice.exact} <span data-unit>${escapeHtml(unit)}</span>` : "",
    isDurable(choice) ? "durable" : "",
    startsOnFace(choice) ? "sur une face" : "",
  ].filter(Boolean);
  if (parts.length) return parts.join(" · ");
  return [STYLES[choice.style].exactZone ? "zone exacte" : "", canBeDurable(choice.style) ? "durable" : ""]
    .filter(Boolean)
    .join(", ");
}

function optionsFold() {
  const content = `${exactRow()}${durableRow()}${originRow()}`;
  return content.trim() ? foldHtml("options", "Plus d'options", optionsSummary(), content) : "";
}

function bindFolds(container: HTMLElement) {
  container.querySelectorAll<HTMLButtonElement>("[data-fold]").forEach((element) => {
    element.onclick = () => {
      const id = element.dataset.fold as FoldId;
      folds = { ...folds, [id]: !folds[id] };
      saveFolds();
      if (id === "wheel") renderWheelSection();
      else if (id === "running") renderRunning();
      else render();
    };
  });
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
  const list = `
      ${running
        .map(
          ({ id, name, carrier }) => `
            <div class="running">
              <span>${escapeHtml(name)} <small>${carrier ? `sur ${escapeHtml(carrier.name)}` : "sur la carte"}</small></span>
              <button type="button" data-stop="${escapeHtml(id)}" aria-label="Retirer ${escapeHtml(name)}" title="Retirer">✕</button>
            </div>`,
        )
        .join("")}
      ${running.length > 1 ? `<button type="button" class="stop-all" id="stop-all">Tout retirer</button>` : ""}`;
  if (compact) return `<section><h2>Effets durables (${running.length}/${MAX_DURABLE})</h2>${list}</section>`;
  return foldHtml("running", "Effets durables", `${running.length}/${MAX_DURABLE} actif${running.length > 1 ? "s" : ""}`, list);
}

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
  bindFolds(container);
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

function update(next: Partial<typeof choice>) {
  choice = { ...choice, ...next };
  saveChoice(localStorage, choice);
}

/** Enregistre sur le token ; la liste affichée change aussitôt, puis suit la scène. */
async function saveSpells(next: Favorite[]) {
  if (!target) return;
  const { id } = target;
  const previous = target.spells;
  target.spells = next;
  try {
    await OBR.scene.items.updateItems(
      (item) => item.id === id,
      (drafts) => {
        for (const draft of drafts) draft.metadata[FX_SPELLS_KEY] = next;
      },
    );
  } catch (error) {
    if (target?.id === id) target.spells = previous;
    throw error;
  }
}

/** Un joueur ne configure que les tokens qu'Owlbear le laisse déplacer. */
async function mayEdit(layer: string, owner: string) {
  if (isGm) return true;
  const update = layer === "MOUNT" ? "MOUNT_UPDATE" : "CHARACTER_UPDATE";
  if (!(await OBR.player.hasPermission(update))) return false;
  if (!(await OBR.player.hasPermission("CHARACTER_OWNER_ONLY"))) return true;
  return owner === OBR.player.id;
}

/** Choisit le token dont la roue s'affiche dans l'onglet. Tout autre objet est ignoré. */
export async function targetToken(id: string, reveal = false) {
  if (reveal && !folds.wheel) {
    folds = { ...folds, wheel: true };
    saveFolds();
  }
  const [item] = await OBR.scene.items.getItems([id]);
  if (!item || (item.layer !== "CHARACTER" && item.layer !== "MOUNT")) return;
  editing = undefined;
  if (!(await mayEdit(item.layer, item.createdUserId))) {
    target = undefined;
    targetProblem = `Tu n'as pas la main sur ${item.name}.`;
  } else {
    target = { id: item.id, name: item.name, spells: spellsOf(item.metadata) };
    targetProblem = "";
  }
  renderWheelSection();
}

function options<T extends string>(ids: readonly T[], label: (id: T) => string, selected: T) {
  return ids
    .map((id) => `<option value="${id}"${id === selected ? " selected" : ""}>${escapeHtml(label(id))}</option>`)
    .join("");
}

function spellEditHtml(spell: Favorite) {
  return `
    <section>
      <h2>Modifier le sort de ${escapeHtml(target!.name)}</h2>
      <form id="spell-edit" class="edit" novalidate>
        <label class="wide">Nom<input type="text" id="spell-name" maxlength="${MAX_NAME_LENGTH}" value="${escapeHtml(spell.name)}" /></label>
        <label>Élément<select id="spell-element">${options(ELEMENT_IDS, (id) => ELEMENTS[id].label, spell.element)}</select></label>
        <label>Style<select id="spell-style">${options(STYLE_IDS, (id) => STYLES[id].label, spell.style)}</select></label>
        <label>Taille<select id="spell-size">${options(SIZE_IDS, (id) => id, spell.size)}</select></label>
        <label id="spell-exact-row"><span id="spell-exact-label"></span><input type="number" id="spell-exact" min="0" step="any" value="${spell.exact ?? ""}" /></label>
        <label class="wide" id="spell-origin-row">Origine sur le token<select id="spell-origin">
          <option value="centre"${spell.onFace ? "" : " selected"}>Au centre</option>
          <option value="face"${spell.onFace ? " selected" : ""}>Sur une face (viser la direction)</option>
        </select></label>
        <label class="wide check" id="spell-durable-row"><input type="checkbox" id="spell-durable"${spell.durable ? " checked" : ""} /> Durable</label>
        ${isSpellLit(spell) ? `<p class="note wide">Déjà allumé : l'effet en cours ne change pas. Éteins-le pour voir la nouvelle version.</p>` : ""}
        <p class="error wide" id="spell-error" hidden></p>
        <div class="wide edit-actions">
          <button type="button" id="spell-cancel">Annuler</button>
          <button type="submit" class="save-spell">Enregistrer</button>
        </div>
      </form>
    </section>`;
}

const isSpellLit = (spell: Favorite) =>
  isDurable(spell) &&
  running.some((entry) => entry.carrier?.id === target?.id && sameDurable(entry, spell));

function bindSpellEdit(index: number, container: HTMLElement) {
  const form = container.querySelector<HTMLFormElement>("#spell-edit")!;
  const field = <T extends HTMLElement>(id: string) => form.querySelector<T>(`#spell-${id}`)!;
  const styleField = field<HTMLSelectElement>("style");
  const error = field<HTMLParagraphElement>("error");
  const close = () => {
    editing = undefined;
    renderWheelSection();
  };
  // Les champs masqués gardent leur valeur : revenir au style d'avant ne la perd pas.
  const showFieldsOfStyle = () => {
    const style = styleField.value as StyleId;
    field("exact-row").hidden = !STYLES[style].exactZone;
    field("exact-label").innerHTML = `${exactZoneLabel(style)} exact (<span data-unit>${escapeHtml(unit)}</span>)`;
    field("durable-row").hidden = !canBeDurable(style);
    field("origin-row").hidden = style !== "cube";
  };
  showFieldsOfStyle();
  styleField.onchange = showFieldsOfStyle;
  field<HTMLButtonElement>("cancel").onclick = close;
  form.onkeydown = (event) => {
    if (event.key === "Escape") close();
  };
  form.oninput = () => {
    error.hidden = true;
  };
  form.onsubmit = (event) => {
    event.preventDefault();
    const fail = (message: string) => {
      error.textContent = message;
      error.hidden = false;
    };
    const spells = target!.spells;
    const next = editSpell(spells, index, {
      name: field<HTMLInputElement>("name").value,
      element: field<HTMLSelectElement>("element").value as ElementId,
      style: styleField.value as StyleId,
      size: field<HTMLSelectElement>("size").value as SizeId,
      exact: field<HTMLInputElement>("exact").valueAsNumber,
      durable: field<HTMLInputElement>("durable").checked,
      onFace: field<HTMLSelectElement>("origin").value === "face",
    });
    if (next === spells) {
      fail("Ce nom est vide ou déjà pris par un autre sort.");
      return;
    }
    saveSpells(next)
      .then(close)
      .catch((reason) => {
        warn(reason);
        fail("Enregistrement impossible.");
      });
  };
  field<HTMLInputElement>("name").focus();
}

function wheelSectionHtml() {
  if (target && editing !== undefined && target.spells[editing]) return spellEditHtml(target.spells[editing]);
  const pick = `<button type="button" class="wide-button" id="pick-token" ${pickingToken ? 'aria-pressed="true"' : ""}>${pickingToken ? "Clique sur un token… (Échap pour annuler)" : target ? "Choisir un autre token" : "Choisir un token sur la carte"}</button>`;
  if (!target) {
    const invite = targetProblem
      ? `<p class="note">${escapeHtml(targetProblem)}</p>`
      : `<p class="note">Sélectionne un token pour préparer sa roue : les sorts qu'on lance d'un clic, avec <em>Sorts</em> dans son menu.</p>`;
    return foldHtml("wheel", "Roue d'un token", "aucun token", `${invite}${pick}`, pickingToken || Boolean(targetProblem));
  }
  const { name, spells } = target;
  const full = spells.length >= MAX_SPELLS;
  const content = `
      ${spells.length
        ? spells
            .map(
              (spell, index) => `
                <div class="spell-row">
                  <span>${escapeHtml(spell.name)} <small>${STYLES[spell.style].label}${isDurable(spell) ? ", durable" : ""}${startsOnFace(spell) ? ", face" : ""}</small></span>
                  <button type="button" data-edit-spell="${index}" aria-label="Modifier ${escapeHtml(spell.name)}" title="Modifier">✎</button>
                  <button type="button" data-remove-spell="${index}" aria-label="Retirer ${escapeHtml(spell.name)}" title="Retirer">✕</button>
                </div>`,
            )
            .join("")
        : `<p class="note">Aucun sort pour l'instant.</p>`}
      ${full
        ? `<p class="note">La roue est pleine : retire un sort pour en ajouter un.</p>`
        : `<form class="save" id="add-spell">
             <input id="spell-new-name" type="text" maxlength="${MAX_NAME_LENGTH}" aria-label="Nom du nouveau sort" placeholder="${escapeHtml(defaultSpellName(choice))}" />
             <button type="submit">+ Ajouter</button>
           </form>
           <p class="note">Ajoute l'effet réglé ci-dessus.</p>`}
      ${pick}`;
  return foldHtml(
    "wheel",
    `Roue de ${escapeHtml(name)}`,
    `${spells.length} sort${spells.length > 1 ? "s" : ""}`,
    content,
    pickingToken,
  );
}

/** Sans toucher au reste de l'onglet, où un champ peut être en cours de saisie. */
function renderWheelSection() {
  const container = app?.querySelector<HTMLDivElement>("#wheel-section");
  if (!container) return;
  container.innerHTML = wheelSectionHtml();
  if (target && editing !== undefined && target.spells[editing]) {
    bindSpellEdit(editing, container);
    return;
  }
  bindFolds(container);
  const pickButton = container.querySelector<HTMLButtonElement>("#pick-token");
  if (pickButton) pickButton.onclick = () => {
    pickingToken = !pickingToken;
    postPick(pickingToken ? "pick-start" : "pick-stop");
    renderWheelSection();
  };
  container.querySelectorAll<HTMLButtonElement>("[data-edit-spell]").forEach((element) => {
    element.onclick = () => {
      editing = Number(element.dataset.editSpell);
      renderWheelSection();
    };
  });
  container.querySelectorAll<HTMLButtonElement>("[data-remove-spell]").forEach((element) => {
    element.onclick = () => {
      const removed = Number(element.dataset.removeSpell);
      saveSpells(target!.spells.filter((_, index) => index !== removed))
        .then(renderWheelSection)
        .catch(warn);
    };
  });
  const add = container.querySelector<HTMLFormElement>("#add-spell");
  if (add) {
    add.onsubmit = (event) => {
      event.preventDefault();
      const name = add.querySelector<HTMLInputElement>("#spell-new-name")!.value.trim() || defaultSpellName(choice);
      // Le réglage « MJ seulement » vaut pour la partie en cours, pas pour le sort.
      saveSpells(addFavorite(target!.spells, name, { ...choice, gmOnly: false }, MAX_SPELLS))
        .then(renderWheelSection)
        .catch(warn);
    };
  }
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
  const { label } = ELEMENTS[choice.element];
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
    <p class="current">
      ${swatch(choice.element)}
      <span>${[label, STYLES[choice.style].label, measure, ...extras].join(" · ")}</span>
    </p>
    ${chips ? `<div class="favorites compact-favorites">${chips}</div>` : ""}
    <div id="running"></div>
    <div id="banner"></div>`;
  bindFavoriteChoices();
  renderRunning();
  renderBanner();
}

function render() {
  if (!app) return;
  if (compact) {
    renderCompact();
    return;
  }
  app.innerHTML = `
    <div id="banner"></div>
    ${favoritesSection()}
    <section>
      <h2>Effet</h2>
      ${pickerRow("element", "Élément", elementValue(choice.element), openPicker === "element")}
      ${openPicker === "element" ? elementGrid(choice.element) : ""}
      ${pickerRow("style", "Style", STYLES[choice.style].label, openPicker === "style")}
      ${openPicker === "style" ? styleGrid(choice.style) : ""}
    </section>
    <section>
      <h2>Taille</h2>
      ${sizeRow(choice.size, Boolean(usesExact()))}
    </section>
    ${optionsFold()}
    <div id="wheel-section"></div>
    <div id="running"></div>`;

  bindFolds(app);
  app.querySelectorAll<HTMLButtonElement>("[data-picker]").forEach((element) => {
    element.onclick = () => {
      const id = element.dataset.picker as "element" | "style";
      openPicker = openPicker === id ? undefined : id;
      render();
      app.querySelector<HTMLButtonElement>(`[data-picker="${id}"]`)?.focus();
    };
  });
  const newFavorite = app.querySelector<HTMLButtonElement>("#new-favorite");
  if (newFavorite) {
    newFavorite.onclick = () => {
      savingFavorite = true;
      render();
      app.querySelector<HTMLInputElement>("#favorite-name")?.focus();
    };
  }
  app.querySelectorAll<HTMLButtonElement>("[data-group]").forEach((element) => {
    element.onclick = () => {
      const group = element.dataset.group!;
      update({ [group]: element.dataset.value! });
      // Le choix fait, la grille se referme ; le focus reste sur la ligne ou sur la taille choisie.
      const wasOpen = openPicker;
      openPicker = undefined;
      render();
      app.querySelector<HTMLButtonElement>(
        wasOpen ? `[data-picker="${wasOpen}"]` : `[data-group="${group}"][data-value="${element.dataset.value}"]`,
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
  const saveForm = app.querySelector<HTMLFormElement>("#save");
  if (saveForm) {
    saveForm.onkeydown = (event) => {
      if (event.key === "Escape") {
        savingFavorite = false;
        render();
      }
    };
    saveForm.onsubmit = (event) => {
      event.preventDefault();
      const name = app.querySelector<HTMLInputElement>("#favorite-name")!.value;
      favorites = addFavorite(favorites, name, choice);
      saveFavorites(localStorage, favorites);
      savingFavorite = false;
      render();
    };
  }
  // Pas de nouveau rendu ici : le champ perdrait le curseur à chaque chiffre tapé, et un rendu à
  // la sortie du champ remplacerait le bouton sur lequel on est en train de cliquer.
  const exact = app.querySelector<HTMLInputElement>("#exact");
  if (exact) {
    exact.oninput = () => {
      const value = Number(exact.value);
      update({ exact: exact.value !== "" && Number.isFinite(value) && value > 0 ? value : null });
      app.querySelector("#sizes")!.classList.toggle("off", usesExact());
      const summary = app.querySelector<HTMLElement>('[data-fold="options"] .fold-summary');
      if (summary) summary.innerHTML = `${optionsSummary()} ▾`;
      app.querySelectorAll<HTMLButtonElement>("[data-favorite]").forEach((element) => {
        const favorite = favorites[Number(element.dataset.favorite)];
        element.setAttribute("aria-pressed", String(matchesFavorite(favorite, choice)));
      });
    };
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
  renderBanner();
  renderWheelSection();
}

export function setCastCompact(next: boolean) {
  compact = next;
  render();
}

export async function setupCast(container: HTMLElement, gm: boolean) {
  app = container;
  isGm = gm;
  if (!listening) {
    listening = true;
    await watchSceneUnit((next) => {
      unit = next;
    });
    if (await OBR.scene.isReady()) readRunning(await OBR.scene.getMetadata());
    OBR.scene.onMetadataChange(readRunning);
    toolActive = (await OBR.tool.getActiveTool()) === FX_TOOL_ID;
    OBR.tool.onToolChange((id) => {
      toolActive = id === FX_TOOL_ID;
      renderBanner();
    });
    // Sélectionner un token suffit à afficher sa roue.
    const selection = await OBR.player.getSelection();
    if (selection?.length === 1) await targetToken(selection[0]);
    OBR.player.onChange(({ selection: next }) => {
      if (next?.length === 1 && next[0] !== target?.id) targetToken(next[0]).catch(warn);
    });
    OBR.scene.items.onChange((items) => {
      if (!target) return;
      const item = items.find(({ id }) => id === target?.id);
      if (!item) {
        target = undefined;
        editing = undefined;
        renderWheelSection();
        return;
      }
      target.spells = spellsOf(item.metadata);
      target.name = item.name;
      if (editing === undefined) renderWheelSection();
    });
    OBR.broadcast.onMessage(FX_PROGRAM_CHANNEL, ({ data }) => {
      const message = data as { type?: string; anchor?: { token?: { id: string } } } | null;
      if (!pickingToken) return;
      if (message?.type === "picked") {
        const token = message.anchor?.token;
        if (!token) return;
        pickingToken = false;
        postPick("pick-stop");
        targetToken(token.id).catch(warn);
      } else if (message?.type === "pick-stopped") {
        pickingToken = false;
        renderWheelSection();
      }
    });
  }
  running = running.filter(({ owner }) => isGm || owner === OBR.player.id);
  render();
}

function renderSettings() {
  if (!settingsPane) return;
  settingsPane.innerHTML = `
    <section>
      <h2>Réglages</h2>
      <label class="option"><input id="gm-only" type="checkbox" ${choice.gmOnly ? "checked" : ""} /> Visible par le MJ seulement</label>
      <p class="note">Les effets que tu lances ne s'affichent pas chez les joueurs.</p>
      <label class="option"><input id="players" type="checkbox" ${playersAllowed ? "checked" : ""} /> Les joueurs peuvent lancer des effets</label>
      <p class="note">Ils ont alors l'onglet Lancer, et la roue sur les tokens qu'ils contrôlent.</p>
    </section>`;
  const gmOnly = settingsPane.querySelector<HTMLInputElement>("#gm-only")!;
  gmOnly.onchange = () => {
    update({ gmOnly: gmOnly.checked });
    renderBanner();
    if (compact) renderCompact();
  };
  const players = settingsPane.querySelector<HTMLInputElement>("#players")!;
  players.onchange = () => {
    playersAllowed = players.checked;
    OBR.room.setMetadata({ [FX_ROOM_KEY]: { players: players.checked } }).catch((error) => {
      warn(error);
      playersAllowed = !players.checked;
      players.checked = playersAllowed;
    });
  };
}

export function setupSettings(container: HTMLElement, allowed: boolean) {
  settingsPane = container;
  playersAllowed = allowed;
  renderSettings();
  OBR.room.onMetadataChange((metadata) => {
    const next = (metadata[FX_ROOM_KEY] as { players?: unknown } | undefined)?.players === true;
    if (next === playersAllowed) return;
    playersAllowed = next;
    renderSettings();
  });
}
