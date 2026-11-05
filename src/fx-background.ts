import { t } from "./i18n";
import OBR, {
  buildCurve,
  buildEffect,
  buildLabel,
  buildLine,
  buildShape,
  isCurve,
  isEffect,
  type Item,
  type Matrix,
  type ToolEvent,
  type Uniform,
  type Player,
} from "@owlbear-rodeo/sdk";
import {
  ELEMENTS,
  FX_CHANNEL,
  FX_DURABLE_ITEM_PREFIX,
  FX_DURABLE_KEY,
  FX_PREVIEW_ID,
  FX_SOURCE_ID,
  FX_TOOL_ID,
  FX_UI_CHANNEL,
  FX_WHEEL_CHANNEL,
  FX_WHEEL_ID,
  DEFAULT_LIMIT,
  STYLES,
  arrowDuration,
  buildMessage,
  coneTarget,
  defaultSpellName,
  cubeOnFace,
  aimsFromToken,
  directionAngle,
  appearAt,
  castTiming,
  isSustained,
  durableChanges,
  dueDurables,
  LEAVES_TRACE,
  restDelay,
  durableItemId,
  durablesIn,
  effectScale,
  exactCells,
  firesFromToken,
  startsOnFace,
  fitsCellCenter,
  isDurable,
  loadChoice,
  parseFxMessage,
  parseWheelCast,
  playerCooldownOver,
  limitsIn,
  othersLimit,
  playersAllowedIn,
  previewOutline,
  projectileDuration,
  sameDurable,
  scaledDuration,
  teleportTiming,
  tokenAt,
  type ElementId,
  CHAIN_HOP_MS,
  type DurableEntry,
  type Favorite,
  type FxChoice,
  type FxMessage,
  type Point,
  type TokenArea,
} from "./fx";
import {
  anchorNear,
  anchorNumbers,
  FX_PROGRAMS_KEY,
  FX_PROGRAM_CHANNEL,
  markedAnchors,
  nextShot,
  permanentChainHops,
  programEffect,
  shotSlot,
  withProgramEffect,
  chainHopDelay,
  chainHops,
  programsIn,
  shotDuration,
  shotAfter,
  shotAnchors,
  shotRandom,
  sceneWriter,
  withActive,
  type Anchor,
  type Program,
  type Shot,
} from "./fx-programs";
import {
  ARROW_SKSL,
  AURA_SKSL,
  BEAM_SKSL,
  BITE_SKSL,
  CLOUD_SKSL,
  CONE_SKSL,
  CUBE_SKSL,
  DOME_SKSL,
  DURABLE_SKSL,
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

const WHEEL_SIZE = 380;
const OWLBEAR_MOVE_TOOL = "rodeo.owlbear.tool/move";
const FRAME_MS = 33;
/** Un tir plus ancien est abandonné : l'onglet était en arrière-plan, ou la machine en retard. */
const STALE_SHOT_MS = 1500;
const PROGRAM_TICK_MS = 100;
const FX_MARKER_PREFIX = "vfx-owlbear/repere/";

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
      // Sous le brouillard de guerre : un effet dans une zone cachée ne doit rien trahir.
      .layer("RULER")
      .locked(true)
      .disableHit(true)
      .build();

    const finish = () => {
      active--;
      OBR.scene.local.deleteItems([item.id]).catch(warn).finally(resolve);
    };

    active++;
    OBR.scene.local.addItems([item]).then(
      () => {
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
      },
      (error) => {
        warn(error);
        finish();
      },
    );
  });
}

/** `unit` suit la taille de l'effet, pour que l'ondulation garde les mêmes proportions. */
const commonUniforms = (element: ElementId, seed: number, unit: number): Uniform[] => {
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

const vector = (from: Point, to: Point): Point => ({ x: to.x - from.x, y: to.y - from.y });

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function play(message: FxMessage, limit: number) {
  if (active >= limit || !(await OBR.scene.isReady())) return;
  const dpi = await OBR.scene.grid.getDpi();
  const { at, element, seed, size, style } = message;
  const from = message.from ?? at;
  const scale = effectScale(message.style, size, message.cells);
  const look = ELEMENTS[element];
  const unit = dpi * scale;
  const common = commonUniforms(element, seed, unit);

  switch (style) {
    case "explosion":
      await explosion(at, dpi * STYLES.explosion.reach * scale, element, seed, unit, scaledDuration(1500, scale));
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
      await explosion(at, dpi * scale, element, seed, unit, scaledDuration(1000, scale));
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
      await explosion(at, dpi * 0.4 * scale, element, seed, unit, scaledDuration(500, scale));
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
        explosion(at, dpi * 0.6 * scale, element, seed, unit, scaledDuration(CHAIN_HOP_MS, scale)),
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

function send(message: FxMessage) {
  OBR.broadcast.sendMessage(FX_CHANNEL, message, { destination: "ALL" }).catch(warn);
}

const randomSeed = () => Math.random() * 100;

let role: "GM" | "PLAYER" = "PLAYER";
let ownConnection = "";
let otherGMs: string[] = [];

/** Plusieurs MJ calculent les mêmes tirs : un seul écrit, sinon leurs écritures s'effacent. */
const writesScene = (startedBy?: string) =>
  role === "GM" &&
  ownConnection !== "" &&
  sceneWriter([ownConnection, ...otherGMs], startedBy) === ownConnection;

const readOtherGMs = (players: Player[]) => {
  otherGMs = players
    .filter(({ role: other, connectionId }) => other === "GM" && connectionId !== ownConnection)
    .map(({ connectionId }) => connectionId);
};
let playersAllowed = false;
let durableLimit = DEFAULT_LIMIT;
/** Au-delà, un nouvel effet est ignoré pour ne pas ralentir les petites machines. */
let simultaneousLimit = DEFAULT_LIMIT;

/** Zones des tokens, gardées tant que rien ne bouge : l'aperçu les lit à chaque mouvement. */
let tokenAreas: Promise<TokenArea[]> | undefined;

function loadTokenAreas() {
  tokenAreas ??= (async () => {
    // Un joueur ne doit pas deviner un token caché en voyant l'effet s'y centrer.
    const tokens = await OBR.scene.items.getItems(
      (item) =>
        (item.layer === "CHARACTER" || item.layer === "MOUNT") && (role === "GM" || item.visible),
    );
    return Promise.all(
      tokens.map(async ({ id, name, createdUserId, layer, zIndex }) => ({
        ...(await OBR.scene.items.getItemBounds([id])),
        id,
        name,
        owner: createdUserId,
        layer,
        zIndex,
      })),
    );
  })().catch((error) => {
    tokenAreas = undefined;
    throw error;
  });
  return tokenAreas;
}

/**
 * Un clic sur un token vise son centre. Owlbear ne désigne pas toujours le token dans
 * `event.target`, et sa position n'est pas forcément son centre : on se fie donc à son emprise.
 */
const tokenUnderPointer = (event: ToolEvent) =>
  loadTokenAreas()
    .then((areas) => tokenAt(event.pointerPosition, areas))
    .catch((error) => {
      warn(error);
      return undefined;
    });

/** Valeur d'une case dans l'unité de la scène. */
const cellValue = async () => (await OBR.scene.grid.getScale()).parsed.multiplier;

let source: Point | undefined;
const REPEATED_CLICK_MS = 400;
let sourceMarkedAt = 0;
/** Token sur lequel le lanceur a été posé, s'il y en a un. */
let sourceToken: TokenArea | undefined;

async function hidePreview() {
  previewShown = false;
  await OBR.scene.local.deleteItems([FX_PREVIEW_ID]).catch(warn);
}

/** Le panneau propose d'annuler tant qu'un premier point attend le second. */
const postAimState = (active: boolean) =>
  OBR.broadcast.sendMessage(FX_UI_CHANNEL, { type: "aim-state", active }, { destination: "LOCAL" }).catch(warn);

async function clearSource() {
  if (source) postAimState(false);
  source = undefined;
  sourceToken = undefined;
  await Promise.all([OBR.scene.local.deleteItems([FX_SOURCE_ID]).catch(warn), hidePreview()]);
}

async function markSource(point: Point, token?: TokenArea) {
  source = point;
  sourceToken = token;
  sourceMarkedAt = performance.now();
  postAimState(true);
  const dpi = await OBR.scene.grid.getDpi();
  const marker = buildShape()
    .id(FX_SOURCE_ID)
    .shapeType("CIRCLE")
    .width(dpi)
    .height(dpi)
    .position(point)
    .fillOpacity(0)
    .strokeColor("#bb99ff")
    .strokeOpacity(1)
    .strokeWidth(dpi * 0.04)
    .layer("POINTER")
    .locked(true)
    .disableHit(true)
    .build();
  await OBR.scene.local.deleteItems([FX_SOURCE_ID]).catch(warn);
  await OBR.scene.local.addItems([marker]).catch(warn);
}

/** Réglages de l'effet tiré d'une description, au point où il doit se trouver. */
function durableSpec(entry: DurableEntry, at: Point, dpi: number) {
  const { element, style, scale, seed, from } = entry;
  const look = ELEMENTS[element];
  const common = commonUniforms(element, seed, dpi * scale);
  const radius = { name: "radius", value: dpi * STYLES[style].reach * scale };
  const start = from ?? at;
  const smoke = { name: "smoke", value: { x: look.smoke[0], y: look.smoke[1], z: look.smoke[2] } };
  const cycle = (ms: number) => ({ name: "cycle", value: ms / 1000 });
  switch (style) {
    case "aura":
    case "dome":
    case "transformation":
    case "flamme":
      return { sksl: DURABLE_SKSL[style], position: at, uniforms: [...common, radius] };
    case "cube":
      return {
        sksl: DURABLE_SKSL.cube,
        position: at,
        uniforms: [...common, { ...radius, value: radius.value / 2 }, { name: "angle", value: entry.angle ?? 0 }],
      };
    case "pluie":
      return {
        sksl: DURABLE_SKSL.pluie,
        position: at,
        uniforms: [
          ...common,
          radius,
          { name: "stretch", value: look.stretch },
          { name: "fallSpeed", value: look.fallSpeed },
        ],
      };
    case "nuage":
      return {
        sksl: DURABLE_SKSL.nuage,
        position: at,
        uniforms: [
          ...common,
          { name: "smoke", value: { x: look.smoke[0], y: look.smoke[1], z: look.smoke[2] } },
          radius,
          { name: "density", value: look.density },
        ],
      };
    case "mur":
      return {
        sksl: DURABLE_SKSL.mur,
        position: from ?? at,
        uniforms: [
          ...common,
          { name: "target", value: vector(from ?? at, at) },
          { name: "width", value: dpi * 0.32 * scale },
          { name: "rough", value: look.rough },
        ],
      };
    case "soin":
      return { sksl: DURABLE_SKSL.soin, position: at, uniforms: [...common, radius] };
    case "rayon":
    case "chaine":
      return {
        sksl: DURABLE_SKSL[style],
        position: start,
        uniforms: [
          ...common,
          { name: "target", value: vector(start, at) },
          { name: "width", value: dpi * (style === "rayon" ? 0.16 : 0.1) * scale },
          // En zigzag, ce qui se lit comme un arc, sauf pour une énergie pure ou une onde.
          { name: "jag", value: style === "rayon" ? look.jag : look.radiant || look.sonic ? 0 : Math.max(look.jag, 0.8) },
          { name: "radiant", value: look.radiant },
        ],
      };
    case "cone":
      return {
        sksl: DURABLE_SKSL.cone,
        position: start,
        uniforms: [
          ...common,
          { name: "target", value: coneTarget(start, at, dpi * STYLES.cone.reach * scale) },
          smoke,
          { name: "rough", value: look.rough },
          { name: "radiant", value: look.radiant },
        ],
      };
    case "fleche":
      return {
        sksl: DURABLE_SKSL.fleche,
        position: start,
        uniforms: [
          // Une flèche reste droite, même dans un élément qui ondule.
          ...common.filter(({ name }) => name !== "warp"),
          { name: "warp", value: 0 },
          { name: "target", value: vector(start, at) },
          { name: "width", value: dpi * 0.045 * scale },
        ],
      };
    case "projectile":
      // Le sol brûlé sous l'impact : ses dimensions suivent celles de l'explosion qu'il laisse.
      return { sksl: DURABLE_SKSL.projectile, position: at, uniforms: [...common, smoke, { name: "radius", value: dpi * scale * 0.75 }] };
    case "explosion":
    case "meteore":
      return {
        sksl: DURABLE_SKSL[style],
        position: at,
        uniforms: [...common, smoke, { ...radius, value: radius.value * (style === "explosion" ? 0.75 : 0.62) }],
      };
    case "coup":
    case "griffes":
      return {
        sksl: DURABLE_SKSL[style],
        position: at,
        uniforms: [
          ...common,
          radius,
          { name: "claws", value: style === "griffes" ? 1 : 0 },
          { name: "dir", value: entry.angle ?? -1 },
        ],
      };
    case "morsure":
      return { sksl: DURABLE_SKSL.morsure, position: at, uniforms: [...common, radius] };
    case "teleportation":
      return {
        sksl: DURABLE_SKSL.teleportation,
        position: start,
        uniforms: [
          ...common,
          cycle(scaledDuration(1500, scale)),
          { name: "radius", value: dpi * scale },
          { name: "target", value: vector(start, at) },
        ],
      };
  }
}

async function addDurableItem(entry: DurableEntry, carriers: Map<string, Item>, dpi: number) {
  const carrier = entry.carrier && carriers.get(entry.carrier.id);
  // La position vient du token à cet instant : il a pu bouger depuis que l'effet a été lancé.
  const center = carrier ? (await OBR.scene.items.getItemBounds([carrier.id])).center : entry.at;
  const at = carrier && entry.offset
    ? { x: center.x + entry.offset.x, y: center.y + entry.offset.y }
    : center;
  const spec = durableSpec(entry, at, dpi);
  const sustained = isSustained(entry.style);
  const delay = restDelay(entry.style, entry.scale, entry.from ?? at, at, dpi);
  const builder = buildEffect()
    .id(durableItemId(entry.id))
    .effectType("VIEWPORT")
    .sksl(spec.sksl)
    .position(spec.position)
    .uniforms(sustained ? [...spec.uniforms, { name: "appear", value: appearAt(entry.enterAt, Date.now(), delay) }] : spec.uniforms)
    .blendMode("SRC_OVER")
    // Sous le brouillard de guerre, comme la météo d'Owlbear.
    .layer("RULER")
    .locked(true)
    .disableHit(true);
  if (carrier) {
    // Il suit le token et disparaît avec lui, mais sa zone ne dépend ni de sa taille ni de sa rotation.
    builder
      .attachedTo(carrier.id)
      .visible(carrier.visible)
      .disableAttachmentBehavior(["SCALE", "ROTATION", "LOCKED"]);
  }
  await OBR.scene.local.addItems([builder.build()]);
  if (sustained) growIn(durableItemId(entry.id), entry.enterAt, delay);
}

/** Fait apparaître un effet qui tient, sur l'objet lui-même. Il s'arrête au milieu de sa vie et y reste. */
function growIn(itemId: string, enterAt: number | undefined, delay: number) {
  if (appearAt(enterAt, Date.now(), delay) >= 0.5) return;
  let sending = false;
  const timer = setInterval(() => {
    if (sending) return;
    const appear = appearAt(enterAt, Date.now(), delay);
    if (appear >= 0.5) clearInterval(timer);
    sending = true;
    OBR.scene.local
      .updateItems([itemId], (drafts) => {
        for (const draft of drafts) {
          if (isEffect(draft)) {
            draft.uniforms = draft.uniforms.map((uniform) => (uniform.name === "appear" ? { ...uniform, value: appear } : uniform));
          }
        }
      })
      .catch(warn)
      .finally(() => {
        sending = false;
      });
  }, FRAME_MS);
}

/** Aligne les effets locaux de ce joueur sur la description partagée. */
async function reconcileDurables() {
  if (!(await OBR.scene.isReady())) return;
  const [metadata, items, dpi] = await Promise.all([
    OBR.scene.getMetadata(),
    OBR.scene.items.getItems(),
    OBR.scene.grid.getDpi(),
  ]);
  const entries = durablesIn(metadata);
  const carriers = new Map(items.map((item) => [item.id, item]));
  syncPrograms(programsIn(metadata));
  await syncMarkers(items.map(({ id }) => id), dpi);
  const local = await OBR.scene.local.getItems((item) =>
    item.id.startsWith(FX_DURABLE_ITEM_PREFIX),
  );
  const { add: wanted, remove } = durableChanges(
    entries,
    local.map(({ id }) => id),
    role,
    (id) => carriers.has(id),
  );
  // Un effet qui suit une animation n'apparaît qu'à son heure.
  const { due: add, next } = dueDurables(wanted, Date.now());
  if (next !== undefined) setTimeout(() => void scheduleReconcile(), Math.max(next - Date.now(), 0) + 10);
  // Dans cet ordre : un effet remplacé ne laisse pas de trou à l'écran.
  await Promise.all(add.map((entry) => addDurableItem(entry, carriers, dpi)));
  if (remove.length) await OBR.scene.local.deleteItems(remove);
  // L'effet d'un token révélé ou caché suit le changement.
  const stale = local.filter(
    ({ attachedTo, visible }) =>
      attachedTo && carriers.has(attachedTo) && carriers.get(attachedTo)?.visible !== visible,
  );
  if (stale.length) {
    await OBR.scene.local.updateItems(
      stale.map(({ id }) => id),
      (drafts) => {
        for (const draft of drafts) {
          const carrier = draft.attachedTo ? carriers.get(draft.attachedTo) : undefined;
          if (carrier) draft.visible = carrier.visible;
        }
      },
    );
  }
  // Le porteur a été supprimé : le MJ nettoie la description pour tout le monde.
  const orphans = entries.filter(({ carrier }) => carrier && !carriers.has(carrier.id));
  if (writesScene() && orphans.length) await saveDurables(entries.filter((e) => !orphans.includes(e)));
}

let programs: Program[] = [];
let programTimer: ReturnType<typeof setInterval> | undefined;
const programClocks = new Map<
  string,
  { startedAt: number; shot: Shot | undefined; busyUntil: number; placing?: Promise<void> }
>();
/** Points du programme en cours d'édition dans la fenêtre du MJ. */
let draftAnchors: Anchor[] = [];
/** Le programme que ce brouillon modifie : ses points enregistrés ne sont plus à jour. */
let draftProgram: string | undefined;
let markerSignature = "";

/** Démarre l'horloge seulement s'il y a un programme actif, et oublie ceux qui ont disparu. */
function syncPrograms(list: Program[]) {
  programs = list;
  const ids = new Set(list.filter(({ active }) => active).map(({ id }) => id));
  for (const id of programClocks.keys()) if (!ids.has(id)) programClocks.delete(id);
  if (ids.size && !programTimer) programTimer = setInterval(runPrograms, PROGRAM_TICK_MS);
  if (!ids.size && programTimer) {
    clearInterval(programTimer);
    programTimer = undefined;
  }
}

function runPrograms() {
  const now = Date.now();
  for (const program of programs) {
    if (!program.active) continue;
    let clock = programClocks.get(program.id);
    if (!clock || clock.startedAt !== program.startedAt) {
      // On repart un peu en arrière : le premier tir d'un programme tout juste activé est déjà échu.
      clock = { startedAt: program.startedAt, shot: shotAfter(program, now - STALE_SHOT_MS), busyUntil: 0 };
      programClocks.set(program.id, clock);
    }
    while (clock.shot && clock.shot.time <= now) {
      if (now - clock.shot.time < STALE_SHOT_MS) {
        clock.busyUntil = clock.shot.time + shotDuration(program);
        const fired = fireProgram(program, clock.shot.index, clock.shot.time).catch(warn);
        if (program.permanent) clock.placing = fired;
      }
      clock.shot = nextShot(program, clock.shot);
    }
    // La dernière chaîne va jusqu'au bout avant que la série ne soit déclarée finie.
    // Le dernier effet permanent doit être posé avant que la série soit déclarée finie.
    if (!clock.shot && now >= clock.busyUntil) (clock.placing ?? Promise.resolve()).then(() => finishProgram(program));
  }
}

const finishing = new Set<string>();
/** Une écriture à la fois : deux séries finies ensemble effaceraient chacune la fin de l'autre. */
let finishingPrograms = Promise.resolve();

/** Série terminée : le MJ le note pour tout le monde, et le programme peut être relancé. */
function finishProgram({ id, startedAt, startedBy }: Program) {
  const key = `${id}/${startedAt}`;
  if (!writesScene(startedBy) || finishing.has(key)) return;
  finishing.add(key);
  finishingPrograms = finishingPrograms
    .then(async () => {
      const current = programsIn(await OBR.scene.getMetadata());
      // S'il a été relancé entre-temps, ce n'est plus la même série.
      if (!current.some((p) => p.id === id && p.startedAt === startedAt)) return;
      await OBR.scene.setMetadata({
        [FX_PROGRAMS_KEY]: withActive(current, [id], false, Date.now()),
      });
    })
    .catch(warn);
}

const stillRunning = ({ id, startedAt }: Program) =>
  programs.some((program) => program.id === id && program.active && program.startedAt === startedAt);

/** Parcourt tous les points à la suite. Une chaîne commencée va au bout, tant qu'elle reste active. */
async function fireChain(program: Program, index: number) {
  if (active >= othersLimit(simultaneousLimit)) return;
  const areas = await loadTokenAreas();
  const hops = chainHops(
    program.anchors.map(({ at, token }) =>
      token ? areas.find(({ id }) => id === token.id)?.center : at,
    ),
  );
  const multiplier = await cellValue();
  const choice = { ...program, gmOnly: false, durable: false };
  for (const [hop, { from, at }] of hops.entries()) {
    if (hop > 0) {
      await new Promise((resolve) => setTimeout(resolve, chainHopDelay(program)));
      if (!stillRunning(program)) return;
    }
    const seed = shotRandom(program, index, 3 + hop) * 100;
    play(buildMessage(choice, at, from, multiplier, seed), simultaneousLimit).catch(warn);
  }
}

/** Les tirs permanents écrivent l'un après l'autre : deux à la fois effaceraient le travail de l'autre. */
let placingEffects = Promise.resolve();

/**
 * Le MJ note l'effet dans la scène, et chaque joueur le crée comme tout effet durable. S'il laisse
 * une trace, chaque joueur joue aussi l'animation de son côté, comme pour un tir normal.
 */
async function firePermanent(program: Program, index: number, time: number) {
  const areas = await loadTokenAreas();
  const tokenOf = ({ token }: Anchor) => (token ? areas.find(({ id }) => id === token.id) : undefined);
  const place = (anchor: Anchor) => (anchor.token ? tokenOf(anchor)?.center : anchor.at);
  // Une chaîne laisse un effet par saut. Un token caché ou supprimé est sauté, et rien n'est trahi.
  const single = program.style === "chaine" ? undefined : shotAnchors(program, index);
  const shots: { at: Anchor; from?: Anchor }[] =
    program.style === "chaine" ? permanentChainHops(program.anchors, place) : single ? [single] : [];
  const [multiplier, dpi] = await Promise.all([cellValue(), OBR.scene.grid.getDpi()]);
  const choice = { ...program, gmOnly: false, durable: false };
  const scale = effectScale(program.style, program.size, exactCells(choice, multiplier));
  const effects = shots.flatMap((shot, hop) => {
    const at = place(shot.at);
    const from = shot.from && place(shot.from);
    if (!at || (shot.from && !from)) return [];
    const carrier = shot.from ? undefined : tokenOf(shot.at);
    const start = program.style === "chaine" ? hop * chainHopDelay(program) : 0;
    return [
      programEffect(program, index, shotSlot(program.anchors, shot), {
        at,
        ...(from ? { from } : {}),
        ...(carrier ? { carrier: { id: carrier.id, name: carrier.name } } : {}),
        scale,
        owner: OBR.player.id,
        ...directionAngle(program),
        ...(LEAVES_TRACE.includes(program.style)
          ? { restAt: time + restDelay(program.style, scale, from ?? at, at, dpi) }
          : { enterAt: time + start }),
      }),
    ];
  });
  if (!effects.length) return;
  // Seule une trace a besoin d'une animation à part : un effet qui tient apparaît de lui-même.
  if (LEAVES_TRACE.includes(program.style)) {
    const { at, from, seed } = effects[0];
    play(buildMessage(choice, at, from, multiplier, seed), othersLimit(simultaneousLimit)).catch(warn);
  }
  if (!writesScene(program.startedBy)) return;
  placingEffects = placingEffects
    .then(async () => {
      const [metadata, room] = await Promise.all([OBR.scene.getMetadata(), OBR.room.getMetadata()]);
      // Arrêté pendant ce temps : on ne repose pas ce que le bouton vient de retirer.
      if (!programsIn(metadata).some((p) => p.id === program.id && p.active && p.startedAt === program.startedAt)) return;
      const entries = durablesIn(metadata);
      const limit = limitsIn(room).durable;
      const next = effects.reduce((list, effect) => withProgramEffect(list, effect, limit), entries);
      if (next !== entries) await saveDurables(next);
    })
    .catch(warn);
  await placingEffects;
}

/** Chaque joueur calcule le même tir de son côté : aucun message n'est échangé. */
async function fireProgram(program: Program, index: number, time: number) {
  if (program.permanent) {
    await firePermanent(program, index, time);
    return;
  }
  if (program.style === "chaine") {
    await fireChain(program, index);
    return;
  }
  const anchors = shotAnchors(program, index);
  if (!anchors) return;
  const areas = await loadTokenAreas();
  // Un token caché ou supprimé est introuvable : ce tir n'a pas lieu, et rien n'est trahi.
  const place = ({ at, token }: Anchor) =>
    token ? areas.find(({ id }) => id === token.id)?.center : at;
  const at = place(anchors.at);
  const from = anchors.from && place(anchors.from);
  if (!at || (anchors.from && !from)) return;
  const choice = { ...program, gmOnly: false, durable: false };
  const message = buildMessage(choice, at, from, await cellValue(), shotRandom(program, index, 3) * 100);
  await play(message, othersLimit(simultaneousLimit));
}

/** Repères visibles du MJ seul. Ils ne sont refaits que si la liste des points a changé. */
async function syncMarkers(itemIds: string[], dpi: number) {
  const present = new Set(itemIds);
  const anchors =
    role === "GM"
      ? markedAnchors(programs, draftAnchors, draftProgram).filter(({ token }) => !token || present.has(token.id))
      : [];
  const numbers = role === "GM"
    ? anchorNumbers(draftAnchors).filter(({ anchor: { token } }) => !token || present.has(token.id))
    : [];
  const signature = JSON.stringify([anchors, numbers]);
  if (signature === markerSignature) return;
  markerSignature = signature;
  const old = await OBR.scene.local.getItems((item) => item.id.startsWith(FX_MARKER_PREFIX));
  if (old.length) await OBR.scene.local.deleteItems(old.map(({ id }) => id));
  if (!anchors.length) return;
  const labels = await Promise.all(
    numbers.map(async ({ anchor: { at, token }, text }, index) => {
      const center = token ? (await OBR.scene.items.getItemBounds([token.id])).center : at;
      // Juste au-dessus du repère, pour lire l'ordre sans masquer le token.
      const label = buildLabel()
        .id(`${FX_MARKER_PREFIX}numero/${index}`)
        .plainText(text)
        .position({ x: center.x, y: center.y - dpi * 0.26 })
        .fontSize(dpi * 0.2)
        .fontWeight(700)
        .fillColor("#ffffff")
        .backgroundColor("#6d4bc4")
        .backgroundOpacity(0.95)
        .cornerRadius(dpi * 0.06)
        .padding(dpi * 0.04)
        .pointerWidth(0)
        .pointerHeight(0)
        .layer("POINTER")
        .locked(true)
        .disableHit(true);
      if (token) label.attachedTo(token.id).disableAttachmentBehavior(["SCALE", "ROTATION", "LOCKED"]);
      return label.build();
    }),
  );
  if (labels.length) await OBR.scene.local.addItems(labels);
  await OBR.scene.local.addItems(
    await Promise.all(
      anchors.map(async ({ at, token }, index) => {
        const center = token ? (await OBR.scene.items.getItemBounds([token.id])).center : at;
        const size = dpi * 0.45;
        const marker = buildShape()
          .id(`${FX_MARKER_PREFIX}${index}`)
          .shapeType("CIRCLE")
          .width(size)
          .height(size)
          // Le cercle se dessine à partir de son centre.
          .position(center)
          .fillOpacity(0)
          .strokeColor("#bb99ff")
          .strokeOpacity(0.9)
          .strokeWidth(dpi * 0.03)
          .strokeDash([dpi * 0.06, dpi * 0.05])
          .layer("POINTER")
          .locked(true)
          .disableHit(true);
        if (token) marker.attachedTo(token.id).disableAttachmentBehavior(["SCALE", "ROTATION", "LOCKED"]);
        return marker.build();
      }),
    ),
  );
}

/** Clics sur la carte demandés par le menu (points d'un programme, token à configurer), et outil à retrouver ensuite. */
let picking: { tool: string; mode: string | undefined } | undefined;

const postToWindow = (data: unknown) =>
  OBR.broadcast.sendMessage(FX_PROGRAM_CHANNEL, data, { destination: "LOCAL" }).catch(warn);

async function startPicking() {
  const [tool, mode] = await Promise.all([OBR.tool.getActiveTool(), OBR.tool.getActiveToolMode()]);
  picking = { tool, mode };
  await clearSource();
  await OBR.tool.activateTool(FX_TOOL_ID);
  await OBR.tool.activateMode(FX_TOOL_ID, MODE_ID);
}

async function stopPicking() {
  if (!picking) return;
  const { tool, mode } = picking;
  picking = undefined;
  await postToWindow({ type: "pick-stopped" });
  await OBR.tool.activateTool(tool);
  if (mode) await OBR.tool.activateMode(tool, mode);
}

function handleProgramMessage(data: unknown) {
  const message = data as { type?: string; anchors?: Anchor[]; program?: string } | null;
  if (message?.type === "pick-start") startPicking().catch(warn);
  else if (message?.type === "pick-stop") stopPicking().catch(warn);
  else if (message?.type === "draft") {
    draftAnchors = Array.isArray(message.anchors) ? message.anchors : [];
    draftProgram = message.program;
    scheduleReconcile();
  }
}

let reconciling = false;
let reconcileAgain = false;

/** Une seule passe à la fois, sinon le même effet pourrait être créé deux fois. */
async function scheduleReconcile() {
  reconcileAgain = true;
  if (reconciling) return;
  reconciling = true;
  while (reconcileAgain) {
    reconcileAgain = false;
    await reconcileDurables().catch(warn);
  }
  reconciling = false;
}

const HIGHLIGHT_PREFIX = "vfx-owlbear/surbrillance/";
const HIGHLIGHT_COLOR = "#ff2bd6";
let highlighting = Promise.resolve();
let highlightIds: string[] = [];

/** Repère, pour ce joueur seulement, les effets durables survolés dans la roue. */
function highlightDurables(ids: string[]) {
  highlighting = highlighting
    .then(async () => {
      if (highlightIds.length) await OBR.scene.local.deleteItems(highlightIds);
      highlightIds = [];
      if (!ids.length || !(await OBR.scene.isReady())) return;
      const [entries, dpi, items] = await Promise.all([
        OBR.scene.getMetadata().then(durablesIn),
        OBR.scene.grid.getDpi(),
        OBR.scene.items.getItems(),
      ]);
      const carriers = new Set(items.map(({ id }) => id));
      const marks: Item[] = [];
      for (const entry of entries.filter(({ id }) => ids.includes(id))) {
        const carried = entry.carrier && carriers.has(entry.carrier.id);
        const center = carried ? (await OBR.scene.items.getItemBounds([entry.carrier!.id])).center : entry.at;
        const at = entry.offset ? { x: center.x + entry.offset.x, y: center.y + entry.offset.y } : center;
        // Une marque blanche se perdrait dans un effet clair : une bande sombre et un trait vif ressortent partout.
        const finish = <T extends { id(id: string): T; layer(layer: "POINTER"): T; zIndex(z: number): T; locked(value: boolean): T; disableHit(value: boolean): T; build(): Item }>(builder: T, part: string, z: number) =>
          builder.id(`${HIGHLIGHT_PREFIX}${entry.id}/${part}`).layer("POINTER").zIndex(z).locked(true).disableHit(true).build();
        if (entry.from) {
          const line = (width: number, color: string, opacity: number) =>
            buildLine().startPosition(entry.from!).endPosition(at).strokeColor(color).strokeOpacity(opacity).strokeWidth(width);
          marks.push(finish(line(dpi * 0.8, "#000000", 0.55), "fond", Date.now()));
          marks.push(finish(line(dpi * 0.18, HIGHLIGHT_COLOR, 1), "trait", Date.now() + 1));
        } else {
          const radius = Math.max(dpi * STYLES[entry.style].reach * entry.scale, dpi * 0.5);
          const ring = (width: number, color: string, opacity: number) =>
            buildShape().shapeType("CIRCLE").width(radius * 2).height(radius * 2).position(at).fillOpacity(0).strokeColor(color).strokeOpacity(opacity).strokeWidth(width);
          marks.push(finish(ring(dpi * 0.3, "#000000", 0.6), "fond", Date.now()));
          marks.push(finish(ring(dpi * 0.12, HIGHLIGHT_COLOR, 1), "trait", Date.now() + 1));
        }
      }
      await OBR.scene.local.addItems(marks);
      highlightIds = marks.map(({ id }) => id);
    })
    .catch(warn);
}

const saveDurables = (entries: DurableEntry[]) =>
  OBR.scene.setMetadata({ [FX_DURABLE_KEY]: entries });

/**
 * Pose l'effet sur la carte, ou l'attache au token s'il y en a un et qu'on a la main dessus.
 * Le même effet déjà attaché à ce token s'éteint : c'est ce qui permet de le retirer d'un clic.
 */
async function placeDurable(
  choice: FxChoice,
  label: string,
  at: Point,
  token: TokenArea | undefined,
  from?: Point,
  placement?: { offset: Point; angle: number },
) {
  const carrier = token && (await canMove(token)) ? token : undefined;
  const [metadata, multiplier] = await Promise.all([OBR.scene.getMetadata(), cellValue()]);
  const entries = durablesIn(metadata);
  if (carrier) {
    const same = entries.find(
      (entry) => entry.carrier?.id === carrier.id && sameDurable(entry, choice),
    );
    if (same) {
      await saveDurables(entries.filter((entry) => entry !== same));
      return;
    }
  }
  if (entries.length >= durableLimit) {
    await OBR.notification.show(t("running.limit", { limit: durableLimit }));
    return;
  }
  const leavesTrace = LEAVES_TRACE.includes(choice.style);
  const scale = effectScale(choice.style, choice.size, exactCells(choice, multiplier));
  const dpi = await OBR.scene.grid.getDpi();
  const entry: DurableEntry = {
    id: crypto.randomUUID(),
    name: label,
    element: choice.element,
    style: choice.style,
    scale,
    seed: randomSeed(),
    ...castTiming(choice.style, Date.now(), restDelay(choice.style, scale, from ?? at, at, dpi)),
    at,
    ...(from ? { from } : {}),
    ...(carrier ? { carrier: { id: carrier.id, name: carrier.name } } : {}),
    ...(aiming && carrier?.id !== aiming.token ? { caster: { token: aiming.token, spell: aiming.spell.name } } : {}),
    ...(carrier && placement ? { offset: placement.offset } : {}),
    ...directionAngle(choice),
    ...(placement ? { angle: placement.angle } : {}),
    gmOnly: choice.gmOnly,
    owner: OBR.player.id,
  };
  await saveDurables([...entries, entry]);
  // La flèche doit voler, les griffes griffer : seule leur trace est durable.
  if (leavesTrace) send(buildMessage(choice, carrier?.center ?? at, from, multiplier, entry.seed));
}

/** Sort lancé depuis la roue, le temps de viser, et l'outil à retrouver ensuite. */
let aiming: { spell: Favorite; token: string; tool: string; mode: string | undefined } | undefined;

/** Réglage à appliquer : le sort visé s'il y en a un, sinon celui du panneau. */
function currentChoice(): FxChoice {
  const saved = loadChoice(localStorage);
  const { element, style, size, exact, durable, onFace, direction } = aiming?.spell ?? saved;
  // Un réglage laissé par une partie de MJ dans ce navigateur ne vaut pas pour un joueur.
  return {
    element,
    style,
    size,
    exact,
    durable: durable === true,
    gmOnly: saved.gmOnly && role === "GM",
    ...(onFace === true ? { onFace: true } : {}),
    ...(direction === undefined ? {} : { direction }),
  };
}

/** Ce cube durable est-il déjà allumé sur ce token ? Le relancer l'éteint, sans rien viser. */
async function isLitOn(token: TokenArea, choice: FxChoice) {
  return (
    isDurable(choice) &&
    (await canMove(token)) &&
    durablesIn(await OBR.scene.getMetadata()).some(
      (entry) => entry.carrier?.id === token.id && sameDurable(entry, choice),
    )
  );
}

/** Côté du cube en unités de la carte, avec ses réglages actuels. */
async function cubeSide(choice: FxChoice) {
  const [dpi, multiplier] = await Promise.all([OBR.scene.grid.getDpi(), cellValue()]);
  return dpi * STYLES.cube.reach * effectScale("cube", choice.size, exactCells(choice, multiplier));
}

async function endAiming() {
  if (!aiming) return;
  const { tool, mode } = aiming;
  aiming = undefined;
  await OBR.tool.activateTool(tool);
  if (mode) await OBR.tool.activateMode(tool, mode);
}

/** Part du token : aussitôt pour un effet sur soi, sinon après avoir visé. */
async function castFromToken(tokenId: string, spell: Favorite) {
  const token = (await loadTokenAreas()).find(({ id }) => id === tokenId);
  if (!token) return;
  const lit = startsOnFace(spell) && (await isLitOn(token, { ...currentChoice(), ...spell, durable: spell.durable === true }));
  if (firesFromToken(spell) || lit) {
    const choice = { ...currentChoice(), ...spell, durable: spell.durable === true, direction: spell.direction };
    if (isDurable(choice)) {
      await placeDurable(choice, spell.name, token.center, token);
    } else {
      send(buildMessage(choice, token.center, undefined, await cellValue(), randomSeed()));
    }
    return;
  }
  const [tool, mode] = await Promise.all([OBR.tool.getActiveTool(), OBR.tool.getActiveToolMode()]);
  aiming = { spell, token: tokenId, tool: aiming?.tool ?? tool, mode: aiming ? aiming.mode : mode };
  await clearSource();
  if (aimsFromToken(spell)) await markSource(token.center, token);
  await OBR.tool.activateTool(FX_TOOL_ID);
  await OBR.tool.activateMode(FX_TOOL_ID, MODE_ID);
}

async function openWheel(tokenId: string) {
  const token = (await loadTokenAreas()).find(({ id }) => id === tokenId);
  if (!token) return;
  if (!(await canMove(token))) {
    await OBR.notification.show(t("wheel.notYoursAny"));
    return;
  }
  const { left, top } = await viewportPosition(token.center);
  await OBR.popover.close(FX_WHEEL_ID);
  await OBR.popover.open({
    id: FX_WHEEL_ID,
    url: `/wheel.html?token=${encodeURIComponent(tokenId)}`,
    width: WHEEL_SIZE,
    height: WHEEL_SIZE,
    anchorReference: "POSITION",
    anchorPosition: { left, top },
    anchorOrigin: { horizontal: "CENTER", vertical: "CENTER" },
    transformOrigin: { horizontal: "CENTER", vertical: "CENTER" },
    hidePaper: true,
    marginThreshold: 8,
  });
}

async function viewportPosition(point: Point) {
  const { x, y } = await OBR.viewport.transformPoint(point);
  return { left: x, top: y };
}

let toolActive = false;
let previewShown = false;
let previewBusy = false;
let pendingMove: ToolEvent | undefined;

async function drawPreview(event: ToolEvent) {
  const choice = currentChoice();
  const token = await tokenUnderPointer(event);
  let point = token?.center ?? event.pointerPosition;
  let angle = 0;
  const [dpi, multiplier] = await Promise.all([OBR.scene.grid.getDpi(), cellValue()]);
  const scale = effectScale(choice.style, choice.size, exactCells(choice, multiplier));
  // Le cube collé à sa face se montre là où il tombera, quel que soit le point survolé.
  if (startsOnFace(choice) && sourceToken) {
    const placed = cubeOnFace(sourceToken.center, event.pointerPosition, sourceToken.width, dpi * STYLES.cube.reach * scale);
    point = { x: sourceToken.center.x + placed.offset.x, y: sourceToken.center.y + placed.offset.y };
    angle = placed.angle;
  }
  const outline = previewOutline(choice.style, source, point, dpi * STYLES[choice.style].reach * scale, angle);
  if (!toolActive) return;
  if (!outline || picking) {
    if (previewShown) await hidePreview();
    return;
  }
  if (previewShown) {
    await OBR.scene.local.updateItems([FX_PREVIEW_ID], (drafts) => {
      for (const draft of drafts) {
        if (isCurve(draft)) {
          draft.points = outline.points;
          draft.style.closed = outline.closed;
        }
      }
    });
    return;
  }
  previewShown = true;
  await OBR.scene.local.addItems([
    buildCurve()
      .id(FX_PREVIEW_ID)
      .position({ x: 0, y: 0 })
      .points(outline.points)
      .closed(outline.closed)
      .tension(0)
      .fillColor("#bb99ff")
      .fillOpacity(outline.closed ? 0.12 : 0)
      .strokeColor("#bb99ff")
      .strokeOpacity(0.9)
      .strokeWidth(dpi * 0.03)
      .strokeDash([dpi * 0.12, dpi * 0.08])
      .layer("POINTER")
      .locked(true)
      .disableHit(true)
      .build(),
  ]);
}

/** Une seule mise à jour à la fois : on garde seulement le dernier mouvement reçu entre-temps. */
async function updatePreview(event: ToolEvent) {
  pendingMove = event;
  if (previewBusy) return;
  previewBusy = true;
  while (pendingMove) {
    const next = pendingMove;
    pendingMove = undefined;
    await drawPreview(next).catch(warn);
  }
  previewBusy = false;
}

/** Un joueur ne déplace que ce qu'Owlbear lui permet déjà de déplacer à la main. */
async function canMove(token: TokenArea) {
  if (role === "GM") return true;
  const update = token.layer === "MOUNT" ? "MOUNT_UPDATE" : "CHARACTER_UPDATE";
  if (!(await OBR.player.hasPermission(update))) return false;
  if (!(await OBR.player.hasPermission("CHARACTER_OWNER_ONLY"))) return true;
  return token.owner === OBR.player.id;
}

/** Avec un token au départ, il arrive calé sur la grille, au moment où l'effet d'arrivée commence. */
async function teleport(
  choice: FxChoice,
  from: Point,
  token: TokenArea | undefined,
  point: Point,
  multiplier: number,
) {
  // En « MJ seulement », un token qui saute trahirait l'effet.
  if (!token || choice.gmOnly || !(await canMove(token))) {
    send(buildMessage(choice, point, from, multiplier, randomSeed()));
    return;
  }
  const dpi = await OBR.scene.grid.getDpi();
  const onCenter = fitsCellCenter(token.width, dpi);
  const at = await OBR.scene.grid.snapPosition(point, 1, !onCenter, onCenter);
  send(buildMessage(choice, at, from, multiplier, randomSeed()));
  setTimeout(() => {
    OBR.scene.items
      .updateItems(
        (item) => item.id === token.id,
        (drafts) => {
          for (const draft of drafts) {
            // La position d'un token n'est pas forcément son centre : on le décale d'autant.
            draft.position.x += at.x - from.x;
            draft.position.y += at.y - from.y;
          }
        },
      )
      .catch(warn);
  }, teleportTiming(choice.size).arrivalDelay);
}

const FX_DRAG_ID = `${FX_MARKER_PREFIX}deplace`;
/** Le point d'un programme qu'on est en train de déplacer sur la carte. */
let draggedAnchor: number | undefined;

async function startAnchorDrag({ pointerPosition }: ToolEvent) {
  if (!picking) return;
  const [areas, dpi] = await Promise.all([loadTokenAreas(), OBR.scene.grid.getDpi()]);
  const positions = draftAnchors.map(({ at, token }) => (token ? areas.find(({ id }) => id === token.id)?.center : undefined) ?? at);
  const index = anchorNear(positions, pointerPosition, dpi * 0.4);
  if (index < 0) return;
  draggedAnchor = index;
  const ghost = buildShape()
    .id(FX_DRAG_ID)
    .shapeType("CIRCLE")
    .width(dpi * 0.45)
    .height(dpi * 0.45)
    .position(pointerPosition)
    .fillColor("#bb99ff")
    .fillOpacity(0.45)
    .strokeColor("#ffffff")
    .strokeWidth(dpi * 0.03)
    .layer("POINTER")
    .locked(true)
    .disableHit(true)
    .build();
  await OBR.scene.local.addItems([ghost]);
}

function moveAnchorDrag({ pointerPosition }: ToolEvent) {
  if (draggedAnchor === undefined) return;
  OBR.scene.local
    .updateItems([FX_DRAG_ID], (drafts) => {
      for (const draft of drafts) draft.position = pointerPosition;
    })
    .catch(warn);
}

async function cancelAnchorDrag() {
  draggedAnchor = undefined;
  await OBR.scene.local.deleteItems([FX_DRAG_ID]).catch(warn);
}

/** Lâché sur un token, le point s'y accroche, comme avec un clic. */
async function endAnchorDrag(event: ToolEvent) {
  const index = draggedAnchor;
  await cancelAnchorDrag();
  if (index === undefined) return;
  const picked = await tokenUnderPointer(event);
  const anchor: Anchor = picked
    ? { at: picked.center, token: { id: picked.id, name: picked.name } }
    : { at: event.pointerPosition };
  await postToWindow({ type: "moved", index, anchor });
}

/** Un clic à la fois : pendant qu'il se traite, le suivant lirait un point de départ périmé. */
let clicks = Promise.resolve();
const queueClick = (event: ToolEvent) => {
  clicks = clicks.then(() => handleClick(event)).catch(warn);
};

async function handleClick(event: ToolEvent) {
  if (picking) {
    const picked = await tokenUnderPointer(event);
    const anchor: Anchor = picked
      ? { at: picked.center, token: { id: picked.id, name: picked.name } }
      : { at: event.pointerPosition };
    await postToWindow({ type: "picked", anchor });
    return;
  }
  const choice = currentChoice();
  const [token, multiplier] = await Promise.all([tokenUnderPointer(event), cellValue()]);
  const point = token?.center ?? event.pointerPosition;
  const label = aiming?.spell.name ?? defaultSpellName(choice);
  if (startsOnFace(choice) && sourceToken) {
    // Second clic : la direction du cube autour du token. Recliquer sur le token annule.
    const carrier = sourceToken;
    await clearSource();
    if (token?.id !== carrier.id) {
      const placed = cubeOnFace(carrier.center, event.pointerPosition, carrier.width, await cubeSide(choice));
      const at = { x: carrier.center.x + placed.offset.x, y: carrier.center.y + placed.offset.y };
      if (isDurable(choice)) await placeDurable(choice, label, at, carrier, undefined, placed);
      else send({ ...buildMessage(choice, at, undefined, multiplier, randomSeed()), angle: placed.angle });
    }
    await endAiming();
  } else if (startsOnFace(choice) && token && !(await isLitOn(token, choice))) {
    // Premier clic sur un token : on attend la direction. Sur la carte, le cube reste centré sur le clic.
    await markSource(token.center, token);
  } else if (!STYLES[choice.style].directed) {
    if (source) await clearSource();
    if (isDurable(choice)) await placeDurable(choice, label, point, token);
    else send(buildMessage(choice, point, undefined, multiplier, randomSeed()));
    await endAiming();
  } else if (!source) {
    await markSource(point, token);
  } else if (source.x === point.x && source.y === point.y) {
    // Recliquer sur le lanceur annule, mais pas un clic répété, ni au milieu d'une chaîne.
    if (choice.style !== "chaine" && performance.now() - sourceMarkedAt >= REPEATED_CLICK_MS) {
      await clearSource();
      await endAiming();
    }
  } else if (isDurable(choice)) {
    const from = source;
    await placeDurable(choice, label, point, undefined, from);
    // Une chaîne repart de la cible qu'elle vient de toucher, jusqu'à Échap.
    if (choice.style === "chaine") {
      await markSource(point);
    } else {
      await clearSource();
      await endAiming();
    }
  } else if (choice.style === "teleportation") {
    const [from, startToken] = [source, sourceToken];
    await clearSource();
    await teleport(choice, from, startToken, point, multiplier);
    await endAiming();
  } else {
    send(buildMessage(choice, point, source, multiplier, randomSeed()));
    // Une chaîne repart de la cible qu'elle vient de toucher, jusqu'à Échap.
    if (choice.style === "chaine") {
      await markSource(point);
    } else {
      await clearSource();
      await endAiming();
    }
  }
  await updatePreview(event);
}

const MODE_ID = `${FX_TOOL_ID}/lancer`;
const MENU_ID = `${FX_TOOL_ID}/menu-sorts`;

/** Outil en main quand l'onglet Lancer a pris le relais, à rendre en le quittant. */
let armedFrom: { tool: string; mode: string | undefined } | undefined;

/** L'onglet Lancer capte les clics sur la carte dès qu'il est affiché. */
async function arm() {
  if (picking || !(role === "GM" || playersAllowed)) return;
  await toolSync;
  const [tool, mode] = await Promise.all([OBR.tool.getActiveTool(), OBR.tool.getActiveToolMode()]);
  if (tool === FX_TOOL_ID) return;
  armedFrom = { tool, mode };
  await OBR.tool.activateTool(FX_TOOL_ID);
  await OBR.tool.activateMode(FX_TOOL_ID, MODE_ID);
}

/**
 * Le panneau qui se charge juste après l'extension, c'est une page rechargée : personne n'a demandé à
 * lancer. Au pire, qui l'ouvre dans ces quelques secondes clique sur Reprendre.
 */
const RELOAD_WINDOW_MS = 10_000;
let bootedAt = 0;

/** Owlbear peut remettre l'outil d'avant le rechargement, sans personne pour le lui avoir demandé ici. */
async function releaseRestoredTool() {
  if (armedFrom || aiming || picking) return;
  if ((await OBR.tool.getActiveTool()) === FX_TOOL_ID) await OBR.tool.activateTool(OWLBEAR_MOVE_TOOL);
}

async function armOnLoad() {
  if (performance.now() - bootedAt < RELOAD_WINDOW_MS) await releaseRestoredTool();
  else await arm();
}

async function disarm() {
  if (!armedFrom) return;
  const { tool, mode } = armedFrom;
  armedFrom = undefined;
  // Une visée lancée depuis une roue rendra le même outil à sa fin.
  if (aiming) {
    aiming = { ...aiming, tool, mode };
    return;
  }
  if ((await OBR.tool.getActiveTool()) !== FX_TOOL_ID) return;
  await OBR.tool.activateTool(tool);
  if (mode) await OBR.tool.activateMode(tool, mode);
}

const cancelAim = () => clearSource().then(endAiming).then(stopPicking);

/** Une visée en cours s'annule ; sinon, on sort du mode lancer. */
async function pressEscape() {
  if (source || aiming || picking) await cancelAim();
  else if (toolActive) await stopCasting();
}

/** Rend la main sans fermer le panneau. Sans outil à retrouver, on revient à celui de déplacement d'Owlbear. */
async function stopCasting() {
  await clearSource();
  if (armedFrom) {
    await disarm();
    return;
  }
  if ((await OBR.tool.getActiveTool()) === FX_TOOL_ID) await OBR.tool.activateTool(OWLBEAR_MOVE_TOOL);
}

/** Cliquer en bougeant la souris, Owlbear le voit comme un glissé : c'est quand même un clic, là où il a commencé. */
const CLICK_WHILE_MOVING_MS = 500;
let pressStart: { event: ToolEvent; at: number; anchor: Promise<void> } | undefined;

async function finishPress(event: ToolEvent) {
  const press = pressStart;
  pressStart = undefined;
  await press?.anchor;
  if (draggedAnchor !== undefined) await endAnchorDrag(event);
  else if (press && performance.now() - press.at < CLICK_WHILE_MOVING_MS) queueClick(press.event);
}

async function createTool() {
  const whenActive = { activeTools: [FX_TOOL_ID] };
  // L'outil ne se montre que pendant qu'il sert : on y entre par le menu Effets, en haut à gauche.
  await OBR.tool.create({
    id: FX_TOOL_ID,
    icons: [{ icon: "/vfx/outil.svg", label: t("app.title"), filter: whenActive }],
    defaultMode: MODE_ID,
  });
  await OBR.tool.createMode({
    id: MODE_ID,
    icons: [{ icon: "/vfx/outil.svg", label: t("tool.label"), filter: whenActive }],
    cursors: [{ cursor: "crosshair" }],
    onToolClick(_context, event) {
      queueClick(event);
      return false;
    },
    onToolMove(_context, event) {
      updatePreview(event).catch(warn);
    },
    onToolDragStart(_context, event) {
      pressStart = { event, at: performance.now(), anchor: startAnchorDrag(event).catch(warn) };
    },
    onToolDragMove(_context, event) {
      moveAnchorDrag(event);
    },
    onToolDragEnd(_context, event) {
      finishPress(event).catch(warn);
    },
    onToolDragCancel() {
      pressStart = undefined;
      cancelAnchorDrag().catch(warn);
    },
    onKeyDown(_context, event) {
      if (event.key === "Escape") {
        pressEscape().catch(warn);
      }
    },
    onActivate() {
      toolActive = true;
    },
    onDeactivate() {
      toolActive = false;
      aiming = undefined;
      if (draggedAnchor !== undefined) cancelAnchorDrag().catch(warn);
      if (picking) {
        picking = undefined;
        postToWindow({ type: "pick-stopped" });
      }
      clearSource();
    },
  });
  await OBR.contextMenu.create({
    id: MENU_ID,
    icons: [
      {
        icon: "/vfx/roue.svg",
        label: t("wheel.menu"),
        filter: {
          max: 1,
          // Les filtres d'une liste s'additionnent : sans « || », aucun objet ne serait sur les deux calques.
          every: [
            { key: "layer", value: "CHARACTER", coordinator: "||" },
            { key: "layer", value: "MOUNT" },
          ],
        },
      },
    ],
    onClick({ items }) {
      if (!items[0]) return;
      // Le menu d'Owlbear reste ouvert tant que le token est sélectionné, et recouvrirait la roue.
      OBR.player
        .deselect()
        .then(() => openWheel(items[0].id))
        .catch(warn);
    },
  });
}

async function removeTool() {
  toolActive = false;
  await clearSource();
  armedFrom = undefined;
  await OBR.popover.close(FX_WHEEL_ID).catch(warn);
  await endAiming().catch(warn);
  await OBR.contextMenu.remove(MENU_ID);
  await OBR.tool.removeMode(MODE_ID);
  await OBR.tool.remove(FX_TOOL_ID);
}

/** Le nom du bouton et les libellés enregistrés auprès d'Owlbear ne suivent pas tout seuls. */
async function applyLanguage() {
  await OBR.action.setTitle(t("app.title"));
  if (!toolCreated) return;
  toolSync = toolSync.then(async () => {
    await removeTool();
    await createTool();
  }).catch(warn);
  await toolSync;
}

let toolCreated = false;
let toolSync = Promise.resolve();

/**
 * L'outil n'existe chez un joueur que si le MJ l'a autorisé. Les changements passent l'un après
 * l'autre : un retrait et une création mêlés pourraient laisser le joueur sans outil.
 */
function syncTool() {
  toolSync = toolSync
    .then(async () => {
      const allowed = role === "GM" || playersAllowed;
      if (allowed === toolCreated) return;
      toolCreated = allowed;
      await (allowed ? createTool() : removeTool());
    })
    .catch(warn);
}

const lastPlayerCast = new Map<string, number>();

/** Nombre d'effets simultanés permis à l'auteur du message, ou 0 s'il n'a pas le droit de lancer. */
async function castLimit(connectionId: string) {
  const own = await OBR.player.getConnectionId();
  const senderRole =
    connectionId === own
      ? role
      : (await OBR.party.getPlayers()).find((player) => player.connectionId === connectionId)?.role;
  if (senderRole === "GM") return simultaneousLimit;
  const now = performance.now();
  if (!playersAllowed || !playerCooldownOver(lastPlayerCast.get(connectionId), now)) return 0;
  lastPlayerCast.set(connectionId, now);
  return othersLimit(simultaneousLimit);
}

export async function setupFx() {
  bootedAt = performance.now();
  OBR.broadcast.onMessage(FX_UI_CHANNEL, ({ data }) => {
    const type = (data as { type?: string } | null)?.type;
    if (type === "arm") arm().catch(warn);
    else if (type === "arm-on-load") armOnLoad().catch(warn);
    else if (type === "escape") pressEscape().catch(warn);
    else if (type === "highlight") highlightDurables(((data as { ids?: string[] }).ids ?? []).filter((id) => typeof id === "string"));
    else if (type === "language") applyLanguage().catch(warn);
    else if (type === "disarm") disarm().catch(warn);
    else if (type === "cancel-aim") cancelAim().catch(warn);
    else if (type === "stop-cast") stopCasting().catch(warn);
  });
  // Le menu refermé, la carte reprend son outil et les repères d'un programme en cours disparaissent.
  OBR.action.onOpenChange((open) => {
    if (open) return;
    draftAnchors = [];
    draftProgram = undefined;
    scheduleReconcile();
    stopPicking().then(disarm).catch(warn);
  });
  OBR.broadcast.onMessage(FX_CHANNEL, ({ data, connectionId }) => {
    const message = parseFxMessage(data);
    if (!message || (message.gmOnly && role !== "GM")) return;
    castLimit(connectionId)
      .then((limit) => (limit > 0 ? play(message, limit) : undefined))
      .catch(warn);
  });
  OBR.broadcast.onMessage(FX_WHEEL_CHANNEL, ({ data }) => {
    const cast = parseWheelCast(data);
    if (cast) castFromToken(cast.token, cast.spell).catch(warn);
  });
  OBR.broadcast.onMessage(FX_PROGRAM_CHANNEL, ({ data }) => handleProgramMessage(data));
  OBR.scene.items.onChange(() => {
    tokenAreas = undefined;
    scheduleReconcile();
  });
  OBR.scene.onMetadataChange(() => scheduleReconcile());
  OBR.scene.onReadyChange((ready) => {
    if (ready) {
      // Les repères locaux ne survivent pas à un changement de scène.
      markerSignature = "";
      scheduleReconcile();
    } else {
      syncPrograms([]);
    }
  });
  OBR.player.onChange((player) => {
    if (player.role === role) return;
    role = player.role;
    tokenAreas = undefined;
    syncTool();
    scheduleReconcile();
  });
  OBR.room.onMetadataChange((metadata) => {
    playersAllowed = playersAllowedIn(metadata);
    durableLimit = limitsIn(metadata).durable;
    simultaneousLimit = limitsIn(metadata).simultaneous;
    syncTool();
  });
  const room = await OBR.room.getMetadata();
  role = await OBR.player.getRole();
  ownConnection = await OBR.player.getConnectionId();
  readOtherGMs(await OBR.party.getPlayers());
  OBR.party.onChange(readOtherGMs);
  playersAllowed = playersAllowedIn(room);
  durableLimit = limitsIn(room).durable;
  simultaneousLimit = limitsIn(room).simultaneous;
  syncTool();
  toolSync.then(releaseRestoredTool).catch(warn);
  // Owlbear peut remettre l'outil seulement une fois celui-ci recréé.
  setTimeout(() => releaseRestoredTool().catch(warn), 2000);
  OBR.action.setTitle(t("app.title")).catch(warn);
  scheduleReconcile();
}
