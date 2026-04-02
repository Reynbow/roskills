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

If you see `Failed to resolve import "@vercel/analytics"`, run `npm install` again — the package is listed in `dependencies` and is required for both local and production builds.

Optional: `SKIP_RATHENA_FETCH=1` skips downloading rAthena data during `predev` / `prebuild` if you are offline (skill names may fall back to placeholders).
