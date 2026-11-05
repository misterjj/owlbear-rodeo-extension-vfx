import OBR from "@owlbear-rodeo/sdk";
import { FX_TARGET_KEY, FX_UI_CHANNEL, playersAllowedIn } from "./fx";
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
      .map(({ id, label }) => `<button type="button" role="tab" data-tab="${id}">${t(label)}</button>`)
      .join("")}
    <button type="button" id="compact" class="tool" title="${t(compact ? "app.expand" : "app.shrink")}" aria-label="${t(compact ? "app.expandWindow" : "app.shrinkWindow")}">${compact ? "▢" : "–"}</button>`;
  nav.querySelectorAll<HTMLButtonElement>("[data-tab]").forEach((button) => {
    button.onclick = () => showTab(button.dataset.tab as Tab);
  });
  nav.querySelector<HTMLButtonElement>("#compact")!.onclick = () => {
    compact = !compact;
    localStorage.setItem(COMPACT_KEY, compact ? "1" : "0");
    document.documentElement.classList.toggle("compact", compact);
    setCastCompact(compact);
    setProgramsCompact(compact);
    renderNav();
    renderTab(tab);
  };
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
      <nav id="tabs" class="tabs" role="tablist"></nav>
      <p id="denied" class="denied" hidden>${t("app.denied")}</p>
      <div id="shell-content">
        <div id="tab-cast" data-pane="cast"></div>
        <div id="tab-programs" data-pane="programs" hidden></div>
        <div id="tab-settings" data-pane="settings" hidden></div>
      </div>
    </div>`;
  const pane = (id: string) => app.querySelector<HTMLDivElement>(`#${id}`)!;
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
