import OBR, { type Metadata } from "@owlbear-rodeo/sdk";
import {
  ELEMENT_IDS,
  FX_DURABLE_KEY,
  FX_SPELLS_KEY,
  canChooseTarget,
  entryOrigin,
  hasDirection,
  defaultTarget,
  spellTarget,
  type SpellTarget,
  FX_TOOL_ID,
  FX_UI_CHANNEL,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  MAX_FAVORITES,
  MAX_NAME_LENGTH,
  MAX_SPELLS,
  SIZE_IDS,
  STYLES,
  STYLE_IDS,
  elementLabel,
  styleLabel,
  addFavorite,
  defaultSpellName,
  durablesIn,
  editSpell,
  exactZoneLabel,
  isDurable,
  limitsIn,
  parseLimit,
  playersAllowedIn,
  roomSettingsWith,
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
  type FxLimits,
  type SizeId,
  type StyleId,
} from "./fx";
import { directionField, readDirectionField } from "./direction-field";
import { elementGrid, elementValue, pickerRow, sizeRow, styleGrid, swatch } from "./effect-fields";
import { FX_PROGRAM_CHANNEL, programsIn, type Program } from "./fx-programs";
import { currentLanguage, LANGUAGES, LANGUAGE_NAMES, languageSetting, setLanguageSetting, t, type Language } from "./i18n";
import { watchSceneUnit } from "./scene-unit";

let app: HTMLElement;
let settingsPane: HTMLElement | undefined;
let choice = loadChoice(localStorage);
let favorites = loadFavorites(localStorage);
let isGm = false;
let playersAllowed = false;
let unit = "cases";
let running: DurableEntry[] = [];
/** Pour nommer le programme d'origine d'un effet : son nom et son groupe ont pu changer depuis son tir. */
let programs: Program[] = [];
let limits: FxLimits = { durable: DEFAULT_LIMIT, programs: DEFAULT_LIMIT, simultaneous: DEFAULT_LIMIT };
let compact = false;
let toolActive = false;
/** Un premier point est posé sur la carte et attend le second. */
let aimingNow = false;
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
    return `${t("hint.faceBase", { off: isDurable(choice) ? t("hint.faceOff") : "" })}${choice.gmOnly ? ` ${t("hint.hidden")}` : ""}`;
  }
  if (isDurable(choice)) {
    const where =
      choice.style === "mur"
        ? t("hint.wall")
        : choice.style === "chaine"
        ? t(aimingNow ? "hint.chainNext" : "hint.chain")
        : STYLES[choice.style].directed
        ? t("hint.directed")
        : t("hint.attach");
    return choice.gmOnly ? `${where} ${t("hint.hidden")}` : where;
  }
  if (choice.gmOnly) {
    return choice.style === "teleportation"
      ? t("hint.gmTeleport")
      : t("hint.gmOnly");
  }
  if (choice.style === "chaine") return t(aimingNow ? "hint.chainNext" : "hint.chain");
  if (choice.style === "mur") return t("hint.wall");
  if (choice.style === "teleportation") return t("hint.teleport");
  return STYLES[choice.style].directed
    ? t("hint.directed")
    : t("hint.map");
}

/** Une fois un autre outil pris en main, le clic sur la carte ne lance plus rien : ça doit se voir. */
function bannerHtml() {
  return toolActive
    ? `<div class="hint">
         <p id="hint">${hint()}</p>
         <div class="hint-actions">
           ${aimingNow ? `<button type="button" id="cancel-aim">${t(choice.style === "chaine" ? "banner.finishChain" : "banner.cancelAim")}</button>` : ""}
           <button type="button" id="stop-cast">${t("banner.stop")}</button>
         </div>
       </div>`
    : `<div class="hint off-tool">
         <span>${t("banner.offTool")}</span>
         <button type="button" id="arm">${t("banner.resume")}</button>
       </div>`;
}

function renderBanner() {
  const banner = app.querySelector<HTMLElement>("#banner");
  if (!banner) return;
  banner.innerHTML = bannerHtml();
  const rearm = banner.querySelector<HTMLButtonElement>("#arm");
  if (rearm) rearm.onclick = () => postUi("arm");
  const cancelAim = banner.querySelector<HTMLButtonElement>("#cancel-aim");
  if (cancelAim) cancelAim.onclick = () => postUi("cancel-aim");
  const stop = banner.querySelector<HTMLButtonElement>("#stop-cast");
  if (stop) stop.onclick = () => postUi("stop-cast");
}

const usesExact = () => choice.exact !== null && STYLES[choice.style].exactZone;

function favoritesSection() {
  const list = favorites
    .map(
      (favorite, index) => `
        <span class="favorite">
          <button type="button" data-favorite="${index}" aria-pressed="${matchesFavorite(favorite, choice)}">${escapeHtml(favorite.name)}</button>
          <button type="button" class="remove" data-remove="${index}" aria-label="${escapeHtml(t("action.removeNamed", { name: favorite.name }))}" title="${t("action.remove")}">✕</button>
        </span>`,
    )
    .join("");
  const full = favorites.length >= MAX_FAVORITES;
  return `
    <section>
      <h2>${t("favorites.title")}</h2>
      <div class="favorites">
        ${list}
        ${savingFavorite ? "" : `<span class="favorite"><button type="button" id="new-favorite">${t("favorites.add")}</button></span>`}
      </div>
      ${savingFavorite
        ? `<form class="save" id="save">
             <input id="favorite-name" type="text" maxlength="30" aria-label="${t("favorites.nameLabel")}" placeholder="${t(full ? "favorites.full" : "favorites.placeholder")}" />
             <button type="submit">${t("favorites.ok")}</button>
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
/** Seulement ce qui est réglé : le résumé ne doit pas laisser croire qu'une option est active. */
function optionsSummary() {
  return [
    usesExact() ? `${exactZoneLabel(choice.style)} ${choice.exact} <span data-unit>${escapeHtml(unit)}</span>` : "",
    hasDirection(choice.style) && choice.direction !== undefined ? `${choice.direction}°` : "",
    isDurable(choice) ? t("options.durable") : "",
    startsOnFace(choice) ? t("options.onFace") : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

function refreshOptionsSummary() {
  const summary = app.querySelector<HTMLElement>('[data-fold="options"] .fold-summary');
  if (summary) summary.innerHTML = `${optionsSummary()} ▾`;
}

function optionsFold() {
  const content = `${exactRow()}${directionRow()}${durableRow()}${originRow()}`;
  return content.trim() ? foldHtml("options", t("options.title"), optionsSummary(), content) : "";
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
      ${t("zone.exact", { what })}
      <input id="exact" type="number" min="0" step="any" data-clearable value="${choice.exact ?? ""}" />
      <span data-unit>${escapeHtml(unit)}</span>
    </label>`;
}

function originRow() {
  if (choice.style !== "cube") return "";
  const face = choice.onFace === true;
  return `
    <div class="origin" role="radiogroup" aria-label="${t("options.originLabel")}">
      <span>${t("options.originOnToken")}</span>
      <label><input type="radio" name="origin" value="centre" ${face ? "" : "checked"} /> ${t("options.originCenter")}</label>
      <label><input type="radio" name="origin" value="face" ${face ? "checked" : ""} /> ${t("options.originFace")}</label>
    </div>`;
}

function directionRow() {
  if (!hasDirection(choice.style)) return "";
  return directionField(choice.direction);
}

function durableRow() {
  return `<label class="option durable"><input id="durable" type="checkbox" ${choice.durable ? "checked" : ""} /> ${t("options.durableLong")}</label>`;
}

const highlightOnMap = (ids: string[]) =>
  OBR.broadcast.sendMessage(FX_UI_CHANNEL, { type: "highlight", ids }, { destination: "LOCAL" }).catch(warn);

function showOnMapWhileHovered(element: HTMLElement, ids: string[]) {
  element.addEventListener("pointerenter", () => highlightOnMap(ids));
  element.addEventListener("pointerleave", () => highlightOnMap([]));
  element.addEventListener("focus", () => highlightOnMap(ids));
  element.addEventListener("blur", () => highlightOnMap([]));
}

function originLabel(entry: DurableEntry) {
  const origin = entryOrigin(entry);
  if (origin?.kind === "program") {
    const program = programs.find(({ id }) => id === entry.program?.id);
    if (!program) return t("running.fromProgram");
    const named = t("running.fromProgramNamed", { name: escapeHtml(program.name) });
    return program.group ? `${named} · ${t("running.inGroup", { group: escapeHtml(program.group) })}` : named;
  }
  if (origin?.kind === "wheel") return origin.name ? t("running.fromToken", { name: escapeHtml(origin.name) }) : t("running.fromTokenAny");
  return origin ? t("running.fromHand", { name: escapeHtml(origin.name) }) : "";
}

function runningList() {
  if (!running.length) return "";
  const list = `
      ${running
        .map(
          (entry) => {
            const { id, name, carrier } = entry;
            const origin = originLabel(entry);
            return `
            <div class="running">
              <span>${escapeHtml(name)} ${carrier ? `<small>${t("running.onToken", { name: escapeHtml(carrier.name) })}</small>` : ""}${origin ? `<small class="origin">${origin}</small>` : ""}</span>
              <button type="button" data-stop="${escapeHtml(id)}" aria-label="${t("action.removeNamed", { name: escapeHtml(name) })}" title="${t("action.remove")}">✕</button>
            </div>`;
          },
        )
        .join("")}
      ${running.length > 1 ? `<button type="button" class="stop-all" id="stop-all">${t("running.removeAll")}</button>` : ""}`;
  if (compact) return `<section><h2>${t("running.title")} (${running.length}/${limits.durable})</h2>${list}</section>`;
  return foldHtml("running", t("running.title"), t(running.length > 1 ? "running.activeMany" : "running.active", { count: running.length, limit: limits.durable }), list);
}

/** Retire de la liste à jour : un autre joueur a pu y toucher depuis son affichage. */
async function stopDurables(ids: string[]) {
  const entries = durablesIn(await OBR.scene.getMetadata());
  await OBR.scene.setMetadata({ [FX_DURABLE_KEY]: entries.filter(({ id }) => !ids.includes(id)) });
}

/** La liste change sans redessiner le reste du panneau, où un champ peut être en cours de saisie. */
function renderRunning() {
  // Les réglages de la salle sont lus avant que le panneau soit dessiné.
  const container = app?.querySelector<HTMLDivElement>("#running");
  if (!container) return;
  container.innerHTML = runningList();
  bindFolds(container);
  container.querySelectorAll<HTMLButtonElement>("[data-stop]").forEach((element) => {
    element.onclick = () => {
      highlightOnMap([]);
      stopDurables([element.dataset.stop!]).catch(warn);
    };
    showOnMapWhileHovered(element, [element.dataset.stop!]);
  });
  const stopAll = container.querySelector<HTMLButtonElement>("#stop-all");
  if (stopAll) {
    stopAll.onclick = () => {
      highlightOnMap([]);
      stopDurables(running.map(({ id }) => id)).catch(warn);
    };
    showOnMapWhileHovered(stopAll, running.map(({ id }) => id));
  }
}

function readRunning(metadata: Metadata) {
  running = durablesIn(metadata).filter(({ owner }) => isGm || owner === OBR.player.id);
  programs = programsIn(metadata);
  renderRunning();
}

function update(next: Partial<typeof choice>) {
  choice = { ...choice, ...next };
  saveChoice(localStorage, choice);
}

/**
 * Enregistre sur le token ; la liste affichée change aussitôt, puis suit la scène. Le changement part
 * de ce que le token contient à cet instant : la liste affichée a pu prendre du retard sur lui.
 */
async function saveSpells(change: (spells: Favorite[]) => Favorite[]) {
  if (!target) return;
  const { id } = target;
  const previous = target.spells;
  target.spells = change(previous);
  try {
    await OBR.scene.items.updateItems(
      (item) => item.id === id,
      (drafts) => {
        for (const draft of drafts) draft.metadata[FX_SPELLS_KEY] = change(spellsOf(draft.metadata));
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
    targetProblem = t("wheel.notYours", { name: item.name });
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
      <h2>${t("wheel.editTitle", { name: escapeHtml(target!.name) })}</h2>
      <form id="spell-edit" class="edit" novalidate>
        <label class="wide">${t("field.name")}<input type="text" id="spell-name" maxlength="${MAX_NAME_LENGTH}" value="${escapeHtml(spell.name)}" /></label>
        <label>${t("field.element")}<select id="spell-element">${options(ELEMENT_IDS, elementLabel, spell.element)}</select></label>
        <label>${t("field.style")}<select id="spell-style">${options(STYLE_IDS, styleLabel, spell.style)}</select></label>
        <label>${t("field.size")}<select id="spell-size">${options(SIZE_IDS, (id) => id, spell.size)}</select></label>
        <label id="spell-exact-row"><span id="spell-exact-label"></span><input type="number" id="spell-exact" min="0" step="any" data-clearable value="${spell.exact ?? ""}" /></label>
        <label class="wide" id="spell-origin-row">${t("wheel.origin")}<select id="spell-origin">
          <option value="centre"${spell.onFace ? "" : " selected"}>${t("wheel.originCenter")}</option>
          <option value="face"${spell.onFace ? " selected" : ""}>${t("wheel.originFace")}</option>
        </select></label>
        <div class="wide" id="spell-direction-row">${directionField(spell.direction)}</div>
        <label class="wide" id="spell-target-row">${t("wheel.target")}<select id="spell-target">
          <option value="self"${spellTarget(spell) === "self" ? " selected" : ""}>${t("wheel.targetSelf")}</option>
          <option value="aim"${spellTarget(spell) === "aim" ? " selected" : ""}>${t("wheel.targetAim")}</option>
        </select></label>
        <label class="wide check" id="spell-durable-row"><input type="checkbox" id="spell-durable"${spell.durable ? " checked" : ""} /> ${t("wheel.durable")}</label>
        ${isSpellLit(spell) ? `<p class="note wide">${t("wheel.alreadyLit")}</p>` : ""}
        <p class="error wide" id="spell-error" hidden></p>
        <div class="wide edit-actions">
          <button type="button" id="spell-cancel">${t("action.cancel")}</button>
          <button type="submit" class="save-spell">${t("action.save")}</button>
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
    field("exact-label").innerHTML = `${t("zone.exact", { what: exactZoneLabel(style) })} (<span data-unit>${escapeHtml(unit)}</span>)`;
    field("origin-row").hidden = style !== "cube";
    // Posé sur une face, le cube part forcément du token : il n'y a rien d'autre à choisir.
    const onFace = style === "cube" && field<HTMLSelectElement>("origin").value === "face";
    field("target-row").hidden = !canChooseTarget(style) || onFace;
    field("direction-row").hidden = !hasDirection(style);
  };
  showFieldsOfStyle();
  styleField.onchange = () => {
    field<HTMLSelectElement>("target").value = defaultTarget(styleField.value as StyleId);
    showFieldsOfStyle();
  };
  field<HTMLSelectElement>("origin").onchange = showFieldsOfStyle;
  field<HTMLButtonElement>("cancel").onclick = close;
  form.onkeydown = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
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
    const changes = {
      name: field<HTMLInputElement>("name").value,
      element: field<HTMLSelectElement>("element").value as ElementId,
      style: styleField.value as StyleId,
      size: field<HTMLSelectElement>("size").value as SizeId,
      exact: field<HTMLInputElement>("exact").valueAsNumber,
      durable: field<HTMLInputElement>("durable").checked,
      onFace: field<HTMLSelectElement>("origin").value === "face",
      target: field<HTMLSelectElement>("target").value as SpellTarget,
      direction: readDirectionField(form),
    };
    const spells = target!.spells;
    if (editSpell(spells, index, changes) === spells) {
      fail(t("wheel.nameTaken"));
      return;
    }
    saveSpells((current) => editSpell(current, index, changes))
      .then(close)
      .catch((reason) => {
        warn(reason);
        fail(t("wheel.saveFailed"));
      });
  };
  field<HTMLInputElement>("name").focus();
}

function wheelSectionHtml() {
  if (target && editing !== undefined && target.spells[editing]) return spellEditHtml(target.spells[editing]);
  const pick = `<button type="button" class="wide-button" id="pick-token" ${pickingToken ? 'aria-pressed="true"' : ""}>${t(pickingToken ? "wheel.picking" : target ? "wheel.pickOther" : "wheel.pick")}</button>`;
  if (!target) {
    const invite = targetProblem
      ? `<p class="note">${escapeHtml(targetProblem)}</p>`
      : `<p class="note">${t("wheel.invite")}</p>`;
    return foldHtml("wheel", t("wheel.titleAny"), t("wheel.noToken"), `${invite}${pick}`, pickingToken || Boolean(targetProblem));
  }
  const { name, spells } = target;
  const full = spells.length >= MAX_SPELLS;
  const content = `
      ${spells.length
        ? spells
            .map(
              (spell, index) => `
                <div class="spell-row">
                  <span>${escapeHtml(spell.name)} <small>${styleLabel(spell.style)}${isDurable(spell) ? t("wheel.durableTag") : ""}${startsOnFace(spell) ? t("wheel.faceTag") : ""}</small></span>
                  <button type="button" data-edit-spell="${index}" aria-label="${t("action.editNamed", { name: escapeHtml(spell.name) })}" title="${t("action.edit")}">✎</button>
                  <button type="button" data-remove-spell="${index}" aria-label="${t("action.removeNamed", { name: escapeHtml(spell.name) })}" title="${t("action.remove")}">✕</button>
                </div>`,
            )
            .join("")
        : `<p class="note">${t("wheel.noSpell")}</p>`}
      ${full
        ? `<p class="note">${t("wheel.full")}</p>`
        : `<form class="save" id="add-spell">
             <input id="spell-new-name" type="text" maxlength="${MAX_NAME_LENGTH}" aria-label="${t("wheel.newName")}" placeholder="${escapeHtml(defaultSpellName(choice))}" />
             <button type="submit">${t("wheel.add")}</button>
           </form>
           <p class="note">${t("wheel.addHint")}</p>`}
      ${pick}`;
  return foldHtml(
    "wheel",
    t("wheel.title", { name: escapeHtml(name) }),
    t(spells.length > 1 ? "wheel.spellCountMany" : "wheel.spellCount", { count: spells.length }),
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
      saveSpells((spells) => spells.filter((_, index) => index !== removed))
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
      saveSpells((spells) => addFavorite(spells, name, { ...choice, gmOnly: false }, MAX_SPELLS))
        .then(renderWheelSection)
        .catch(warn);
    };
  }
}

function bindFavoriteChoices() {
  app.querySelectorAll<HTMLButtonElement>("[data-favorite]").forEach((element) => {
    element.onclick = () => {
      const { element: fxElement, style, size, exact, durable, onFace, direction } =
        favorites[Number(element.dataset.favorite)];
      update({ element: fxElement, style, size, exact, durable: durable === true, onFace: onFace === true, direction });
      render();
    };
  });
}

/** L'essentiel pour jouer : ce qui partira au prochain clic, et de quoi changer d'effet ou en retirer un. */
function renderCompact() {
  const label = elementLabel(choice.element);
  const measure = usesExact() ? `${choice.exact} <span data-unit>${escapeHtml(unit)}</span>` : choice.size;
  const extras = [isDurable(choice) ? t("options.durable") : "", choice.gmOnly ? t("running.mjOnly") : ""].filter(Boolean);
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
      <span>${[label, styleLabel(choice.style), measure, ...extras].join(" · ")}</span>
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
      <h2>${t("field.effect")}</h2>
      ${pickerRow("element", t("field.element"), elementValue(choice.element), openPicker === "element")}
      ${openPicker === "element" ? elementGrid(choice.element) : ""}
      ${pickerRow("style", t("field.style"), styleLabel(choice.style), openPicker === "style")}
      ${openPicker === "style" ? styleGrid(choice.style) : ""}
    </section>
    <section>
      <h2>${t("field.size")}</h2>
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
        event.preventDefault();
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
      refreshOptionsSummary();
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
  const direction = app.querySelector<HTMLElement>("[data-direction]");
  if (direction) {
    direction.oninput = () => {
      update({ direction: readDirectionField(app) });
      refreshOptionsSummary();
    };
  }
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
      if (!toolActive) aimingNow = false;
      renderBanner();
    });
    OBR.broadcast.onMessage(FX_UI_CHANNEL, ({ data }) => {
      const message = data as { type?: string; active?: boolean } | null;
      if (message?.type !== "aim-state") return;
      aimingNow = message.active === true;
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

function limitWarning() {
  const warnings = [
    limits.durable > DEFAULT_LIMIT
      ? t("settings.warnDurable")
      : "",
    limits.programs > DEFAULT_LIMIT
      ? t("settings.warnPrograms")
      : "",
    limits.simultaneous > DEFAULT_LIMIT
      ? t("settings.warnSimultaneous")
      : "",
  ].filter(Boolean);
  return warnings.map((text) => `<p class="warning">⚠ ${text}</p>`).join("");
}

/** Le site guide, dans la langue de l'interface. */
const GUIDE_URL_BASE = "https://vfx-owlbear.pages.dev/";
const guideUrl = () => (currentLanguage() === "fr" ? `${GUIDE_URL_BASE}fr/` : GUIDE_URL_BASE);

function renderSettings() {
  const GUIDE_URL = guideUrl();
  if (!settingsPane) return;
  const language = languageSetting();
  const languageSection = `
    <section>
      <h2>${t("settings.language")}</h2>
      <select id="language" aria-label="${t("settings.language")}">
        <option value="auto"${language === "auto" ? " selected" : ""}>${t("settings.languageAuto")}</option>
        ${LANGUAGES.map((id) => `<option value="${id}"${language === id ? " selected" : ""}>${LANGUAGE_NAMES[id]}</option>`).join("")}
      </select>
    </section>
    <section class="about">
      <h2>${t("settings.about")}</h2>
      <p class="note"><a href="${GUIDE_URL}" target="_blank" rel="noopener">${t("settings.guide")}</a></p>
      <p class="note">${t("settings.privacy")}</p>
    </section>`;
  settingsPane.innerHTML = isGm
    ? `
    <section>
      <h2>${t("settings.title")}</h2>
      <label class="option"><input id="gm-only" type="checkbox" ${choice.gmOnly ? "checked" : ""} /> ${t("settings.gmOnly")}</label>
      <p class="note">${t("settings.gmOnlyHelp")}</p>
      <label class="option"><input id="players" type="checkbox" ${playersAllowed ? "checked" : ""} /> ${t("settings.players")}</label>
      <p class="note">${t("settings.playersHelp")}</p>
    </section>
    <section>
      <h2>${t("settings.limits")}</h2>
      <label class="limit">${t("settings.limitDurable")}<input id="limit-durable" type="number" min="1" max="${MAX_LIMIT}" step="1" value="${limits.durable}" /></label>
      <label class="limit">${t("settings.limitPrograms")}<input id="limit-programs" type="number" min="1" max="${MAX_LIMIT}" step="1" value="${limits.programs}" /></label>
      <label class="limit">${t("settings.limitSimultaneous")}<input id="limit-simultaneous" type="number" min="1" max="${MAX_LIMIT}" step="1" value="${limits.simultaneous}" /></label>
      <div id="limit-warning">${limitWarning()}</div>
      <p class="note">${t("settings.limitsHelp", { limit: DEFAULT_LIMIT })}</p>
    </section>
    ${languageSection}`
    : languageSection;
  settingsPane.querySelector<HTMLSelectElement>("#language")!.onchange = async (event) => {
    setLanguageSetting((event.target as HTMLSelectElement).value as Language | "auto");
    await postUi("language");
    // Tout le menu se redessine dans la nouvelle langue ; un programme en cours de saisie est gardé.
    location.reload();
  };
  if (!isGm) return;
  const gmOnly = settingsPane.querySelector<HTMLInputElement>("#gm-only")!;
  gmOnly.onchange = () => {
    update({ gmOnly: gmOnly.checked });
    renderBanner();
    if (compact) renderCompact();
  };
  const players = settingsPane.querySelector<HTMLInputElement>("#players")!;
  players.onchange = () => {
    playersAllowed = players.checked;
    OBR.room
      .getMetadata()
      .then((metadata) => OBR.room.setMetadata(roomSettingsWith(metadata, { players: players.checked })))
      .catch((error) => {
        warn(error);
        playersAllowed = !players.checked;
        players.checked = playersAllowed;
      });
  };
  for (const key of ["durable", "programs", "simultaneous"] as const) {
    const input = settingsPane.querySelector<HTMLInputElement>(`#limit-${key}`)!;
    input.onchange = () => {
      const previous = limits;
      limits = { ...limits, [key]: parseLimit(input.value, limits[key]) };
      input.value = String(limits[key]);
      settingsPane!.querySelector("#limit-warning")!.innerHTML = limitWarning();
      renderRunning();
      OBR.room
        .getMetadata()
        .then((metadata) => OBR.room.setMetadata(roomSettingsWith(metadata, { limits })))
        .catch((error) => {
          warn(error);
          limits = previous;
          input.value = String(limits[key]);
          settingsPane!.querySelector("#limit-warning")!.innerHTML = limitWarning();
        });
    };
  }
}

export function setupSettings(container: HTMLElement, allowed: boolean) {
  settingsPane = container;
  playersAllowed = allowed;
  renderSettings();
}

/** Les limites et l'autorisation des joueurs viennent de la salle, y compris pour un joueur. */
export async function watchRoomSettings() {
  const read = (metadata: Metadata) => {
    const nextLimits = limitsIn(metadata);
    const nextPlayers = playersAllowedIn(metadata);
    const changed = nextPlayers !== playersAllowed || nextLimits.durable !== limits.durable || nextLimits.programs !== limits.programs || nextLimits.simultaneous !== limits.simultaneous;
    limits = nextLimits;
    playersAllowed = nextPlayers;
    if (!changed) return;
    renderRunning();
    // Une saisie en cours dans les réglages n'est pas écrasée par un écho de ce qu'on vient d'enregistrer.
    if (!settingsPane?.contains(document.activeElement)) renderSettings();
  };
  read(await OBR.room.getMetadata());
  OBR.room.onMetadataChange(read);
}
