import { t } from "./i18n";
import {
  CHAIN_HOP_MS,
  ELEMENTS,
  MAX_LIMIT,
  SIZES,
  STYLES,
  isExact,
  isKeyOf,
  isPoint,
  scaledDuration,
  type DurableEntry,
  type FxCast,
  type Point,
  type StyleId,
} from "./fx";

const PLUGIN_ID = "vfx-owlbear";

/** Programmes de la scène, enregistrés dans ses métadonnées. */
export const FX_PROGRAMS_KEY = `${PLUGIN_ID}/programmes`;
/** Échanges entre la fenêtre des programmes et l'arrière-plan, chez le MJ seulement. */
export const FX_PROGRAM_CHANNEL = `${PLUGIN_ID}/programme`;

export const MAX_ANCHORS = 8;
/** En dessous, un programme enchaînerait plus d'effets que la limite ne peut en jouer. */
export const MIN_INTERVAL = 0.2;
const MAX_SECONDS = 86400;
const MAX_SHOTS = 100000;

/** Point d'appui : une position sur la carte, ou un token que l'effet suit. */
export interface Anchor {
  at: Point;
  token?: { id: string; name: string };
}

export interface Timing {
  /** Intervalle entre deux tirs, en secondes. */
  min: number;
  max: number;
  /** Attente avant le premier tir, en secondes. */
  offset: number;
  /** Nombre de tirs avant l'arrêt, ou `null` pour ne jamais s'arrêter. */
  shots: number | null;
}

export interface Program extends FxCast, Timing {
  id: string;
  name: string;
  /** Nom du groupe, vide s'il n'en a pas. */
  group: string;
  /** Rayon, longueur ou côté dans l'unité de la scène, pour les styles de zone. */
  exact: number | null;
  anchors: Anchor[];
  active: boolean;
  /** Heure d'activation : c'est d'elle que chaque joueur déduit les tirs. */
  startedAt: number;
  /** L'effet reste sur son point jusqu'à ce qu'un nouveau tir l'y remplace. */
  permanent: boolean;
  /** Points tirés au hasard, ou parcourus dans l'ordre et en boucle. */
  order: PointOrder;
}

export type PointOrder = "random" | "sequence";

const clamp = (value: number, low: number, high: number) => Math.min(Math.max(value, low), high);

const seconds = (value: unknown, fallback: number, low: number) => {
  const number = typeof value === "number" ? value : Number.NaN;
  return clamp(Number.isFinite(number) ? number : fallback, low, MAX_SECONDS);
};

/** Remet les valeurs saisies dans des limites sûres, et le minimum avant le maximum. */
export function normalizeTiming(input: {
  min?: unknown;
  max?: unknown;
  offset?: unknown;
  shots?: unknown;
}): Timing {
  const first = seconds(input.min, 3, MIN_INTERVAL);
  const second = seconds(input.max, first, MIN_INTERVAL);
  const shots = typeof input.shots === "number" && input.shots >= 1 ? input.shots : null;
  return {
    min: Math.min(first, second),
    max: Math.max(first, second),
    offset: seconds(input.offset, 0, 0),
    shots: shots === null ? null : Math.min(Math.floor(shots), MAX_SHOTS),
  };
}

const isAnchor = (value: unknown): value is Anchor => {
  const anchor = value as Partial<Anchor> | null;
  return (
    isPoint(anchor?.at) &&
    (anchor.token === undefined ||
      (typeof anchor.token.id === "string" && typeof anchor.token.name === "string"))
  );
};

const isProgram = (value: unknown): value is Program => {
  const program = value as Partial<Program> | null;
  return (
    typeof program?.id === "string" &&
    typeof program.name === "string" &&
    typeof program.group === "string" &&
    isKeyOf(ELEMENTS, program.element) &&
    isKeyOf(STYLES, program.style) &&
    isKeyOf(SIZES, program.size) &&
    (program.exact === null || isExact(program.exact)) &&
    Array.isArray(program.anchors) &&
    program.anchors.every(isAnchor) &&
    typeof program.active === "boolean" &&
    Number.isFinite(program.startedAt)
  );
};

/** Relit la liste partagée : ce qui est invalide est écarté, les durées sont remises en limites. */
export function programsIn(metadata: Record<string, unknown>): Program[] {
  const saved = metadata[FX_PROGRAMS_KEY];
  if (!Array.isArray(saved)) return [];
  return saved
    .filter(isProgram)
    .slice(0, MAX_LIMIT)
    .map((program) => {
      // Les programmes enregistrés avant ces réglages restent éphémères et au hasard.
      const permanent = program.permanent === true;
      return {
        ...program,
        ...normalizeTiming(program),
        anchors: program.anchors.slice(0, MAX_ANCHORS),
        permanent,
        order: program.order === "sequence" ? ("sequence" as const) : ("random" as const),
      };
    });
}

export const anchorsNeeded = (style: StyleId) => (STYLES[style].directed ? 2 : 1);

/** Ce qui empêche d'enregistrer ce programme, ou rien s'il est complet. */
export function programProblem({ name, style, anchors }: Pick<Program, "name" | "style" | "anchors">) {
  if (!name.trim()) return t("program.needName");
  const needed = anchorsNeeded(style);
  if (anchors.length >= needed) return undefined;
  return needed === 1
    ? t("program.needOne")
    : t("program.needTwo");
}

/**
 * Hasard qui donne le même résultat chez tous les joueurs pour un même tir, sans message échangé.
 * Chaque activation a son propre tirage. Retourne un nombre de 0 à 1 (exclu).
 */
export function shotRandom({ id, startedAt }: Pick<Program, "id" | "startedAt">, index: number, slot: number) {
  let hash = (Math.floor(startedAt) ^ (index * 2654435761) ^ (slot * 40503)) >>> 0;
  for (let i = 0; i < id.length; i++) hash = Math.imul(hash ^ id.charCodeAt(i), 2166136261) >>> 0;
  hash = Math.imul(hash ^ (hash >>> 15), hash | 1);
  hash ^= hash + Math.imul(hash ^ (hash >>> 7), hash | 61);
  return ((hash ^ (hash >>> 14)) >>> 0) / 4294967296;
}

export interface Shot {
  index: number;
  /** Heure du tir, en millisecondes. */
  time: number;
}

export const firstShot = (program: Program): Shot => ({
  index: 0,
  time: program.startedAt + program.offset * 1000,
});

/** Le saut suivant part avant la fin du précédent : la chaîne se lit d'un seul trait. */
const CHAIN_HOP_OVERLAP = 0.6;

/** Attente entre le départ de deux sauts d'une chaîne. */
export const chainHopDelay = ({ size }: Pick<Program, "size">) =>
  scaledDuration(CHAIN_HOP_MS, SIZES[size]) * CHAIN_HOP_OVERLAP;

/** Temps qu'occupe un tir avant que l'intervalle ne commence : seule une chaîne en a besoin. */
export function shotDuration(program: Pick<Program, "style" | "size" | "anchors">) {
  if (program.style !== "chaine") return 0;
  const hops = Math.max(program.anchors.length - 1, 1);
  return (hops - 1) * chainHopDelay(program) + scaledDuration(CHAIN_HOP_MS, SIZES[program.size]);
}

/** Tir suivant, ou rien quand la série est terminée. */
export function nextShot(program: Program, { index, time }: Shot): Shot | undefined {
  const next = index + 1;
  if (program.shots !== null && next >= program.shots) return undefined;
  const wait = program.min + shotRandom(program, index, 0) * (program.max - program.min);
  return { index: next, time: time + shotDuration(program) + wait * 1000 };
}

/** Premier tir encore à venir à cet instant, pour un joueur qui arrive en cours de programme. */
export function shotAfter(program: Program, now: number): Shot | undefined {
  let shot: Shot | undefined = firstShot(program);
  while (shot && shot.time <= now) shot = nextShot(program, shot);
  return shot;
}

/**
 * Sauts d'une chaîne, dans l'ordre où ses points ont été placés. Un point absent (`undefined`) est
 * sauté, et deux points confondus à la suite ne font pas de saut.
 */
export function chainHops(points: (Point | undefined)[]) {
  const kept = points.filter((point): point is Point => point !== undefined);
  const path = kept.filter(
    (point, index) => index === 0 || point.x !== kept[index - 1].x || point.y !== kept[index - 1].y,
  );
  return path.slice(1).map((at, index) => ({ from: path[index], at }));
}

/**
 * Points d'appui d'un tir. Avec deux points, un effet dirigé va toujours du premier au second.
 * Avec plus de points, il relie deux d'entre eux au hasard, ou chacun au suivant en séquence.
 * Une chaîne passe par `chainHops`.
 */
export function shotAnchors(program: Program, index: number): { at: Anchor; from?: Anchor } | undefined {
  const { anchors, style, order } = program;
  if (anchors.length < anchorsNeeded(style)) return undefined;
  if (order === "sequence" && (!STYLES[style].directed || anchors.length > 2)) {
    const current = index % anchors.length;
    if (!STYLES[style].directed) return { at: anchors[current] };
    return { from: anchors[current], at: anchors[(current + 1) % anchors.length] };
  }
  const pick = (slot: number, count: number) => Math.floor(shotRandom(program, index, slot) * count);
  if (!STYLES[style].directed) return { at: anchors[pick(1, anchors.length)] };
  if (anchors.length === 2) return { from: anchors[0], at: anchors[1] };
  const from = pick(1, anchors.length);
  // On tire parmi les autres points, pour ne jamais relier un point à lui-même.
  const to = (from + 1 + pick(2, anchors.length - 1)) % anchors.length;
  return { from: anchors[from], at: anchors[to] };
}

/** Change l'état des programmes visés. Une même heure de départ garde leurs décalages alignés. */
export function withActive(programs: Program[], ids: string[], active: boolean, now: number): Program[] {
  return programs.map((program) =>
    ids.includes(program.id) && program.active !== active
      ? { ...program, active, startedAt: active ? now : program.startedAt }
      : program,
  );
}

export function withProgram(programs: Program[], program: Program): Program[] {
  return programs.some(({ id }) => id === program.id)
    ? programs.map((other) => (other.id === program.id ? program : other))
    : [...programs, program];
}

/** Sauts d'une chaîne permanente : les points absents sont sautés, deux points confondus n'en font qu'un. */
export function permanentChainHops(anchors: Anchor[], place: (anchor: Anchor) => Point | undefined) {
  const kept = anchors.filter((anchor) => place(anchor) !== undefined);
  const path = kept.filter((anchor, index) => {
    if (index === 0) return true;
    const [here, before] = [place(anchor)!, place(kept[index - 1])!];
    return here.x !== before.x || here.y !== before.y;
  });
  return path.slice(1).map((at, index) => ({ from: path[index], at }));
}

/** Un même point placé deux fois est un seul point : il porte le numéro de sa première place. */
const anchorRank = (anchors: Anchor[], anchor: Anchor) =>
  anchors.findIndex((other) =>
    anchor.token ? other.token?.id === anchor.token.id : !other.token && other.at.x === anchor.at.x && other.at.y === anchor.at.y,
  );

/** Le point qu'occupe un effet permanent : son départ et son arrivée s'il est dirigé, sinon le point visé. */
export const shotSlot = (anchors: Anchor[], shot: { at: Anchor; from?: Anchor }) =>
  shot.from ? `${anchorRank(anchors, shot.from)}>${anchorRank(anchors, shot.at)}` : String(anchorRank(anchors, shot.at));

/** Description de l'effet d'un tir. Son nom vient du tir : deux MJ qui le calculent écrivent la même chose. */
export const programEffect = (
  program: Program,
  index: number,
  slot: string,
  place: Pick<DurableEntry, "at" | "from" | "carrier" | "scale" | "owner" | "restAt">,
): DurableEntry => ({
  ...place,
  id: `${program.id}:${slot}:${program.startedAt}:${index}`,
  name: program.name,
  element: program.element,
  style: program.style,
  // La téléportation n'a pas de trace, juste sa boucle : la même graine ne la coupe pas d'un tir à l'autre.
  seed: shotRandom(program, program.style === "teleportation" ? 0 : index, 3) * 100,
  gmOnly: false,
  program: { id: program.id, slot },
});

/**
 * Pose l'effet d'un tir à la place de celui qui occupe déjà ce point. Un point encore libre doit
 * respecter la limite de la scène : sinon, la liste revient telle quelle et il n'y a rien à écrire.
 */
export function withProgramEffect(entries: DurableEntry[], effect: DurableEntry, limit: number) {
  if (entries.some(({ id }) => id === effect.id)) return entries;
  const occupied = ({ program }: DurableEntry) =>
    program?.id === effect.program?.id && program?.slot === effect.program?.slot;
  if (entries.some(occupied)) return entries.map((entry) => (occupied(entry) ? effect : entry));
  return entries.length < limit ? [...entries, effect] : entries;
}

export const withoutProgramEffects = (entries: DurableEntry[], ids: string[]) =>
  entries.filter(({ program }) => !program || !ids.includes(program.id));

/** Noms des groupes existants, dans l'ordre alphabétique. */
export const groupNames = (programs: Program[]) =>
  [...new Set(programs.map(({ group }) => group).filter(Boolean))].sort((a, b) => a.localeCompare(b, "fr"));

/**
 * Points à repérer pour le MJ : ceux des programmes inactifs et du programme en cours d'édition.
 * Celui-ci ne compte que par son brouillon : sa version enregistrée garderait un point déjà retiré.
 */
export const markedAnchors = (programs: Program[], draft: Anchor[], editing?: string) => [
  ...programs.filter(({ active, id }) => !active && id !== editing).flatMap(({ anchors }) => anchors),
  ...draft,
];

/** Le point le plus proche sous le pointeur, ou -1. `positions` donne où chacun se trouve vraiment. */
export function anchorNear(positions: Point[], pointer: Point, reach: number) {
  let found = -1;
  let closest = reach;
  positions.forEach(({ x, y }, index) => {
    const distance = Math.hypot(x - pointer.x, y - pointer.y);
    if (distance <= closest) {
      found = index;
      closest = distance;
    }
  });
  return found;
}

/** Échange un point avec son voisin. Au bord de la liste, rien ne change. */
export function moveAnchor(anchors: Anchor[], index: number, delta: -1 | 1): Anchor[] {
  const other = index + delta;
  if (!anchors[index] || !anchors[other]) return anchors;
  const next = [...anchors];
  [next[index], next[other]] = [next[other], next[index]];
  return next;
}

/** Numéros à afficher sur la carte : un même point utilisé plusieurs fois les regroupe, « 1, 3 ». */
export function anchorNumbers(anchors: Anchor[]) {
  const labels: { anchor: Anchor; text: string }[] = [];
  anchors.forEach((anchor, index) => {
    const same = labels.find(({ anchor: other }) =>
      anchor.token ? other.token?.id === anchor.token.id : !other.token && other.at.x === anchor.at.x && other.at.y === anchor.at.y,
    );
    if (same) same.text = `${same.text}, ${index + 1}`;
    else labels.push({ anchor, text: String(index + 1) });
  });
  return labels;
}
