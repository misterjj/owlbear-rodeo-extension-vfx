import { forceLanguage } from "../src/i18n";
import { MAX_LIMIT } from "../src/fx";
import { describe, expect, it } from "vitest";
import {
  MAX_ANCHORS,
  MIN_INTERVAL,
  chainHopDelay,
  chainHops,
  firstShot,
  groupNames,
  markedAnchors,
  nextShot,
  normalizeTiming,
  programProblem,
  FX_PROGRAMS_KEY,
  programsIn,
  shotAfter,
  shotAnchors,
  shotDuration,
  shotRandom,
  sceneWriter,
  withActive,
  withProgram,
  type Program,
  anchorNear,
  anchorNumbers,
  moveAnchor,
  permanentChainHops,
  programEffect,
  shotSlot,
  withProgramEffect,
  withoutProgramEffects,
} from "../src/fx-programs";

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
  permanent: false,
  order: "random",
};
const key = "vfx-owlbear/programmes";

forceLanguage("fr");

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
    const many = Array.from({ length: MAX_LIMIT + 3 }, (_, i) => ({ ...base, id: `p${i}` }));
    expect(programsIn({ [key]: many })).toHaveLength(MAX_LIMIT);
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

  it("n'affiche que le brouillon du programme modifié, sans ses points déjà retirés", () => {
    const off = { ...base, id: "p2", active: false };
    const other = { ...base, id: "p3", active: false, anchors: [point(7)] };
    expect(markedAnchors([off, other], [point(9)], "p2")).toEqual([point(7), point(9)]);
  });

  it("trouve le point le plus proche du pointeur, et aucun s'il est trop loin", () => {
    const positions = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 130, y: 0 }];
    expect(anchorNear(positions, { x: 120, y: 0 }, 40)).toBe(2);
    expect(anchorNear(positions, { x: 5, y: 0 }, 40)).toBe(0);
    expect(anchorNear(positions, { x: 500, y: 0 }, 40)).toBe(-1);
  });
});

describe("ordre des points", () => {
  const [a, b, c] = [{ at: { x: 1, y: 1 } }, { at: { x: 2, y: 2 } }, { at: { x: 3, y: 3 } }];

  it("échange un point avec son voisin", () => {
    expect(moveAnchor([a, b, c], 1, -1)).toEqual([b, a, c]);
    expect(moveAnchor([a, b, c], 1, 1)).toEqual([a, c, b]);
  });

  it("ne bouge rien au bord de la liste", () => {
    const list = [a, b];
    expect(moveAnchor(list, 0, -1)).toBe(list);
    expect(moveAnchor(list, 1, 1)).toBe(list);
  });

  it("numérote chaque point, et regroupe un point utilisé plusieurs fois", () => {
    expect(anchorNumbers([a, b, c]).map(({ text }) => text)).toEqual(["1", "2", "3"]);
    expect(anchorNumbers([a, b, { ...a }]).map(({ text }) => text)).toEqual(["1, 3", "2"]);
    const token = { at: { x: 9, y: 9 }, token: { id: "t", name: "T" } };
    const moved = { at: { x: 5, y: 5 }, token: { id: "t", name: "T" } };
    expect(anchorNumbers([token, a, moved]).map(({ text }) => text)).toEqual(["1, 3", "2"]);
    expect(anchorNumbers([]).length).toBe(0);
  });
});

describe("ordre séquentiel", () => {
  const points = [point(0), point(100), point(200)];
  const sequence: Program = { ...base, order: "sequence", anchors: points };

  it("parcourt les points d'une zone dans l'ordre et en boucle", () => {
    const area = { ...sequence, style: "explosion" as const };
    expect([0, 1, 2, 3, 4].map((i) => shotAnchors(area, i)!.at)).toEqual([points[0], points[1], points[2], points[0], points[1]]);
  });

  it("relie chaque point au suivant pour un effet dirigé, et le dernier au premier", () => {
    expect([0, 1, 2].map((i) => shotAnchors(sequence, i))).toEqual([
      { from: points[0], at: points[1] },
      { from: points[1], at: points[2] },
      { from: points[2], at: points[0] },
    ]);
  });

  it("garde le sens du premier au second avec deux points", () => {
    const two = { ...sequence, anchors: [points[0], points[1]] };
    expect(shotAnchors(two, 1)).toEqual({ from: points[0], at: points[1] });
  });
});

describe("effets permanents", () => {
  const flame: Program = { ...base, style: "flamme", permanent: true, anchors: [point(0), point(100)] };
  const place = { at: { x: 0, y: 0 }, scale: 1, owner: "mj" };
  const effect = (index: number, slot = "0", program = flame) => programEffect(program, index, slot, place);

  it("relit un ancien programme comme éphémère et au hasard", () => {
    const { permanent, order, ...old } = base;
    expect(programsIn({ [key]: [old] })[0]).toMatchObject({ permanent: false, order: "random" });
  });

  it("accepte le permanent pour tous les styles", () => {
    expect(programsIn({ [key]: [{ ...base, permanent: true }] })[0].permanent).toBe(true);
  });

  it("laisse un effet par saut de chaîne, sans les points absents ni confondus", () => {
    const anchors = [point(0), point(100), point(100), { at: { x: 200, y: 0 }, token: { id: "caché", name: "x" } }, point(300)];
    const place = (anchor: (typeof anchors)[number]) => ("token" in anchor ? undefined : anchor.at);
    expect(permanentChainHops(anchors, place)).toEqual([
      { from: anchors[0], at: anchors[1] },
      { from: anchors[1], at: anchors[4] },
    ]);
  });

  it("garde un intervalle court, jusqu'au même minimum que les autres", () => {
    const saved = programsIn({ [key]: [{ ...flame, min: 0.2, max: 0.5 }] })[0];
    expect(saved).toMatchObject({ min: 0.2, max: 0.5, permanent: true });
    expect(programsIn({ [key]: [{ ...flame, min: 0.05, max: 0.05 }] })[0].min).toBe(MIN_INTERVAL);
  });

  it("remplace l'effet du même point à chaque tir et garde les autres", () => {
    const entries = [effect(0, "0"), effect(1, "1")];
    const next = withProgramEffect(entries, effect(2, "0"), 10);
    expect(next.map(({ id }) => id)).toEqual([effect(2, "0").id, effect(1, "1").id]);
  });

  it("garde la même graine à une téléportation, dont la boucle ne doit pas sauter", () => {
    const portal = { ...flame, style: "teleportation" as const };
    expect(effect(1, "0", portal).seed).toBe(effect(7, "0", portal).seed);
    expect(effect(1).seed).not.toBe(effect(7).seed);
  });

  it("laisse se superposer deux programmes sur un même point", () => {
    const other = { ...flame, id: "p2" };
    expect(withProgramEffect([effect(0)], effect(0, "0", other), 10)).toHaveLength(2);
  });

  it("respecte la limite pour un nouveau point, mais pas pour un remplacement", () => {
    const entries = [effect(0, "0")];
    expect(withProgramEffect(entries, effect(1, "1"), 1)).toBe(entries);
    expect(withProgramEffect(entries, effect(1, "0"), 1)).toEqual([effect(1, "0")]);
  });

  it("n'écrit rien si un autre MJ a déjà noté ce tir", () => {
    const entries = [effect(3)];
    expect(withProgramEffect(entries, effect(3), 10)).toBe(entries);
  });

  it("retire seulement les effets des programmes visés", () => {
    const hand = { ...effect(0), id: "main", program: undefined };
    const other = effect(0, "0", { ...flame, id: "p2" });
    expect(withoutProgramEffects([hand, effect(0), other], ["p1"])).toEqual([hand, other]);
  });

  it("compte un point placé deux fois comme un seul, et un mur par ses deux extrémités", () => {
    const anchors = [point(0), point(100), point(0)];
    expect(shotSlot(anchors, { at: anchors[2] })).toBe("0");
    expect(shotSlot(anchors, { from: anchors[1], at: anchors[2] })).toBe("1>0");
  });
});

describe("un seul MJ écrit dans la scène", () => {
  it("laisse écrire celui qui a activé le programme, tant qu'il est là", () => {
    expect(sceneWriter(["a", "b"], "b")).toBe("b");
    expect(sceneWriter(["a", "c"], "b")).toBe("a");
  });

  it("choisit le même MJ chez tout le monde quand rien ne le désigne", () => {
    expect(sceneWriter(["b", "a"])).toBe(sceneWriter(["a", "b"]));
    expect(sceneWriter([])).toBeUndefined();
  });

  it("note qui active, et ne l'efface pas à l'arrêt", () => {
    const [off] = programsIn({ [FX_PROGRAMS_KEY]: [{ ...base, active: false, startedBy: 12 }] });
    expect(off.startedBy).toBeUndefined();
    const [on] = withActive([off], [off.id], true, 9000, "a");
    expect(on.startedBy).toBe("a");
    expect(withActive([on], [on.id], false, 9500)[0].startedBy).toBe("a");
  });
});
