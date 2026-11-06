import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // En dev, Owlbear charge le manifest depuis un autre domaine.
  // Un port fixe, pour pouvoir lancer aussi l'extension des fiches (5173).
  server: { cors: true, port: 5174, strictPort: true },
  build: {
    rollupOptions: {
      input: { guide: resolve("index.html"), guideFr: resolve("fr/index.html"), background: resolve("background.html"), action: resolve("action.html"), wheel: resolve("wheel.html") },
    },
  },
});
