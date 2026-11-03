import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  DEFAULT_CHOICE,
  ELEMENTS,
  ELEMENT_IDS,
  SIZES,
  STYLES,
  STYLE_IDS,
  MAX_FAVORITES,
  MAX_SPELLS,
  MAX_DURABLE,
  canBeDurable,
  castsOnSelf,
  durableChanges,
  durableItemId,
  durablesIn,
  firesFromToken,
  isDurable,
  sameDurable,
  defaultSpellName,
  parseWheelCast,
  renameSpell,
  spellsOf,
  wheelPositions,
  type DurableEntry,
  type Favorite,
  addFavorite,
  arrowDuration,
  buildMessage,
  coneTarget,
  effectScale,
  exactCells,
  fitsCellCenter,
  loadChoice,
  loadFavorites,
  matchesFavorite,
  parseFxMessage,
  playerCooldownOver,
  playersAllowedIn,
  previewOutline,
  projectileDuration,
  saveChoice,
  saveFavorites,
  scaledDuration,
  teleportTiming,
  tokenAt,
} from "../src/fx";
import * as shaders from "../src/fx-shaders";

const at = { x: 1, y: 2 };
const choice = { element: "glace", style: "explosion", size: "XL" };

function memoryStorage(initial?: string) {
  let value = initial ?? null;
  return {
    getItem: () => value,
    setItem: (_key: string, next: string) => {
      value = next;
    },
  };
}

describe("messages d'effet", () => {
  it("accepte un effet sur la carte et ignore un lanceur inutile", () => {
    expect(parseFxMessage({ ...choice, at, from: at, seed: 3 })).toEqual({ ...choice, at, seed: 3 });
  });

  it("exige un lanceur pour les effets dirigés", () => {
    const directed = { ...choice, style: "rayon", at, seed: 3 };
    expect(parseFxMessage(directed)).toBeUndefined();
    expect(parseFxMessage({ ...directed, from: at })).toEqual({ ...directed, from: at });
  });

  it("ignore les messages invalides venus du réseau", () => {
    for (const data of [
      null,
      "explosion",
      { ...choice, at },
      { ...choice, at, seed: "1" },
      { ...choice, seed: 1 },
      { ...choice, at: { x: Number.NaN, y: 0 }, seed: 1 },
      { ...choice, element: "constructor", at, seed: 1 },
      { ...choice, style: "toString", at, seed: 1 },
      { ...choice, size: "XXL", at, seed: 1 },
    ]) {
      expect(parseFxMessage(data)).toBeUndefined();
    }
  });
});

describe("zone exacte et MJ seulement dans les messages", () => {
  const full = {
    element: "feu",
    style: "explosion",
    size: "M",
    exact: 6,
    gmOnly: true,
    durable: false,
  } as const;

  it("convertit la zone dans l'unité de la scène en cases", () => {
    expect(buildMessage(full, at, undefined, 1.5, 3)).toEqual({
      element: "feu",
      style: "explosion",
      size: "M",
      at,
      seed: 3,
      cells: 4,
      gmOnly: true,
    });
  });

  it("n'applique pas la zone exacte aux styles sans zone", () => {
    const message = buildMessage({ ...full, style: "coup", gmOnly: false }, at, undefined, 1.5, 3);
    expect(message).toEqual({ element: "feu", style: "coup", size: "M", at, seed: 3 });
  });

  it("donne à l'effet exactement la zone demandée", () => {
    expect(effectScale("explosion", "XL", 5)).toBe(2);
    expect(effectScale("cone", "XS", 5)).toBe(1);
    expect(effectScale("explosion", "L", undefined)).toBe(SIZES.L);
    expect(effectScale("coup", "L", 5)).toBe(SIZES.L);
  });

  it("borne les zones et refuse celles qui sont invalides", () => {
    expect(exactCells({ ...full, exact: 100000 }, 1.5)).toBe(40);
    expect(exactCells({ ...full, exact: null }, 1.5)).toBeUndefined();
    expect(parseFxMessage({ ...choice, at, seed: 1, cells: 9000 })?.cells).toBe(40);
    for (const cells of [0, -1, "3", Number.NaN]) {
      expect(parseFxMessage({ ...choice, at, seed: 1, cells })).toBeUndefined();
    }
  });

  it("ne garde que le vrai drapeau MJ seulement", () => {
    expect(parseFxMessage({ ...choice, at, seed: 1, gmOnly: true })?.gmOnly).toBe(true);
    expect(parseFxMessage({ ...choice, at, seed: 1, gmOnly: "oui" })).not.toHaveProperty("gmOnly");
  });
});

describe("favoris", () => {
  const current = {
    element: "feu",
    style: "explosion",
    size: "L",
    exact: null,
    gmOnly: true,
    durable: false,
  } as const;

  it("enregistre un favori sans le drapeau MJ seulement", () => {
    expect(addFavorite([], "  Boule de feu ", current)).toEqual([
      { name: "Boule de feu", element: "feu", style: "explosion", size: "L", exact: null },
    ]);
  });

  it("remplace un favori du même nom, sans tenir compte de la casse", () => {
    const first = addFavorite([], "Boule", current);
    const second = addFavorite(first, "boule", { ...current, element: "glace" });
    expect(second).toHaveLength(1);
    expect(second[0]).toMatchObject({ name: "boule", element: "glace" });
  });

  it("ignore un nom vide et ne dépasse pas la limite", () => {
    expect(addFavorite([], "   ", current)).toEqual([]);
    let list = addFavorite([], "a0", current);
    for (let i = 1; i <= MAX_FAVORITES + 3; i++) list = addFavorite(list, `a${i}`, current);
    expect(list).toHaveLength(MAX_FAVORITES);
    expect(addFavorite(list, "A0", { ...current, size: "S" })[0].size).toBe("S");
  });

  it("relit ce qui est valide et écarte le reste", () => {
    const storage = memoryStorage();
    const list = addFavorite([], "Boule", current);
    saveFavorites(storage, list);
    expect(loadFavorites(storage)).toEqual(list);
    expect(loadFavorites(memoryStorage("pas du json"))).toEqual([]);
    expect(loadFavorites(memoryStorage('{"a":1}'))).toEqual([]);
    expect(loadFavorites(memoryStorage(`[{"name":"x","element":"constructor"},${JSON.stringify(list[0])}]`))).toEqual(list);
  });

  it("reconnaît le favori correspondant au réglage", () => {
    const [favorite] = addFavorite([], "Boule", current);
    expect(matchesFavorite(favorite, current)).toBe(true);
    expect(matchesFavorite(favorite, { ...current, gmOnly: false })).toBe(true);
    expect(matchesFavorite(favorite, { ...current, exact: 6 })).toBe(false);
  });
});

describe("aperçu", () => {
  const pointer = { x: 100, y: 0 };

  it("entoure le pointeur pour un effet de zone", () => {
    const outline = previewOutline("explosion", undefined, pointer, 50)!;
    expect(outline.closed).toBe(true);
    for (const point of outline.points) {
      expect(Math.hypot(point.x - 100, point.y)).toBeCloseTo(50);
    }
  });

  it("attend le lanceur pour un effet dirigé", () => {
    expect(previewOutline("rayon", undefined, pointer, 0)).toBeUndefined();
    expect(previewOutline("cone", undefined, pointer, 100)).toBeUndefined();
  });

  it("relie le lanceur au pointeur", () => {
    expect(previewOutline("rayon", at, pointer, 0)).toEqual({ points: [at, pointer], closed: false });
  });

  it("dessine un cône aussi large que long, de la longueur demandée", () => {
    const outline = previewOutline("cone", { x: 0, y: 0 }, { x: 10, y: 0 }, 100)!;
    expect(outline.closed).toBe(true);
    expect(outline.points[0]).toEqual({ x: 0, y: 0 });
    const [first, last] = [outline.points[1], outline.points.at(-1)!];
    expect(Math.hypot(first.x, first.y)).toBeCloseTo(100);
    expect(last.y - first.y).toBeCloseTo(2 * 100 * Math.sin(Math.atan(0.5)));
  });
});

describe("joueurs", () => {
  it("refuse tant que le MJ n'a pas autorisé", () => {
    expect(playersAllowedIn({})).toBe(false);
    expect(playersAllowedIn({ "vfx-owlbear/reglages": { players: "oui" } })).toBe(false);
    expect(playersAllowedIn({ "vfx-owlbear/reglages": { players: true } })).toBe(true);
  });

  it("espace les effets d'un même joueur", () => {
    expect(playerCooldownOver(undefined, 10)).toBe(true);
    expect(playerCooldownOver(1000, 1100)).toBe(false);
    expect(playerCooldownOver(1000, 1300)).toBe(true);
  });
});

describe("réglages", () => {
  it("garde la taille M comme référence", () => {
    expect(SIZES.M).toBe(1);
    expect(Object.keys(SIZES)).toEqual(["XS", "S", "M", "L", "XL"]);
    expect(scaledDuration(1500, SIZES.M)).toBe(1500);
    expect(scaledDuration(1500, SIZES.XL)).toBeGreaterThan(1500);
    expect(scaledDuration(1500, 50)).toBe(scaledDuration(1500, 4));
  });

  it("retrouve le dernier réglage", () => {
    const storage = memoryStorage();
    expect(loadChoice(storage)).toEqual(DEFAULT_CHOICE);
    const saved = {
      element: "poison",
      style: "aura",
      size: "XS",
      exact: 6,
      gmOnly: true,
      durable: true,
    } as const;
    saveChoice(storage, saved);
    expect(loadChoice(storage)).toEqual(saved);
  });

  it("remplace ce qui est illisible par le réglage par défaut", () => {
    expect(loadChoice(memoryStorage("pas du json"))).toEqual(DEFAULT_CHOICE);
    expect(loadChoice(memoryStorage("null"))).toEqual(DEFAULT_CHOICE);
    expect(loadChoice(memoryStorage('{"element":"constructor","size":"XL"}'))).toEqual({
      ...DEFAULT_CHOICE,
      size: "XL",
    });
  });

  it("donne à chaque élément une palette complète", () => {
    expect(ELEMENT_IDS).toHaveLength(16);
    for (const id of ELEMENT_IDS) {
      expect(ELEMENTS[id].palette.flat()).toHaveLength(9);
      expect(ELEMENTS[id].smoke).toHaveLength(3);
    }
  });

  it("propose tous les styles, et demande un lanceur seulement à ceux qui partent d'un point", () => {
    expect(STYLE_IDS).toHaveLength(16);
    expect(STYLE_IDS.filter((id) => STYLES[id].directed)).toEqual([
      "fleche",
      "projectile",
      "rayon",
      "chaine",
      "cone",
      "mur",
      "teleportation",
    ]);
  });
});

describe("géométrie", () => {
  it("garde la durée du projectile dans des limites raisonnables", () => {
    const from = { x: 0, y: 0 };
    expect(projectileDuration(from, { x: 150, y: 0 }, 150)).toBe(220);
    expect(projectileDuration(from, { x: 900, y: 0 }, 150)).toBe(420);
    expect(projectileDuration(from, { x: 90000, y: 0 }, 150)).toBe(800);
  });

  it("fait voler la flèche plus vite qu'un projectile", () => {
    const from = { x: 0, y: 0 };
    const to = { x: 900, y: 0 };
    expect(arrowDuration(from, to, 150)).toBeLessThan(projectileDuration(from, to, 150));
  });

  it("donne au cône sa longueur quelle que soit la distance du clic", () => {
    expect(coneTarget({ x: 0, y: 0 }, { x: 10, y: 0 }, 750)).toEqual({ x: 750, y: 0 });
    expect(coneTarget({ x: 5, y: 5 }, { x: 5, y: 5 }, 750)).toEqual({ x: 0, y: 0 });
  });

  it("place tous les effets avec le repère fourni par Owlbear", () => {
    const sources = Object.values(shaders).filter((value) => typeof value === "string");
    expect(sources).toHaveLength(14);
    for (const sksl of sources) {
      expect(sksl).toContain("uniform mat3 model;");
      expect(sksl).toContain("uniform float t;");
    }
  });

  it("anime les effets durables avec l'horloge d'Owlbear, sans message", () => {
    for (const sksl of Object.values(shaders.DURABLE_SKSL)) {
      expect(sksl).toContain("uniform mat3 model;");
      expect(sksl).toContain("uniform float time;");
      expect(sksl).not.toContain("uniform float t;");
    }
  });

  it("propose une version continue pour chaque style qui peut durer", () => {
    expect(STYLE_IDS.filter(canBeDurable).sort()).toEqual(Object.keys(shaders.DURABLE_SKSL).sort());
  });
});

describe("clic sur un token", () => {
  const token = (x: number, layer = "CHARACTER", zIndex = 1) => ({
    id: `token-${x}`,
    name: `Token ${x}`,
    owner: "mj",
    width: 100,
    center: { x, y: 0 },
    min: { x: x - 50, y: -50 },
    max: { x: x + 50, y: 50 },
    layer,
    zIndex,
  });

  it("vise le centre du token sous le pointeur", () => {
    expect(tokenAt({ x: 130, y: 40 }, [token(0), token(100)])?.center).toEqual({ x: 100, y: 0 });
  });

  it("ne vise rien hors des tokens", () => {
    expect(tokenAt({ x: 500, y: 0 }, [token(0)])).toBeUndefined();
    expect(tokenAt({ x: 0, y: 0 }, [])).toBeUndefined();
  });

  it("choisit le token du dessus quand ils se chevauchent", () => {
    const point = { x: 50, y: 0 };
    expect(tokenAt(point, [token(0, "CHARACTER", 1), token(100, "CHARACTER", 2)])?.center.x).toBe(100);
    expect(tokenAt(point, [token(0, "CHARACTER", 1), token(100, "MOUNT", 9)])?.center.x).toBe(0);
  });
});

describe("téléportation", () => {
  it("centre sur une case un token de largeur impaire, sur un coin une largeur paire", () => {
    expect(fitsCellCenter(150, 150)).toBe(true);
    expect(fitsCellCenter(300, 150)).toBe(false);
    expect(fitsCellCenter(450, 150)).toBe(true);
  });

  it("traite un token plus petit qu'une case comme une case", () => {
    expect(fitsCellCenter(40, 150)).toBe(true);
  });

  it("fait arriver le token pendant que le départ se termine", () => {
    const { duration, arrivalDelay } = teleportTiming("M");
    expect(arrivalDelay).toBeGreaterThan(0);
    expect(arrivalDelay).toBeLessThan(duration);
  });
});

describe("sorts d'un token", () => {
  const spell: Favorite = { name: "Griffes", element: "sang", style: "griffes", size: "M", exact: null };
  const key = "vfx-owlbear/sorts";

  it("relit les sorts valides du token", () => {
    expect(spellsOf({})).toEqual([]);
    expect(spellsOf({ [key]: "non" })).toEqual([]);
    expect(spellsOf({ [key]: [spell, { name: "x", element: "toString" }] })).toEqual([spell]);
  });

  it("ne garde pas plus de sorts que la roue n'en affiche", () => {
    const many = Array.from({ length: MAX_SPELLS + 3 }, (_, i) => ({ ...spell, name: `s${i}` }));
    expect(spellsOf({ [key]: many })).toHaveLength(MAX_SPELLS);
  });

  it("renomme un sort, sans nom vide ni doublon", () => {
    const list = [spell, { ...spell, name: "Morsure" }];
    expect(renameSpell(list, 0, "  Griffes de loup ")[0].name).toBe("Griffes de loup");
    expect(renameSpell(list, 0, "griffes")[0].name).toBe("griffes");
    expect(renameSpell(list, 0, "   ")).toBe(list);
    expect(renameSpell(list, 0, "MORSURE")).toBe(list);
    expect(renameSpell(list, 0, "x".repeat(50))[0].name).toHaveLength(30);
  });

  it("nomme un sort d'après son style et son élément", () => {
    expect(defaultSpellName({ element: "feu", style: "explosion", size: "M" })).toBe("Explosion · Feu");
  });

  it("ne fait viser que les effets qui ne partent pas du token lui-même", () => {
    for (const style of ["aura", "soin", "dome"] as const) expect(castsOnSelf(style)).toBe(true);
    for (const style of ["explosion", "coup", "rayon"] as const) expect(castsOnSelf(style)).toBe(false);
  });

  it("valide le sort choisi dans la roue", () => {
    expect(parseWheelCast({ token: "t", spell })).toEqual({ token: "t", spell });
    expect(parseWheelCast({ token: 1, spell })).toBeUndefined();
    expect(parseWheelCast({ token: "t", spell: { name: "x" } })).toBeUndefined();
    expect(parseWheelCast(null)).toBeUndefined();
  });

  it("répartit les sorts en cercle en partant du haut", () => {
    const [top, right, bottom, left] = wheelPositions(4, 10);
    expect(top.y).toBeCloseTo(-10);
    expect(right.x).toBeCloseTo(10);
    expect(bottom.y).toBeCloseTo(10);
    expect(left.x).toBeCloseTo(-10);
  });

  it("garde les boutons de la roue dans la fenêtre sans qu'ils se chevauchent", () => {
    const [size, button, radius] = [340, 78, (37 / 100) * 340];
    expect(radius + button / 2).toBeLessThanOrEqual(size / 2);
    const [a, b] = wheelPositions(MAX_SPELLS, radius);
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(button);
  });
});

describe("effets durables", () => {
  const key = "vfx-owlbear/durable";

  it("ne rend durable que les styles prévus", () => {
    expect(isDurable({ style: "nuage", durable: true })).toBe(true);
    expect(isDurable({ style: "nuage", durable: false })).toBe(false);
    expect(isDurable({ style: "nuage" })).toBe(false);
    expect(isDurable({ style: "explosion", durable: true })).toBe(false);
  });

  const entry: DurableEntry = {
    id: "e1",
    name: "Aura ténébreuse",
    element: "tenebres",
    style: "nuage",
    scale: 1.2,
    seed: 3,
    at,
    carrier: { id: "mante", name: "Mante" },
    gmOnly: false,
    owner: "mj",
  };

  it("relit la description et écarte ce qui est invalide", () => {
    expect(durablesIn({ [key]: [entry] })).toEqual([entry]);
    expect(durablesIn({})).toEqual([]);
    expect(durablesIn({ [key]: "non" })).toEqual([]);
    for (const bad of [
      { ...entry, element: "constructor" },
      { ...entry, style: "explosion" },
      { ...entry, scale: 0 },
      { ...entry, at: { x: Number.NaN, y: 0 } },
      { ...entry, carrier: { id: 1 } },
      { ...entry, owner: undefined },
    ]) {
      expect(durablesIn({ [key]: [bad] })).toEqual([]);
    }
  });

  it("ne garde pas plus d'effets que la limite", () => {
    const many = Array.from({ length: MAX_DURABLE + 2 }, (_, i) => ({ ...entry, id: `e${i}` }));
    expect(durablesIn({ [key]: many })).toHaveLength(MAX_DURABLE);
  });

  it("reconnaît le même effet déjà allumé, quelle que soit sa taille", () => {
    expect(sameDurable(entry, { element: "tenebres", style: "nuage", size: "XL" })).toBe(true);
    expect(sameDurable(entry, { element: "feu", style: "nuage", size: "M" })).toBe(false);
  });

  describe("effets locaux de chaque joueur", () => {
    const exists = (id: string) => id === "mante";
    const onMap = { ...entry, id: "e2", carrier: undefined };
    const hidden = { ...entry, id: "e3", gmOnly: true };
    const gone = { ...entry, id: "e4", carrier: { id: "parti", name: "Parti" } };

    it("crée ce qui manque et retire ce qui n'est plus décrit", () => {
      const result = durableChanges([entry, onMap], [durableItemId("e1"), durableItemId("vieux")], "GM", exists);
      expect(result.add).toEqual([onMap]);
      expect(result.remove).toEqual([durableItemId("vieux")]);
    });

    it("ne recrée rien quand tout est en place", () => {
      expect(durableChanges([entry], [durableItemId("e1")], "PLAYER", exists)).toEqual({ add: [], remove: [] });
    });

    it("ne montre « MJ seulement » qu'aux MJ", () => {
      expect(durableChanges([hidden], [], "GM", exists).add).toEqual([hidden]);
      expect(durableChanges([hidden], [], "PLAYER", exists).add).toEqual([]);
      expect(durableChanges([hidden], [durableItemId("e3")], "PLAYER", exists).remove).toHaveLength(1);
    });

    it("ignore un effet dont le porteur n'existe plus", () => {
      expect(durableChanges([gone], [], "GM", exists).add).toEqual([]);
    });
  });

  it("depuis la roue, n'attend un clic que s'il faut choisir un point", () => {
    expect(firesFromToken({ style: "nuage", durable: true })).toBe(true);
    expect(firesFromToken({ style: "pluie", durable: true })).toBe(true);
    expect(firesFromToken({ style: "nuage" })).toBe(false);
    expect(firesFromToken({ style: "mur", durable: true })).toBe(false);
    expect(firesFromToken({ style: "aura" })).toBe(true);
  });

  it("limite leur nombre et rend les ténèbres presque opaques", () => {
    expect(MAX_DURABLE).toBeGreaterThan(0);
    expect(ELEMENTS.tenebres.density).toBeGreaterThan(0.9);
    expect(ELEMENTS.poison.density).toBeLessThan(0.7);
  });

  it("garde l'option durable dans un favori et la reconnaît", () => {
    const choice = { element: "feu", style: "aura", size: "M", exact: null, gmOnly: false, durable: true } as const;
    const [favorite] = addFavorite([], "Bouclier", choice);
    expect(favorite.durable).toBe(true);
    expect(matchesFavorite(favorite, choice)).toBe(true);
    expect(matchesFavorite(favorite, { ...choice, durable: false })).toBe(false);
  });
});

describe("manifest", () => {
  it("respecte la limite de description d'Owlbear", () => {
    const manifest = JSON.parse(readFileSync("public/manifest.json", "utf8"));
    expect(manifest.description.length).toBeLessThanOrEqual(128);
  });
});
