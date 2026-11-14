import { defineConfig } from "vite";

// Relative base so the built site works from any folder on tomandes.eu.
export default defineConfig({
  base: "./",
  build: { outDir: "dist", sourcemap: false },
});
