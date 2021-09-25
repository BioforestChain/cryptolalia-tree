import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

// https://vitejs.dev/config/
export default defineConfig({
  build: {
    target: ["chrome74", "node14"],
    outDir: "docs",
  },
  plugins: [svelte()],
});
