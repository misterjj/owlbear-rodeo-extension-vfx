import OBR, { buildEffect, buildShape, isEffect, type Item, type ToolEvent, type Uniform } from "@owlbear-rodeo/sdk";
import {
  FX_CHANNEL,
  FX_SOURCE_ID,
  FX_TOOL_ID,
  parseFxMessage,
  projectileDuration,
  type FxMessage,
  type Point,
} from "./fx";
import { EXPLOSION_SKSL, PROJECTILE_SKSL } from "./fx-shaders";

const EXPLOSION_MS = 1500;
const IMPACT_MS = 1000;
const FRAME_MS = 33;
/** Au-delà, un nouvel effet est ignoré pour ne pas ralentir les petites machines. */
const MAX_ACTIVE = 6;

let active = 0;

const warn = (error: unknown) => console.warn("Effets :", error);

/** Joue l'effet puis le retire, même si des mises à jour échouent en route. */
function animate(sksl: string, position: Point, uniforms: Uniform[], duration: number) {
  return new Promise<void>((resolve) => {
    const item = buildEffect()
      .effectType("VIEWPORT")
      .sksl(sksl)
      .position(position)
      .uniforms([{ name: "t", value: 0 }, ...uniforms])
      .blendMode("SRC_OVER")
      .layer("POINTER")
      .locked(true)
      .disableHit(true)
      .build();

    const finish = () => {
      active--;
      OBR.scene.local.deleteItems([item.id]).catch(warn).finally(resolve);
    };

    active++;
    OBR.scene.local.addItems([item]).then(() => {
      const start = performance.now();
      let sending = false;
      const timer = setInterval(() => {
        const elapsed = performance.now() - start;
        if (elapsed >= duration) {
          clearInterval(timer);
          finish();
          return;
        }
        // Une mise à jour lente ne doit pas s'empiler avec les suivantes.
        if (sending) return;
        sending = true;
        OBR.scene.local
          .updateItems([item], (drafts) => {
            for (const draft of drafts) {
              if (isEffect(draft)) {
                draft.uniforms = [{ name: "t", value: elapsed / duration }, ...uniforms];
              }
            }
          })
          .catch(warn)
          .finally(() => {
            sending = false;
          });
      }, FRAME_MS);
    }, (error) => {
      warn(error);
      finish();
    });
  });
}

function explosion(at: Point, radius: number, seed: number, duration: number) {
  return animate(
    EXPLOSION_SKSL,
    at,
    [
      { name: "radius", value: radius },
      { name: "seed", value: seed },
    ],
    duration,
  );
}

async function play(message: FxMessage) {
  if (active >= MAX_ACTIVE || !(await OBR.scene.isReady())) return;
  const dpi = await OBR.scene.grid.getDpi();
  if (message.type === "explosion") {
    await explosion(message.at, dpi * 2.5, message.seed, EXPLOSION_MS);
    return;
  }
  const { from, to, seed } = message;
  await animate(
    PROJECTILE_SKSL,
    from,
    [
      { name: "target", value: { x: to.x - from.x, y: to.y - from.y } },
      { name: "width", value: dpi * 0.13 },
      { name: "seed", value: seed },
    ],
    projectileDuration(from, to, dpi),
  );
  await explosion(to, dpi, seed, IMPACT_MS);
}

function send(message: FxMessage) {
  OBR.broadcast.sendMessage(FX_CHANNEL, message, { destination: "ALL" }).catch(warn);
}

const randomSeed = () => Math.random() * 100;

/** Un clic sur un token vise son centre. */
function clickPoint(event: ToolEvent): Point {
  const target: Item | undefined = event.target;
  return target && (target.layer === "CHARACTER" || target.layer === "MOUNT")
    ? target.position
    : event.pointerPosition;
}

let source: Point | undefined;

async function clearSource() {
  source = undefined;
  await OBR.scene.local.deleteItems([FX_SOURCE_ID]).catch(warn);
}

async function markSource(point: Point) {
  source = point;
  const dpi = await OBR.scene.grid.getDpi();
  const marker = buildShape()
    .id(FX_SOURCE_ID)
    .shapeType("CIRCLE")
    .width(dpi)
    .height(dpi)
    .position(point)
    .fillOpacity(0)
    .strokeColor("#ff7a18")
    .strokeOpacity(1)
    .strokeWidth(dpi * 0.04)
    .layer("POINTER")
    .locked(true)
    .disableHit(true)
    .build();
  await OBR.scene.local.addItems([marker]).catch(warn);
}

function createTool() {
  const whenActive = { activeTools: [FX_TOOL_ID], roles: ["GM" as const] };
  const cursors = [{ cursor: "crosshair" }];
  OBR.tool.create({
    id: FX_TOOL_ID,
    icons: [{ icon: "/vfx/outil.svg", label: "Effets", filter: { roles: ["GM"] } }],
    disabled: { roles: ["PLAYER"] },
    defaultMode: `${FX_TOOL_ID}/explosion`,
  });
  OBR.tool.createMode({
    id: `${FX_TOOL_ID}/explosion`,
    icons: [{ icon: "/vfx/explosion.svg", label: "Explosion de feu : clique sur la carte", filter: whenActive }],
    cursors,
    onToolClick(_context, event) {
      send({ type: "explosion", at: clickPoint(event), seed: randomSeed() });
      return false;
    },
  });
  OBR.tool.createMode({
    id: `${FX_TOOL_ID}/projectile`,
    icons: [{ icon: "/vfx/projectile.svg", label: "Projectile de feu : clique sur le lanceur, puis sur la cible", filter: whenActive }],
    cursors,
    onToolClick(_context, event) {
      const point = clickPoint(event);
      if (source) {
        send({ type: "projectile", from: source, to: point, seed: randomSeed() });
        clearSource();
      } else {
        markSource(point).catch(warn);
      }
      return false;
    },
    onKeyDown(_context, event) {
      if (event.key === "Escape") clearSource();
    },
    onDeactivate() {
      clearSource();
    },
  });
}

export function setupFx() {
  createTool();
  OBR.broadcast.onMessage(FX_CHANNEL, ({ data }) => {
    const message = parseFxMessage(data);
    if (message) play(message).catch(warn);
  });
}
