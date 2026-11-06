import type { Matrix, Uniform } from "@owlbear-rodeo/sdk";
import {
  arrowDuration,
  CHAIN_HOP_MS,
  coneTarget,
  effectScale,
  ELEMENTS,
  projectileDuration,
  scaledDuration,
  STYLES,
  teleportTiming,
  type ElementId,
  type FxMessage,
  type Point,
} from "./fx";
import {
  ARROW_SKSL,
  AURA_SKSL,
  BEAM_SKSL,
  BITE_SKSL,
  CLOUD_SKSL,
  CONE_SKSL,
  CUBE_SKSL,
  DOME_SKSL,
  EXPLOSION_SKSL,
  FLAME_SKSL,
  HEAL_SKSL,
  METEOR_SKSL,
  PROJECTILE_SKSL,
  RAIN_SKSL,
  SLASH_SKSL,
  TELEPORT_SKSL,
  TRANSFORMATION_SKSL,
  WALL_SKSL,
} from "./fx-shaders";

/**
 * Déroulé d'un effet bref, sans rien savoir de l'endroit où il est dessiné : Owlbear dans
 * l'extension, un canvas WebGL sur le site. `animate` joue un shader de `t` = 0 à 1.
 */
export type Animate = (sksl: string, position: Point, uniforms: Uniform[], duration: number) => Promise<void>;

/** `unit` suit la taille de l'effet, pour que l'ondulation garde les mêmes proportions. */
export const commonUniforms = (element: ElementId, seed: number, unit: number): Uniform[] => {
  const look = ELEMENTS[element];
  return [
    { name: "palette", value: look.palette.flat() as unknown as Matrix },
    { name: "seed", value: seed },
    { name: "warp", value: look.warp },
    { name: "unit", value: unit },
    { name: "sonic", value: look.sonic },
  ];
};

function explosion(
  animate: Animate,
  at: Point,
  radius: number,
  element: ElementId,
  seed: number,
  unit: number,
  duration: number,
) {
  const look = ELEMENTS[element];
  return animate(
    EXPLOSION_SKSL,
    at,
    [
      ...commonUniforms(element, seed, unit),
      { name: "smoke", value: { x: look.smoke[0], y: look.smoke[1], z: look.smoke[2] } },
      { name: "radius", value: radius },
      { name: "rough", value: look.rough },
      { name: "shock", value: look.shock },
    ],
    duration,
  );
}

export const vector = (from: Point, to: Point): Point => ({ x: to.x - from.x, y: to.y - from.y });

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function playEffect(message: FxMessage, dpi: number, animate: Animate) {
  const { at, element, seed, size, style } = message;
  const from = message.from ?? at;
  const scale = effectScale(message.style, size, message.cells);
  const look = ELEMENTS[element];
  const unit = dpi * scale;
  const common = commonUniforms(element, seed, unit);

  switch (style) {
    case "explosion":
      await explosion(animate, at, dpi * STYLES.explosion.reach * scale, element, seed, unit, scaledDuration(1500, scale));
      break;
    case "projectile":
      await animate(
        PROJECTILE_SKSL,
        from,
        [
          ...common,
          { name: "target", value: vector(from, at) },
          { name: "width", value: dpi * 0.13 * scale },
        ],
        projectileDuration(from, at, dpi),
      );
      await explosion(animate, at, dpi * scale, element, seed, unit, scaledDuration(1000, scale));
      break;
    case "fleche":
      await animate(
        ARROW_SKSL,
        from,
        [
          // Une flèche reste droite, même dans un élément qui ondule.
          ...common.filter(({ name }) => name !== "warp"),
          { name: "warp", value: 0 },
          { name: "target", value: vector(from, at) },
          { name: "width", value: dpi * 0.045 * scale },
        ],
        arrowDuration(from, at, dpi),
      );
      await explosion(animate, at, dpi * 0.4 * scale, element, seed, unit, scaledDuration(500, scale));
      break;
    case "coup":
    case "griffes":
      await animate(
        SLASH_SKSL,
        at,
        [
          ...common,
          { name: "radius", value: dpi * STYLES[style].reach * scale },
          { name: "claws", value: style === "griffes" ? 1 : 0 },
          { name: "dir", value: message.angle ?? -1 },
        ],
        scaledDuration(650, scale),
      );
      break;
    case "morsure":
      await animate(
        BITE_SKSL,
        at,
        [...common, { name: "radius", value: dpi * STYLES.morsure.reach * scale }],
        scaledDuration(800, scale),
      );
      break;
    case "pluie":
      await animate(
        RAIN_SKSL,
        at,
        [
          ...common,
          { name: "radius", value: dpi * STYLES.pluie.reach * scale },
          { name: "stretch", value: look.stretch },
          { name: "fallSpeed", value: look.fallSpeed },
        ],
        scaledDuration(3000, scale),
      );
      break;
    case "rayon":
      await animate(
        BEAM_SKSL,
        from,
        [
          ...common,
          { name: "target", value: vector(from, at) },
          { name: "width", value: dpi * 0.16 * scale },
          { name: "jag", value: look.jag },
          { name: "radiant", value: look.radiant },
        ],
        scaledDuration(1000, scale),
      );
      break;
    case "chaine":
      // En zigzag, ce qui se lit comme un arc, sauf pour une énergie pure ou une onde.
      await Promise.all([
        animate(
          BEAM_SKSL,
          from,
          [
            ...common,
            { name: "target", value: vector(from, at) },
            { name: "width", value: dpi * 0.1 * scale },
            { name: "jag", value: look.radiant || look.sonic ? 0 : Math.max(look.jag, 0.8) },
            { name: "radiant", value: look.radiant },
          ],
          scaledDuration(CHAIN_HOP_MS, scale),
        ),
        explosion(animate, at, dpi * 0.6 * scale, element, seed, unit, scaledDuration(CHAIN_HOP_MS, scale)),
      ]);
      break;
    case "cone":
      await animate(
        CONE_SKSL,
        from,
        [
          ...common,
          { name: "target", value: coneTarget(from, at, dpi * STYLES.cone.reach * scale) },
          { name: "smoke", value: { x: look.smoke[0], y: look.smoke[1], z: look.smoke[2] } },
          { name: "rough", value: look.rough },
          { name: "radiant", value: look.radiant },
        ],
        scaledDuration(1200, scale),
      );
      break;
    case "mur":
      await animate(
        WALL_SKSL,
        from,
        [
          ...common,
          { name: "target", value: vector(from, at) },
          { name: "width", value: dpi * 0.32 * scale },
          { name: "rough", value: look.rough },
        ],
        scaledDuration(3500, scale),
      );
      break;
    case "dome":
      await animate(
        DOME_SKSL,
        at,
        [...common, { name: "radius", value: dpi * STYLES.dome.reach * scale }],
        scaledDuration(3000, scale),
      );
      break;
    case "cube":
      await animate(
        CUBE_SKSL,
        at,
        [
          ...common,
          { name: "radius", value: (dpi * STYLES.cube.reach * scale) / 2 },
          { name: "angle", value: message.angle ?? 0 },
        ],
        scaledDuration(3000, scale),
      );
      break;
    case "aura":
      await animate(
        AURA_SKSL,
        at,
        [...common, { name: "radius", value: dpi * STYLES.aura.reach * scale }],
        scaledDuration(2200, scale),
      );
      break;
    case "meteore":
      await animate(
        METEOR_SKSL,
        at,
        [
          ...common,
          { name: "smoke", value: { x: look.smoke[0], y: look.smoke[1], z: look.smoke[2] } },
          { name: "radius", value: dpi * STYLES.meteore.reach * scale },
          { name: "rough", value: look.rough },
        ],
        scaledDuration(2600, scale),
      );
      break;
    case "flamme":
      await animate(
        FLAME_SKSL,
        at,
        [...common, { name: "radius", value: dpi * STYLES.flamme.reach * scale }],
        scaledDuration(3000, scale),
      );
      break;
    case "transformation":
      await animate(
        TRANSFORMATION_SKSL,
        at,
        [...common, { name: "radius", value: dpi * STYLES.transformation.reach * scale }],
        scaledDuration(2600, scale),
      );
      break;
    case "nuage":
      await animate(
        CLOUD_SKSL,
        at,
        [
          ...common,
          { name: "smoke", value: { x: look.smoke[0], y: look.smoke[1], z: look.smoke[2] } },
          { name: "radius", value: dpi * STYLES.nuage.reach * scale },
          { name: "density", value: look.density },
        ],
        scaledDuration(4000, scale),
      );
      break;
    case "soin":
      await animate(
        HEAL_SKSL,
        at,
        [...common, { name: "radius", value: dpi * STYLES.soin.reach * scale }],
        scaledDuration(1800, scale),
      );
      break;
    case "teleportation": {
      const uniforms = [...common, { name: "radius", value: dpi * scale }];
      const { duration, arrivalDelay } = teleportTiming(size);
      await Promise.all([
        animate(TELEPORT_SKSL, from, [...uniforms, { name: "appear", value: 0 }], duration),
        wait(arrivalDelay).then(() =>
          animate(TELEPORT_SKSL, at, [...uniforms, { name: "appear", value: 1 }], duration),
        ),
      ]);
      break;
    }
  }
}
