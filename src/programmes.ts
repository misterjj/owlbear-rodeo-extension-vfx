import OBR, { type Metadata } from "@owlbear-rodeo/sdk";
import { DEFAULT_LIMIT, FX_DURABLE_KEY, STYLES, durablesIn, elementLabel, exactZoneLabel, styleLabel, isExact, limitsIn, type DurableEntry, type ElementId, type SizeId, type StyleId } from "./fx";
import { elementColor, elementGrid, elementValue, pickerRow, sizeRow, styleGrid, type PickerId } from "./effect-fields";
import { STYLE_ICONS } from "./fx-icons";
import { t } from "./i18n";
import {
  FX_PROGRAMS_KEY,
  FX_PROGRAM_CHANNEL,
  MAX_ANCHORS,
  MIN_INTERVAL,
  type PointOrder,
  anchorsNeeded,
  groupNames,
  moveAnchor,
  normalizeTiming,
  programProblem,
  programsIn,
  withActive,
  withProgram,
  withoutProgramEffects,
  type Program,
} from "./fx-programs";
import { watchSceneUnit } from "./scene-unit";

let app: HTMLElement;
const warn = (error: unknown) => console.warn("Effets :", error);

let programs: Program[] = [];
/** Effets durables de la scène : une série finie laisse les siens en place. */
let effects: DurableEntry[] = [];
/** Programme en cours d'édition ; sans lui, la fenêtre montre la liste. */
let draft: Program | undefined;
let picking = false;
let problem = "";
let confirmingDelete: string | undefined;
let unit = "cases";
let openPicker: PickerId | undefined;
let programLimit = DEFAULT_LIMIT;
let compact = false;
/** Le menu Effets est rechargé quand on le rouvre : la saisie en cours y survit. */
const DRAFT_STORAGE_KEY = "vfx:programme-en-cours";

const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

const post = (data: unknown) =>
  OBR.broadcast.sendMessage(FX_PROGRAM_CHANNEL, data, { destination: "LOCAL" }).catch(warn);

/** Les points en cours d'édition s'affichent sur la carte à la place de ceux du programme enregistré. */
const postDraft = () => post({ type: "draft", anchors: draft?.anchors ?? [], program: draft?.id });

/**
 * Repart des listes à jour : un autre MJ a pu y toucher depuis son affichage.
 * `cleared` : les programmes dont les effets permanents sont retirés en même temps.
 */
async function saveWith(change: (current: Program[]) => Program[], cleared: string[] = []) {
  const metadata = await OBR.scene.getMetadata();
  await OBR.scene.setMetadata({
    [FX_PROGRAMS_KEY]: change(programsIn(metadata)),
    ...(cleared.length ? { [FX_DURABLE_KEY]: withoutProgramEffects(durablesIn(metadata), cleared) } : {}),
  });
}

/** Série terminée, mais ses effets permanents sont encore sur la carte. */
const hasLeftovers = ({ id, active }: Program) => !active && effects.some(({ program }) => program?.id === id);

const rhythm = ({ min, max, offset, shots, permanent, order, anchors, style }: Program) =>
  [
    min === max ? t("program.every", { min }) : t("program.everyRange", { min, max }),
    offset > 0 ? t("program.offset", { offset }) : "",
    shots === null ? "" : t(shots > 1 ? "program.shots" : "program.shot", { count: shots }),
    permanent ? t("program.permanentTag") : "",
    order === "sequence" && hasOrderChoice(style, anchors.length) ? t("program.sequenceTag") : "",
  ]
    .filter(Boolean)
    .join(", ");

const picto = ({ style, element }: Program) =>
  `<svg class="picto" viewBox="0 0 24 24" aria-hidden="true" style="color: ${elementColor(element)}">${STYLE_ICONS[style]}</svg>`;

function toggleButton(program: Program) {
  const { id, name, active } = program;
  const action = t(active ? "program.deactivate" : "program.activate", { name: escapeHtml(name) });
  const clear = t("program.clearNamed", { name: escapeHtml(name) });
  return `<button type="button" class="btn toggle ${active ? "on" : ""}" data-toggle="${escapeHtml(id)}" title="${action}" aria-label="${action}">${active ? "■" : "▶"}</button>
    ${hasLeftovers(program) ? `<button type="button" class="btn" data-clear="${escapeHtml(id)}" title="${clear}" aria-label="${clear}">■</button>` : ""}`;
}

function programRow(program: Program) {
  const { id, name, active, style, element } = program;
  return `
    <div class="program ${active ? "active" : ""}">
      ${picto(program)}
      <div class="info">
        <span class="name">${escapeHtml(name)}</span>
        <small>${escapeHtml(`${styleLabel(style)} · ${elementLabel(element)}`)}</small>
        <small>${escapeHtml(rhythm(program))}</small>
        ${hasLeftovers(program) ? `<small>${t("program.finished")}</small>` : ""}
      </div>
      ${toggleButton(program)}
      <button type="button" class="btn" data-edit="${escapeHtml(id)}" aria-label="${t("action.editNamed", { name: escapeHtml(name) })}" title="${t("action.edit")}">✎</button>
      <button type="button" class="btn ${confirmingDelete === id ? "danger" : ""}" data-delete="${escapeHtml(id)}" aria-label="${t("program.deleteNamed", { name: escapeHtml(name) })}" title="${t("program.delete")}">${confirmingDelete === id ? t("program.confirm") : "✕"}</button>
    </div>`;
}

function groupBlock(group: string, members: Program[]) {
  const name = escapeHtml(group);
  const running = members.filter(({ active }) => active).length;
  return `
    <section class="group">
      <div class="group-head">
        <h2>${name} <small>${t(running > 1 ? "program.activeMany" : "program.activeOne", { running, total: members.length })}</small></h2>
        <button type="button" class="btn" data-group-on="${name}" title="${t("program.allOnNamed", { name })}" aria-label="${t("program.allOnNamed", { name })}">${t("program.allOn")}</button>
        <button type="button" class="btn" data-group-off="${name}" title="${t("program.allOffNamed", { name })}" aria-label="${t("program.allOffNamed", { name })}">${t("program.allOff")}</button>
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
      <button type="button" class="btn" data-group-on="${name}" title="${t("program.allOnNamed", { name })}" aria-label="${t("program.allOnNamed", { name })}">▶</button>
      <button type="button" class="btn" data-group-off="${name}" title="${t("program.allOffNamed", { name })}" aria-label="${t("program.allOffNamed", { name })}">■</button>
    </div>
    ${members.map(compactRow).join("")}`;
}

function bindToggles() {
  // Arrêter retire les effets permanents ; une série qui se termine seule ne passe pas par ici.
  const setActive = (ids: string[], active: boolean) =>
    OBR.player
      .getConnectionId()
      .then((by) => saveWith((current) => withActive(current, ids, active, Date.now(), by), active ? [] : ids))
      .catch(warn);
  app.querySelectorAll<HTMLButtonElement>("[data-toggle]").forEach((button) => {
    button.onclick = () => {
      const program = programs.find(({ id }) => id === button.dataset.toggle);
      if (program) setActive([program.id], !program.active);
    };
  });
  app.querySelectorAll<HTMLButtonElement>("[data-clear]").forEach((button) => {
    button.onclick = () => setActive([button.dataset.clear!], false);
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
    ? `<p class="note">${picking ? t("program.pickingNote", { count: draft.anchors.length }) : t("program.draftNote")}</p>`
    : "";
  app.innerHTML = `
    ${editing}
    ${programs.length ? "" : `<p class="empty">${t("program.emptyShort")}</p>`}
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
      <strong>${t("program.title", { count: programs.length, limit: programLimit })}</strong>
      <button type="button" class="btn primary" id="new" ${programs.length >= programLimit ? "disabled" : ""} title="${programs.length >= programLimit ? t("program.limitReached") : ""}">${t("program.new")}</button>
    </header>
    ${programs.length ? "" : `<p class="empty">${t("program.empty")}</p>`}
    ${groups.map((group) => groupBlock(group, programs.filter((p) => p.group === group))).join("")}
    ${loose.length ? `<section class="group">${groups.length ? `<div class="group-head"><h2>${t("program.noGroup")}</h2></div>` : ""}${loose.map(programRow).join("")}</section>` : ""}`;

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
      permanent: false,
      order: "random",
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
      saveWith((current) => current.filter((program) => program.id !== id), [id]).catch(warn);
    };
  });
}

function openForm() {
  problem = "";
  confirmingDelete = undefined;
  openPicker = undefined;
  renderForm();
  postDraft();
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
    permanent: app.querySelector<HTMLInputElement>("#permanent")?.checked ?? false,
  };
}

/** Avec un seul parcours possible, ou pour une chaîne qui suit déjà l'ordre, il n'y a rien à choisir. */
const hasOrderChoice = (style: StyleId, count: number) => style !== "chaine" && count > anchorsNeeded(style);

function orderRow({ order }: Program) {
  const option = (value: PointOrder, label: string) =>
    `<option value="${value}" ${order === value ? "selected" : ""}>${label}</option>`;
  return `<label class="inline"><span>${t("program.order")}</span><select id="order">${option("random", t("program.orderRandom"))}${option("sequence", t("program.orderSequence"))}</select></label>`;
}

function anchorsHtml() {
  const { anchors, style, order } = draft!;
  const rows = anchors
    .map(
      ({ at, token }, index) => `
        <div class="anchor">
          <span class="rank">${index + 1}</span>
          <span>${token ? t("program.token", { name: escapeHtml(token.name) }) : t("program.mapPoint", { x: Math.round(at.x), y: Math.round(at.y) })}</span>
          <button type="button" class="btn" data-move-anchor="${index}" data-delta="-1" ${index === 0 ? "disabled" : ""} aria-label="${t("program.moveUpNamed", { index: index + 1 })}" title="${t("program.moveUp")}">▲</button>
          <button type="button" class="btn" data-move-anchor="${index}" data-delta="1" ${index === anchors.length - 1 ? "disabled" : ""} aria-label="${t("program.moveDownNamed", { index: index + 1 })}" title="${t("program.moveDown")}">▼</button>
          <button type="button" class="btn" data-remove-anchor="${index}" aria-label="${t("program.removePoint", { index: index + 1 })}" title="${t("action.remove")}">✕</button>
        </div>`,
    )
    .join("");
  const directed = STYLES[style].directed;
  const sequence = order === "sequence";
  const note = style === "chaine"
    ? t("program.chainNote")
    : directed
    ? t(sequence ? "program.directedSequenceNote" : "program.directedNote")
    : t(sequence ? "program.areaSequenceNote" : "program.areaNote");
  return `
    ${rows || `<p class="empty">${t("program.noPoint", { count: anchorsNeeded(style) })}</p>`}
    ${hasOrderChoice(style, anchors.length) ? orderRow(draft!) : ""}
    <button type="button" id="pick" class="btn wide-action ${picking ? "picking" : ""}" ${anchors.length >= MAX_ANCHORS && !picking ? "disabled" : ""}>${t(picking ? "program.stopPicking" : "program.startPicking")}</button>
    <p class="note">${picking ? t("program.pickingHelp") : note}</p>`;
}

function bindAnchors() {
  const order = app.querySelector<HTMLSelectElement>("#order");
  if (order) {
    order.onchange = () => {
      draft!.order = order.value as PointOrder;
      refreshAnchors();
      app.querySelector<HTMLSelectElement>("#order")?.focus();
    };
  }
  app.querySelector<HTMLButtonElement>("#pick")!.onclick = () => {
    picking = !picking;
    post({ type: picking ? "pick-start" : "pick-stop" });
    refreshAnchors();
  };
  app.querySelectorAll<HTMLButtonElement>("[data-move-anchor]").forEach((button) => {
    button.onclick = () => {
      const index = Number(button.dataset.moveAnchor);
      const delta = Number(button.dataset.delta) as -1 | 1;
      draft!.anchors = moveAnchor(draft!.anchors, index, delta);
      postDraft();
      refreshAnchors();
      // Le clavier suit le point déplacé, s'il peut encore aller dans ce sens.
      const next = app.querySelector<HTMLButtonElement>(`[data-move-anchor="${index + delta}"][data-delta="${delta}"]`);
      (next && !next.disabled ? next : app.querySelector<HTMLButtonElement>("#pick"))?.focus();
    };
  });
  app.querySelectorAll<HTMLButtonElement>("[data-remove-anchor]").forEach((button) => {
    button.onclick = () => {
      const index = Number(button.dataset.removeAnchor);
      draft!.anchors = draft!.anchors.filter((_, i) => i !== index);
      postDraft();
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
    <header class="bar"><strong>${t(programs.some(({ id }) => id === d.id) ? "program.editTitle" : "program.newTitle")}</strong></header>
    <form id="form" novalidate>
      <div class="fields">
        <label>${t("field.name")}<input id="name" type="text" maxlength="40" value="${escapeHtml(d.name)}" placeholder="${t("program.namePlaceholder")}" /></label>
        <label>${t("program.group")}<input id="group" type="text" maxlength="30" list="groups" value="${escapeHtml(d.group)}" placeholder="${t("program.groupPlaceholder")}" /></label>
        <datalist id="groups">${groupNames(programs).map((group) => `<option value="${escapeHtml(group)}"></option>`).join("")}</datalist>
      </div>
      <h2>${t("field.effect")}</h2>
      ${pickerRow("element", t("field.element"), elementValue(d.element), openPicker === "element")}
      ${openPicker === "element" ? elementGrid(d.element) : ""}
      ${pickerRow("style", t("field.style"), styleLabel(d.style), openPicker === "style")}
      ${openPicker === "style" ? styleGrid(d.style) : ""}
      ${sizeRow(d.size, usesExact)}
      ${zone ? `<label class="inline"><span>${t("zone.exact", { what: exactZoneLabel(d.style) })} (<span data-unit>${escapeHtml(unit)}</span>)</span><input id="exact" type="number" min="0" step="any" value="${d.exact ?? ""}" /></label>` : ""}
      <h2>${t("program.rhythm")}</h2>
      <div class="fields">
        <label>${t("program.minInterval")}<input id="min" type="number" min="${MIN_INTERVAL}" step="0.1" value="${d.min}" /></label>
        <label>${t("program.maxInterval")}<input id="max" type="number" min="${MIN_INTERVAL}" step="0.1" value="${d.max}" /></label>
        <label>${t("program.firstShot")}<input id="offset" type="number" min="0" step="0.1" value="${d.offset}" /></label>
        <label>${t("program.shotsField")}<input id="shots" type="number" min="1" step="1" value="${d.shots ?? ""}" /></label>
      </div>
      ${d.group ? `<p class="note">${t("program.offsetNote")}</p>` : ""}
      <label class="permanent"><input id="permanent" type="checkbox" ${d.permanent ? "checked" : ""} /> ${t("program.permanent")}</label>
      <p class="note">${t("program.permanentNote")}</p>
      <h2>${t("program.points")}</h2>
      <div id="anchors"></div>
      ${problem ? `<p class="error" role="alert">${escapeHtml(problem)}</p>` : ""}
      <div class="actions">
        <button type="button" class="btn" id="cancel">${t("action.cancel")}</button>
        <button type="submit" class="btn primary">${t("action.save")}</button>
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
    // Ses effets déjà posés ne correspondent plus forcément à ces réglages.
    saveWith((current) => withProgram(current, program), [program.id])
      .then(closeForm)
      .catch((error) => {
        warn(error);
        problem = t("program.saveFailed");
        renderForm();
      });
  };
}

function closeForm() {
  draft = undefined;
  openPicker = undefined;
  if (picking) post({ type: "pick-stop" });
  picking = false;
  postDraft();
  renderList();
}

function readPrograms(metadata: Metadata) {
  programs = programsIn(metadata);
  effects = durablesIn(metadata);
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
    const message = data as { type?: string; anchor?: Program["anchors"][number]; index?: number } | null;
    if (message?.type === "picked" && picking && message.anchor && draft && draft.anchors.length < MAX_ANCHORS) {
      draft.anchors = [...draft.anchors, message.anchor];
      postDraft();
      // Le message « ajoute un point » n'a plus lieu d'être.
      problem = "";
      app.querySelector("#form .error")?.remove();
      refresh();
    } else if (message?.type === "moved" && draft && message.anchor && draft.anchors[message.index ?? -1]) {
      draft.anchors = draft.anchors.map((anchor, index) => (index === message.index ? message.anchor! : anchor));
      postDraft();
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
    const metadata = await OBR.scene.getMetadata();
    programs = programsIn(metadata);
    effects = durablesIn(metadata);
  }
  OBR.scene.onMetadataChange(readPrograms);
  // Le menu reste ouvert d'une scène à l'autre : la liste doit suivre.
  OBR.scene.onReadyChange(async (ready) => {
    const metadata = ready ? await OBR.scene.getMetadata() : {};
    programs = programsIn(metadata);
    effects = durablesIn(metadata);
    if (compact || !draft) renderList();
  });
  programLimit = limitsIn(await OBR.room.getMetadata()).programs;
  OBR.room.onMetadataChange((metadata) => {
    programLimit = limitsIn(metadata).programs;
    if (compact || !draft) renderList();
  });
  if (draft) postDraft();
  showCurrent();
}
