import OBR from "@owlbear-rodeo/sdk";
import {
  ELEMENTS,
  FX_SPELLS_KEY,
  FX_WHEEL_CHANNEL,
  FX_WHEEL_ID,
  MAX_NAME_LENGTH,
  MAX_SPELLS,
  STYLES,
  addFavorite,
  defaultSpellName,
  loadChoice,
  loadFavorites,
  renameSpell,
  spellsOf,
  wheelPositions,
  type Favorite,
  type Rgb,
} from "./fx";
import "./wheel.css";

const app = document.querySelector<HTMLDivElement>("#app")!;
const tokenId = new URLSearchParams(location.search).get("token") ?? "";
let spells: Favorite[] = [];
let tokenName = "";

const css = ([r, g, b]: Rgb) => `rgb(${r * 255} ${g * 255} ${b * 255})`;

const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

const close = () => OBR.popover.close(FX_WHEEL_ID);

/** La liste change aussitôt, pour qu'un clic juste après un renommage parte du bon état. */
async function saveSpells(next: Favorite[]) {
  const previous = spells;
  spells = next;
  try {
    await OBR.scene.items.updateItems(
      (item) => item.id === tokenId,
      (drafts) => {
        for (const draft of drafts) draft.metadata[FX_SPELLS_KEY] = next;
      },
    );
  } catch (error) {
    spells = previous;
    throw error;
  }
}

function spellBackground({ element }: Favorite) {
  const [cold, mid, hot] = ELEMENTS[element].palette;
  return `radial-gradient(circle at 50% 35%, ${css(hot)}, ${css(mid)} 45%, ${css(cold)})`;
}

function renderWheel() {
  const positions = wheelPositions(spells.length, 37);
  app.innerHTML = `
    ${spells
      .map((spell, index) => {
        const { x, y } = positions[index];
        return `<button type="button" class="spell" data-spell="${index}" title="${escapeHtml(spell.name)}" style="left: ${50 + x}%; top: ${50 + y}%; background: ${spellBackground(spell)}"><span>${escapeHtml(spell.name)}</span></button>`;
      })
      .join("")}
    <button type="button" class="center" id="manage" title="Gérer les sorts" aria-label="Gérer les sorts">⚙</button>`;

  app.querySelector<HTMLButtonElement>("#manage")!.onclick = (event) => {
    event.stopPropagation();
    renderManage();
  };
  app.querySelectorAll<HTMLButtonElement>("[data-spell]").forEach((element) => {
    element.onclick = async (event) => {
      event.stopPropagation();
      const spell = spells[Number(element.dataset.spell)];
      await OBR.broadcast.sendMessage(
        FX_WHEEL_CHANNEL,
        { token: tokenId, spell },
        { destination: "LOCAL" },
      );
      await close();
    };
  });
}

function renderManage() {
  const choice = loadChoice(localStorage);
  const current: Favorite = {
    name: defaultSpellName(choice),
    element: choice.element,
    style: choice.style,
    size: choice.size,
    exact: choice.exact,
  };
  const candidates = [current, ...loadFavorites(localStorage)];
  const full = spells.length >= MAX_SPELLS;
  app.innerHTML = `
    <div class="card" id="card">
      <header class="bar">
        <strong>${escapeHtml(tokenName || "Sorts du token")}</strong>
        <button type="button" id="back">${spells.length ? "Roue" : "Fermer"}</button>
      </header>
      <section>
        <h2>Sorts (${spells.length}/${MAX_SPELLS})</h2>
        ${
          spells.length
            ? spells
                .map(
                  (spell, index) => `
                    <div class="row">
                      <input type="text" data-name="${index}" maxlength="${MAX_NAME_LENGTH}" value="${escapeHtml(spell.name)}" aria-label="Nom du sort ${escapeHtml(spell.name)}" />
                      <small>${STYLES[spell.style].label}</small>
                      <button type="button" data-remove="${index}" aria-label="Retirer ${escapeHtml(spell.name)}" title="Retirer">✕</button>
                    </div>`,
                )
                .join("")
            : `<p class="empty">Aucun sort pour l'instant.</p>`
        }
      </section>
      <section>
        <h2>Ajouter</h2>
        ${
          full
            ? `<p class="note">La roue est pleine : retire un sort pour en ajouter un.</p>`
            : `<form class="row" id="add-current">
                <input type="text" id="new-name" maxlength="${MAX_NAME_LENGTH}" aria-label="Nom du nouveau sort" placeholder="${escapeHtml(current.name)}" />
                <button type="submit" data-add="0">+ Réglage en cours</button>
              </form>
              ${candidates
                .slice(1)
                .map(
                  (candidate, index) =>
                    `<button type="button" class="add" data-add="${index + 1}">+ ${escapeHtml(candidate.name)}</button>`,
                )
                .join("")}`
        }
      </section>
    </div>`;

  app.querySelector<HTMLDivElement>("#card")!.onclick = (event) => event.stopPropagation();
  app.querySelector<HTMLButtonElement>("#back")!.onclick = () => {
    if (spells.length) renderWheel();
    else close();
  };
  const refresh = (next: Favorite[]) =>
    saveSpells(next)
      .then(renderManage)
      .catch((error) => console.warn("Effets :", error));
  app.querySelectorAll<HTMLButtonElement>("[data-remove]").forEach((element) => {
    element.onclick = () =>
      refresh(spells.filter((_, index) => index !== Number(element.dataset.remove)));
  });
  const add = (candidate: Favorite, name: string) =>
    refresh(addFavorite(spells, name, { ...candidate, gmOnly: false }, MAX_SPELLS));
  app.querySelectorAll<HTMLButtonElement>(".add").forEach((element) => {
    element.onclick = () => {
      const candidate = candidates[Number(element.dataset.add)];
      add(candidate, candidate.name);
    };
  });
  const addCurrent = app.querySelector<HTMLFormElement>("#add-current");
  if (addCurrent) {
    addCurrent.onsubmit = (event) => {
      event.preventDefault();
      const name = app.querySelector<HTMLInputElement>("#new-name")!.value;
      add(current, name.trim() || current.name);
    };
  }
  // Pas de nouveau rendu après un renommage : il remplacerait le bouton qu'on est en train de cliquer.
  app.querySelectorAll<HTMLInputElement>("[data-name]").forEach((input) => {
    const index = Number(input.dataset.name);
    input.onkeydown = (event) => {
      if (event.key === "Enter") input.blur();
    };
    input.onchange = () => {
      const previous = spells[index].name;
      const next = renameSpell(spells, index, input.value);
      input.value = next[index].name;
      if (next === spells) return;
      saveSpells(next).catch((error) => {
        console.warn("Effets :", error);
        input.value = previous;
      });
    };
  });
}

OBR.onReady(async () => {
  const [item] = await OBR.scene.items.getItems([tokenId]);
  if (!item) {
    await close();
    return;
  }
  tokenName = item.name;
  spells = spellsOf(item.metadata);
  // Un clic dans le vide de la roue la referme, comme un clic à côté.
  document.body.onclick = () => close();
  if (spells.length) renderWheel();
  else renderManage();
});
