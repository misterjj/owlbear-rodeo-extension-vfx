import { describe, expect, it, vi } from "vitest";

const room = vi.hoisted(() => {
  // Le panneau lit le choix et les favoris dès son chargement.
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {} });
  return { metadata: {} as Record<string, unknown> };
});

vi.mock("@owlbear-rodeo/sdk", () => ({
  default: {
    room: {
      getMetadata: async () => room.metadata,
      onMetadataChange: () => () => {},
    },
  },
  buildEffect: () => ({}),
  buildImage: () => ({}),
  buildLabel: () => ({}),
  buildShape: () => ({}),
  isImage: () => false,
}));

describe("démarrage du panneau", () => {
  it("lit des réglages de salle personnalisés avant que le panneau soit dessiné", async () => {
    const { FX_ROOM_KEY } = await import("../src/fx");
    const { watchRoomSettings } = await import("../src/panel");
    room.metadata = { [FX_ROOM_KEY]: { limits: { durable: 25, programs: 10 } } };
    await expect(watchRoomSettings()).resolves.toBeUndefined();
  });
});
