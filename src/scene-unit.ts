import OBR from "@owlbear-rodeo/sdk";
import { unitLabel } from "./fx";

/** Suit l'unité de la scène : elle n'est pas connue avant son chargement, et l'échelle peut changer. */
export async function watchSceneUnit(apply: (unit: string) => void) {
  const read = async () => {
    if (!(await OBR.scene.isReady())) return;
    const unit = unitLabel((await OBR.scene.grid.getScale()).parsed);
    apply(unit);
    // Sans refaire la fenêtre, ce qui effacerait une saisie en cours.
    document.querySelectorAll("[data-unit]").forEach((element) => {
      element.textContent = unit;
    });
  };
  OBR.scene.onReadyChange((ready) => {
    if (ready) read().catch((error) => console.warn("Effets :", error));
  });
  OBR.scene.grid.onChange(() => {
    read().catch((error) => console.warn("Effets :", error));
  });
  await read();
}
