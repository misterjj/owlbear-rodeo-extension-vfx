import OBR, { buildShape, type Item, type Vector2 } from "@owlbear-rodeo/sdk";
import {
  FX_WINDOW_CHANNEL,
  FX_WINDOW_GHOST_ID,
  WINDOW_TOP_SPACE,
  placeWindow,
  type WindowKind,
  type WindowPrefs,
} from "./fx-window";

/** Un cadre par image suffit, et Owlbear n'a pas à absorber chaque mouvement de la souris. */
const MOVE_INTERVAL_MS = 33;
const WATCH_INTERVAL_MS = 200;
/**
 * Plus aucun mouvement reçu pendant ce délai : la fenêtre a peut-être perdu la souris sans en être
 * prévenue, et elle ne saura jamais que le bouton a été relâché.
 */
const IDLE_RELEASE_MS = 2500;
const DRAG_THRESHOLD = 4;
const DRAG_HEARTBEAT_MS = 500;
/** Le contour ne doit jamais retenir la fenêtre si Owlbear tarde à répondre. */
const GHOST_REMOVAL_WAIT_MS = 400;

const params = new URLSearchParams(location.search);
/** Placée par l'arrière-plan, qui l'indique dans l'adresse de la page. */
export const windowPrefs: WindowPrefs = {
  left: Number(params.get("left")) || 0,
  top: Number(params.get("top")) || 0,
  compact: params.has("reduite"),
};

const warn = (error: unknown) => console.warn("Effets, déplacement de la fenêtre :", error);

interface DragHandlers {
  onMove: (delta: Vector2) => void;
  onEnd: (delta: Vector2) => void;
  onCancel: () => void;
}

/**
 * Suit un glissement commencé là où `canStart` l'accepte, même hors de la fenêtre.
 * Il arrive que la page cesse de recevoir la souris, sans que rien ne le signale toujours : quelle
 * que soit la façon dont le geste se termine, le glissement finit et se pose à la dernière position
 * connue. La capture porte sur toute la page, car la liste peut être redessinée pendant le geste.
 */
function trackDrag(area: HTMLElement, canStart: (target: Element) => boolean, handlers: DragHandlers) {
  const root = document.documentElement;
  let abandon: (() => void) | undefined;

  area.addEventListener("pointerdown", (start) => {
    if (start.button !== 0 || !canStart(start.target as Element)) return;
    abandon?.();
    start.preventDefault();
    root.setPointerCapture(start.pointerId);
    root.classList.add("dragging");
    let lastSent = 0;
    let lastEvent = performance.now();
    let done = false;
    let pending: ReturnType<typeof setTimeout> | undefined;
    let latest: Vector2 = { x: 0, y: 0 };
    const isOurs = (event: PointerEvent) => event.pointerId === start.pointerId;
    const deltaOf = (event: PointerEvent) => ({
      x: event.screenX - start.screenX,
      y: event.screenY - start.screenY,
    });

    const flush = () => {
      pending = undefined;
      lastSent = performance.now();
      handlers.onMove(latest);
    };
    const move = (event: PointerEvent) => {
      if (!isOurs(event)) return;
      lastEvent = performance.now();
      // Bouton déjà relâché sans que la page le sache : cette position-ci n'est pas fiable.
      if (event.buttons === 0) {
        release("bouton déjà relâché");
        return;
      }
      latest = deltaOf(event);
      if (pending !== undefined) return;
      // Le dernier mouvement part toujours, même si la souris s'arrête juste après.
      const wait = MOVE_INTERVAL_MS - (performance.now() - lastSent);
      if (wait <= 0) flush();
      else pending = setTimeout(flush, wait);
    };
    const finish = () => {
      done = true;
      abandon = undefined;
      clearTimeout(pending);
      clearInterval(watch);
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", up, true);
      window.removeEventListener("pointercancel", cancel, true);
      root.removeEventListener("lostpointercapture", lost);
      root.classList.remove("dragging");
    };
    const release = (reason?: string) => {
      if (done) return;
      finish();
      if (reason) console.warn(`Effets : glissement terminé sans relâchement reçu (${reason}).`);
      handlers.onEnd(latest);
    };
    const up = (event: PointerEvent) => {
      if (!isOurs(event)) return;
      latest = deltaOf(event);
      release();
    };
    const lost = () => release("capture perdue");
    const cancel = () => {
      if (done) return;
      finish();
      handlers.onCancel();
    };
    const watch = setInterval(() => {
      if (!root.hasPointerCapture(start.pointerId)) release("capture absente");
      else if (performance.now() - lastEvent > IDLE_RELEASE_MS) release("plus aucun mouvement");
    }, WATCH_INTERVAL_MS);
    window.addEventListener("pointermove", move, true);
    window.addEventListener("pointerup", up, true);
    window.addEventListener("pointercancel", cancel, true);
    root.addEventListener("lostpointercapture", lost);
    abandon = cancel;
  });
}

/**
 * Contour piloté directement par la fenêtre : un seul message au départ plutôt qu'un par mouvement.
 * Une mise à jour lente ou perdue ne bloque ni n'interrompt le geste.
 */
function startGhost(prefs: WindowPrefs) {
  let drawn: { item: Item; origin: Vector2; scale: number; screen: { width: number; height: number } } | undefined;
  let latest: Vector2 | undefined;
  const size = { width: window.innerWidth, height: window.innerHeight };
  const placed = (delta: Vector2, screen: { width: number; height: number }) =>
    placeWindow({ ...prefs, left: prefs.left + delta.x, top: prefs.top + delta.y }, screen, size);

  const move = (delta: Vector2) => {
    latest = delta;
    if (!drawn) return;
    const { left, top } = placed(delta, drawn.screen);
    const position = {
      x: drawn.origin.x + (left - prefs.left) / drawn.scale,
      y: drawn.origin.y + (top - prefs.top) / drawn.scale,
    };
    const previous = drawn.item;
    drawn.item = { ...previous, position };
    OBR.scene.local
      .updateItems(
        [previous],
        (items) => {
          if (items[0]) items[0].position = position;
        },
        true,
      )
      .catch(warn);
  };

  const ready = (async () => {
    await OBR.scene.local.deleteItems([FX_WINDOW_GHOST_ID]).catch(warn);
    const [width, viewportHeight, scale, origin] = await Promise.all([
      OBR.viewport.getWidth(),
      OBR.viewport.getHeight(),
      OBR.viewport.getScale(),
      OBR.viewport.inverseTransformPoint({ x: prefs.left, y: prefs.top }),
    ]);
    const screen = { width, height: viewportHeight };
    const item = buildShape()
      .id(FX_WINDOW_GHOST_ID)
      .shapeType("RECTANGLE")
      .position(origin)
      .width(size.width / scale)
      .height(placed({ x: 0, y: 0 }, screen).height / scale)
      .fillColor("#bb99ff")
      .fillOpacity(0.15)
      .strokeColor("#bb99ff")
      .strokeOpacity(1)
      .strokeWidth(3 / scale)
      .layer("POPOVER")
      .locked(true)
      .disableHit(true)
      .build();
    await OBR.scene.local.addItems([item]);
    drawn = { item, origin, scale, screen };
    if (latest) move(latest);
  })().catch(warn);

  return {
    move,
    /** Attend la fin de la création : un relâchement très rapide ne laisse rien derrière lui. */
    async remove() {
      await ready;
      drawn = undefined;
      await OBR.scene.local.deleteItems([FX_WINDOW_GHOST_ID]).catch(warn);
    },
  };
}

const post = (data: unknown) =>
  OBR.broadcast.sendMessage(FX_WINDOW_CHANNEL, data, { destination: "LOCAL" }).catch(warn);

/** Bouton de la barre de titre, à brancher avec `bindResize`. */
export const resizeButton = (className = "") =>
  `<button type="button" id="resize" class="${className}" title="${windowPrefs.compact ? "Agrandir" : "Réduire"}" aria-label="${windowPrefs.compact ? "Agrandir" : "Réduire"} la fenêtre">${windowPrefs.compact ? "▢" : "–"}</button>`;

export function bindResize(kind: WindowKind, container: HTMLElement, beforeReload: () => void) {
  container.querySelector<HTMLButtonElement>("#resize")!.onclick = () => {
    beforeReload();
    post({ type: "compact", window: kind, compact: !windowPrefs.compact });
  };
}

let lastHeight = 0;

/** La fenêtre réduite prend juste la place de son contenu, sans dépasser le bas de l'écran. */
export function fitCompactHeight(kind: WindowKind, popoverId: string, content: HTMLElement) {
  const wanted = content.scrollHeight;
  // Une page déjà retirée de l'écran mesure 0 : elle ne doit pas écraser la fenêtre en place.
  if (!wanted || wanted === lastHeight) return;
  lastHeight = wanted;
  post({ type: "height", window: kind, height: wanted });
  OBR.viewport
    .getHeight()
    .then((available) => OBR.popover.setHeight(popoverId, Math.min(wanted, available - WINDOW_TOP_SPACE)))
    .catch(warn);
}

/** Déplace la fenêtre en glissant sa barre `.bar`. Elle est rouverte ailleurs : `beforeReload` garde ce qui est saisi. */
export function setupWindowDrag(kind: WindowKind, area: HTMLElement, beforeReload: () => void) {
  let ghost: ReturnType<typeof startGhost> | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  const isDrag = ({ x, y }: Vector2) => Math.hypot(x, y) >= DRAG_THRESHOLD;
  const stop = () => {
    clearInterval(heartbeat);
    const current = ghost;
    ghost = undefined;
    return current;
  };
  const signal = () => post({ type: "drag" });

  trackDrag(area, (target) => !!target.closest(".bar") && !target.closest("button"), {
    onMove(delta) {
      if (!ghost) {
        if (!isDrag(delta)) return;
        ghost = startGhost(windowPrefs);
        signal();
        heartbeat = setInterval(signal, DRAG_HEARTBEAT_MS);
      }
      ghost.move(delta);
    },
    async onEnd(delta) {
      const current = stop();
      if (!current && !isDrag(delta)) return;
      beforeReload();
      await Promise.race([
        current?.remove(),
        new Promise((resolve) => setTimeout(resolve, GHOST_REMOVAL_WAIT_MS)),
      ]);
      // Sans ce message, la fenêtre ne bouge pas : une nouvelle tentative vaut le coup.
      const message = { type: "drop", window: kind, delta };
      OBR.broadcast
        .sendMessage(FX_WINDOW_CHANNEL, message, { destination: "LOCAL" })
        .catch(() => post(message));
    },
    onCancel() {
      const current = stop();
      if (!current) return;
      current.remove();
      post({ type: "drag-cancel" });
    },
  });
}
