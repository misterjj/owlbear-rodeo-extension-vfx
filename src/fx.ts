const PLUGIN_ID = "vfx-owlbear";

export const FX_CHANNEL = `${PLUGIN_ID}/effets`;
export const FX_TOOL_ID = `${PLUGIN_ID}/outil`;
export const FX_SOURCE_ID = `${PLUGIN_ID}/lanceur`;

export interface Point {
  x: number;
  y: number;
}

/** La graine est transmise pour que l'effet ait la même forme chez tous les joueurs. */
export type FxMessage =
  | { type: "explosion"; at: Point; seed: number }
  | { type: "projectile"; from: Point; to: Point; seed: number };

const isPoint = (value: unknown): value is Point => {
  const point = value as Partial<Point> | null;
  return Number.isFinite(point?.x) && Number.isFinite(point?.y);
};

/** Le message vient du réseau : tout le reste est ignoré. */
export function parseFxMessage(data: unknown): FxMessage | undefined {
  const message = data as Partial<Record<"type" | "at" | "from" | "to" | "seed", unknown>> | null;
  if (typeof message?.seed !== "number" || !Number.isFinite(message.seed)) return undefined;
  const seed = message.seed;
  if (message.type === "explosion" && isPoint(message.at)) {
    return { type: "explosion", at: message.at, seed };
  }
  if (message.type === "projectile" && isPoint(message.from) && isPoint(message.to)) {
    return { type: "projectile", from: message.from, to: message.to, seed };
  }
  return undefined;
}

/** Un projectile vole à vitesse constante, sans être trop bref ni trop long. */
export function projectileDuration(from: Point, to: Point, dpi: number) {
  const cells = Math.hypot(to.x - from.x, to.y - from.y) / dpi;
  return Math.min(800, Math.max(220, cells * 70));
}
