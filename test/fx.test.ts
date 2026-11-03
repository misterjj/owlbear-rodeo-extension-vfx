import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parseFxMessage, projectileDuration } from "../src/fx";
import { EXPLOSION_SKSL, PROJECTILE_SKSL } from "../src/fx-shaders";

describe("effets visuels", () => {
  const at = { x: 1, y: 2 };

  it("accepte les messages valides", () => {
    expect(parseFxMessage({ type: "explosion", at, seed: 3 })).toEqual({ type: "explosion", at, seed: 3 });
    expect(parseFxMessage({ type: "projectile", from: at, to: at, seed: 3, extra: 1 })).toEqual({
      type: "projectile",
      from: at,
      to: at,
      seed: 3,
    });
  });

  it("ignore les messages invalides venus du réseau", () => {
    for (const data of [
      null,
      "explosion",
      { type: "autre", at, seed: 1 },
      { type: "explosion", at, seed: "1" },
      { type: "explosion", at: { x: Number.NaN, y: 0 }, seed: 1 },
      { type: "explosion", seed: 1 },
      { type: "projectile", from: at, seed: 1 },
    ]) {
      expect(parseFxMessage(data)).toBeUndefined();
    }
  });

  it("garde la durée du projectile dans des limites raisonnables", () => {
    const from = { x: 0, y: 0 };
    expect(projectileDuration(from, { x: 150, y: 0 }, 150)).toBe(220);
    expect(projectileDuration(from, { x: 900, y: 0 }, 150)).toBe(420);
    expect(projectileDuration(from, { x: 90000, y: 0 }, 150)).toBe(800);
  });

  it("place les effets avec le repère fourni par Owlbear", () => {
    for (const sksl of [EXPLOSION_SKSL, PROJECTILE_SKSL]) {
      expect(sksl).toContain("uniform mat3 model;");
      expect(sksl).toContain("uniform float t;");
    }
  });

  it("respecte la limite de description d'Owlbear", () => {
    const manifest = JSON.parse(readFileSync("public/manifest.json", "utf8"));
    expect(manifest.description.length).toBeLessThanOrEqual(128);
  });
});
