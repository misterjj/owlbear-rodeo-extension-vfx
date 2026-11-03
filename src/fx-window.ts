/** Place et format des fenêtres de l'extension, sans dépendance à Owlbear. */
const PLUGIN_ID = "vfx-owlbear";

export type WindowKind = "panel" | "programs";

/** Échanges entre une fenêtre et l'arrière-plan, sur le même écran. */
export const FX_WINDOW_CHANNEL = `${PLUGIN_ID}/fenetre`;
/** Contour montrant la future place d'une fenêtre pendant un déplacement. */
export const FX_WINDOW_GHOST_ID = `${PLUGIN_ID}/contour-fenetre`;

const WINDOW_MARGIN = 8;
/** Bandeau du haut d'Owlbear : une fenêtre pleine hauteur le laisse visible. */
export const WINDOW_TOP_SPACE = 88;

export interface WindowPrefs {
  left: number;
  top: number;
  compact: boolean;
}

export interface WindowSize {
  width: number;
  height: number;
}

export function parseWindowPrefs(raw: string | null, fallback: WindowPrefs): WindowPrefs {
  try {
    const { left, top, compact } = JSON.parse(raw ?? "") as Partial<WindowPrefs>;
    if (Number.isFinite(left) && Number.isFinite(top)) {
      return { left: left!, top: top!, compact: compact === true };
    }
  } catch {
    // Valeur illisible : la fenêtre reprend sa place d'origine.
  }
  return fallback;
}

/** Taille et position réelles : la fenêtre reste entièrement dans l'écran, même rétréci depuis. */
export function placeWindow(prefs: WindowPrefs, viewport: WindowSize, size: WindowSize) {
  const height = Math.min(size.height, viewport.height - WINDOW_TOP_SPACE);
  const within = (value: number, room: number) =>
    Math.round(Math.max(WINDOW_MARGIN, Math.min(value, room - WINDOW_MARGIN)));
  return {
    width: size.width,
    height,
    left: within(prefs.left, viewport.width - size.width),
    top: within(prefs.top, viewport.height - height),
  };
}
