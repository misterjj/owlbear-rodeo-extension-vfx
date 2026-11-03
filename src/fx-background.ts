import OBR, {
  buildCurve,
  buildEffect,
  buildShape,
  isCurve,
  isEffect,
  type Item,
  type Matrix,
  type ToolEvent,
  type Uniform,
} from "@owlbear-rodeo/sdk";
import {
  ELEMENTS,
  FX_CHANNEL,
  FX_DURABLE_ITEM_PREFIX,
  FX_DURABLE_KEY,
  FX_PANEL_ID,
  FX_PREVIEW_ID,
  FX_SOURCE_ID,
  FX_TOOL_ID,
  FX_WHEEL_CHANNEL,
  FX_WHEEL_ID,
  MAX_DURABLE,
  STYLES,
  arrowDuration,
  buildMessage,
  coneTarget,
  defaultSpellName,
  durableChanges,
  durableItemId,
  durablesIn,
  effectScale,
  exactCells,
  firesFromToken,
  fitsCellCenter,
  isDurable,
  loadChoice,
  parseFxMessage,
  parseWheelCast,
  playerCooldownOver,
  playersAllowedIn,
  previewOutline,
  projectileDuration,
  sameDurable,
  scaledDuration,
  teleportTiming,
  tokenAt,
  type ElementId,
  type DurableEntry,
  type Favorite,
  type FxChoice,
  type FxMessage,
  type Point,
  type TokenArea,
} from "./fx";
import {
  FX_PROGRAMS_KEY,
  FX_PROGRAMS_WINDOW_ID,
  FX_PROGRAM_CHANNEL,
  markedAnchors,
  nextShot,
  programsIn,
  shotAfter,
  shotAnchors,
  shotRandom,
  withActive,
  type Anchor,
  type Program,
  type Shot,
} from "./fx-programs";
import { openWindow, setupWindowHost } from "./window-host";
import {
  ARROW_SKSL,
  AURA_SKSL,
  BEAM_SKSL,
  BITE_SKSL,
  CLOUD_SKSL,
  CONE_SKSL,
  DOME_SKSL,
  DURABLE_SKSL,
  EXPLOSION_SKSL,
  HEAL_SKSL,
  PROJECTILE_SKSL,
  RAIN_SKSL,
  SLASH_SKSL,
  TELEPORT_SKSL,
  WALL_SKSL,
} from "./fx-shaders";

const PANEL_HEIGHT_GM = 830;
const PANEL_HEIGHT_PLAYER = 724;
const PROGRAMS_HEIGHT = 620;
const WHEEL_SIZE = 340;
const FRAME_MS = 33;
/** Au-delà, un nouvel effet est ignoré pour ne pas ralentir les petites machines. */
const MAX_ACTIVE = 6;
/** Les joueurs ne peuvent pas occuper toute la place : le MJ doit pouvoir lancer les siens. */
const MAX_ACTIVE_FROM_PLAYERS = 4;
/** Un décor animé ne doit jamais empêcher de lancer un sort à la main. */
const MAX_ACTIVE_FROM_PROGRAMS = 3;
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
        ],
        scaledDuration(1000, scale),
      );
      break;
    case "chaine":
      // Toujours en zigzag, quel que soit l'élément : c'est ce qui se lit comme un arc.
      await Promise.all([
        animate(
          BEAM_SKSL,
          from,
          [
            ...common,
            { name: "target", value: vector(from, at) },
            { name: "width", value: dpi * 0.1 * scale },
            { name: "jag", value: Math.max(look.jag, 0.8) },
          ],
          scaledDuration(600, scale),
        ),
        explosion(at, dpi * 0.6 * scale, element, seed, unit, scaledDuration(600, scale)),
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
    case "aura":
      await animate(
        AURA_SKSL,
        at,
        [...common, { name: "radius", value: dpi * STYLES.aura.reach * scale }],
        scaledDuration(2200, scale),
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
let playersAllowed = false;

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
/** Token sur lequel le lanceur a été posé, s'il y en a un. */
let sourceToken: TokenArea | undefined;

async function hidePreview() {
  previewShown = false;
  await OBR.scene.local.deleteItems([FX_PREVIEW_ID]).catch(warn);
}

async function clearSource() {
  source = undefined;
  sourceToken = undefined;
  await Promise.all([OBR.scene.local.deleteItems([FX_SOURCE_ID]).catch(warn), hidePreview()]);
}

async function markSource(point: Point, token?: TokenArea) {
  source = point;
  sourceToken = token;
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
  switch (style) {
    case "aura":
    case "dome":
      return { sksl: DURABLE_SKSL[style], position: at, uniforms: [...common, radius] };
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
    default:
      return undefined;
  }
}

async function addDurableItem(entry: DurableEntry, carriers: Map<string, Item>, dpi: number) {
  const carrier = entry.carrier && carriers.get(entry.carrier.id);
  // La position vient du token à cet instant : il a pu bouger depuis que l'effet a été lancé.
  const at = carrier ? (await OBR.scene.items.getItemBounds([carrier.id])).center : entry.at;
  const spec = durableSpec(entry, at, dpi);
  if (!spec) return;
  const builder = buildEffect()
    .id(durableItemId(entry.id))
    .effectType("VIEWPORT")
    .sksl(spec.sksl)
    .position(spec.position)
    .uniforms(spec.uniforms)
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
  const { add, remove } = durableChanges(
    entries,
    local.map(({ id }) => id),
    role,
    (id) => carriers.has(id),
  );
  if (remove.length) await OBR.scene.local.deleteItems(remove);
  await Promise.all(add.map((entry) => addDurableItem(entry, carriers, dpi)));
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
  if (role === "GM" && orphans.length) await saveDurables(entries.filter((e) => !orphans.includes(e)));
}

let programs: Program[] = [];
let programTimer: ReturnType<typeof setInterval> | undefined;
const programClocks = new Map<string, { startedAt: number; shot: Shot | undefined }>();
/** Points du programme en cours d'édition dans la fenêtre du MJ. */
let draftAnchors: Anchor[] = [];
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
      clock = { startedAt: program.startedAt, shot: shotAfter(program, now - STALE_SHOT_MS) };
      programClocks.set(program.id, clock);
    }
    while (clock.shot && clock.shot.time <= now) {
      if (now - clock.shot.time < STALE_SHOT_MS) fireProgram(program, clock.shot.index).catch(warn);
      clock.shot = nextShot(program, clock.shot);
    }
    if (!clock.shot) finishProgram(program);
  }
}

const finishing = new Set<string>();

/** Série terminée : le MJ le note pour tout le monde, et le programme peut être relancé. */
function finishProgram({ id, startedAt }: Program) {
  const key = `${id}/${startedAt}`;
  if (role !== "GM" || finishing.has(key)) return;
  finishing.add(key);
  OBR.scene
    .getMetadata()
    .then((metadata) => {
      const current = programsIn(metadata);
      // S'il a été relancé entre-temps, ce n'est plus la même série.
      if (!current.some((p) => p.id === id && p.startedAt === startedAt)) return undefined;
      return OBR.scene.setMetadata({
        [FX_PROGRAMS_KEY]: withActive(current, [id], false, Date.now()),
      });
    })
    .catch(warn);
}

/** Chaque joueur calcule le même tir de son côté : aucun message n'est échangé. */
async function fireProgram(program: Program, index: number) {
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
  await play(message, MAX_ACTIVE_FROM_PROGRAMS);
}

/** Repères visibles du MJ seul. Ils ne sont refaits que si la liste des points a changé. */
async function syncMarkers(itemIds: string[], dpi: number) {
  const present = new Set(itemIds);
  const anchors =
    role === "GM"
      ? markedAnchors(programs, draftAnchors).filter(({ token }) => !token || present.has(token.id))
      : [];
  const signature = JSON.stringify(anchors);
  if (signature === markerSignature) return;
  markerSignature = signature;
  const old = await OBR.scene.local.getItems((item) => item.id.startsWith(FX_MARKER_PREFIX));
  if (old.length) await OBR.scene.local.deleteItems(old.map(({ id }) => id));
  if (!anchors.length) return;
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

async function openProgramsWindow() {
  if (role === "GM") await openWindow("programs");
}

/** Clics sur la carte demandés par la fenêtre des programmes, et outil à retrouver ensuite. */
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
  const message = data as { type?: string; anchors?: Anchor[] } | null;
  if (message?.type === "open-window") openProgramsWindow().catch(warn);
  else if (message?.type === "pick-start") startPicking().catch(warn);
  else if (message?.type === "pick-stop") stopPicking().catch(warn);
  else if (message?.type === "draft") {
    draftAnchors = Array.isArray(message.anchors) ? message.anchors : [];
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
  if (entries.length >= MAX_DURABLE) {
    await OBR.notification.show(`${MAX_DURABLE} effets durables au plus : retires-en un d'abord.`);
    return;
  }
  const entry: DurableEntry = {
    id: crypto.randomUUID(),
    name: label,
    element: choice.element,
    style: choice.style,
    scale: effectScale(choice.style, choice.size, exactCells(choice, multiplier)),
    seed: randomSeed(),
    at,
    ...(from ? { from } : {}),
    ...(carrier ? { carrier: { id: carrier.id, name: carrier.name } } : {}),
    gmOnly: choice.gmOnly,
    owner: OBR.player.id,
  };
  await saveDurables([...entries, entry]);
}

/** Sort lancé depuis la roue, le temps de viser, et l'outil à retrouver ensuite. */
let aiming: { spell: Favorite; tool: string; mode: string | undefined } | undefined;

/** Réglage à appliquer : le sort visé s'il y en a un, sinon celui du panneau. */
function currentChoice(): FxChoice {
  const saved = loadChoice(localStorage);
  const { element, style, size, exact, durable } = aiming?.spell ?? saved;
  // Un réglage laissé par une partie de MJ dans ce navigateur ne vaut pas pour un joueur.
  return {
    element,
    style,
    size,
    exact,
    durable: durable === true,
    gmOnly: saved.gmOnly && role === "GM",
  };
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
  if (firesFromToken(spell)) {
    const choice = { ...currentChoice(), ...spell, durable: spell.durable === true };
    if (isDurable(choice)) {
      await placeDurable(choice, spell.name, token.center, token);
    } else {
      send(buildMessage(choice, token.center, undefined, await cellValue(), randomSeed()));
    }
    return;
  }
  const [tool, mode] = await Promise.all([OBR.tool.getActiveTool(), OBR.tool.getActiveToolMode()]);
  aiming = { spell, tool: aiming?.tool ?? tool, mode: aiming ? aiming.mode : mode };
  await clearSource();
  if (STYLES[spell.style].directed) await markSource(token.center, token);
  await OBR.tool.activateTool(FX_TOOL_ID);
  await OBR.tool.activateMode(FX_TOOL_ID, MODE_ID);
}

async function openWheel(tokenId: string) {
  const token = (await loadTokenAreas()).find(({ id }) => id === tokenId);
  if (!token) return;
  if (!(await canMove(token))) {
    await OBR.notification.show("Tu n'as pas la main sur ce token.");
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
  const point = token?.center ?? event.pointerPosition;
  const [dpi, multiplier] = await Promise.all([OBR.scene.grid.getDpi(), cellValue()]);
  const scale = effectScale(choice.style, choice.size, exactCells(choice, multiplier));
  const outline = previewOutline(choice.style, source, point, dpi * STYLES[choice.style].reach * scale);
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
  if (!STYLES[choice.style].directed) {
    if (source) await clearSource();
    if (isDurable(choice)) await placeDurable(choice, label, point, token);
    else send(buildMessage(choice, point, undefined, multiplier, randomSeed()));
    await endAiming();
  } else if (!source) {
    await markSource(point, token);
  } else if (source.x === point.x && source.y === point.y) {
    // Recliquer sur le lanceur annule.
    await clearSource();
    await endAiming();
  } else if (isDurable(choice)) {
    const from = source;
    await clearSource();
    await placeDurable(choice, label, point, undefined, from);
    await endAiming();
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

async function openPanel() {
  if (role === "GM" || playersAllowed) await openWindow("panel");
}

const MODE_ID = `${FX_TOOL_ID}/lancer`;
const WHEEL_MODE_ID = `${FX_TOOL_ID}/roue`;
const ACTION_ID = `${FX_TOOL_ID}/reglages`;
const MENU_ID = `${FX_TOOL_ID}/menu-sorts`;
const PROGRAMS_ACTION_ID = `${FX_TOOL_ID}/programmes`;

async function createTool() {
  const whenActive = { activeTools: [FX_TOOL_ID] };
  await OBR.tool.create({
    id: FX_TOOL_ID,
    icons: [{ icon: "/vfx/outil.svg", label: "Effets" }],
    defaultMode: MODE_ID,
  });
  await OBR.tool.createMode({
    id: MODE_ID,
    icons: [{ icon: "/vfx/outil.svg", label: "Lancer un effet", filter: whenActive }],
    cursors: [{ cursor: "crosshair" }],
    onToolClick(_context, event) {
      handleClick(event).catch(warn);
      return false;
    },
    onToolMove(_context, event) {
      updatePreview(event).catch(warn);
    },
    onKeyDown(_context, event) {
      if (event.key === "Escape") {
        clearSource().then(endAiming).then(stopPicking).catch(warn);
      }
    },
    onActivate() {
      toolActive = true;
      // Pendant une visée, le panneau ne ferait que masquer la carte.
      if (!aiming && !picking) openPanel().catch(warn);
    },
    onDeactivate() {
      toolActive = false;
      aiming = undefined;
      if (picking) {
        picking = undefined;
        postToWindow({ type: "pick-stopped" });
      }
      clearSource();
      OBR.popover.close(FX_PANEL_ID).catch(warn);
    },
  });
  await OBR.tool.createMode({
    id: WHEEL_MODE_ID,
    icons: [{ icon: "/vfx/roue.svg", label: "Roue des sorts des tokens", filter: whenActive }],
    cursors: [{ cursor: "pointer" }],
    onToolClick(_context, event) {
      tokenUnderPointer(event)
        .then((token) => (token ? openWheel(token.id) : undefined))
        .catch(warn);
      return false;
    },
  });
  await OBR.tool.createAction({
    id: PROGRAMS_ACTION_ID,
    icons: [
      {
        icon: "/vfx/programmes.svg",
        label: "Programmes d'effets",
        // Sans outil imposé : la fenêtre doit pouvoir s'ouvrir pendant le reste de la partie.
        filter: { roles: ["GM"] },
      },
    ],
    onClick() {
      openProgramsWindow().catch(warn);
    },
  });
  await OBR.contextMenu.create({
    id: MENU_ID,
    icons: [
      {
        icon: "/vfx/roue.svg",
        label: "Sorts",
        filter: {
          max: 1,
          some: [
            { key: "layer", value: "CHARACTER" },
            { key: "layer", value: "MOUNT" },
          ],
        },
      },
    ],
    onClick({ items }) {
      if (items[0]) openWheel(items[0].id).catch(warn);
    },
  });
  await OBR.tool.createAction({
    id: ACTION_ID,
    icons: [{ icon: "/vfx/reglages.svg", label: "Réglages des effets", filter: whenActive }],
    onClick() {
      openPanel().catch(warn);
    },
  });
}

async function removeTool() {
  toolActive = false;
  await clearSource();
  await OBR.popover.close(FX_PANEL_ID).catch(warn);
  await OBR.popover.close(FX_WHEEL_ID).catch(warn);
  await endAiming().catch(warn);
  await OBR.contextMenu.remove(MENU_ID);
  await OBR.tool.removeAction(PROGRAMS_ACTION_ID);
  await OBR.tool.removeAction(ACTION_ID);
  await OBR.tool.removeMode(WHEEL_MODE_ID);
  await OBR.tool.removeMode(MODE_ID);
  await OBR.tool.remove(FX_TOOL_ID);
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
  if (senderRole === "GM") return MAX_ACTIVE;
  const now = performance.now();
  if (!playersAllowed || !playerCooldownOver(lastPlayerCast.get(connectionId), now)) return 0;
  lastPlayerCast.set(connectionId, now);
  return MAX_ACTIVE_FROM_PLAYERS;
}

export async function setupFx() {
  setupWindowHost({
    fullHeight: (kind) =>
      kind === "programs" ? PROGRAMS_HEIGHT : role === "GM" ? PANEL_HEIGHT_GM : PANEL_HEIGHT_PLAYER,
    canShow: async (kind) =>
      kind === "programs"
        ? role === "GM"
        : (role === "GM" || playersAllowed) && (await OBR.tool.getActiveTool()) === FX_TOOL_ID,
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
    if (role !== "GM") OBR.popover.close(FX_PROGRAMS_WINDOW_ID).catch(warn);
    tokenAreas = undefined;
    syncTool();
    scheduleReconcile();
  });
  OBR.room.onMetadataChange((metadata) => {
    playersAllowed = playersAllowedIn(metadata);
    syncTool();
  });
  [role, playersAllowed] = await Promise.all([
    OBR.player.getRole(),
    OBR.room.getMetadata().then(playersAllowedIn),
  ]);
  syncTool();
  scheduleReconcile();
}
