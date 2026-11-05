import { readDirection } from "./fx";
import { t } from "./i18n";

const STEP = 5;

/** Direction des griffes et du coup : au hasard, ou fixe avec un curseur de 0 à 360. */
export function directionField(direction: number | undefined, className = "") {
  const fixed = direction !== undefined;
  const value = direction ?? 0;
  return `
    <div class="direction ${className}" data-direction data-fixed="${fixed ? "1" : "0"}">
      <div class="direction-head">
        <span>${t("direction.label")}</span>
        <div class="direction-modes" role="group" aria-label="${t("direction.label")}">
          <button type="button" data-direction-mode="random" aria-pressed="${!fixed}">${t("direction.random")}</button>
          <button type="button" data-direction-mode="fixed" aria-pressed="${fixed}">${t("direction.fixed")}</button>
        </div>
      </div>
      <div class="direction-slider"${fixed ? "" : " hidden"}>
        <span class="direction-arrow" style="transform: rotate(${value}deg)" aria-hidden="true">↑</span>
        <input id="direction" type="range" min="0" max="360" step="${STEP}" value="${value}" aria-label="${t("direction.label")}" />
        <output>${value}°</output>
      </div>
    </div>`;
}

/** La valeur choisie dans ce conteneur. Sans champ affiché ou au hasard : rien. */
export function readDirectionField(root: ParentNode) {
  const field = root.querySelector<HTMLElement>("[data-direction]");
  if (field?.dataset.fixed !== "1") return undefined;
  return readDirection(field.querySelector<HTMLInputElement>("#direction")!.valueAsNumber);
}

/** Le bouton et le curseur vivent d'eux-mêmes, où que le champ soit affiché. */
export function watchDirectionFields(root: HTMLElement) {
  root.addEventListener("input", (event) => {
    const input = event.target as HTMLInputElement;
    if (input.id !== "direction") return;
    const field = input.closest<HTMLElement>("[data-direction]");
    field!.querySelector<HTMLElement>(".direction-arrow")!.style.transform = `rotate(${input.value}deg)`;
    field!.querySelector("output")!.textContent = `${input.value}°`;
  });
  root.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-direction-mode]");
    if (!button) return;
    const field = button.closest<HTMLElement>("[data-direction]")!;
    const fixed = button.dataset.directionMode === "fixed";
    field.dataset.fixed = fixed ? "1" : "0";
    field.querySelectorAll<HTMLButtonElement>("[data-direction-mode]").forEach((mode) => {
      mode.setAttribute("aria-pressed", String(mode === button));
    });
    field.querySelector<HTMLElement>(".direction-slider")!.hidden = !fixed;
    // Prévient qui suit le réglage, comme si le curseur avait bougé.
    field.querySelector("#direction")!.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
