import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    {
      name: "roskills-dev-rewrites",
      configureServer(server) {
        const map: Record<string, string> = {
          "/skills": "/index.html",
          "/skills/": "/index.html",
          "/cards": "/cards.html",
          "/cards/": "/cards.html",
          "/pets": "/pets.html",
          "/pets/": "/pets.html",
          "/mounts": "/mounts.html",
          "/mounts/": "/mounts.html",
          "/armour": "/armour.html",
          "/armour/": "/armour.html",
          "/weapons": "/weapons.html",
          "/weapons/": "/weapons.html",
          "/monsters": "/monsters.html",
          "/monsters/": "/monsters.html",
          "/msq": "/msq.html",
          "/msq/": "/msq.html",
          "/equipment": "/equipment.html",
          "/equipment/": "/equipment.html",
          "/re-monsters": "/re-monsters.html",
          "/re-monsters/": "/re-monsters.html",
          "/leveling": "/re-monsters.html",
          "/leveling/": "/re-monsters.html",
        };

        server.middlewares.use((req, _res, next) => {
          const url = req.url;
          if (url && map[url]) req.url = map[url];
          next();
        });
      },
    },
  ],
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
        "re-monsters": "re-monsters.html",
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
