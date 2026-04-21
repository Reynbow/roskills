import { defineConfig } from "vite";

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        index: "index.html",
        cards: "cards.html",
      },
    },
  },
  server: {
    host: true,
    port: 5173,
    /** Avoid silently moving to 5174+ while the browser tab still points at 5173. */
    strictPort: true,
    open: false,
  },
});
