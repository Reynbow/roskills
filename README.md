# Pre-Renewal Skill Planner

## Local development

After cloning or **any `git pull` that changes `package.json` or `package-lock.json`**, install dependencies:

```bash
npm install
```

Then start the dev server:

```bash
npm run dev
```

Production build (same as CI):

```bash
npm run build
```

The app is served from committed **`src/data/*.json`**, **`public/`** assets, and **`src/`** — no import step runs on install or build.

If you see `Failed to resolve import "@vercel/analytics"`, run `npm install` again — the package is listed in `dependencies` and is required for both local and production builds.

## Maintainer tooling (not in this repo)

Data import, zrenderer sprite batches, mount previews, and related Lua/YML sources are **gitignored** (`scripts/`, `skillinfo/`). They are not required for the website to run. Keep those directories locally if you regenerate skill JSON, card/equip DBs, or class sprites; everyone else uses the committed outputs only.
