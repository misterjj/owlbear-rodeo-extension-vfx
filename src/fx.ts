const PLUGIN_ID = "vfx-owlbear";

export const FX_CHANNEL = `${PLUGIN_ID}/effets`;
export const FX_TOOL_ID = `${PLUGIN_ID}/outil`;
export const FX_SOURCE_ID = `${PLUGIN_ID}/lanceur`;
export const FX_PANEL_ID = `${PLUGIN_ID}/panneau`;
export const FX_PREVIEW_ID = `${PLUGIN_ID}/apercu`;
export const FX_WHEEL_ID = `${PLUGIN_ID}/roue`;
/** Sort choisi dans la roue, transmis à l'arrière-plan de l'extension. */
export const FX_WHEEL_CHANNEL = `${PLUGIN_ID}/sort-choisi`;
/** Sorts d'un token, enregistrés dans ses métadonnées : ils le suivent. */
export const FX_SPELLS_KEY = `${PLUGIN_ID}/sorts`;
/** Liste des effets durables, enregistrée dans les métadonnées de la scène. */
export const FX_DURABLE_KEY = `${PLUGIN_ID}/durable`;
/** Début de l'identifiant des effets qui en sont tirés, créés localement chez chaque joueur. */
export const FX_DURABLE_ITEM_PREFIX = `${PLUGIN_ID}/durable/`;
/** Réglages communs à la salle, enregistrés dans ses métadonnées. */
export const FX_ROOM_KEY = `${PLUGIN_ID}/reglages`;

const CHOICE_KEY = "vfx:choix";
const FAVORITES_KEY = "vfx:favoris";

export type Rgb = readonly [number, number, number];

export interface ElementLook {
  label: string;
  /** Couleurs froide, moyenne et chaude. */
  palette: readonly [Rgb, Rgb, Rgb];
  smoke: Rgb;
  /** Finesse des déformations : plus la valeur est haute, plus l'effet est tourmenté. */
  rough: number;
  /** Longueur des gouttes de pluie : courte pour des flocons ou des braises. */
  stretch: number;
  fallSpeed: number;
  /** Rayon droit (0) ou brisé en zigzag (1). */
  jag: number;
  /** Ondulation de l'effet : 0 pour une forme stable. */
  warp: number;
  /** Part de l'onde de choc dans une explosion : 0 pour une boule pleine, 1 pour une onde presque seule. */
  shock: number;
  /** Opacité d'un nuage : ceux qui doivent cacher ce qu'ils couvrent sont presque opaques. */
  density: number;
  /** Énergie pure (1) : rayons rectilignes et cône en faisceaux, sans fumée. */
  radiant: number;
  /** Onde sonore (1) : l'énergie se propage en anneaux, sans fumée ni matière. */
  sonic: number;
}

export const ELEMENTS = {
  feu: {
    label: "Feu",
    palette: [[0.35, 0.03, 0], [1, 0.33, 0.02], [1, 0.9, 0.55]],
    smoke: [0.07, 0.06, 0.06],
    rough: 1,
    stretch: 0.22,
    fallSpeed: 0.8,
    jag: 0.15,
    warp: 0,
    shock: 0,
    density: 0.6,
    radiant: 0,
    sonic: 0,
  },
  glace: {
    label: "Glace",
    palette: [[0.05, 0.2, 0.5], [0.25, 0.65, 0.95], [0.88, 0.98, 1]],
    smoke: [0.72, 0.84, 0.95],
    rough: 1.5,
    stretch: 0.09,
    fallSpeed: 0.45,
    jag: 0.05,
    warp: 0,
    shock: 0,
    density: 0.6,
    radiant: 0,
    sonic: 0,
  },
  foudre: {
    label: "Foudre",
    palette: [[0.15, 0.1, 0.55], [0.45, 0.45, 1], [0.93, 0.96, 1]],
    smoke: [0.1, 0.1, 0.26],
    rough: 2,
    stretch: 0.5,
    fallSpeed: 1.8,
    jag: 1,
    warp: 0,
    shock: 0,
    density: 0.6,
    radiant: 0,
    sonic: 0,
  },
  poison: {
    label: "Poison",
    palette: [[0.22, 0.05, 0.32], [0.3, 0.65, 0.2], [0.72, 0.95, 0.35]],
    smoke: [0.17, 0.3, 0.1],
    rough: 0.8,
    stretch: 0.2,
    fallSpeed: 0.6,
    jag: 0.2,
    warp: 0,
    shock: 0,
    density: 0.6,
    radiant: 0,
    sonic: 0,
  },
  acide: {
    label: "Acide",
    palette: [[0.3, 0.35, 0], [0.72, 0.82, 0.05], [0.97, 1, 0.5]],
    smoke: [0.33, 0.38, 0.05],
    rough: 1.2,
    stretch: 0.3,
    fallSpeed: 1,
    jag: 0.25,
    warp: 0,
    shock: 0,
    density: 0.6,
    radiant: 0,
    sonic: 0,
  },
  tenebres: {
    label: "Ténèbres",
    palette: [[0.02, 0, 0.04], [0.16, 0.03, 0.28], [0.5, 0.22, 0.78]],
    smoke: [0.02, 0.01, 0.04],
    rough: 1,
    stretch: 0.3,
    fallSpeed: 0.7,
    jag: 0.3,
    warp: 0,
    shock: 0,
    density: 0.93,
    radiant: 0,
    sonic: 0,
  },
  lumiere: {
    label: "Lumière",
    palette: [[0.72, 0.45, 0.05], [1, 0.82, 0.3], [1, 1, 0.9]],
    smoke: [0.95, 0.88, 0.58],
    rough: 0.9,
    stretch: 0.35,
    fallSpeed: 1.2,
    jag: 0.05,
    warp: 0,
    shock: 0,
    density: 0.6,
    radiant: 1,
    sonic: 0,
  },
  force: {
    label: "Force",
    palette: [[0.16, 0.05, 0.6], [0.52, 0.28, 1], [0.9, 0.86, 1]],
    smoke: [0.3, 0.2, 0.7],
    rough: 0.6,
    stretch: 0.3,
    fallSpeed: 1.4,
    jag: 0,
    warp: 0,
    shock: 0.3,
    density: 0.6,
    radiant: 0,
    sonic: 0,
  },
  necrotique: {
    label: "Nécrotique",
    palette: [[0.02, 0.05, 0.03], [0.22, 0.36, 0.2], [0.62, 0.8, 0.52]],
    smoke: [0.03, 0.05, 0.03],
    rough: 1.1,
    stretch: 0.25,
    fallSpeed: 0.5,
    jag: 0.35,
    warp: 0.3,
    shock: 0,
    density: 0.6,
    radiant: 0,
    sonic: 0,
  },
  psychique: {
    label: "Psychique",
    palette: [[0.35, 0.02, 0.38], [1, 0.25, 0.7], [1, 0.84, 0.96]],
    smoke: [0.5, 0.15, 0.5],
    rough: 0.8,
    stretch: 0.2,
    fallSpeed: 0.7,
    jag: 0.3,
    warp: 1,
    shock: 0.2,
    density: 0.6,
    radiant: 0,
    sonic: 0,
  },
  tonnerre: {
    label: "Tonnerre",
    palette: [[0.5, 0.64, 0.84], [0.76, 0.86, 0.97], [0.97, 0.99, 1]],
    smoke: [0.62, 0.7, 0.8],
    rough: 1.3,
    stretch: 0.4,
    fallSpeed: 1.6,
    jag: 0.5,
    warp: 0.2,
    shock: 1,
    density: 0.6,
    radiant: 0,
    sonic: 1,
  },
  physique: {
    label: "Physique",
    palette: [[0.22, 0.22, 0.25], [0.62, 0.62, 0.67], [0.97, 0.97, 0.99]],
    smoke: [0.38, 0.34, 0.29],
    rough: 1.4,
    stretch: 0.14,
    fallSpeed: 1.3,
    jag: 0,
    warp: 0,
    shock: 0.2,
    density: 0.6,
    radiant: 0,
    sonic: 0,
  },
  sang: {
    label: "Sang",
    palette: [[0.2, 0, 0.01], [0.62, 0.02, 0.05], [0.95, 0.2, 0.16]],
    smoke: [0.28, 0.01, 0.02],
    rough: 1.5,
    stretch: 0.16,
    fallSpeed: 1.1,
    jag: 0.1,
    warp: 0,
    shock: 0,
    density: 0.6,
    radiant: 0,
    sonic: 0,
  },
  eau: {
    label: "Eau",
    palette: [[0, 0.14, 0.4], [0.05, 0.42, 0.82], [0.76, 0.93, 1]],
    smoke: [0.6, 0.78, 0.92],
    rough: 0.9,
    stretch: 0.28,
    fallSpeed: 1.3,
    jag: 0.1,
    warp: 0.5,
    shock: 0.1,
    density: 0.6,
    radiant: 0,
    sonic: 0,
  },
  terre: {
    label: "Terre",
    palette: [[0.16, 0.09, 0.04], [0.47, 0.3, 0.14], [0.8, 0.65, 0.4]],
    smoke: [0.42, 0.32, 0.2],
    rough: 1.8,
    stretch: 0.08,
    fallSpeed: 1,
    jag: 0.4,
    warp: 0,
    shock: 0,
    density: 0.6,
    radiant: 0,
    sonic: 0,
  },
  vent: {
    label: "Vent",
    palette: [[0.45, 0.62, 0.62], [0.74, 0.9, 0.87], [0.97, 1, 1]],
    smoke: [0.8, 0.88, 0.88],
    rough: 0.7,
    stretch: 0.45,
    fallSpeed: 2,
    jag: 0.15,
    warp: 1.6,
    shock: 0.5,
    density: 0.6,
    radiant: 0,
    sonic: 0,
  },
} as const satisfies Record<string, ElementLook>;

/**
 * `directed` : l'effet part d'un lanceur et demande donc deux clics.
 * `reach` : rayon, longueur ou côté en cases à la taille M, 0 si les clics décident de la longueur.
 * `exactZone` : la zone peut être donnée dans l'unité de la scène, comme dans la description d'un sort.
 */
export const STYLES = {
  coup: { label: "Coup", directed: false, reach: 0.9, exactZone: false },
  griffes: { label: "Griffes", directed: false, reach: 0.9, exactZone: false },
  morsure: { label: "Morsure", directed: false, reach: 0.9, exactZone: false },
  fleche: { label: "Flèche", directed: true, reach: 0, exactZone: false },
  projectile: { label: "Projectile", directed: true, reach: 0, exactZone: false },
  rayon: { label: "Rayon", directed: true, reach: 0, exactZone: false },
  chaine: { label: "Chaîne", directed: true, reach: 0, exactZone: false },
  cone: { label: "Cône", directed: true, reach: 5, exactZone: true },
  explosion: { label: "Explosion", directed: false, reach: 2.5, exactZone: true },
  meteore: { label: "Météore", directed: false, reach: 2.5, exactZone: true },
  pluie: { label: "Pluie", directed: false, reach: 3, exactZone: true },
  mur: { label: "Mur", directed: true, reach: 0, exactZone: false },
  dome: { label: "Dôme", directed: false, reach: 2.5, exactZone: true },
  cube: { label: "Cube", directed: false, reach: 4, exactZone: true },
  nuage: { label: "Nuage", directed: false, reach: 2.5, exactZone: true },
  aura: { label: "Aura", directed: false, reach: 1.5, exactZone: true },
  transformation: { label: "Transformation", directed: false, reach: 1.2, exactZone: true },
  soin: { label: "Soin", directed: false, reach: 1, exactZone: true },
  teleportation: { label: "Téléportation", directed: true, reach: 0, exactZone: false },
} as const;

/** La taille M est la référence. */
export const SIZES = { XS: 0.4, S: 0.65, M: 1, L: 1.6, XL: 2.4 } as const;

export type ElementId = keyof typeof ELEMENTS;
export type StyleId = keyof typeof STYLES;
export type SizeId = keyof typeof SIZES;

export const ELEMENT_IDS = Object.keys(ELEMENTS) as ElementId[];
export const STYLE_IDS = Object.keys(STYLES) as StyleId[];
export const SIZE_IDS = Object.keys(SIZES) as SizeId[];

export interface Point {
  x: number;
  y: number;
}

/** Ce qui définit l'apparence d'un effet. */
export interface FxCast {
  element: ElementId;
  style: StyleId;
  size: SizeId;
}

export interface FxChoice extends FxCast {
  /** Rayon, longueur ou côté dans l'unité de la scène ; remplace la taille pour les styles de zone. */
  exact: number | null;
  /** Seuls les MJ voient l'effet. */
  gmOnly: boolean;
  /** L'effet reste, sur la carte ou attaché à un token, jusqu'à ce qu'on le retire. */
  durable: boolean;
  /** Cube lancé depuis un token : collé à l'une de ses faces plutôt que centré sur lui. */
  onFace?: boolean;
}

/** La graine est transmise pour que l'effet ait la même forme chez tous les joueurs. */
export interface FxMessage extends FxCast {
  at: Point;
  /** Présent seulement pour les effets qui partent d'un lanceur. */
  from?: Point;
  seed: number;
  /** Rayon, longueur ou côté en cases, quand une zone exacte a été demandée. */
  cells?: number;
  /** Rotation d'un cube, en radians. */
  angle?: number;
  gmOnly?: true;
}

export const isKeyOf = <T extends object>(table: T, value: unknown): value is keyof T =>
  typeof value === "string" && Object.hasOwn(table, value);

export const isExact = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

/** Au-delà, une zone couvrirait la carte et ralentirait tout le monde. */
const MAX_CELLS = 40;

export const isPoint = (value: unknown): value is Point => {
  const point = value as Partial<Point> | null;
  return Number.isFinite(point?.x) && Number.isFinite(point?.y);
};

/** Le message vient du réseau : tout le reste est ignoré. */
export function parseFxMessage(data: unknown): FxMessage | undefined {
  const message = data as Partial<Record<keyof FxMessage, unknown>> | null;
  if (
    !isKeyOf(ELEMENTS, message?.element) ||
    !isKeyOf(STYLES, message?.style) ||
    !isKeyOf(SIZES, message?.size) ||
    !isPoint(message?.at) ||
    typeof message?.seed !== "number" ||
    !Number.isFinite(message.seed)
  ) {
    return undefined;
  }
  const parsed: FxMessage = {
    element: message.element,
    style: message.style,
    size: message.size,
    at: message.at,
    seed: message.seed,
  };
  if (STYLES[message.style].directed) {
    if (!isPoint(message.from)) return undefined;
    parsed.from = message.from;
  }
  if (message.cells !== undefined) {
    if (!isExact(message.cells)) return undefined;
    parsed.cells = Math.min(message.cells, MAX_CELLS);
  }
  if (typeof message.angle === "number" && Number.isFinite(message.angle)) parsed.angle = message.angle;
  if (message.gmOnly === true) parsed.gmOnly = true;
  return parsed;
}

/** Message envoyé à la salle : `multiplier` est la valeur d'une case dans l'unité de la scène. */
export function buildMessage(
  choice: FxChoice,
  at: Point,
  from: Point | undefined,
  multiplier: number,
  seed: number,
): FxMessage {
  const cells = exactCells(choice, multiplier);
  return {
    element: choice.element,
    style: choice.style,
    size: choice.size,
    at,
    seed,
    ...(from ? { from } : {}),
    ...(cells === undefined ? {} : { cells }),
    ...(choice.gmOnly ? { gmOnly: true as const } : {}),
  };
}

export const DEFAULT_CHOICE: FxChoice = {
  element: "feu",
  style: "explosion",
  size: "M",
  exact: null,
  gmOnly: false,
  durable: false,
};

type ChoiceStorage = Pick<Storage, "getItem" | "setItem">;

/** Dernier réglage utilisé, ou le réglage par défaut pour ce qui est illisible. */
export function loadChoice(storage: ChoiceStorage): FxChoice {
  try {
    const saved = JSON.parse(storage.getItem(CHOICE_KEY) ?? "{}");
    return {
      element: isKeyOf(ELEMENTS, saved?.element) ? saved.element : DEFAULT_CHOICE.element,
      style: isKeyOf(STYLES, saved?.style) ? saved.style : DEFAULT_CHOICE.style,
      size: isKeyOf(SIZES, saved?.size) ? saved.size : DEFAULT_CHOICE.size,
      exact: isExact(saved?.exact) ? saved.exact : null,
      gmOnly: saved?.gmOnly === true,
      durable: saved?.durable === true,
      ...(saved?.onFace === true ? { onFace: true } : {}),
    };
  } catch {
    return DEFAULT_CHOICE;
  }
}

export function saveChoice(storage: ChoiceStorage, choice: FxChoice) {
  storage.setItem(CHOICE_KEY, JSON.stringify(choice));
}

/** Un projectile vole à vitesse constante, sans être trop bref ni trop long. */
export function projectileDuration(from: Point, to: Point, dpi: number) {
  const cells = Math.hypot(to.x - from.x, to.y - from.y) / dpi;
  return Math.min(800, Math.max(220, cells * 70));
}

export interface TokenArea {
  id: string;
  name: string;
  owner: string;
  width: number;
  center: Point;
  min: Point;
  max: Point;
  layer: string;
  zIndex: number;
}

const LAYER_ORDER = ["MOUNT", "CHARACTER"];

/** Token visible sous le pointeur : le plus haut si plusieurs se chevauchent. */
export function tokenAt(point: Point, tokens: TokenArea[]): TokenArea | undefined {
  const rank = (token: TokenArea) => [LAYER_ORDER.indexOf(token.layer), token.zIndex];
  const [top] = tokens
    .filter(
      ({ min, max }) =>
        point.x >= min.x && point.x <= max.x && point.y >= min.y && point.y <= max.y,
    )
    .sort((a, b) => rank(b)[0] - rank(a)[0] || rank(b)[1] - rank(a)[1]);
  return top;
}

/** Un token de largeur impaire se centre sur une case, un token de largeur paire sur un coin. */
export const fitsCellCenter = (width: number, dpi: number) =>
  Math.max(Math.round(width / dpi), 1) % 2 === 1;

/** L'arrivée commence avant la fin du départ : les deux effets se tuilent. */
export function teleportTiming(size: SizeId) {
  const duration = scaledDuration(650, SIZES[size]);
  return { duration, arrivalDelay: duration * 0.75 };
}

/** Une flèche va plus vite qu'un sort. */
export const arrowDuration = (from: Point, to: Point, dpi: number) =>
  Math.round(projectileDuration(from, to, dpi) * 0.65);

/** Un cône a une longueur fixe : le clic ne donne que sa direction. */
export function coneTarget(from: Point, at: Point, length: number): Point {
  const distance = Math.max(Math.hypot(at.x - from.x, at.y - from.y), 1);
  return { x: ((at.x - from.x) / distance) * length, y: ((at.y - from.y) / distance) * length };
}

/** Ce que vaut le nombre saisi. Une échelle sans unité qui n'est pas de 1 ne compte pas en cases. */
export const unitLabel = ({ multiplier, unit }: { multiplier: number; unit: string }) =>
  unit || (multiplier === 1 ? "cases" : "unités");

/** Zone demandée en cases, si elle s'applique à ce style. */
export function exactCells(choice: FxChoice, multiplier: number) {
  if (choice.exact === null || !STYLES[choice.style].exactZone) return undefined;
  return Math.min(choice.exact / (multiplier > 0 ? multiplier : 1), MAX_CELLS);
}

/** Facteur d'échelle de l'effet : 1 pour la taille M. */
export function effectScale(style: StyleId, size: SizeId, cells: number | undefined) {
  return cells !== undefined && STYLES[style].exactZone ? cells / STYLES[style].reach : SIZES[size];
}

/** Durée d'un saut de chaîne à la taille M. */
export const CHAIN_HOP_MS = 600;

/** Les grands effets durent un peu plus longtemps, sans s'éterniser pour une très grande zone. */
export const scaledDuration = (base: number, scale: number) =>
  Math.round(base * Math.sqrt(Math.min(scale, 4)));

/** Les favoris sont limités pour que le panneau reste utilisable. */
export const MAX_FAVORITES = 12;
export const MAX_NAME_LENGTH = 30;

export interface Favorite extends FxCast {
  name: string;
  exact: number | null;
  durable?: boolean;
  onFace?: boolean;
}

const isFavorite = (value: unknown): value is Favorite => {
  const favorite = value as Partial<Favorite> | null;
  return (
    typeof favorite?.name === "string" &&
    favorite.name.length > 0 &&
    isKeyOf(ELEMENTS, favorite.element) &&
    isKeyOf(STYLES, favorite.style) &&
    isKeyOf(SIZES, favorite.size) &&
    (favorite.exact === null || isExact(favorite.exact))
  );
};

export function loadFavorites(storage: ChoiceStorage): Favorite[] {
  try {
    const saved = JSON.parse(storage.getItem(FAVORITES_KEY) ?? "[]");
    return Array.isArray(saved) ? saved.filter(isFavorite).slice(0, MAX_FAVORITES) : [];
  } catch {
    return [];
  }
}

export function saveFavorites(storage: ChoiceStorage, favorites: Favorite[]) {
  storage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
}

/** Reprendre un nom existant remplace ce favori. Sans nom ou liste pleine, rien ne change. */
export function addFavorite(
  favorites: Favorite[],
  name: string,
  choice: FxChoice,
  max = MAX_FAVORITES,
): Favorite[] {
  const trimmed = name.trim().slice(0, MAX_NAME_LENGTH);
  if (!trimmed) return favorites;
  const favorite: Favorite = {
    name: trimmed,
    element: choice.element,
    style: choice.style,
    size: choice.size,
    exact: choice.exact,
    ...(isDurable(choice) ? { durable: true } : {}),
    ...(startsOnFace(choice) ? { onFace: true } : {}),
  };
  const key = trimmed.toLowerCase();
  const index = favorites.findIndex((other) => other.name.toLowerCase() === key);
  if (index >= 0) return favorites.map((other, i) => (i === index ? favorite : other));
  return favorites.length >= max ? favorites : [...favorites, favorite];
}

/** Le favori correspond-il au réglage en cours ? */
export const matchesFavorite = (favorite: Favorite, choice: FxChoice) =>
  favorite.element === choice.element &&
  favorite.style === choice.style &&
  favorite.size === choice.size &&
  favorite.exact === choice.exact &&
  Boolean(favorite.durable) === isDurable(choice) &&
  startsOnFace(favorite) === startsOnFace(choice);

export interface Outline {
  points: Point[];
  closed: boolean;
}

/** Demi-angle d'un cône dont la largeur égale la longueur, comme dans les règles. */
const CONE_HALF_ANGLE = Math.atan(0.5);

/** Contour montré sous le pointeur avant de lancer, ou rien si le lanceur manque encore. */
/** Ce que mesure la zone exacte de ce style, tel qu'une description de sort l'indique. */
export const exactZoneLabel = (style: StyleId) =>
  style === "cone" ? "Longueur" : style === "cube" ? "Côté" : "Rayon";

export function previewOutline(
  style: StyleId,
  source: Point | undefined,
  pointer: Point,
  reach: number,
  angle = 0,
): Outline | undefined {
  if (style === "cube") {
    const half = reach / 2;
    const [c, s] = [Math.cos(angle), Math.sin(angle)];
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    return {
      points: corners.map(([x, y]) => ({
        x: pointer.x + (x * c - y * s) * half,
        y: pointer.y + (x * s + y * c) * half,
      })),
      closed: true,
    };
  }
  if (!STYLES[style].directed) {
    const points = Array.from({ length: 48 }, (_, i) => {
      const angle = (i / 48) * Math.PI * 2;
      return { x: pointer.x + Math.cos(angle) * reach, y: pointer.y + Math.sin(angle) * reach };
    });
    return { points, closed: true };
  }
  if (!source) return undefined;
  if (style !== "cone") return { points: [source, pointer], closed: false };
  const direction = Math.atan2(pointer.y - source.y, pointer.x - source.x);
  const arc = Array.from({ length: 13 }, (_, i) => {
    const angle = direction - CONE_HALF_ANGLE + (i / 12) * CONE_HALF_ANGLE * 2;
    return { x: source.x + Math.cos(angle) * reach, y: source.y + Math.sin(angle) * reach };
  });
  return { points: [source, ...arc], closed: true };
}

export const startsOnFace = ({ style, onFace }: { style: StyleId; onFace?: boolean }) =>
  style === "cube" && onFace === true;

/**
 * Cube collé au token, dans n'importe quelle direction : sa face touche le bord du token (vu comme un
 * disque, pour que le cube tourne sans à-coup) et lui fait toujours face. `angle` est en radians.
 */
export function cubeOnFace(center: Point, pointer: Point, tokenWidth: number, side: number) {
  const dx = pointer.x - center.x;
  const dy = pointer.y - center.y;
  const angle = dx === 0 && dy === 0 ? 0 : Math.atan2(dy, dx);
  const distance = (tokenWidth + side) / 2;
  return { angle, offset: { x: Math.cos(angle) * distance, y: Math.sin(angle) * distance } };
}

/** Lu dans les métadonnées de la salle : refusé tant que le MJ n'a rien autorisé. */
export const playersAllowedIn = (metadata: Record<string, unknown>) =>
  (metadata[FX_ROOM_KEY] as { players?: unknown } | undefined)?.players === true;

const PLAYER_COOLDOWN_MS = 300;

/** Un joueur ne peut pas enchaîner les effets au point de gêner la salle. */
export const playerCooldownOver = (last: number | undefined, now: number) =>
  last === undefined || now - last >= PLAYER_COOLDOWN_MS;

/** Au-delà, les boutons de la roue se chevaucheraient. */
export const MAX_SPELLS = 8;

export function spellsOf(metadata: Record<string, unknown>): Favorite[] {
  const saved = metadata[FX_SPELLS_KEY];
  return Array.isArray(saved) ? saved.filter(isFavorite).slice(0, MAX_SPELLS) : [];
}

/** Sans nom, ou avec le nom d'un autre sort, rien ne change. */
export function renameSpell(spells: Favorite[], index: number, name: string): Favorite[] {
  const trimmed = name.trim().slice(0, MAX_NAME_LENGTH);
  const key = trimmed.toLowerCase();
  const taken = spells.some((other, i) => i !== index && other.name.toLowerCase() === key);
  if (!trimmed || taken) return spells;
  return spells.map((spell, i) => (i === index ? { ...spell, name: trimmed } : spell));
}

/** Remplace les réglages d'un sort. Une zone exacte ou « durable » que le style ne permet pas est oubliée. */
export function editSpell(spells: Favorite[], index: number, changes: Favorite): Favorite[] {
  const renamed = renameSpell(spells, index, changes.name);
  if (renamed === spells) return spells;
  const { element, style, size, exact } = changes;
  return renamed.map((spell, i) =>
    i === index
      ? {
          name: spell.name,
          element,
          style,
          size,
          exact: STYLES[style].exactZone && isExact(exact) ? exact : null,
          ...(isDurable(changes) ? { durable: true } : {}),
          ...(startsOnFace(changes) ? { onFace: true } : {}),
        }
      : spell,
  );
}

export const defaultSpellName = ({ element, style }: FxCast) =>
  `${STYLES[style].label} · ${ELEMENTS[element].label}`;

/** Ces styles partent du token sans qu'il y ait à viser. */
export const castsOnSelf = (style: StyleId) =>
  style === "aura" || style === "soin" || style === "dome" || style === "transformation";

export interface WheelCast {
  token: string;
  spell: Favorite;
}

export function parseWheelCast(data: unknown): WheelCast | undefined {
  const cast = data as Partial<WheelCast> | null;
  return typeof cast?.token === "string" && isFavorite(cast.spell)
    ? { token: cast.token, spell: cast.spell }
    : undefined;
}

/** Places sur la roue, en partant du haut, en décalage depuis son centre. */
export function wheelPositions(count: number, radius: number): Point[] {
  return Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
    return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
  });
}

const DURABLE_STYLES: readonly StyleId[] = ["aura", "pluie", "dome", "cube", "mur", "nuage", "transformation"];

export const canBeDurable = (style: StyleId) => DURABLE_STYLES.includes(style);

export const isDurable = ({ style, durable }: { style: StyleId; durable?: boolean }) =>
  durable === true && canBeDurable(style);

/** Chaque effet durable est recalculé en permanence par tous les joueurs : leur nombre est limité. */
export const MAX_DURABLE = 8;

/**
 * Description partagée d'un effet durable. Owlbear ne garde pas les effets dans la scène partagée :
 * chaque joueur crée le sien à partir de cette description, comme le fait son extension de météo.
 */
export interface DurableEntry {
  id: string;
  name: string;
  element: ElementId;
  style: StyleId;
  /** Facteur d'échelle de l'effet : 1 pour la taille M. */
  scale: number;
  seed: number;
  /** Point visé sur la carte ; pour un mur, sa fin. Sans effet si l'entrée a un porteur. */
  at: Point;
  /** Début d'un mur. */
  from?: Point;
  /** Token porteur : l'effet le suit. */
  carrier?: { id: string; name: string };
  /** Décalage depuis le centre du porteur et rotation, pour un cube collé à sa face. */
  offset?: Point;
  angle?: number;
  gmOnly: boolean;
  owner: string;
}

const isDurableEntry = (value: unknown): value is DurableEntry => {
  const entry = value as Partial<DurableEntry> | null;
  return (
    typeof entry?.id === "string" &&
    typeof entry.name === "string" &&
    isKeyOf(ELEMENTS, entry.element) &&
    isKeyOf(STYLES, entry.style) &&
    canBeDurable(entry.style) &&
    isExact(entry.scale) &&
    typeof entry.seed === "number" &&
    Number.isFinite(entry.seed) &&
    isPoint(entry.at) &&
    (entry.from === undefined || isPoint(entry.from)) &&
    (entry.offset === undefined || isPoint(entry.offset)) &&
    (entry.angle === undefined || Number.isFinite(entry.angle)) &&
    (entry.carrier === undefined ||
      (typeof entry.carrier.id === "string" && typeof entry.carrier.name === "string")) &&
    typeof entry.gmOnly === "boolean" &&
    typeof entry.owner === "string"
  );
};

export function durablesIn(metadata: Record<string, unknown>): DurableEntry[] {
  const saved = metadata[FX_DURABLE_KEY];
  return Array.isArray(saved) ? saved.filter(isDurableEntry).slice(0, MAX_DURABLE) : [];
}

/** Même effet déjà attaché à ce token : un nouveau clic sert à l'éteindre. */
export const sameDurable = (entry: DurableEntry, { element, style }: FxCast) =>
  entry.element === element && entry.style === style;

export const durableItemId = (entryId: string) => `${FX_DURABLE_ITEM_PREFIX}${entryId}`;

/** Ce qu'un joueur doit ajouter ou retirer pour que ses effets locaux suivent la description. */
export function durableChanges(
  entries: DurableEntry[],
  itemIds: string[],
  role: "GM" | "PLAYER",
  tokenExists: (id: string) => boolean,
) {
  const wanted = entries.filter(
    ({ carrier, gmOnly }) =>
      (role === "GM" || !gmOnly) && (carrier === undefined || tokenExists(carrier.id)),
  );
  const wantedIds = new Set(wanted.map(({ id }) => durableItemId(id)));
  return {
    add: wanted.filter(({ id }) => !itemIds.includes(durableItemId(id))),
    remove: itemIds.filter((id) => !wantedIds.has(id)),
  };
}

/** La durée d'un sort lancé depuis la roue : on ne vise que s'il y a un point à choisir. */
export const firesFromToken = (spell: { style: StyleId; durable?: boolean; onFace?: boolean }) =>
  !startsOnFace(spell) && (castsOnSelf(spell.style) || (isDurable(spell) && !STYLES[spell.style].directed));
