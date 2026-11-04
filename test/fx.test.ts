import { beforeAll, describe, expect, it } from "vitest";
import { DICTIONARY_KEYS, LANGUAGES, browserLanguage, dictionary, forceLanguage, t } from "../src/i18n";
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
  DEFAULT_LIMIT,
  MAX_LIMIT,
  limitsIn,
  parseLimit,
  roomSettingsWith,
  castsOnSelf,
  appearAt,
  dueDurables,
  isSustained,
  restDelay,
  durableChanges,
  durableItemId,
  durablesIn,
  firesFromToken,
  isDurable,
  sameDurable,
  defaultSpellName,
  editSpell,
  cubeOnFace,
  startsOnFace,
  parseWheelCast,
  renameSpell,
  spellsOf,
  unitLabel,
  STYLE_GROUPS,
  fitWheelLabel,
  readableColor,
  wheelSector,
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
  exactZoneLabel,
} from "../src/fx";
import { STYLE_ICONS } from "../src/fx-icons";
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

  it("nomme l'unité de la zone exacte sans mentir sur une échelle sans unité", () => {
    expect(unitLabel({ multiplier: 1.5, unit: "m" })).toBe("m");
    expect(unitLabel({ multiplier: 1, unit: "" })).toBe("cases");
    expect(unitLabel({ multiplier: 5, unit: "" })).toBe("unités");
  });

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

  it("réserve les rayons rectilignes et le cône en faisceaux à la lumière", () => {
    expect(ELEMENT_IDS.filter((id) => ELEMENTS[id].radiant)).toEqual(["lumiere"]);
  });

  it("réserve la propagation en ondes au tonnerre", () => {
    expect(ELEMENT_IDS.filter((id) => ELEMENTS[id].sonic)).toEqual(["tonnerre"]);
  });

  it("propose tous les styles, et demande un lanceur seulement à ceux qui partent d'un point", () => {
    expect(STYLE_IDS).toHaveLength(20);
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
    expect(sources).toHaveLength(18);
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
    expect([...STYLE_IDS].sort()).toEqual(Object.keys(shaders.DURABLE_SKSL).sort());
  });
});

describe("effet qui succède à une animation", () => {
  const from = { x: 0, y: 0 };
  const at = { x: 700, y: 0 };

  it("attend la fin du vol pour planter la flèche, plus longtemps si elle va plus loin", () => {
    expect(restDelay("fleche", 1, from, at, 70)).toBeGreaterThan(0);
    expect(restDelay("fleche", 1, from, at, 70)).toBeGreaterThan(restDelay("fleche", 1, from, { x: 70, y: 0 }, 70));
  });

  it("n'attend rien pour la téléportation, qui n'a pas d'animation de départ", () => {
    expect(restDelay("teleportation", 1, from, at, 70)).toBe(0);
  });

  it("donne un instant de relève à tous les autres styles", () => {
    for (const style of STYLE_IDS.filter((id) => id !== "teleportation")) {
      expect(restDelay(style, 1, from, at, 70)).toBeGreaterThan(0);
    }
  });

  it("ne garde que les effets arrivés à leur heure, et dit quand revenir", () => {
    const entry = (id: string, restAt?: number) => ({ id, restAt }) as DurableEntry;
    const { due, next } = dueDurables([entry("a"), entry("b", 100), entry("c", 200), entry("d", 300)], 100);
    expect(due.map(({ id }) => id)).toEqual(["a", "b"]);
    expect(next).toBe(200);
    expect(dueDurables([entry("a")], 0).next).toBeUndefined();
  });

  it("fait apparaître un effet qui tient jusqu'au milieu de sa vie, puis l'y laisse", () => {
    expect(appearAt(1000, 1000, 400)).toBe(0);
    expect(appearAt(1000, 1200, 400)).toBe(0.25);
    expect(appearAt(1000, 5000, 400)).toBe(0.5);
    expect(appearAt(undefined, 1000, 400)).toBe(0.5);
    // Un joueur en avance sur l'heure du tir attend sans rien montrer.
    expect(appearAt(1000, 900, 400)).toBe(0);
  });

  it("donne une apparition sur le même objet aux seuls effets qui tiennent", () => {
    for (const style of STYLE_IDS) {
      const declared = shaders.DURABLE_SKSL[style].includes("uniform float appear;");
      expect([style, declared]).toEqual([style, isSustained(style)]);
    }
  });

  it("relit l'heure de relève, et écarte une valeur invalide", () => {
    const key = "vfx-owlbear/durable";
    const valid: DurableEntry = { id: "e", name: "n", element: "feu", style: "fleche", scale: 1, seed: 1, at, gmOnly: false, owner: "o", restAt: 5 };
    expect(durablesIn({ [key]: [valid] })).toEqual([valid]);
    expect(durablesIn({ [key]: [{ ...valid, restAt: "tard" }] })).toEqual([]);
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

  it("modifie un sort sans toucher aux autres", () => {
    const other = { ...spell, name: "Morsure" };
    const list = [spell, other];
    const next = editSpell(list, 0, { name: " Boule ", element: "feu", style: "explosion", size: "L", exact: 6 });
    expect(next[0]).toEqual({ name: "Boule", element: "feu", style: "explosion", size: "L", exact: 6 });
    expect(next[1]).toBe(other);
    expect(list[0]).toBe(spell);
  });

  it("refuse un nom vide ou déjà pris lors d'une modification", () => {
    const list = [spell, { ...spell, name: "Morsure" }];
    expect(editSpell(list, 0, { ...spell, name: "  " })).toBe(list);
    expect(editSpell(list, 0, { ...spell, name: "morsure" })).toBe(list);
    expect(editSpell(list, 0, { ...spell, size: "XL" })[0].size).toBe("XL");
  });

  it("oublie ce que le nouveau style ne permet pas", () => {
    const zone: Favorite = { name: "Dôme", element: "feu", style: "dome", size: "M", exact: 6, durable: true };
    const kept = editSpell([zone], 0, zone)[0];
    expect(kept.exact).toBe(6);
    expect(kept.durable).toBe(true);
    const changed = editSpell([zone], 0, { ...zone, style: "griffes" })[0];
    expect(changed.exact).toBeNull();
    expect(changed.durable).toBe(true);
    expect(editSpell([zone], 0, { ...zone, exact: Number.NaN })[0].exact).toBeNull();
    expect(editSpell([zone], 0, { ...zone, exact: 0 })[0].exact).toBeNull();
    expect("durable" in editSpell([zone], 0, { ...zone, durable: false })[0]).toBe(false);
  });

  it("nomme un sort d'après son style et son élément", () => {
    expect(defaultSpellName({ element: "feu", style: "explosion", size: "M" })).toBe("Explosion · Feu");
  });

  it("ne fait viser que les effets qui ne partent pas du token lui-même", () => {
    for (const style of ["aura", "soin", "dome", "transformation"] as const) expect(castsOnSelf(style)).toBe(true);
    for (const style of ["explosion", "coup", "rayon"] as const) expect(castsOnSelf(style)).toBe(false);
  });

  it("valide le sort choisi dans la roue", () => {
    expect(parseWheelCast({ token: "t", spell })).toEqual({ token: "t", spell });
    expect(parseWheelCast({ token: 1, spell })).toBeUndefined();
    expect(parseWheelCast({ token: "t", spell: { name: "x" } })).toBeUndefined();
    expect(parseWheelCast(null)).toBeUndefined();
  });

  it("découpe la roue en secteurs, le premier en haut", () => {
    const [top, right, bottom, left] = [0, 1, 2, 3].map((i) => wheelSector(i, 4).middle);
    expect(top.y).toBeLessThan(0);
    expect(top.x).toBeCloseTo(0);
    expect(right.x).toBeGreaterThan(0);
    expect(bottom.y).toBeGreaterThan(0);
    expect(left.x).toBeLessThan(0);
  });

  it("garde la forme d'un secteur avec un seul sort", () => {
    const { path, middle } = wheelSector(0, 1);
    expect(path).toContain(" 0 0 1 ");
    expect(middle.x).toBeCloseTo(0);
    expect(middle.y).toBeLessThan(0);
    expect(path).not.toContain("NaN");
  });

  it("garde le nom à sa taille tant qu'il tient, sinon le réduit", () => {
    expect(fitWheelLabel("Rage", 100)).toEqual({ size: 12.5, lines: ["Rage"] });
    expect(fitWheelLabel("Vague tonnante", 100).lines).toEqual(["Vague tonnante"]);
    const long = fitWheelLabel("Représailles infernales", 80);
    expect(long.size).toBeLessThan(12.5);
    expect(long.lines).toEqual(["Représailles", "infernales"]);
    expect(long.lines.join(" ")).toBe("Représailles infernales");
  });

  it("coupe seulement un nom impossible à faire tenir", () => {
    const { size, lines } = fitWheelLabel("x".repeat(30), 60);
    expect(size).toBe(8.5);
    expect(lines).toHaveLength(2);
    expect(lines[1].endsWith("…")).toBe(true);
    const words = fitWheelLabel("un deux trois quatre cinq six sept huit neuf dix onze", 60);
    expect(words.lines).toHaveLength(2);
    expect(words.lines[1].endsWith("…")).toBe(true);
  });

  it("éclaircit seulement les couleurs trop sombres", () => {
    expect(readableColor([1, 1, 0.9])).toEqual([1, 1, 0.9]);
    const [r, g, b] = readableColor([0.2, 0, 0.3]);
    expect(0.3 * r + 0.59 * g + 0.11 * b).toBeCloseTo(0.45, 1);
    expect(r).toBeGreaterThan(g);
  });

  it("classe chaque style dans un seul groupe, avec une icône", () => {
    const grouped = STYLE_GROUPS.flatMap(({ styles }) => styles);
    expect([...grouped].sort()).toEqual([...STYLE_IDS].sort());
    for (const style of STYLE_IDS) expect(STYLE_ICONS[style]).toContain("<");
  });
});

describe("effets durables", () => {
  const key = "vfx-owlbear/durable";

  it("rend durable tout style qui le demande", () => {
    expect(isDurable({ durable: true })).toBe(true);
    expect(isDurable({ durable: false })).toBe(false);
    expect(isDurable({})).toBe(false);
    expect(isDurable({ durable: true })).toBe(true);
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
      { ...entry, style: "constructor" },
      { ...entry, scale: 0 },
      { ...entry, at: { x: Number.NaN, y: 0 } },
      { ...entry, carrier: { id: 1 } },
      { ...entry, owner: undefined },
    ]) {
      expect(durablesIn({ [key]: [bad] })).toEqual([]);
    }
  });

  it("ne garde pas plus d'effets que la limite", () => {
    const many = Array.from({ length: MAX_LIMIT + 2 }, (_, i) => ({ ...entry, id: `e${i}` }));
    expect(durablesIn({ [key]: many })).toHaveLength(MAX_LIMIT);
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
    // Durables, les effets qu'on envoie sur quelqu'un se visent toujours.
    expect(firesFromToken({ style: "explosion", durable: true })).toBe(false);
    expect(firesFromToken({ style: "coup", durable: true })).toBe(false);
    expect(firesFromToken({ style: "rayon", durable: true })).toBe(false);
    expect(firesFromToken({ style: "aura" })).toBe(true);
  });

  it("limite leur nombre et rend les ténèbres presque opaques", () => {
    expect(DEFAULT_LIMIT).toBe(10);
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

describe("limites réglables", () => {
  const room = (limits: unknown) => ({ "vfx-owlbear/reglages": { players: true, limits } });

  it("vaut 10 par défaut, et tant que la valeur est illisible", () => {
    expect(limitsIn({})).toEqual({ durable: 10, programs: 10 });
    expect(limitsIn(room({ durable: "x", programs: 0 }))).toEqual({ durable: 10, programs: 10 });
    expect(limitsIn(room({ durable: 2.5, programs: MAX_LIMIT + 1 }))).toEqual({ durable: 10, programs: 10 });
    expect(limitsIn(room({ durable: 25, programs: 1 }))).toEqual({ durable: 25, programs: 1 });
  });

  it("ramène une saisie dans les bornes et ignore ce qui est illisible", () => {
    expect(parseLimit("25", 10)).toBe(25);
    expect(parseLimit("0", 10)).toBe(1);
    expect(parseLimit("500", 10)).toBe(MAX_LIMIT);
    expect(parseLimit("7.6", 10)).toBe(8);
    expect(parseLimit("", 10)).toBe(10);
    expect(parseLimit("abc", 12)).toBe(12);
  });

  it("ne perd pas les autres réglages de la salle", () => {
    const limits = { durable: 5, programs: 6 };
    expect(roomSettingsWith(room({ durable: 1, programs: 1 }), { limits })).toEqual(room(limits));
    expect(roomSettingsWith(room(limits), { players: false })).toEqual({ "vfx-owlbear/reglages": { players: false, limits } });
    expect(playersAllowedIn(roomSettingsWith({}, { limits }))).toBe(false);
  });
});

describe("cube sur une face", () => {
  const center = { x: 100, y: 100 };

  it("tourne librement autour du token, sa face contre lui", () => {
    // Token de 150, cube de 450 : 300 entre les deux centres, quelle que soit la direction.
    const right = cubeOnFace(center, { x: 400, y: 100 }, 150, 450);
    expect(right.angle).toBe(0);
    expect(right.offset.x).toBeCloseTo(300);
    expect(right.offset.y).toBeCloseTo(0);
    const up = cubeOnFace(center, { x: 100, y: -50 }, 150, 450);
    expect(up.angle).toBeCloseTo(-Math.PI / 2);
    expect(up.offset.y).toBeCloseTo(-300);
    const diagonal = cubeOnFace(center, { x: 200, y: 200 }, 150, 450);
    expect(diagonal.angle).toBeCloseTo(Math.PI / 4);
    expect(Math.hypot(diagonal.offset.x, diagonal.offset.y)).toBeCloseTo(300);
    expect(diagonal.offset.x).toBeCloseTo(diagonal.offset.y);
  });

  it("garde une direction valable si le pointeur est sur le centre", () => {
    expect(cubeOnFace(center, center, 150, 450).angle).toBe(0);
  });

  it("transmet la rotation et ignore une valeur illisible", () => {
    const message = { element: "feu", style: "cube", size: "M", at: center, seed: 1 };
    expect(parseFxMessage({ ...message, angle: 1.2 })?.angle).toBe(1.2);
    expect(parseFxMessage({ ...message, angle: "x" })?.angle).toBeUndefined();
    expect(parseFxMessage(message)?.angle).toBeUndefined();
  });

  it("montre un aperçu tourné comme le cube", () => {
    const { points } = previewOutline("cube", undefined, { x: 0, y: 0 }, 100, Math.PI / 4)!;
    expect(points[0].x).toBeCloseTo(0);
    expect(points[0].y).toBeCloseTo(-Math.SQRT2 * 50);
  });

  it("ne vaut que pour le cube", () => {
    expect(startsOnFace({ style: "cube", onFace: true })).toBe(true);
    expect(startsOnFace({ style: "cube" })).toBe(false);
    expect(startsOnFace({ style: "dome", onFace: true })).toBe(false);
  });

  it("demande de viser depuis la roue, même durable", () => {
    expect(firesFromToken({ style: "cube", durable: true })).toBe(true);
    expect(firesFromToken({ style: "cube", durable: true, onFace: true })).toBe(false);
  });

  it("est gardé dans le réglage, les favoris et les sorts, puis oublié pour un autre style", () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    const choice = { element: "tonnerre", style: "cube", size: "M", exact: 4.5, gmOnly: false, durable: false, onFace: true } as const;
    saveChoice(storage, choice);
    expect(loadChoice(storage).onFace).toBe(true);
    const [favorite] = addFavorite([], "Vague", choice);
    expect(favorite.onFace).toBe(true);
    expect(matchesFavorite(favorite, choice)).toBe(true);
    expect(matchesFavorite(favorite, { ...choice, onFace: false })).toBe(false);
    expect(editSpell([favorite], 0, favorite)[0].onFace).toBe(true);
    expect("onFace" in editSpell([favorite], 0, { ...favorite, style: "dome" })[0]).toBe(false);
  });

  it("garde son décalage dans la description partagée", () => {
    const entry = { id: "a", name: "x", element: "feu", style: "cube", scale: 1, seed: 1, at: { x: 0, y: 0 }, carrier: { id: "t", name: "t" }, gmOnly: false, owner: "m", offset: { x: 300, y: 0 }, angle: 0.5 };
    expect(durablesIn({ "vfx-owlbear/durable": [entry] })[0].offset).toEqual({ x: 300, y: 0 });
    expect(durablesIn({ "vfx-owlbear/durable": [entry] })[0].angle).toBe(0.5);
    expect(durablesIn({ "vfx-owlbear/durable": [{ ...entry, offset: "non" }] })).toEqual([]);
    expect(durablesIn({ "vfx-owlbear/durable": [{ ...entry, angle: "non" }] })).toEqual([]);
  });
});

describe("cube", () => {
  it("couvre un carré dont le côté est la zone demandée", () => {
    const outline = previewOutline("cube", undefined, { x: 100, y: 200 }, 60);
    expect(outline).toEqual({
      closed: true,
      points: [
        { x: 70, y: 170 },
        { x: 130, y: 170 },
        { x: 130, y: 230 },
        { x: 70, y: 230 },
      ],
    });
  });

  it("nomme sa zone exacte par son côté", () => {
    expect(exactZoneLabel("cube")).toBe("Côté");
    expect(exactZoneLabel("cone")).toBe("Longueur");
    expect(exactZoneLabel("dome")).toBe("Rayon");
  });

  it("prend le côté demandé en cases", () => {
    const cells = 6;
    expect(effectScale("cube", "M", cells) * STYLES.cube.reach).toBe(cells);
  });

  it("ne part pas tout seul du token", () => {
    expect(castsOnSelf("cube")).toBe(false);
  });
});

beforeAll(() => forceLanguage("fr"));

describe("traductions", () => {
  it("donne le français à un navigateur français, l'anglais aux autres", () => {
    expect(browserLanguage(["fr-CH", "en"])).toBe("fr");
    expect(browserLanguage(["de-DE", "fr"])).toBe("fr");
    expect(browserLanguage(["de-DE"])).toBe("en");
    expect(browserLanguage([])).toBe("en");
  });

  it("traduit dans la langue choisie et remplace les valeurs", () => {
    forceLanguage("en");
    expect(t("wheel.notYours", { name: "Orc" })).toBe("You don't control Orc.");
    forceLanguage("fr");
    expect(t("wheel.notYours", { name: "Orc" })).toBe("Tu n'as pas la main sur Orc.");
  });

  it("n'oublie aucun texte, avec les mêmes valeurs dans chaque langue", () => {
    const slots = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
    for (const language of LANGUAGES) {
      for (const key of DICTIONARY_KEYS) {
        const text = dictionary(language)[key];
        expect(text, `${language} ${key}`).toBeTruthy();
        expect(slots(text), `${language} ${key}`).toEqual(slots(dictionary("fr")[key]));
      }
    }
  });
});
