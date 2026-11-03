import { describe, expect, it } from "vitest";
import {
  MAX_ANCHORS,
  MAX_PROGRAMS,
  MIN_INTERVAL,
  chainHopDelay,
  chainHops,
  firstShot,
  groupNames,
  markedAnchors,
  nextShot,
  normalizeTiming,
  programProblem,
  programsIn,
  shotAfter,
  shotAnchors,
  shotDuration,
  shotRandom,
  withActive,
  withProgram,
  type Program,
} from "../src/fx-programs";
import { parseWindowPrefs, placeWindow } from "../src/fx-window";

const point = (x: number) => ({ at: { x, y: 0 } });
const base: Program = {
  id: "p1",
  name: "Canon",
  group: "",
  element: "feu",
  style: "projectile",
  size: "M",
  exact: null,
  anchors: [point(0), point(100)],
  min: 3,
  max: 3,
  offset: 0,
  shots: null,
  active: true,
  startedAt: 1000,
};
const key = "vfx-owlbear/programmes";

describe("valeurs saisies", () => {
  it("garde des valeurs valides", () => {
    expect(normalizeTiming({ min: 1, max: 5, offset: 2, shots: 4 })).toEqual({ min: 1, max: 5, offset: 2, shots: 4 });
  });

  it("remet le minimum avant le maximum", () => {
    expect(normalizeTiming({ min: 5, max: 1 })).toMatchObject({ min: 1, max: 5 });
  });

  it("refuse un intervalle trop court ou invalide", () => {
    expect(normalizeTiming({ min: 0, max: 0 })).toMatchObject({ min: MIN_INTERVAL, max: MIN_INTERVAL });
    expect(normalizeTiming({ min: Number.NaN })).toMatchObject({ min: 3, max: 3 });
    expect(normalizeTiming({ min: -4, max: 2 })).toMatchObject({ min: MIN_INTERVAL, max: 2 });
  });

  it("traite une série vide ou nulle comme sans fin, et garde un nombre entier", () => {
    expect(normalizeTiming({ shots: null }).shots).toBeNull();
    expect(normalizeTiming({ shots: 0 }).shots).toBeNull();
    expect(normalizeTiming({ shots: 2.7 }).shots).toBe(2);
  });
});

describe("programme complet", () => {
  it("demande un nom et assez de points", () => {
    expect(programProblem(base)).toBeUndefined();
    expect(programProblem({ ...base, name: "  " })).toContain("nom");
    expect(programProblem({ ...base, anchors: [point(0)] })).toContain("deux points");
    expect(programProblem({ ...base, style: "explosion", anchors: [] })).toContain("un point");
    expect(programProblem({ ...base, style: "explosion", anchors: [point(0)] })).toBeUndefined();
  });
});

describe("relecture de la liste partagée", () => {
  it("écarte ce qui est invalide et corrige les durées", () => {
    expect(programsIn({})).toEqual([]);
    expect(programsIn({ [key]: "non" })).toEqual([]);
    expect(programsIn({ [key]: [{ ...base, element: "constructor" }] })).toEqual([]);
    expect(programsIn({ [key]: [{ ...base, anchors: [{ at: { x: Number.NaN, y: 0 } }] }] })).toEqual([]);
    expect(programsIn({ [key]: [{ ...base, min: 0, max: 0 }] })[0].min).toBe(MIN_INTERVAL);
  });

  it("respecte les limites", () => {
    const many = Array.from({ length: MAX_PROGRAMS + 3 }, (_, i) => ({ ...base, id: `p${i}` }));
    expect(programsIn({ [key]: many })).toHaveLength(MAX_PROGRAMS);
    const anchors = Array.from({ length: MAX_ANCHORS + 3 }, (_, i) => point(i));
    expect(programsIn({ [key]: [{ ...base, anchors }] })[0].anchors).toHaveLength(MAX_ANCHORS);
  });
});

describe("hasard partagé", () => {
  it("donne le même résultat à tous les joueurs pour un même tir", () => {
    expect(shotRandom(base, 7, 0)).toBe(shotRandom({ ...base }, 7, 0));
  });

  it("change d'un tir à l'autre et d'une activation à l'autre", () => {
    expect(shotRandom(base, 7, 0)).not.toBe(shotRandom(base, 8, 0));
    expect(shotRandom(base, 7, 0)).not.toBe(shotRandom(base, 7, 1));
    expect(shotRandom(base, 7, 0)).not.toBe(shotRandom({ ...base, startedAt: 2000 }, 7, 0));
  });

  it("reste entre 0 et 1, sans biais visible", () => {
    const values = Array.from({ length: 20000 }, (_, i) => shotRandom(base, i, 0));
    expect(Math.min(...values)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...values)).toBeLessThan(1);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    expect(mean).toBeGreaterThan(0.48);
    expect(mean).toBeLessThan(0.52);
  });
});

describe("calendrier des tirs", () => {
  it("tire à intervalle fixe, après le décalage", () => {
    const program = { ...base, offset: 1.5 };
    const first = firstShot(program);
    expect(first).toEqual({ index: 0, time: 2500 });
    expect(nextShot(program, first)).toEqual({ index: 1, time: 5500 });
  });

  it("reste dans l'intervalle saisi", () => {
    const program = { ...base, min: 1, max: 5 };
    let shot = firstShot(program);
    const waits = new Set<number>();
    for (let i = 0; i < 500; i++) {
      const next = nextShot(program, shot)!;
      const wait = next.time - shot.time;
      expect(wait).toBeGreaterThanOrEqual(1000);
      expect(wait).toBeLessThanOrEqual(5000);
      waits.add(wait);
      shot = next;
    }
    expect(waits.size).toBeGreaterThan(100);
  });

  it("s'arrête au bout de la série", () => {
    const program = { ...base, shots: 2 };
    const first = firstShot(program);
    const second = nextShot(program, first)!;
    expect(second.index).toBe(1);
    expect(nextShot(program, second)).toBeUndefined();
  });

  it("fait tomber un joueur qui arrive sur le même tir que les autres", () => {
    const program = { ...base, min: 1, max: 5 };
    let shot = firstShot(program);
    for (let i = 0; i < 40; i++) shot = nextShot(program, shot)!;
    expect(shotAfter(program, shot.time - 1)).toEqual(shot);
  });

  it("n'a plus de tir à venir quand la série est passée", () => {
    expect(shotAfter({ ...base, shots: 2 }, 1e9)).toBeUndefined();
    expect(shotAfter(base, 0)).toEqual({ index: 0, time: 1000 });
  });
});

describe("points d'un tir", () => {
  it("va toujours du premier au second avec deux points", () => {
    for (let i = 0; i < 50; i++) {
      expect(shotAnchors(base, i)).toEqual({ from: base.anchors[0], at: base.anchors[1] });
    }
  });

  it("relie deux points différents, tous utilisés, avec plus de deux points", () => {
    const program = { ...base, anchors: [point(0), point(1), point(2), point(3)] };
    const pairs = new Set<string>();
    for (let i = 0; i < 400; i++) {
      const { from, at } = shotAnchors(program, i)!;
      expect(from).not.toBe(at);
      pairs.add(`${from!.at.x}-${at.at.x}`);
    }
    expect(pairs.size).toBe(12);
  });

  it("choisit un point au hasard pour un effet de zone", () => {
    const program = { ...base, style: "explosion", anchors: [point(0), point(1), point(2)] } as const;
    const used = new Set<number>();
    for (let i = 0; i < 200; i++) {
      const shot = shotAnchors({ ...program, anchors: [...program.anchors] }, i)!;
      expect(shot.from).toBeUndefined();
      used.add(shot.at.at.x);
    }
    expect(used.size).toBe(3);
  });

  it("ne tire pas sans assez de points", () => {
    expect(shotAnchors({ ...base, anchors: [point(0)] }, 0)).toBeUndefined();
  });
});

describe("chaîne", () => {
  const chain: Program = { ...base, style: "chaine", anchors: [point(0), point(1), point(2), point(3)] };

  it("relie tous les points dans l'ordre", () => {
    expect(chainHops(chain.anchors.map(({ at }) => at))).toEqual([
      { from: { x: 0, y: 0 }, at: { x: 1, y: 0 } },
      { from: { x: 1, y: 0 }, at: { x: 2, y: 0 } },
      { from: { x: 2, y: 0 }, at: { x: 3, y: 0 } },
    ]);
  });

  it("saute un point absent et reprend au suivant", () => {
    expect(chainHops([{ x: 0, y: 0 }, undefined, { x: 2, y: 0 }])).toEqual([
      { from: { x: 0, y: 0 }, at: { x: 2, y: 0 } },
    ]);
    expect(chainHops([undefined, { x: 2, y: 0 }])).toEqual([]);
  });

  it("ne saute pas d'un point sur lui-même, mais peut revenir à son départ", () => {
    const a = { x: 0, y: 0 };
    const b = { x: 1, y: 0 };
    expect(chainHops([a, { ...a }, b, a])).toEqual([
      { from: a, at: b },
      { from: b, at: a },
    ]);
  });

  it("attend la fin de la chaîne avant de compter l'intervalle", () => {
    const first = firstShot(chain);
    const end = first.time + shotDuration(chain);
    expect(shotDuration(chain)).toBe(2 * chainHopDelay(chain) + 600);
    expect(nextShot(chain, first)).toEqual({ index: 1, time: end + 3000 });
  });

  it("dure plus longtemps avec plus de points", () => {
    const longer = { ...chain, anchors: [...chain.anchors, point(4)] };
    expect(shotDuration(longer)).toBeGreaterThan(shotDuration(chain));
  });

  it("ne change pas le rythme des autres styles", () => {
    expect(shotDuration(base)).toBe(0);
    expect(nextShot(base, firstShot(base))).toEqual({ index: 1, time: 4000 });
  });

  it("garde le même calendrier pour un joueur qui arrive en cours de route", () => {
    let shot = firstShot(chain);
    for (let i = 0; i < 20; i++) shot = nextShot(chain, shot)!;
    expect(shotAfter(chain, shot.time - 1)).toEqual(shot);
  });

  it("compte une chaîne complète pour un seul tir", () => {
    const series = { ...chain, shots: 2 };
    const second = nextShot(series, firstShot(series))!;
    expect(second.index).toBe(1);
    expect(nextShot(series, second)).toBeUndefined();
  });
});

describe("gestion", () => {
  const off = { ...base, id: "p2", active: false, group: "Trésor", startedAt: 5 };

  it("donne le même départ aux programmes activés ensemble", () => {
    const other = { ...off, id: "p3" };
    const result = withActive([off, other], ["p2", "p3"], true, 9000);
    expect(result.map(({ startedAt }) => startedAt)).toEqual([9000, 9000]);
    expect(result.every(({ active }) => active)).toBe(true);
  });

  it("ne relance pas un programme déjà actif", () => {
    expect(withActive([base], ["p1"], true, 9000)[0].startedAt).toBe(1000);
  });

  it("ne touche qu'aux programmes visés", () => {
    const result = withActive([base, off], ["p1"], false, 9000);
    expect(result[0].active).toBe(false);
    expect(result[1]).toEqual(off);
  });

  it("ajoute ou remplace un programme", () => {
    expect(withProgram([base], off)).toHaveLength(2);
    expect(withProgram([base], { ...base, name: "Autre" })).toEqual([{ ...base, name: "Autre" }]);
  });

  it("liste chaque groupe une fois, sans les programmes sans groupe", () => {
    expect(groupNames([base, off, { ...off, id: "p3" }, { ...off, id: "p4", group: "Autel" }])).toEqual(["Autel", "Trésor"]);
  });

  it("repère les points des programmes inactifs et du brouillon", () => {
    const draft = [point(9)];
    expect(markedAnchors([base, off], draft)).toEqual([...off.anchors, ...draft]);
  });
});

describe("placement d'une fenêtre", () => {
  const screen = { width: 1200, height: 800 };
  const size = { width: 380, height: 620 };
  const fallback = { left: 72, top: 72, compact: false };

  it("reprend sa place d'origine si la valeur enregistrée est illisible", () => {
    for (const raw of [null, "", "{", '{"left":"a","top":1}', "null"]) {
      expect(parseWindowPrefs(raw, fallback)).toEqual(fallback);
    }
    expect(parseWindowPrefs('{"left":10,"top":20,"compact":true}', fallback)).toEqual({ left: 10, top: 20, compact: true });
  });

  it("reste entière dans l'écran", () => {
    expect(placeWindow({ left: 5000, top: 5000, compact: false }, screen, size)).toEqual({
      width: 380,
      height: 620,
      left: 812,
      top: 172,
    });
    expect(placeWindow({ left: -50, top: -50, compact: false }, screen, size)).toMatchObject({ left: 8, top: 8 });
  });

  it("se place selon sa hauteur réelle", () => {
    const low = { left: 100, top: 790, compact: true };
    expect(placeWindow(low, screen, { width: 250, height: 140 })).toMatchObject({ height: 140, top: 652 });
    expect(placeWindow(low, screen, { width: 250, height: 300 })).toMatchObject({ height: 300, top: 492 });
  });

  it("garde le haut d'Owlbear visible sur un petit écran", () => {
    expect(placeWindow({ left: 0, top: 0, compact: false }, { width: 1200, height: 500 }, size).height).toBe(412);
  });
});
