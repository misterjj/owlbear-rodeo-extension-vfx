import OBR from "@owlbear-rodeo/sdk";
import { FX_PANEL_ID, isPoint, type Point } from "./fx";
import { FX_PROGRAMS_WINDOW_ID } from "./fx-programs";
import {
  FX_WINDOW_CHANNEL,
  FX_WINDOW_GHOST_ID,
  parseWindowPrefs,
  placeWindow,
  type WindowKind,
  type WindowPrefs,
} from "./fx-window";

const warn = (error: unknown) => console.warn("Effets :", error);

const WINDOWS = {
  panel: {
    id: FX_PANEL_ID,
    url: "/panel.html",
    width: 320,
    compact: { width: 260, height: 120 },
    fallback: { left: 72, top: 72, compact: false },
    key: `${FX_PANEL_ID}/place`,
  },
  programs: {
    id: FX_PROGRAMS_WINDOW_ID,
    url: "/programmes.html",
    width: 380,
    compact: { width: 250, height: 140 },
    fallback: { left: 404, top: 72, compact: false },
    key: `${FX_PROGRAMS_WINDOW_ID}/place`,
  },
} satisfies Record<WindowKind, unknown>;

/** Sans signal de la fenêtre pendant ce délai, elle a disparu en plein geste : son contour reste à retirer. */
const DRAG_TIMEOUT_MS = 2000;
/** Un contour demandé juste avant la réouverture peut arriver après elle. */
const LATE_GHOST_DELAY_MS = 1500;

const readPrefs = (kind: WindowKind) => {
  const { key, fallback } = WINDOWS[kind];
  try {
    return parseWindowPrefs(localStorage.getItem(key), fallback);
  } catch {
    return fallback;
  }
};

/** Sans accès au stockage, une fenêtre garde sa place jusqu'au rechargement de la page. */
const prefs: Record<WindowKind, WindowPrefs> = { panel: readPrefs("panel"), programs: readPrefs("programs") };
/** Hauteur réelle des fenêtres réduites, qui dépend de leur contenu. */
const compactHeights: Partial<Record<WindowKind, number>> = {};

function savePrefs(kind: WindowKind, next: WindowPrefs) {
  prefs[kind] = next;
  try {
    localStorage.setItem(WINDOWS[kind].key, JSON.stringify(next));
  } catch (error) {
    warn(error);
  }
}

const viewportSize = async () => {
  const [width, height] = await Promise.all([OBR.viewport.getWidth(), OBR.viewport.getHeight()]);
  return { width, height };
};

interface HostOptions {
  /** Hauteur de la fenêtre entière. */
  fullHeight: (kind: WindowKind) => number;
  /** Faux si la fenêtre ne doit plus se rouvrir après un geste : l'outil a pu changer entre-temps. */
  canShow: (kind: WindowKind) => Promise<boolean>;
}

let options: HostOptions;

const sizeOf = (kind: WindowKind, compact: boolean) => {
  const { width, compact: small } = WINDOWS[kind];
  return compact
    ? { width: small.width, height: compactHeights[kind] ?? small.height }
    : { width, height: options.fullHeight(kind) };
};

export async function openWindow(kind: WindowKind) {
  const { id, url } = WINDOWS[kind];
  const current = prefs[kind];
  const { width, height, left, top } = placeWindow(current, await viewportSize(), sizeOf(kind, current.compact));
  // Le prochain déplacement part de la place réelle, pas d'une place qu'un écran plus petit a corrigée.
  prefs[kind] = { ...current, left, top };
  await OBR.popover.close(id);
  await OBR.popover.open({
    id,
    url: `${url}?left=${left}&top=${top}${current.compact ? "&reduite" : ""}`,
    width,
    height,
    anchorReference: "POSITION",
    anchorPosition: { left, top },
    anchorOrigin: { horizontal: "LEFT", vertical: "TOP" },
    transformOrigin: { horizontal: "LEFT", vertical: "TOP" },
    // La carte reste cliquable : c'est là qu'on lance les effets et qu'on place les points.
    disableClickAway: true,
    marginThreshold: 8,
  });
}

let dragSignal: number | undefined;
let dragWatch: ReturnType<typeof setInterval> | undefined;

const removeGhost = () => OBR.scene.local.deleteItems([FX_WINDOW_GHOST_ID]).catch(warn);

function endDrag() {
  dragSignal = undefined;
  clearInterval(dragWatch);
  dragWatch = undefined;
}

function noteDrag() {
  dragSignal = Date.now();
  dragWatch ??= setInterval(() => {
    if (Date.now() - dragSignal! < DRAG_TIMEOUT_MS) return;
    endDrag();
    removeGhost();
  }, DRAG_TIMEOUT_MS / 4);
}

async function reopen(kind: WindowKind) {
  if (await options.canShow(kind)) await openWindow(kind);
}

async function dropWindow(kind: WindowKind, { x, y }: Point) {
  endDrag();
  await removeGhost();
  setTimeout(() => {
    if (dragSignal === undefined) removeGhost();
  }, LATE_GHOST_DELAY_MS);
  const current = prefs[kind];
  const moved = { ...current, left: current.left + x, top: current.top + y };
  const { left, top } = placeWindow(moved, await viewportSize(), sizeOf(kind, current.compact));
  savePrefs(kind, { ...moved, left, top });
  await reopen(kind);
}

export function setupWindowHost(hostOptions: HostOptions) {
  options = hostOptions;
  OBR.broadcast.onMessage(FX_WINDOW_CHANNEL, ({ data }) => {
    const message = data as {
      type?: string;
      window?: WindowKind;
      delta?: unknown;
      compact?: unknown;
      height?: unknown;
    } | null;
    if (message?.type === "drag") noteDrag();
    else if (message?.type === "drag-cancel") {
      endDrag();
      removeGhost();
    }
    const kind = message?.window;
    if (kind !== "panel" && kind !== "programs") return;
    if (message?.type === "height" && typeof message.height === "number") {
      compactHeights[kind] = message.height;
    } else if (message?.type === "drop" && isPoint(message.delta)) {
      dropWindow(kind, message.delta).catch(warn);
    } else if (message?.type === "compact") {
      savePrefs(kind, { ...prefs[kind], compact: message.compact === true });
      reopen(kind).catch(warn);
    }
  });
}
