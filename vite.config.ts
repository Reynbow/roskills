import { defineConfig } from "vite";

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        index: "index.html",
        cards: "cards.html",
        pets: "pets.html",
        msq: "msq.html",
        mounts: "mounts.html",
        armour: "armour.html",
        weapons: "weapons.html",
        monsters: "monsters.html",
        equipment: "equipment.html",
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
