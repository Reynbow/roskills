import { defineConfig } from "vite";

export default defineConfig({
  optimizeDeps: {
    include: ["@vercel/analytics"],
  },
  server: {
    host: true,
    port: 5173,
    open: false,
  },
});
