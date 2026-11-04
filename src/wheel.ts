import OBR from "@owlbear-rodeo/sdk";
import {
  ELEMENTS,
  FX_TARGET_KEY,
  FX_UI_CHANNEL,
  FX_WHEEL_CHANNEL,
  FX_WHEEL_ID,
  STYLES,
  WHEEL_OUTER,
  durablesIn,
  fitWheelLabel,
  isDurable,
  readableColor,
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
import "./wheel.css";

const app = document.querySelector<HTMLDivElement>("#app")!;
const tokenId = new URLSearchParams(location.search).get("token") ?? "";
let spells: Favorite[] = [];
let tokenName = "";
let unit = "cases";
/** Effets durables allumés sur ce token. */
let lit: DurableEntry[] = [];

const isLit = (spell: Favorite) =>
  isDurable(spell) && lit.some((entry) => sameDurable(entry, spell));

const css = ([r, g, b]: Rgb) => `rgb(${r * 255} ${g * 255} ${b * 255})`;

const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

const close = () => OBR.popover.close(FX_WHEEL_ID);

function detail(spell: Favorite) {
  const measure = spell.exact !== null && STYLES[spell.style].exactZone ? `${spell.exact} ${unit}` : spell.size;
  const extras = [isDurable(spell) ? "durable" : "", startsOnFace(spell) ? "sur une face" : ""].filter(Boolean);
  return [STYLES[spell.style].label, ELEMENTS[spell.element].label, measure, ...extras].join(" · ");
}

function spellSector(spell: Favorite, index: number) {
  const { path, middle, width } = wheelSector(index, spells.length);
  const { size, lines } = fitWheelLabel(spell.name, width);
  const color = css(readableColor(ELEMENTS[spell.element].palette[1] as Rgb));
  // L'icône remonte un peu pour laisser la place au nom, sur une ou deux lignes.
  const top = middle.y - (lines.length > 1 ? 24 : 20);
  const text = lines
    .map(
      (line, row) =>
        `<text x="${middle.x}" y="${top + 37 + row * (size + 1.5)}" font-size="${size}">${escapeHtml(line)}</text>`,
    )
    .join("");
  return `
    <g class="spell${isLit(spell) ? " lit" : ""}" data-spell="${index}" role="button" tabindex="0" style="--color: ${color}" aria-label="${escapeHtml(spell.name)}${isLit(spell) ? ", allumé, activer pour l'éteindre" : ""}">
      <path class="sector" d="${path}"></path>
      <g class="icon" transform="translate(${middle.x - 12} ${top})">${STYLE_ICONS[spell.style]}</g>
      ${text}
    </g>`;
}

function renderWheel() {
  const half = WHEEL_OUTER + 4;
  app.innerHTML = `
    <svg class="wheel" viewBox="${-half} ${-half} ${half * 2} ${half * 2}">${spells.map(spellSector).join("")}</svg>
    <div class="detail" id="detail" hidden></div>`;
  const pill = app.querySelector<HTMLDivElement>("#detail")!;
  app.querySelectorAll<SVGGElement>("[data-spell]").forEach((element) => {
    const spell = spells[Number(element.dataset.spell)];
    const show = () => {
      pill.textContent = isLit(spell) ? `${detail(spell)} · allumé` : detail(spell);
      pill.hidden = false;
    };
    const hide = () => {
      pill.hidden = true;
    };
    element.addEventListener("pointerenter", show);
    element.addEventListener("pointerleave", hide);
    element.addEventListener("focus", show);
    element.addEventListener("blur", hide);
    const cast = async (event: Event) => {
      event.stopPropagation();
      await OBR.broadcast.sendMessage(
        FX_WHEEL_CHANNEL,
        { token: tokenId, spell },
        { destination: "LOCAL" },
      );
      await close();
    };
    element.addEventListener("click", cast);
    element.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") cast(event);
    });
  });
}

/** La roue ne sert qu'à lancer : elle renvoie vers le menu Effets, où elle se configure. */
function renderEmpty() {
  app.innerHTML = `
    <div class="card" id="card">
      <strong>${escapeHtml(tokenName || "Ce token")}</strong>
      <p class="empty">Aucun sort sur ce token.</p>
      <button type="button" id="configure">Configurer sa roue</button>
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
  lit = durablesIn(await OBR.scene.getMetadata()).filter(({ carrier }) => carrier?.id === tokenId);
  // Un clic dans le vide de la roue la referme, comme un clic à côté.
  document.body.onclick = () => close();
  if (spells.length) renderWheel();
  else renderEmpty();
});
