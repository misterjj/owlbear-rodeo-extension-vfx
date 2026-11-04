import OBR, { type Metadata } from "@owlbear-rodeo/sdk";
import { ELEMENTS, STYLES, exactZoneLabel, isExact, type ElementId, type SizeId, type StyleId } from "./fx";
import { elementColor, elementGrid, elementValue, pickerRow, sizeRow, styleGrid, type PickerId } from "./effect-fields";
import { STYLE_ICONS } from "./fx-icons";
import {
  FX_PROGRAMS_KEY,
  FX_PROGRAM_CHANNEL,
  MAX_ANCHORS,
  MAX_PROGRAMS,
  MIN_INTERVAL,
  anchorsNeeded,
  groupNames,
  normalizeTiming,
  programProblem,
  programsIn,
  withActive,
  withProgram,
  type Program,
} from "./fx-programs";
import { watchSceneUnit } from "./scene-unit";

let app: HTMLElement;
const warn = (error: unknown) => console.warn("Effets :", error);

let programs: Program[] = [];
/** Programme en cours d'édition ; sans lui, la fenêtre montre la liste. */
let draft: Program | undefined;
let picking = false;
let problem = "";
let confirmingDelete: string | undefined;
let unit = "cases";
let openPicker: PickerId | undefined;
let compact = false;
/** Le menu Effets est rechargé quand on le rouvre : la saisie en cours y survit. */
const DRAFT_STORAGE_KEY = "vfx:programme-en-cours";

const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

const post = (data: unknown) =>
  OBR.broadcast.sendMessage(FX_PROGRAM_CHANNEL, data, { destination: "LOCAL" }).catch(warn);

/** Repart de la liste à jour : un autre MJ a pu y toucher depuis son affichage. */
async function saveWith(change: (current: Program[]) => Program[]) {
  const current = programsIn(await OBR.scene.getMetadata());
  await OBR.scene.setMetadata({ [FX_PROGRAMS_KEY]: change(current) });
}

const rhythm = ({ min, max, offset, shots }: Program) =>
  [
    min === max ? `toutes les ${min} s` : `toutes les ${min} à ${max} s`,
    offset > 0 ? `décalé de ${offset} s` : "",
    shots === null ? "" : `${shots} tir${shots > 1 ? "s" : ""}`,
  ]
    .filter(Boolean)
    .join(", ");

const picto = ({ style, element }: Program) =>
  `<svg class="picto" viewBox="0 0 24 24" aria-hidden="true" style="color: ${elementColor(element)}">${STYLE_ICONS[style]}</svg>`;

function toggleButton({ id, name, active }: Program) {
  const action = `${active ? "Désactiver" : "Activer"} ${escapeHtml(name)}`;
  return `<button type="button" class="btn toggle ${active ? "on" : ""}" data-toggle="${escapeHtml(id)}" title="${action}" aria-label="${action}">${active ? "■" : "▶"}</button>`;
}

function programRow(program: Program) {
  const { id, name, active, style, element } = program;
  return `
    <div class="program ${active ? "active" : ""}">
      ${picto(program)}
      <div class="info">
        <span class="name">${escapeHtml(name)}</span>
        <small>${escapeHtml(`${STYLES[style].label} · ${ELEMENTS[element].label}`)}</small>
        <small>${escapeHtml(rhythm(program))}</small>
      </div>
      ${toggleButton(program)}
      <button type="button" class="btn" data-edit="${escapeHtml(id)}" aria-label="Modifier ${escapeHtml(name)}" title="Modifier">✎</button>
      <button type="button" class="btn ${confirmingDelete === id ? "danger" : ""}" data-delete="${escapeHtml(id)}" aria-label="Supprimer ${escapeHtml(name)}" title="Supprimer">${confirmingDelete === id ? "Confirmer" : "✕"}</button>
    </div>`;
}

function groupBlock(group: string, members: Program[]) {
  const name = escapeHtml(group);
  const running = members.filter(({ active }) => active).length;
  return `
    <section class="group">
      <div class="group-head">
        <h2>${name} <small>${running}/${members.length} actif${running > 1 ? "s" : ""}</small></h2>
        <button type="button" class="btn" data-group-on="${name}" title="Tout activer dans ${name}" aria-label="Tout activer dans ${name}">▶ Tout</button>
        <button type="button" class="btn" data-group-off="${name}" title="Tout désactiver dans ${name}" aria-label="Tout désactiver dans ${name}">■ Tout</button>
      </div>
      ${members.map(programRow).join("")}
    </section>`;
}

function saveDraftForReload() {
  captureForm();
  try {
    if (draft) sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ draft }));
  } catch (error) {
    warn(error);
  }
}

function restoreDraft() {
  try {
    const saved = sessionStorage.getItem(DRAFT_STORAGE_KEY);
    sessionStorage.removeItem(DRAFT_STORAGE_KEY);
    if (saved) ({ draft } = JSON.parse(saved) as { draft: Program });
  } catch (error) {
    warn(error);
  }
}

/** Une ligne par programme, ou par groupe en tête de ses programmes, sans rien pour les modifier. */
function compactRow(program: Program) {
  return `
    <div class="mini ${program.active ? "active" : ""}">
      ${picto(program)}
      <span class="mini-name" title="${escapeHtml(program.name)}">${escapeHtml(program.name)}</span>
      ${toggleButton(program)}
    </div>`;
}

function compactGroup(group: string, members: Program[]) {
  const name = escapeHtml(group);
  return `
    <div class="mini mini-group">
      <h2 title="${name}">${name}</h2>
      <button type="button" class="btn" data-group-on="${name}" title="Tout activer dans ${name}" aria-label="Tout activer dans ${name}">▶</button>
      <button type="button" class="btn" data-group-off="${name}" title="Tout désactiver dans ${name}" aria-label="Tout désactiver dans ${name}">■</button>
    </div>
    ${members.map(compactRow).join("")}`;
}

function bindToggles() {
  const setActive = (ids: string[], active: boolean) =>
    saveWith((current) => withActive(current, ids, active, Date.now())).catch(warn);
  app.querySelectorAll<HTMLButtonElement>("[data-toggle]").forEach((button) => {
    button.onclick = () => {
      const program = programs.find(({ id }) => id === button.dataset.toggle);
      if (program) setActive([program.id], !program.active);
    };
  });
  const groupIds = (group?: string) =>
    programs.filter((program) => program.group === group).map(({ id }) => id);
  app.querySelectorAll<HTMLButtonElement>("[data-group-on]").forEach((button) => {
    button.onclick = () => setActive(groupIds(button.dataset.groupOn), true);
  });
  app.querySelectorAll<HTMLButtonElement>("[data-group-off]").forEach((button) => {
    button.onclick = () => setActive(groupIds(button.dataset.groupOff), false);
  });
}

function renderCompact() {
  const groups = groupNames(programs);
  const loose = programs.filter(({ group }) => !group);
  const editing = draft
    ? `<p class="note">${picking ? `Clique sur la carte : ${draft.anchors.length} point(s).` : "Programme en cours de saisie : agrandis pour reprendre."}</p>`
    : "";
  app.innerHTML = `
    ${editing}
    ${programs.length ? "" : `<p class="empty">Aucun programme.</p>`}
    ${groups.map((group) => compactGroup(group, programs.filter((p) => p.group === group))).join("")}
    ${loose.map(compactRow).join("")}`;
  bindToggles();
}

function renderList() {
  if (compact) {
    renderCompact();
    return;
  }
  const groups = groupNames(programs);
  const loose = programs.filter(({ group }) => !group);
  app.innerHTML = `
    <header class="bar">
      <strong>Programmes (${programs.length}/${MAX_PROGRAMS})</strong>
      <button type="button" class="btn primary" id="new" ${programs.length >= MAX_PROGRAMS ? "disabled" : ""}>+ Nouveau</button>
    </header>
    ${programs.length ? "" : `<p class="empty">Un programme relance un effet tout seul, à ton rythme : un canon toutes les 3 secondes, des éclairs entre deux poteaux. Rien ne part tant que tu ne l'as pas activé.</p>`}
    ${groups.map((group) => groupBlock(group, programs.filter((p) => p.group === group))).join("")}
    ${loose.length ? `<section class="group">${groups.length ? `<div class="group-head"><h2>Sans groupe</h2></div>` : ""}${loose.map(programRow).join("")}</section>` : ""}`;

  app.querySelector<HTMLButtonElement>("#new")!.onclick = () => {
    draft = {
      id: crypto.randomUUID(),
      name: "",
      group: "",
      element: "feu",
      style: "projectile",
      size: "M",
      exact: null,
      anchors: [],
      min: 3,
      max: 3,
      offset: 0,
      shots: null,
      active: false,
      startedAt: 0,
    };
    openForm();
  };
  bindToggles();
  app.querySelectorAll<HTMLButtonElement>("[data-edit]").forEach((button) => {
    button.onclick = () => {
      const program = programs.find(({ id }) => id === button.dataset.edit);
      if (program) {
        draft = { ...program, anchors: [...program.anchors] };
        openForm();
      }
    };
  });
  app.querySelectorAll<HTMLButtonElement>("[data-delete]").forEach((button) => {
    button.onclick = () => {
      const id = button.dataset.delete!;
      if (confirmingDelete !== id) {
        confirmingDelete = id;
        renderList();
        return;
      }
      confirmingDelete = undefined;
      saveWith((current) => current.filter((program) => program.id !== id)).catch(warn);
    };
  });
}

function openForm() {
  problem = "";
  confirmingDelete = undefined;
  openPicker = undefined;
  renderForm();
  post({ type: "draft", anchors: draft!.anchors });
}

/** Garde ce qui est saisi avant de redessiner le formulaire. */
function captureForm() {
  // Dans la version réduite, le formulaire n'est pas affiché : le brouillon est déjà à jour.
  if (!draft || !app.querySelector("#form")) return;
  const value = (id: string) => app.querySelector<HTMLInputElement | HTMLSelectElement>(`#${id}`)?.value ?? "";
  const number = (id: string) => (value(id).trim() === "" ? undefined : Number(value(id)));
  const exact = number("exact");
  draft = {
    ...draft,
    name: value("name"),
    group: value("group").trim(),
    exact: isExact(exact) ? exact : null,
    min: number("min") ?? draft.min,
    max: number("max") ?? draft.max,
    offset: number("offset") ?? 0,
    shots: number("shots") ?? null,
  };
}

function anchorsHtml() {
  const { anchors, style } = draft!;
  const rows = anchors
    .map(
      ({ at, token }, index) => `
        <div class="anchor">
          <span class="rank">${index + 1}</span>
          <span>${token ? `Token ${escapeHtml(token.name)}` : `Carte (${Math.round(at.x)}, ${Math.round(at.y)})`}</span>
          <button type="button" class="btn" data-remove-anchor="${index}" aria-label="Retirer le point ${index + 1}" title="Retirer">✕</button>
        </div>`,
    )
    .join("");
  const directed = STYLES[style].directed;
  const note = style === "chaine"
    ? "À chaque tir, la chaîne parcourt tous les points dans l'ordre. L'intervalle compte à partir de sa fin."
    : directed
    ? "Avec deux points, l'effet va du premier au second. Avec plus, il relie deux points au hasard."
    : "Avec plusieurs points, chaque tir en choisit un au hasard.";
  return `
    ${rows || `<p class="empty">Aucun point pour l'instant (${anchorsNeeded(style)} au moins).</p>`}
    <button type="button" id="pick" class="btn wide-action ${picking ? "picking" : ""}" ${anchors.length >= MAX_ANCHORS && !picking ? "disabled" : ""}>${picking ? "Terminer les clics sur la carte" : "Ajouter des points sur la carte"}</button>
    <p class="note">${picking ? "Clique sur la carte ou sur un token. Échap pour finir." : note}</p>`;
}

function bindAnchors() {
  app.querySelector<HTMLButtonElement>("#pick")!.onclick = () => {
    picking = !picking;
    post({ type: picking ? "pick-start" : "pick-stop" });
    refreshAnchors();
  };
  app.querySelectorAll<HTMLButtonElement>("[data-remove-anchor]").forEach((button) => {
    button.onclick = () => {
      const index = Number(button.dataset.removeAnchor);
      draft!.anchors = draft!.anchors.filter((_, i) => i !== index);
      post({ type: "draft", anchors: draft!.anchors });
      refreshAnchors();
    };
  });
}

function refresh() {
  if (compact) renderCompact();
  else refreshAnchors();
}

function refreshAnchors() {
  const container = app.querySelector<HTMLDivElement>("#anchors");
  if (!container || !draft) return;
  container.innerHTML = anchorsHtml();
  bindAnchors();
}

function renderForm() {
  const d = draft!;
  const zone = STYLES[d.style].exactZone;
  const usesExact = zone && d.exact !== null;
  app.innerHTML = `
    <header class="bar"><strong>${programs.some(({ id }) => id === d.id) ? "Modifier le programme" : "Nouveau programme"}</strong></header>
    <form id="form" novalidate>
      <div class="fields">
        <label>Nom<input id="name" type="text" maxlength="40" value="${escapeHtml(d.name)}" placeholder="Ex. Canon du couloir" /></label>
        <label>Groupe (facultatif)<input id="group" type="text" maxlength="30" list="groups" value="${escapeHtml(d.group)}" placeholder="Ex. Salle du trésor" /></label>
        <datalist id="groups">${groupNames(programs).map((group) => `<option value="${escapeHtml(group)}"></option>`).join("")}</datalist>
      </div>
      <h2>Effet</h2>
      ${pickerRow("element", "Élément", elementValue(d.element), openPicker === "element")}
      ${openPicker === "element" ? elementGrid(d.element) : ""}
      ${pickerRow("style", "Style", STYLES[d.style].label, openPicker === "style")}
      ${openPicker === "style" ? styleGrid(d.style) : ""}
      ${sizeRow(d.size, usesExact)}
      ${zone ? `<label class="inline"><span>${exactZoneLabel(d.style)} exact (<span data-unit>${escapeHtml(unit)}</span>)</span><input id="exact" type="number" min="0" step="any" value="${d.exact ?? ""}" /></label>` : ""}
      <h2>Rythme</h2>
      <div class="fields">
        <label>Intervalle min. (secondes)<input id="min" type="number" min="${MIN_INTERVAL}" step="any" value="${d.min}" /></label>
        <label>Intervalle max. (secondes)<input id="max" type="number" min="${MIN_INTERVAL}" step="any" value="${d.max}" /></label>
        <label>Premier tir après (secondes)<input id="offset" type="number" min="0" step="any" value="${d.offset}" /></label>
        <label>Tirs (vide : sans fin)<input id="shots" type="number" min="1" step="1" value="${d.shots ?? ""}" /></label>
      </div>
      ${d.group ? `<p class="note">Décaler le premier tir fait alterner les programmes de ce groupe.</p>` : ""}
      <h2>Points</h2>
      <div id="anchors"></div>
      ${problem ? `<p class="error" role="alert">${escapeHtml(problem)}</p>` : ""}
      <div class="actions">
        <button type="button" class="btn" id="cancel">Annuler</button>
        <button type="submit" class="btn primary">Enregistrer</button>
      </div>
    </form>`;
  refreshAnchors();
  app.querySelectorAll<HTMLButtonElement>("[data-picker]").forEach((button) => {
    button.onclick = () => {
      const id = button.dataset.picker as PickerId;
      captureForm();
      openPicker = openPicker === id ? undefined : id;
      renderForm();
      app.querySelector<HTMLButtonElement>(`[data-picker="${id}"]`)?.focus();
    };
  });
  app.querySelectorAll<HTMLButtonElement>("[data-group]").forEach((button) => {
    button.onclick = () => {
      const value = button.dataset.value!;
      const group = button.dataset.group as "element" | "style" | "size";
      captureForm();
      if (group === "element") draft!.element = value as ElementId;
      else if (group === "style") draft!.style = value as StyleId;
      else draft!.size = value as SizeId;
      // Le choix fait, la grille se referme.
      const wasOpen = openPicker;
      openPicker = undefined;
      renderForm();
      app.querySelector<HTMLButtonElement>(wasOpen ? `[data-picker="${wasOpen}"]` : `[data-group="size"][data-value="${value}"]`)?.focus();
    };
  });
  const exact = app.querySelector<HTMLInputElement>("#exact");
  if (exact) {
    exact.oninput = () => {
      app.querySelector("#sizes")!.classList.toggle("off", isExact(exact.valueAsNumber));
    };
  }
  app.querySelector<HTMLButtonElement>("#cancel")!.onclick = closeForm;
  app.querySelector<HTMLFormElement>("#form")!.onsubmit = (event) => {
    event.preventDefault();
    captureForm();
    const found = programProblem(draft!);
    if (found) {
      problem = found;
      renderForm();
      return;
    }
    const program: Program = {
      ...draft!,
      name: draft!.name.trim(),
      ...normalizeTiming(draft!),
      // Un programme actif repart avec ses nouveaux réglages.
      startedAt: Date.now(),
    };
    saveWith((current) => withProgram(current, program))
      .then(closeForm)
      .catch((error) => {
        warn(error);
        problem = "Enregistrement impossible.";
        renderForm();
      });
  };
}

function closeForm() {
  draft = undefined;
  openPicker = undefined;
  if (picking) post({ type: "pick-stop" });
  picking = false;
  post({ type: "draft", anchors: [] });
  renderList();
}

function readPrograms(metadata: Metadata) {
  programs = programsIn(metadata);
  if (compact || !draft) renderList();
}

/** Réduit, l'onglet se limite à activer ou désactiver. Une saisie en cours est gardée. */
export function setProgramsCompact(next: boolean) {
  captureFormIfMounted();
  compact = next;
  if (app) showCurrent();
}

function captureFormIfMounted() {
  if (app) captureForm();
}

function showCurrent() {
  if (draft && !compact) {
    problem = "";
    renderForm();
  } else {
    renderList();
  }
}

export async function setupPrograms(container: HTMLElement) {
  app = container;
  restoreDraft();
  window.addEventListener("pagehide", saveDraftForReload);
  OBR.broadcast.onMessage(FX_PROGRAM_CHANNEL, ({ data }) => {
    const message = data as { type?: string; anchor?: Program["anchors"][number] } | null;
    if (message?.type === "picked" && picking && message.anchor && draft && draft.anchors.length < MAX_ANCHORS) {
      draft.anchors = [...draft.anchors, message.anchor];
      post({ type: "draft", anchors: draft.anchors });
      refresh();
    } else if (message?.type === "pick-stopped") {
      picking = false;
      refresh();
    }
  });
  await watchSceneUnit((next) => {
    unit = next;
  });
  if (await OBR.scene.isReady()) {
    programs = programsIn(await OBR.scene.getMetadata());
  }
  OBR.scene.onMetadataChange(readPrograms);
  // Le menu reste ouvert d'une scène à l'autre : la liste doit suivre.
  OBR.scene.onReadyChange(async (ready) => {
    programs = ready ? programsIn(await OBR.scene.getMetadata()) : [];
    if (compact || !draft) renderList();
  });
  if (draft) post({ type: "draft", anchors: draft.anchors });
  showCurrent();
}
