import OBR from "@owlbear-rodeo/sdk";
import {
  ELEMENTS,
  ELEMENT_IDS,
  FX_SPELLS_KEY,
  FX_WHEEL_CHANNEL,
  FX_WHEEL_ID,
  MAX_NAME_LENGTH,
  MAX_SPELLS,
  SIZE_IDS,
  STYLES,
  STYLE_IDS,
  addFavorite,
  canBeDurable,
  defaultSpellName,
  durablesIn,
  editSpell,
  exactZoneLabel,
  isDurable,
  loadChoice,
  loadFavorites,
  renameSpell,
  sameDurable,
  spellsOf,
  startsOnFace,
  unitLabel,
  wheelPositions,
  type DurableEntry,
  type ElementId,
  type Favorite,
  type Rgb,
  type SizeId,
  type StyleId,
} from "./fx";
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
        return `<button type="button" class="spell${isLit(spell) ? " lit" : ""}" data-spell="${index}" title="${escapeHtml(spell.name)}${isLit(spell) ? " : allumé, cliquer pour l'éteindre" : ""}" style="left: ${50 + x}%; top: ${50 + y}%; background: ${spellBackground(spell)}"><span>${escapeHtml(spell.name)}</span></button>`;
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
    ...(isDurable(choice) ? { durable: true } : {}),
    ...(startsOnFace(choice) ? { onFace: true } : {}),
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
                      <small>${STYLES[spell.style].label}${isDurable(spell) ? ", durable" : ""}${startsOnFace(spell) ? ", face" : ""}</small>
                      <button type="button" data-edit="${index}" aria-label="Modifier ${escapeHtml(spell.name)}" title="Modifier">✎</button>
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
  app.querySelectorAll<HTMLButtonElement>("[data-edit]").forEach((element) => {
    element.onclick = () => renderEdit(Number(element.dataset.edit));
  });
  app.querySelectorAll<HTMLButtonElement>("[data-remove]").forEach((element) => {
    element.onclick = () =>
      refresh(spells.filter((_, index) => index !== Number(element.dataset.remove)));
  });
  const add = (candidate: Favorite, name: string) =>
    refresh(addFavorite(spells, name, { ...candidate, gmOnly: false, durable: candidate.durable === true }, MAX_SPELLS));
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

function options<T extends string>(ids: readonly T[], label: (id: T) => string, selected: T) {
  return ids
    .map((id) => `<option value="${id}"${id === selected ? " selected" : ""}>${escapeHtml(label(id))}</option>`)
    .join("");
}

function renderEdit(index: number) {
  const spell = spells[index];
  app.innerHTML = `
    <div class="card" id="card">
      <header class="bar">
        <strong>Modifier le sort</strong>
        <button type="button" id="back">Retour</button>
      </header>
      <form id="edit" class="edit" novalidate>
        <label class="wide">Nom<input type="text" id="name" maxlength="${MAX_NAME_LENGTH}" value="${escapeHtml(spell.name)}" /></label>
        <label>Élément<select id="element">${options(ELEMENT_IDS, (id) => ELEMENTS[id].label, spell.element)}</select></label>
        <label>Style<select id="style">${options(STYLE_IDS, (id) => STYLES[id].label, spell.style)}</select></label>
        <label>Taille<select id="size">${options(SIZE_IDS, (id) => id, spell.size)}</select></label>
        <label id="exact-row"><span id="exact-label"></span><input type="number" id="exact" min="0" step="any" value="${spell.exact ?? ""}" /></label>
        <label class="wide" id="origin-row">Origine sur le token<select id="origin">
          <option value="centre"${spell.onFace ? "" : " selected"}>Au centre</option>
          <option value="face"${spell.onFace ? " selected" : ""}>Sur une face (viser la direction)</option>
        </select></label>
        <label class="wide check" id="durable-row"><input type="checkbox" id="durable"${spell.durable ? " checked" : ""} /> Durable</label>
        ${isLit(spell) ? `<p class="note wide">Déjà allumé : l'effet en cours ne change pas. Éteins-le, au besoin depuis le panneau, pour voir la nouvelle version.</p>` : ""}
        <p class="error wide" id="error" hidden></p>
        <button type="submit" class="wide save">Enregistrer</button>
      </form>
    </div>`;

  const form = app.querySelector<HTMLFormElement>("#edit")!;
  const field = <T extends HTMLElement>(id: string) => form.querySelector<T>(`#${id}`)!;
  const styleField = field<HTMLSelectElement>("style");
  const error = field<HTMLParagraphElement>("error");
  const back = () => renderManage();

  // Les champs masqués gardent leur valeur : revenir au style d'avant ne la perd pas.
  const showFieldsOfStyle = () => {
    const style = styleField.value as StyleId;
    field("exact-row").hidden = !STYLES[style].exactZone;
    field("exact-label").textContent = `${exactZoneLabel(style)} exact (${unit})`;
    field("durable-row").hidden = !canBeDurable(style);
    field("origin-row").hidden = style !== "cube";
  };
  showFieldsOfStyle();
  styleField.onchange = showFieldsOfStyle;

  app.querySelector<HTMLDivElement>("#card")!.onclick = (event) => event.stopPropagation();
  app.querySelector<HTMLButtonElement>("#back")!.onclick = back;
  form.onkeydown = (event) => {
    if (event.key === "Escape") back();
  };
  form.oninput = () => {
    error.hidden = true;
  };
  form.onsubmit = (event) => {
    event.preventDefault();
    const next = editSpell(spells, index, {
      name: field<HTMLInputElement>("name").value,
      element: field<HTMLSelectElement>("element").value as ElementId,
      style: styleField.value as StyleId,
      size: field<HTMLSelectElement>("size").value as SizeId,
      exact: field<HTMLInputElement>("exact").valueAsNumber,
      durable: field<HTMLInputElement>("durable").checked,
      onFace: field<HTMLSelectElement>("origin").value === "face",
    });
    const fail = (message: string) => {
      error.textContent = message;
      error.hidden = false;
    };
    if (next === spells) {
      fail("Ce nom est vide ou déjà pris par un autre sort.");
      return;
    }
    saveSpells(next)
      .then(back)
      .catch((reason) => {
        console.warn("Effets :", reason);
        fail("Enregistrement impossible.");
      });
  };
  field<HTMLInputElement>("name").focus();
}

OBR.onReady(async () => {
  const [item] = await OBR.scene.items.getItems([tokenId]);
  if (!item) {
    await close();
    return;
  }
  unit = unitLabel((await OBR.scene.grid.getScale()).parsed);
  tokenName = item.name;
  spells = spellsOf(item.metadata);
  lit = durablesIn(await OBR.scene.getMetadata()).filter(({ carrier }) => carrier?.id === tokenId);
  // Un clic dans le vide de la roue la referme, comme un clic à côté.
  document.body.onclick = () => close();
  if (spells.length) renderWheel();
  else renderManage();
});
