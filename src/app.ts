import OBR from "@owlbear-rodeo/sdk";
import { FX_DURABLE_KEY, FX_TARGET_KEY, FX_UI_CHANNEL, durablesIn, playersAllowedIn } from "./fx";
import { FX_PROGRAMS_KEY, programsIn, withActive } from "./fx-programs";
import { setCastCompact, setupCast, setupSettings, targetToken, watchRoomSettings } from "./panel";
import { setProgramsCompact, setupPrograms } from "./programmes";
import { currentLanguage, t, type TextKey } from "./i18n";
import { watchDirectionFields } from "./direction-field";
import { watchSteppers } from "./stepper";
import "./panel.css";
import "./programmes.css";

type Tab = "cast" | "programs" | "settings";
const TAB_KEY = "vfx:onglet";
const COMPACT_KEY = "vfx:reduite";
/** Bandeau du haut d'Owlbear : la fenêtre le laisse visible. */
const TOP_SPACE = 88;

const app = document.querySelector<HTMLDivElement>("#app")!;
const warn = (error: unknown) => console.warn("Effets :", error);

let isGm = false;
let playersAllowed = false;
let compact = localStorage.getItem(COMPACT_KEY) === "1";
let tab: Tab = (localStorage.getItem(TAB_KEY) as Tab | null) ?? "cast";
let programsReady = false;

const post = (type: string) =>
  OBR.broadcast.sendMessage(FX_UI_CHANNEL, { type }, { destination: "LOCAL" }).catch(warn);

const TABS: { id: Tab; label: TextKey; gmOnly: boolean }[] = [
  { id: "cast", label: "tab.cast", gmOnly: false },
  { id: "programs", label: "tab.programs", gmOnly: true },
  { id: "settings", label: "tab.settings", gmOnly: false },
];

/** Réglages : une icône seule, comme dans Tempest!. */
const SETTINGS_ICON =
  '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/></svg>';

/**
 * Tout arrêter, depuis la barre du haut : le MJ retire tous les effets durables et arrête les programmes ;
 * un joueur retire seulement les siens.
 */
async function stopEverything() {
  const metadata = await OBR.scene.getMetadata();
  const durables = durablesIn(metadata);
  const update: Record<string, unknown> = {
    [FX_DURABLE_KEY]: isGm ? [] : durables.filter(({ owner }) => owner !== OBR.player.id),
  };
  if (isGm) {
    const programs = programsIn(metadata);
    const active = programs.filter(({ active }) => active).map(({ id }) => id);
    if (active.length) update[FX_PROGRAMS_KEY] = withActive(programs, active, false, Date.now(), await OBR.player.getConnectionId());
  }
  await OBR.scene.setMetadata(update);
}

/** Clair ou sombre, comme Owlbear. */
const applyTheme = (mode: string) => (document.documentElement.dataset.theme = mode === "LIGHT" ? "light" : "dark");

/** Affiche l'onglet sans toucher à l'outil : qui a arrêté de lancer ne doit pas s'y retrouver sans le vouloir. */
function renderTab(next: Tab) {
  tab = TABS.some(({ id, gmOnly }) => id === next && (isGm || !gmOnly)) ? next : "cast";
  localStorage.setItem(TAB_KEY, tab);
  app.querySelectorAll<HTMLElement>("[data-pane]").forEach((pane) => {
    pane.hidden = pane.dataset.pane !== tab;
  });
  app.querySelectorAll<HTMLButtonElement>("[data-tab]").forEach((button) => {
    button.setAttribute("aria-selected", String(button.dataset.tab === tab));
  });
}

function showTab(next: Tab) {
  renderTab(next);
  // L'onglet Lancer est prêt à viser dès qu'on y arrive ; les autres rendent l'outil d'avant.
  post(tab === "cast" ? "arm" : "disarm");
}

function renderNav() {
  const nav = app.querySelector<HTMLElement>("#tabs")!;
  nav.innerHTML = `
    ${TABS.filter(({ gmOnly }) => isGm || !gmOnly)
      .map(({ id, label }) =>
        id === "settings"
          ? `<button type="button" role="tab" class="tab-icon" data-tab="${id}" title="${t(label)}" aria-label="${t(label)}">${SETTINGS_ICON}</button>`
          : `<button type="button" role="tab" data-tab="${id}">${t(label)}</button>`,
      )
      .join("")}`;
  nav.querySelectorAll<HTMLButtonElement>("[data-tab]").forEach((button) => {
    button.onclick = () => showTab(button.dataset.tab as Tab);
  });
}

/** Réduire ou agrandir, dans la barre du haut à droite de « Tout arrêter ». */
function renderCompactButton() {
  const button = app.querySelector<HTMLButtonElement>("#compact")!;
  button.textContent = compact ? "▢" : "–";
  button.title = t(compact ? "app.expand" : "app.shrink");
  button.setAttribute("aria-label", t(compact ? "app.expandWindow" : "app.shrinkWindow"));
}

function toggleCompact() {
  compact = !compact;
  localStorage.setItem(COMPACT_KEY, compact ? "1" : "0");
  document.documentElement.classList.toggle("compact", compact);
  setCastCompact(compact);
  setProgramsCompact(compact);
  renderCompactButton();
  renderTab(tab);
}

/** La fenêtre prend la hauteur de son contenu, sans dépasser l'écran : il défile au-delà. */
function followHeight(shell: HTMLElement) {
  let last = 0;
  const fit = () => {
    const wanted = Math.ceil(shell.getBoundingClientRect().height);
    if (!wanted || wanted === last) return;
    last = wanted;
    OBR.viewport
      .getHeight()
      .then((available) => OBR.action.setHeight(Math.min(wanted, available - TOP_SPACE)))
      .catch(warn);
  };
  new ResizeObserver(fit).observe(shell);
  fit();
}

function renderAccess() {
  const allowed = isGm || playersAllowed;
  app.querySelector<HTMLElement>("#shell-content")!.hidden = !allowed;
  app.querySelector<HTMLElement>("#denied")!.hidden = allowed;
  app.querySelector<HTMLElement>("#tabs")!.hidden = !allowed;
  app.querySelector<HTMLElement>("#stop-everything")!.hidden = !allowed;
  if (!allowed) post("disarm");
}

OBR.onReady(async () => {
  const [role, metadata] = await Promise.all([OBR.player.getRole(), OBR.room.getMetadata()]);
  isGm = role === "GM";
  playersAllowed = playersAllowedIn(metadata);
  document.documentElement.classList.toggle("compact", compact);
  document.documentElement.lang = currentLanguage();
  app.innerHTML = `
    <div id="shell">
      <header class="app-bar">
        <strong>${t("app.title")}</strong>
        <span class="app-actions">
          <button type="button" class="stop" id="stop-everything">${t("app.stopAll")}</button>
          <button type="button" class="tool" id="compact"></button>
        </span>
      </header>
      <nav id="tabs" class="tabs" role="tablist"></nav>
      <p id="denied" class="denied" hidden>${t("app.denied")}</p>
      <div id="shell-content">
        <div id="tab-cast" data-pane="cast"></div>
        <div id="tab-programs" data-pane="programs" hidden></div>
        <div id="tab-settings" data-pane="settings" hidden></div>
      </div>
    </div>`;
  const pane = (id: string) => app.querySelector<HTMLDivElement>(`#${id}`)!;
  app.querySelector<HTMLButtonElement>("#stop-everything")!.onclick = () => stopEverything().catch(warn);
  app.querySelector<HTMLButtonElement>("#compact")!.onclick = toggleCompact;
  renderCompactButton();
  OBR.theme.getTheme().then((theme) => applyTheme(theme.mode)).catch(warn);
  OBR.theme.onChange((theme) => applyTheme(theme.mode));
  setCastCompact(compact);
  setProgramsCompact(compact);
  await watchRoomSettings();
  await setupCast(pane("tab-cast"), isGm);
  setupSettings(pane("tab-settings"), playersAllowed);
  const ensureGmTabs = async () => {
    if (!isGm || programsReady) return;
    programsReady = true;
    await setupPrograms(pane("tab-programs"));
  };
  await ensureGmTabs();
  renderNav();
  renderAccess();
  // Depuis une roue vide : c'est ce token qu'on vient configurer.
  const pending = localStorage.getItem(FX_TARGET_KEY);
  localStorage.removeItem(FX_TARGET_KEY);
  if (pending) {
    tab = "cast";
    await targetToken(pending, true);
  }
  renderTab(tab);
  // Venir d'une roue est une demande ; une page rechargée n'en est pas une.
  post(tab === "cast" ? (pending ? "arm" : "arm-on-load") : "disarm");
  followHeight(pane("shell"));
  watchSteppers(app);
  watchDirectionFields(app);
  document.addEventListener("keydown", (event) => {
    // Le clavier reste dans cette fenêtre tant qu'on n'a pas cliqué sur la carte.
    if (event.key === "Escape" && !event.defaultPrevented) post("escape");
  });

  OBR.broadcast.onMessage(FX_UI_CHANNEL, ({ data }) => {
    const message = data as { type?: string; token?: unknown } | null;
    if (message?.type !== "target" || typeof message.token !== "string") return;
    localStorage.removeItem(FX_TARGET_KEY);
    showTab("cast");
    targetToken(message.token, true).catch(warn);
  });
  OBR.player.onChange(async (player) => {
    const gm = player.role === "GM";
    if (gm === isGm) return;
    isGm = gm;
    await setupCast(pane("tab-cast"), isGm);
    setupSettings(pane("tab-settings"), playersAllowed);
    await ensureGmTabs();
    renderNav();
    renderAccess();
    showTab(tab);
  });
  OBR.room.onMetadataChange((next) => {
    const newlyAllowed = !isGm && !playersAllowed && playersAllowedIn(next);
    playersAllowed = playersAllowedIn(next);
    renderAccess();
    if (newlyAllowed) showTab(tab);
    else if (isGm || playersAllowed) renderTab(tab);
  });
});
