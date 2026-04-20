import { defineConfig } from "vite";

export default defineConfig({
  optimizeDeps: {
    include: ["@vercel/analytics"],
  },
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
    open: false,
  },
});
