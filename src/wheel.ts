import OBR from "@owlbear-rodeo/sdk";
import {
  ELEMENTS,
  FX_DURABLE_KEY,
  FX_TARGET_KEY,
  FX_UI_CHANNEL,
  FX_WHEEL_CHANNEL,
  FX_WHEEL_ID,
  STYLES,
  WHEEL_OUTER,
  elementLabel,
  styleLabel,
  durablesIn,
  fitWheelLabel,
  isDurable,
  canChooseTarget,
  placedBySpell,
  spellTarget,
  readableColor,
  wheelInstances,
  sameDurable,
  spellsOf,
  startsOnFace,
  unitLabel,
  wheelSector,
  type DurableEntry,
  type Favorite,
  type Rgb,
} from "./fx";
import { STYLE_ICONS } from "./fx-icons";
import { t } from "./i18n";
import "./wheel.css";

const app = document.querySelector<HTMLDivElement>("#app")!;
const tokenId = new URLSearchParams(location.search).get("token") ?? "";
let spells: Favorite[] = [];
let tokenName = "";
let unit = "cases";
/** Effets durables allumés sur ce token. */
let lit: DurableEntry[] = [];
/** Tous les effets durables de la scène, pour retrouver ce qu'un sort a posé sur la carte. */
let durables: DurableEntry[] = [];

const placed = (spell: Favorite) => placedBySpell(durables, tokenId, spell.name);

const isLit = (spell: Favorite) =>
  isDurable(spell) && (lit.some((entry) => sameDurable(entry, spell)) || placed(spell).length > 0);

const css = ([r, g, b]: Rgb) => `rgb(${r * 255} ${g * 255} ${b * 255})`;

const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

const warn = (error: unknown) => console.warn("Effets :", error);

const close = () => OBR.popover.close(FX_WHEEL_ID);

function detail(spell: Favorite) {
  const measure = spell.exact !== null && STYLES[spell.style].exactZone ? `${spell.exact} ${unit}` : spell.size;
  const targetLabel = canChooseTarget(spell.style) && !startsOnFace(spell) ? t(spellTarget(spell) === "self" ? "wheel.targetSelf" : "wheel.targetAim") : "";
  const extras = [isDurable(spell) ? t("options.durable") : "", startsOnFace(spell) ? t("options.onFace") : "", targetLabel].filter(Boolean);
  return [styleLabel(spell.style), elementLabel(spell.element), measure, ...extras].join(" · ");
}

const sendCast = async (spell: Favorite) => {
  highlight([]);
  await OBR.broadcast.sendMessage(FX_WHEEL_CHANNEL, { token: tokenId, spell }, { destination: "LOCAL" });
  await close();
};

/** Repart de la scène à jour : un autre joueur a pu y toucher depuis l'ouverture de la roue. */
async function stopEntries(spell: Favorite, ids: string[]) {
  highlight([]);
  const current = durablesIn(await OBR.scene.getMetadata());
  const next = current.filter(({ id }) => !ids.includes(id));
  await OBR.scene.setMetadata({ [FX_DURABLE_KEY]: next });
  durables = next;
  if (placed(spell).length) renderChoice(spell);
  else renderWheel();
}

const highlight = (ids: string[]) =>
  OBR.broadcast
    .sendMessage(FX_UI_CHANNEL, { type: "highlight", ids }, { destination: "LOCAL" })
    .catch(warn);

interface Sector {
  label: string;
  icon: string;
  color: string;
  detail: string;
  /** Effets à mettre en surbrillance sur la carte quand on le survole. */
  ids?: string[];
  onChoose: () => void;
}

function sectorHtml({ label, icon, color }: Sector, index: number, count: number, kind: string) {
  const { path, middle, width } = wheelSector(index, count);
  const { size, lines } = fitWheelLabel(label, width);
  // L'icône remonte un peu pour laisser la place au nom, sur une ou deux lignes.
  const top = middle.y - (lines.length > 1 ? 24 : 20);
  const text = lines
    .map(
      (line, row) =>
        `<text x="${middle.x}" y="${top + 37 + row * (size + 1.5)}" font-size="${size}">${escapeHtml(line)}</text>`,
    )
    .join("");
  return `
    <g class="spell ${kind}" data-sector="${index}" role="button" tabindex="0" style="--color: ${color}" aria-label="${escapeHtml(label)}">
      <path class="sector" d="${path}"></path>
      <g class="icon" transform="translate(${middle.x - 12} ${top})">${icon}</g>
      ${text}
    </g>`;
}

/** Une roue, à la place de la précédente et au même endroit. */
function renderSectors(sectors: Sector[], kind: (sector: Sector) => string) {
  const half = WHEEL_OUTER + 4;
  app.innerHTML = `
    <svg class="wheel" viewBox="${-half} ${-half} ${half * 2} ${half * 2}">${sectors.map((sector, index) => sectorHtml(sector, index, sectors.length, kind(sector))).join("")}</svg>
    <div class="detail" id="detail" hidden></div>`;
  const pill = app.querySelector<HTMLDivElement>("#detail")!;
  app.querySelectorAll<SVGGElement>("[data-sector]").forEach((element) => {
    const sector = sectors[Number(element.dataset.sector)];
    const show = () => {
      pill.textContent = sector.detail;
      pill.hidden = false;
      if (sector.ids) highlight(sector.ids);
    };
    const hide = () => {
      pill.hidden = true;
      if (sector.ids) highlight([]);
    };
    element.addEventListener("pointerenter", show);
    element.addEventListener("pointerleave", hide);
    element.addEventListener("focus", show);
    element.addEventListener("blur", hide);
    const choose = (event: Event) => {
      event.stopPropagation();
      sector.onChoose();
    };
    element.addEventListener("click", choose);
    element.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") choose(event);
    });
  });
}

const PLUS_ICON = `<path d="M12 5v14M5 12h14" />`;
const STOP_ICON = `<rect x="6" y="6" width="12" height="12" rx="1.5" />`;
const STOP_ALL_ICON = `<rect x="4" y="8" width="11" height="11" rx="1.5" /><path d="M9 4.5h10.5V15" />`;
const BACK_ICON = `<path d="M10 6 4 12l6 6M4 12h16" />`;
const STOP_COLOR = "rgb(255 130 120)";
const NEUTRAL_COLOR = "rgb(214 217 228)";

/** Ce sort a déjà laissé des effets sur la carte : en poser un autre, ou arrêter lesquels ? */
function renderChoice(spell: Favorite) {
  const entries = placed(spell);
  const color = css(readableColor(ELEMENTS[spell.element].palette[1] as Rgb));
  const instances = wheelInstances(entries);
  const single = entries.length === 1;
  const sectors: Sector[] = [
    {
      label: t("wheel.castNew"),
      icon: PLUS_ICON,
      color,
      detail: `${spell.name} · ${t("wheel.castNew")}`,
      onChoose: () => sendCast(spell),
    },
    ...instances.map(({ entry, number }) => ({
      label: single ? t("wheel.stopOne") : t("wheel.instance", { number }),
      icon: STOP_ICON,
      color: STOP_COLOR,
      detail: single ? `${spell.name} · ${t("wheel.stopOne")}` : `${spell.name} · ${t("wheel.instanceDetail", { number })}`,
      ids: [entry.id],
      onChoose: () => stopEntries(spell, [entry.id]).catch(warn),
    })),
    ...(single
      ? []
      : [
          {
            label: t("wheel.stopAll"),
            icon: STOP_ALL_ICON,
            color: STOP_COLOR,
            detail: `${spell.name} · ${t("wheel.stopAllCount", { count: entries.length })}`,
            ids: entries.map(({ id }) => id),
            onChoose: () => stopEntries(spell, entries.map(({ id }) => id)).catch(warn),
          },
        ]),
    { label: t("wheel.back"), icon: BACK_ICON, color: NEUTRAL_COLOR, detail: t("wheel.backDetail"), onChoose: renderWheel },
  ];
  renderSectors(sectors, () => "");
}

function renderWheel() {
  const chosen = new Map<Sector, Favorite>();
  const sectors = spells.map((spell): Sector => {
    const sector: Sector = {
      label: spell.name,
      icon: STYLE_ICONS[spell.style],
      color: css(readableColor(ELEMENTS[spell.element].palette[1] as Rgb)),
      detail: isLit(spell) ? `${detail(spell)} · ${t("wheel.lit")}` : detail(spell),
      onChoose: () => (placed(spell).length ? renderChoice(spell) : sendCast(spell).catch(warn)),
    };
    chosen.set(sector, spell);
    return sector;
  });
  renderSectors(sectors, (sector) => (isLit(chosen.get(sector)!) ? "lit" : ""));
}

/** La roue ne sert qu'à lancer : elle renvoie vers le menu Effets, où elle se configure. */
function renderEmpty() {
  app.innerHTML = `
    <div class="card" id="card">
      <strong>${escapeHtml(tokenName || t("wheel.thisToken"))}</strong>
      <p class="empty">${t("wheel.empty")}</p>
      <button type="button" id="configure">${t("wheel.configure")}</button>
    </div>`;
  app.querySelector<HTMLDivElement>("#card")!.onclick = (event) => event.stopPropagation();
  app.querySelector<HTMLButtonElement>("#configure")!.onclick = async () => {
    // Le menu lit cette valeur s'il n'est pas encore ouvert, et le message s'il l'est déjà.
    localStorage.setItem(FX_TARGET_KEY, tokenId);
    await OBR.broadcast
      .sendMessage(FX_UI_CHANNEL, { type: "target", token: tokenId }, { destination: "LOCAL" })
      .catch((error) => console.warn("Effets :", error));
    await OBR.action.open();
    await close();
  };
}

OBR.onReady(async () => {
  const [item] = await OBR.scene.items.getItems([tokenId]);
  if (!item) {
    await close();
    return;
  }
  tokenName = item.name;
  unit = unitLabel((await OBR.scene.grid.getScale()).parsed);
  spells = spellsOf(item.metadata);
  durables = durablesIn(await OBR.scene.getMetadata());
  lit = durables.filter(({ carrier }) => carrier?.id === tokenId);
  // Un clic dans le vide de la roue la referme, comme un clic à côté.
  document.body.onclick = () => close();
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && spells.length) renderWheel();
  });
  // Si la roue se ferme alors qu'un secteur est survolé, rien ne doit rester allumé sur la carte.
  window.addEventListener("pagehide", () => highlight([]));
  if (spells.length) renderWheel();
  else renderEmpty();
});
