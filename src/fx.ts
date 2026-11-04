import { t, type TextKey } from "./i18n";
const PLUGIN_ID = "vfx-owlbear";

export const FX_CHANNEL = `${PLUGIN_ID}/effets`;
export const FX_TOOL_ID = `${PLUGIN_ID}/outil`;
export const FX_SOURCE_ID = `${PLUGIN_ID}/lanceur`;
/** Échanges entre le menu Effets et l'arrière-plan, sur le même écran. */
export const FX_UI_CHANNEL = `${PLUGIN_ID}/interface`;
/** Token à configurer quand le menu Effets s'ouvre depuis une roue vide. */
export const FX_TARGET_KEY = "vfx:cible";
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
  coup: { directed: false, reach: 0.9, exactZone: false },
  griffes: { directed: false, reach: 0.9, exactZone: false },
  morsure: { directed: false, reach: 0.9, exactZone: false },
  fleche: { directed: true, reach: 0, exactZone: false },
  projectile: { directed: true, reach: 0, exactZone: false },
  rayon: { directed: true, reach: 0, exactZone: false },
  chaine: { directed: true, reach: 0, exactZone: false },
  cone: { directed: true, reach: 5, exactZone: true },
  explosion: { directed: false, reach: 2.5, exactZone: true },
  meteore: { directed: false, reach: 2.5, exactZone: true },
  pluie: { directed: false, reach: 3, exactZone: true },
  mur: { directed: true, reach: 0, exactZone: false },
  dome: { directed: false, reach: 2.5, exactZone: true },
  cube: { directed: false, reach: 4, exactZone: true },
  nuage: { directed: false, reach: 2.5, exactZone: true },
  aura: { directed: false, reach: 1.5, exactZone: true },
  flamme: { directed: false, reach: 1, exactZone: true },
  transformation: { directed: false, reach: 1.2, exactZone: true },
  soin: { directed: false, reach: 1, exactZone: true },
  teleportation: { directed: true, reach: 0, exactZone: false },
} as const;

/** La taille M est la référence. */
export const SIZES = { XS: 0.4, S: 0.65, M: 1, L: 1.6, XL: 2.4 } as const;

export type ElementId = keyof typeof ELEMENTS;
export type StyleId = keyof typeof STYLES;
export type SizeId = keyof typeof SIZES;

export const elementLabel = (element: ElementId) => t(`element.${element}`);
export const styleLabel = (style: StyleId) => t(`style.${style}`);

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
  unit || t(multiplier === 1 ? "unit.cells" : "unit.units");

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
  t(style === "cone" ? "zone.length" : style === "cube" ? "zone.side" : "zone.radius");

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
  `${styleLabel(style)} · ${elementLabel(element)}`;

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

export const WHEEL_OUTER = 150;
export const WHEEL_INNER = 62;
const WHEEL_GAP = 0.03;

/**
 * Secteur d'un sort sur la roue, le premier centré en haut, en décalage depuis le centre.
 * `middle` est le milieu du secteur, là où se placent son icône et son nom.
 */
export function wheelSector(index: number, count: number) {
  // Un sort seul garde la forme d'un secteur : un anneau entier ne se lirait pas comme un bouton.
  const span = (Math.PI * 2) / Math.max(count, count === 1 ? 3 : 2);
  const start = -Math.PI / 2 - span / 2 + index * span + WHEEL_GAP;
  const end = start + span - WHEEL_GAP * 2;
  const at = (radius: number, angle: number): Point => ({
    x: Math.round(Math.cos(angle) * radius * 100) / 100,
    y: Math.round(Math.sin(angle) * radius * 100) / 100,
  });
  const large = end - start > Math.PI ? 1 : 0;
  const [a, b, c, d] = [at(WHEEL_OUTER, start), at(WHEEL_OUTER, end), at(WHEEL_INNER, end), at(WHEEL_INNER, start)];
  const middleRadius = (WHEEL_OUTER + WHEEL_INNER) / 2;
  return {
    path: `M${a.x} ${a.y}A${WHEEL_OUTER} ${WHEEL_OUTER} 0 ${large} 1 ${b.x} ${b.y}L${c.x} ${c.y}A${WHEEL_INNER} ${WHEEL_INNER} 0 ${large} 0 ${d.x} ${d.y}Z`,
    middle: at(middleRadius, (start + end) / 2),
    /** Largeur disponible pour le nom, au milieu du secteur. */
    width: Math.min(span * middleRadius - 10, 104),
  };
}

const LABEL_SIZES = [12.5, 11.5, 10.5, 9.5, 8.5];
/** Largeur moyenne d'un caractère, rapportée à sa hauteur. */
const CHAR_WIDTH = 0.54;
const LABEL_LINES = 2;

function wrapLabel(name: string, perLine: number) {
  const lines: string[] = [];
  for (const word of name.split(/\s+/)) {
    const last = lines[lines.length - 1];
    if (last !== undefined && `${last} ${word}`.length <= perLine) lines[lines.length - 1] = `${last} ${word}`;
    else lines.push(word);
  }
  return lines;
}

/**
 * Nom d'un sort sur la roue : sur une ou deux lignes, à la plus grande taille qui tient.
 * Seul un nom vraiment trop long est coupé.
 */
export function fitWheelLabel(name: string, width: number) {
  for (const size of LABEL_SIZES) {
    const perLine = Math.floor(width / (size * CHAR_WIDTH));
    const lines = wrapLabel(name, perLine);
    if (lines.length <= LABEL_LINES && lines.every((line) => line.length <= perLine)) return { size, lines };
  }
  const size = LABEL_SIZES[LABEL_SIZES.length - 1];
  const perLine = Math.floor(width / (size * CHAR_WIDTH));
  const lines = wrapLabel(name, perLine).flatMap(
    (line) => line.match(new RegExp(`.{1,${perLine}}`, "gu")) ?? [],
  );
  if (lines.length <= LABEL_LINES) return { size, lines };
  const kept = lines.slice(0, LABEL_LINES);
  kept[LABEL_LINES - 1] = `${kept[LABEL_LINES - 1].slice(0, perLine - 1).trimEnd()}…`;
  return { size, lines: kept };
}

/** Une couleur d'élément trop sombre se perdrait sur le fond de la roue : elle est éclaircie. */
export function readableColor([r, g, b]: Rgb): Rgb {
  const light = 0.3 * r + 0.59 * g + 0.11 * b;
  const add = light >= 0.45 ? 0 : (0.45 - light) / (1 - light);
  return [r + (1 - r) * add, g + (1 - g) * add, b + (1 - b) * add];
}

/** Regroupement des styles dans l'onglet Lancer. */
export const STYLE_GROUPS: { label: TextKey; styles: StyleId[] }[] = [
  { label: "group.melee", styles: ["coup", "griffes", "morsure"] },
  { label: "group.ranged", styles: ["fleche", "projectile", "rayon", "chaine"] },
  { label: "group.areas", styles: ["explosion", "meteore", "cone", "flamme", "mur", "dome", "cube", "pluie", "nuage"] },
  { label: "group.self", styles: ["aura", "transformation", "soin", "teleportation"] },
];

export const isDurable = ({ durable }: { durable?: boolean }) => durable === true;

/**
 * Chaque effet durable est recalculé en permanence par tous les joueurs : leur nombre est limité, et
 * le MJ peut changer cette limite selon le matériel de sa table.
 */
export const DEFAULT_LIMIT = 10;
/** Garde-fou : les listes sont stockées dans la scène, et lues telles quelles chez tous les joueurs. */
export const MAX_LIMIT = 100;

export interface FxLimits {
  durable: number;
  programs: number;
  /** Effets animés en cours sur une même machine, durables non compris. */
  simultaneous: number;
}

const readLimit = (value: unknown) =>
  typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= MAX_LIMIT ? value : DEFAULT_LIMIT;

export function limitsIn(metadata: Record<string, unknown>): FxLimits {
  const settings = metadata[FX_ROOM_KEY] as { limits?: Partial<Record<keyof FxLimits, unknown>> } | undefined;
  return {
    durable: readLimit(settings?.limits?.durable),
    programs: readLimit(settings?.limits?.programs),
    simultaneous: readLimit(settings?.limits?.simultaneous),
  };
}

/** Places gardées pour le MJ : ni les joueurs ni les programmes ne peuvent l'empêcher de lancer un sort. */
const RESERVED_FOR_GM = 2;

/** La part des effets simultanés laissée aux joueurs et aux programmes. */
export const othersLimit = (simultaneous: number) => Math.max(1, simultaneous - RESERVED_FOR_GM);

/** Une saisie hors limites revient à la valeur permise la plus proche ; illisible, elle ne change rien. */
export function parseLimit(raw: string, current: number) {
  const value = Math.round(Number(raw));
  if (raw.trim() === "" || !Number.isFinite(value)) return current;
  return Math.min(MAX_LIMIT, Math.max(1, value));
}

/** Réglages de la salle après modification : ce qui n'est pas changé est conservé. */
export function roomSettingsWith(metadata: Record<string, unknown>, change: { players?: boolean; limits?: FxLimits }) {
  const current = (metadata[FX_ROOM_KEY] ?? {}) as Record<string, unknown>;
  return { [FX_ROOM_KEY]: { ...current, ...change } };
}

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
  /** Posé par un programme : le point occupé est `slot`, et un nouveau tir sur ce point le remplace. */
  program?: { id: string; slot: string };
  /** Heure à laquelle l'animation de départ a assez avancé pour laisser place à sa trace. */
  restAt?: number;
  /** Heure de son apparition, pour un effet qui tient. Sans elle, il est là d'emblée. */
  enterAt?: number;
}

const isDurableEntry = (value: unknown): value is DurableEntry => {
  const entry = value as Partial<DurableEntry> | null;
  return (
    typeof entry?.id === "string" &&
    typeof entry.name === "string" &&
    isKeyOf(ELEMENTS, entry.element) &&
    isKeyOf(STYLES, entry.style) &&
    isExact(entry.scale) &&
    typeof entry.seed === "number" &&
    Number.isFinite(entry.seed) &&
    isPoint(entry.at) &&
    (entry.from === undefined || isPoint(entry.from)) &&
    (entry.offset === undefined || isPoint(entry.offset)) &&
    (entry.angle === undefined || Number.isFinite(entry.angle)) &&
    (entry.carrier === undefined ||
      (typeof entry.carrier.id === "string" && typeof entry.carrier.name === "string")) &&
    (entry.restAt === undefined || Number.isFinite(entry.restAt)) &&
    (entry.enterAt === undefined || Number.isFinite(entry.enterAt)) &&
    (entry.program === undefined ||
      (typeof entry.program.id === "string" && typeof entry.program.slot === "string")) &&
    typeof entry.gmOnly === "boolean" &&
    typeof entry.owner === "string"
  );
};

export function durablesIn(metadata: Record<string, unknown>): DurableEntry[] {
  const saved = metadata[FX_DURABLE_KEY];
  return Array.isArray(saved) ? saved.filter(isDurableEntry).slice(0, MAX_LIMIT) : [];
}

/**
 * Même effet déjà attaché à ce token : un nouveau clic sert à l'éteindre.
 * L'effet d'un programme ne compte pas : les lancers à la main n'y touchent pas.
 */
export const sameDurable = (entry: DurableEntry, { element, style }: FxCast) =>
  !entry.program && entry.element === element && entry.style === style;

/** Styles dont il ne reste qu'une trace : lancés durables, ils jouent d'abord leur animation complète. */
export const LEAVES_TRACE: readonly StyleId[] = ["fleche", "projectile", "coup", "griffes", "morsure", "explosion", "meteore"];

/** Un effet qui tient, par opposition à une trace ou à la boucle de la téléportation. */
export const isSustained = (style: StyleId) => style !== "teleportation" && !LEAVES_TRACE.includes(style);

/** Départ d'un effet durable lancé maintenant : une trace attend la fin de l'animation, un effet qui tient apparaît. */
export function castTiming(style: StyleId, now: number, delay: number): { restAt?: number; enterAt?: number } {
  if (LEAVES_TRACE.includes(style)) return { restAt: now + delay };
  return isSustained(style) ? { enterAt: now } : {};
}

/** Où en est l'apparition d'un effet qui tient : de 0 au milieu de sa vie, 0,5, où il reste. */
export function appearAt(enterAt: number | undefined, now: number, delay: number) {
  if (enterAt === undefined || delay <= 0) return 0.5;
  return Math.min(Math.max(((now - enterAt) / delay) * 0.5, 0), 0.5);
}

/** Durée de chaque animation à la taille M, pour les styles sans trajet ; l'instant où l'effet durable lui succède. */
const REST_MOMENT: Partial<Record<StyleId, { ms: number; at: number }>> = {
  coup: { ms: 650, at: 0.45 },
  griffes: { ms: 650, at: 0.45 },
  morsure: { ms: 800, at: 0.78 },
  explosion: { ms: 1500, at: 0.5 },
  meteore: { ms: 2600, at: 0.6 },
  pluie: { ms: 3000, at: 0.5 },
  rayon: { ms: 1000, at: 0.5 },
  chaine: { ms: CHAIN_HOP_MS, at: 0.5 },
  cone: { ms: 1200, at: 0.5 },
  mur: { ms: 3500, at: 0.5 },
  dome: { ms: 3000, at: 0.5 },
  cube: { ms: 3000, at: 0.5 },
  aura: { ms: 2200, at: 0.5 },
  flamme: { ms: 3000, at: 0.5 },
  transformation: { ms: 2600, at: 0.5 },
  nuage: { ms: 4000, at: 0.5 },
  soin: { ms: 1800, at: 0.5 },
};

/** Temps entre le lancer et l'apparition de l'effet qui reste, en millisecondes. */
export function restDelay(style: StyleId, scale: number, from: Point, at: Point, dpi: number) {
  if (style === "fleche") return arrowDuration(from, at, dpi);
  if (style === "projectile") return projectileDuration(from, at, dpi) + scaledDuration(1000, scale) * 0.5;
  const moment = REST_MOMENT[style];
  return moment ? scaledDuration(moment.ms, scale) * moment.at : 0;
}

/** Les effets à créer dès maintenant, et l'heure à laquelle revenir pour les autres. */
export function dueDurables(entries: DurableEntry[], now: number) {
  const later = entries.flatMap(({ restAt }) => (restAt !== undefined && restAt > now ? [restAt] : []));
  return {
    due: entries.filter(({ restAt }) => restAt === undefined || restAt <= now),
    next: later.length ? Math.min(...later) : undefined,
  };
}

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

/** Durables, ces zones restent sur le lanceur. Une explosion ou un coup durable se vise, comme d'habitude. */
const DURABLE_ON_CASTER: readonly StyleId[] = ["pluie", "cube", "nuage", "flamme"];

/** La durée d'un sort lancé depuis la roue : on ne vise que s'il y a un point à choisir. */
export const firesFromToken = (spell: { style: StyleId; durable?: boolean; onFace?: boolean }) =>
  !startsOnFace(spell) && (castsOnSelf(spell.style) || (isDurable(spell) && DURABLE_ON_CASTER.includes(spell.style)));
