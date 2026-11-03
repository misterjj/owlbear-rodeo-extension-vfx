import OBR, { type Metadata } from "@owlbear-rodeo/sdk";
import {
  ELEMENTS,
  ELEMENT_IDS,
  SIZE_IDS,
  STYLES,
  STYLE_IDS,
  isExact,
  type ElementId,
  type SizeId,
  type StyleId,
} from "./fx";
import {
  FX_PROGRAMS_KEY,
  FX_PROGRAMS_WINDOW_ID,
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
import { bindResize, fitCompactHeight, resizeButton, setupWindowDrag, windowPrefs } from "./window-drag";
import "./programmes.css";

const app = document.querySelector<HTMLDivElement>("#app")!;
const warn = (error: unknown) => console.warn("Effets :", error);

let programs: Program[] = [];
/** Programme en cours d'édition ; sans lui, la fenêtre montre la liste. */
let draft: Program | undefined;
let picking = false;
let problem = "";
let confirmingDelete: string | undefined;
let unit = "cases";
const compact = windowPrefs.compact;
/** La fenêtre est rechargée quand elle bouge ou change de format : la saisie en cours y survit. */
const DRAFT_STORAGE_KEY = `${FX_PROGRAMS_WINDOW_ID}/saisie`;

const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

const post = (data: unknown) =>
  OBR.broadcast.sendMessage(FX_PROGRAM_CHANNEL, data, { destination: "LOCAL" }).catch(warn);

/** Repart de la liste à jour : un autre MJ a pu y toucher depuis son affichage. */
async function saveWith(change: (current: Program[]) => Program[]) {
  const current = programsIn(await OBR.scene.getMetadata());
  await OBR.scene.setMetadata({ [FX_PROGRAMS_KEY]: change(current) });
}

const summary = ({ element, style, min, max, offset, shots }: Program) => {
  const rhythm = min === max ? `toutes les ${min} s` : `toutes les ${min} à ${max} s`;
  return [
    `${STYLES[style].label} · ${ELEMENTS[element].label}`,
    rhythm,
    offset > 0 ? `décalé de ${offset} s` : "",
    shots === null ? "" : `${shots} tir${shots > 1 ? "s" : ""}`,
  ]
    .filter(Boolean)
    .join(", ");
};

function programRow(program: Program) {
  const { id, name, active } = program;
  return `
    <div class="program">
      <span class="dot ${active ? "on" : ""}" title="${active ? "Actif" : "Inactif"}"></span>
      <div class="info">${escapeHtml(name)}<small>${escapeHtml(summary(program))}</small></div>
      <button type="button" data-toggle="${escapeHtml(id)}">${active ? "Désactiver" : "Activer"}</button>
      <button type="button" data-edit="${escapeHtml(id)}" aria-label="Modifier ${escapeHtml(name)}" title="Modifier">✎</button>
      <button type="button" data-delete="${escapeHtml(id)}" aria-label="Supprimer ${escapeHtml(name)}" title="Supprimer">${confirmingDelete === id ? "Confirmer" : "✕"}</button>
    </div>`;
}

function groupBlock(group: string, members: Program[]) {
  return `
    <div class="group-head">
      <h2>${escapeHtml(group)}</h2>
      <div>
        <button type="button" data-group-on="${escapeHtml(group)}">Tout activer</button>
        <button type="button" data-group-off="${escapeHtml(group)}">Tout désactiver</button>
      </div>
    </div>
    ${members.map(programRow).join("")}`;
}

function saveDraftForReload() {
  captureForm();
  try {
    if (draft) sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ draft, picking }));
  } catch (error) {
    warn(error);
  }
}

function restoreDraft() {
  try {
    const saved = sessionStorage.getItem(DRAFT_STORAGE_KEY);
    sessionStorage.removeItem(DRAFT_STORAGE_KEY);
    if (saved) ({ draft, picking } = JSON.parse(saved) as { draft: Program; picking: boolean });
  } catch (error) {
    warn(error);
  }
}

/** Une ligne par programme, ou par groupe en tête de ses programmes, sans rien pour les modifier. */
function compactRow({ id, name, active }: Program) {
  const action = `${active ? "Désactiver" : "Activer"} ${escapeHtml(name)}`;
  return `
    <div class="mini">
      <span class="dot ${active ? "on" : ""}" title="${active ? "Actif" : "Inactif"}"></span>
      <span class="mini-name" title="${escapeHtml(name)}">${escapeHtml(name)}</span>
      <button type="button" data-toggle="${escapeHtml(id)}" title="${action}" aria-label="${action}">${active ? "■" : "▶"}</button>
    </div>`;
}

function compactGroup(group: string, members: Program[]) {
  const name = escapeHtml(group);
  return `
    <div class="mini mini-group">
      <h2 title="${name}">${name}</h2>
      <button type="button" data-group-on="${name}" title="Tout activer dans ${name}" aria-label="Tout activer dans ${name}">▶</button>
      <button type="button" data-group-off="${name}" title="Tout désactiver dans ${name}" aria-label="Tout désactiver dans ${name}">■</button>
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
  // Fermer ici ferait perdre une saisie en cours : il faut d'abord agrandir pour l'annuler.
  const editing = draft
    ? `<p class="note">${picking ? `Clique sur la carte : ${draft.anchors.length} point(s).` : "Programme en cours de saisie : agrandis pour reprendre."}</p>`
    : "";
  app.innerHTML = `
    <header class="bar" title="Glisser pour déplacer">
      <strong>Programmes</strong>
      <span>
        ${resizeButton()}
        ${draft ? "" : `<button type="button" id="close" title="Fermer" aria-label="Fermer">✕</button>`}
      </span>
    </header>
    ${editing}
    ${programs.length ? "" : `<p class="empty">Aucun programme.</p>`}
    ${groups.map((group) => compactGroup(group, programs.filter((p) => p.group === group))).join("")}
    ${loose.map(compactRow).join("")}`;
  const close = app.querySelector<HTMLButtonElement>("#close");
  if (close) close.onclick = () => OBR.popover.close(FX_PROGRAMS_WINDOW_ID);
  bindResize("programs", app, saveDraftForReload);
  bindToggles();
  fitCompactHeight("programs", FX_PROGRAMS_WINDOW_ID, app);
}

function renderList() {
  if (compact) {
    renderCompact();
    return;
  }
  const groups = groupNames(programs);
  const loose = programs.filter(({ group }) => !group);
  app.innerHTML = `
    <header class="bar" title="Glisser pour déplacer">
      <strong>Programmes (${programs.length}/${MAX_PROGRAMS})</strong>
      <span>
        <button type="button" class="primary" id="new" ${programs.length >= MAX_PROGRAMS ? "disabled" : ""}>Nouveau</button>
        ${resizeButton()}
        <button type="button" id="close" title="Fermer" aria-label="Fermer">✕</button>
      </span>
    </header>
    ${programs.length ? "" : `<p class="empty">Aucun programme : un effet relancé tout seul, à ton rythme. Rien ne part tant que tu ne l'as pas activé.</p>`}
    ${groups.map((group) => groupBlock(group, programs.filter((p) => p.group === group))).join("")}
    ${loose.length ? `${groups.length ? `<h2>Sans groupe</h2>` : ""}${loose.map(programRow).join("")}` : ""}`;

  app.querySelector<HTMLButtonElement>("#close")!.onclick = () =>
    OBR.popover.close(FX_PROGRAMS_WINDOW_ID);
  bindResize("programs", app, saveDraftForReload);
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
  renderForm();
  post({ type: "draft", anchors: draft!.anchors });
}

const options = <T extends string>(ids: T[], label: (id: T) => string, selected: T) =>
  ids
    .map((id) => `<option value="${id}" ${id === selected ? "selected" : ""}>${escapeHtml(label(id))}</option>`)
    .join("");

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
    element: value("element") as ElementId,
    style: value("style") as StyleId,
    size: value("size") as SizeId,
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
          <span>${index + 1}. ${token ? `Token ${escapeHtml(token.name)}` : `Carte (${Math.round(at.x)}, ${Math.round(at.y)})`}</span>
          <button type="button" data-remove-anchor="${index}" aria-label="Retirer le point ${index + 1}" title="Retirer">✕</button>
        </div>`,
    )
    .join("");
  const directed = STYLES[style].directed;
  const note = directed
    ? "Avec deux points, l'effet va du premier au second. Avec plus, il relie deux points au hasard."
    : "Avec plusieurs points, chaque tir en choisit un au hasard.";
  return `
    ${rows || `<p class="empty">Aucun point pour l'instant (${anchorsNeeded(style)} au moins).</p>`}
    <button type="button" id="pick" class="${picking ? "picking" : ""}" ${anchors.length >= MAX_ANCHORS && !picking ? "disabled" : ""}>${picking ? "Terminer les clics sur la carte" : "Ajouter des points sur la carte"}</button>
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
  app.innerHTML = `
    <header class="bar" title="Glisser pour déplacer"><strong>${programs.some(({ id }) => id === d.id) ? "Modifier le programme" : "Nouveau programme"}</strong>${resizeButton()}</header>
    <form id="form" novalidate>
      <div class="fields">
        <label class="wide">Nom<input id="name" type="text" maxlength="40" value="${escapeHtml(d.name)}" placeholder="Ex. Canon du couloir" /></label>
        <label class="wide">Groupe (facultatif)<input id="group" type="text" maxlength="30" list="groups" value="${escapeHtml(d.group)}" placeholder="Ex. Salle du trésor" /></label>
        <datalist id="groups">${groupNames(programs).map((group) => `<option value="${escapeHtml(group)}"></option>`).join("")}</datalist>
        <label>Élément<select id="element">${options(ELEMENT_IDS, (id) => ELEMENTS[id].label, d.element)}</select></label>
        <label>Style<select id="style">${options(STYLE_IDS, (id) => STYLES[id].label, d.style)}</select></label>
        <label>Taille<select id="size">${options(SIZE_IDS, (id) => id, d.size)}</select></label>
        ${zone ? `<label>${d.style === "cone" ? "Longueur" : "Rayon"} exact (${escapeHtml(unit)})<input id="exact" type="number" min="0" step="any" value="${d.exact ?? ""}" /></label>` : ""}
      </div>
      <h2>Rythme</h2>
      <div class="fields">
        <label>Intervalle min. (secondes)<input id="min" type="number" min="${MIN_INTERVAL}" step="any" value="${d.min}" /></label>
        <label>Intervalle max. (secondes)<input id="max" type="number" min="${MIN_INTERVAL}" step="any" value="${d.max}" /></label>
        <label>Premier tir après (secondes)<input id="offset" type="number" min="0" step="any" value="${d.offset}" /></label>
        <label>Tirs (vide : sans fin)<input id="shots" type="number" min="1" step="1" value="${d.shots ?? ""}" /></label>
      </div>
      <p class="note">Décaler le premier tir sert à faire alterner des programmes activés ensemble depuis leur groupe.</p>
      <h2>Points</h2>
      <div id="anchors"></div>
      ${problem ? `<p class="error" role="alert">${escapeHtml(problem)}</p>` : ""}
      <div class="actions">
        <button type="button" id="cancel">Annuler</button>
        <button type="submit" class="primary">Enregistrer</button>
      </div>
    </form>`;
  refreshAnchors();
  bindResize("programs", app, saveDraftForReload);
  app.querySelector<HTMLSelectElement>("#style")!.onchange = () => {
    captureForm();
    renderForm();
  };
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
  if (picking) post({ type: "pick-stop" });
  picking = false;
  post({ type: "draft", anchors: [] });
  renderList();
}

function readPrograms(metadata: Metadata) {
  programs = programsIn(metadata);
  if (compact || !draft) renderList();
}

OBR.onReady(async () => {
  if ((await OBR.player.getRole()) !== "GM") {
    await OBR.popover.close(FX_PROGRAMS_WINDOW_ID);
    return;
  }
  document.documentElement.classList.toggle("compact", compact);
  restoreDraft();
  setupWindowDrag("programs", app, saveDraftForReload);
  OBR.broadcast.onMessage(FX_PROGRAM_CHANNEL, ({ data }) => {
    const message = data as { type?: string; anchor?: Program["anchors"][number] } | null;
    if (message?.type === "picked" && message.anchor && draft && draft.anchors.length < MAX_ANCHORS) {
      draft.anchors = [...draft.anchors, message.anchor];
      post({ type: "draft", anchors: draft.anchors });
      refresh();
    } else if (message?.type === "pick-stopped") {
      picking = false;
      refresh();
    }
  });
  if (await OBR.scene.isReady()) {
    unit = (await OBR.scene.grid.getScale()).parsed.unit || unit;
    programs = programsIn(await OBR.scene.getMetadata());
  }
  OBR.scene.onMetadataChange(readPrograms);
  // La fenêtre reste ouverte d'une scène à l'autre : la liste doit suivre.
  OBR.scene.onReadyChange(async (ready) => {
    programs = ready ? programsIn(await OBR.scene.getMetadata()) : [];
    if (compact || !draft) renderList();
  });
  if (draft && !compact) {
    problem = "";
    renderForm();
  } else {
    renderList();
  }
});
