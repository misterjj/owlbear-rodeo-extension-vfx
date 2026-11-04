import { ELEMENTS, ELEMENT_IDS, SIZE_IDS, STYLES, STYLE_GROUPS, readableColor, type ElementId, type FxCast, type Rgb, type StyleId } from "./fx";
import { styleIcon } from "./fx-icons";

/** Éléments de formulaire communs aux onglets Lancer et Programmes. */
const css = ([r, g, b]: Rgb) => `rgb(${r * 255} ${g * 255} ${b * 255})`;

export type PickerId = "element" | "style";

export const elementColor = (element: ElementId) => css(readableColor(ELEMENTS[element].palette[1] as Rgb));

export const swatch = (element: ElementId) => {
  const { palette } = ELEMENTS[element];
  return `<span class="swatch" style="background: radial-gradient(${css(palette[2] as Rgb)}, ${css(palette[1] as Rgb)} 55%, ${css(palette[0] as Rgb)})"></span>`;
};

export const choiceButton = (group: keyof FxCast, value: string, content: string, label: string, pressed: boolean) =>
  `<button type="button" data-group="${group}" data-value="${value}" aria-label="${label}" aria-pressed="${pressed}">${content}</button>`;

/** Ligne qui montre le choix en cours et ouvre sa grille. */
export function pickerRow(id: PickerId, label: string, value: string, open: boolean) {
  return `
    <button type="button" class="picker${open ? " open" : ""}" data-picker="${id}" aria-expanded="${open}">
      <small>${label}</small>
      <b>${value}</b>
      <span class="chevron">${open ? "▴" : "▾"}</span>
    </button>`;
}

export const elementValue = (element: ElementId) => `${swatch(element)}${ELEMENTS[element].label}`;

export function elementGrid(selected: ElementId) {
  return `
    <div class="grid">
      ${ELEMENT_IDS.map((id) => choiceButton("element", id, `${swatch(id)}<span>${ELEMENTS[id].label}</span>`, ELEMENTS[id].label, id === selected)).join("")}
    </div>`;
}

const SHORT_LABELS: Partial<Record<StyleId, string>> = { transformation: "Transfo.", teleportation: "Téléport." };

export function styleGrid(selected: StyleId) {
  return STYLE_GROUPS.map(
    ({ label, styles }) => `
      <h3>${label}</h3>
      <div class="grid">
        ${styles.map((id) => choiceButton("style", id, `${styleIcon(id)}<span>${SHORT_LABELS[id] ?? STYLES[id].label}</span>`, STYLES[id].label, id === selected)).join("")}
      </div>`,
  ).join("");
}

export function sizeRow(selected: string, off: boolean) {
  return `
    <div class="choices sizes ${off ? "off" : ""}" id="sizes">
      ${SIZE_IDS.map((id) => choiceButton("size", id, id, `Taille ${id}`, id === selected)).join("")}
    </div>`;
}
