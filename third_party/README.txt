This folder holds tooling that is not committed (see .gitignore).

  npm run setup:zrenderer
    → downloads the official Windows zrenderer CLI into zrenderer-win/

Optional: shallow clone upstream source for reference (also gitignored):
  git clone --depth 1 https://github.com/zhad3/zrenderer.git third_party/zrenderer

Rendering sit sprites still requires your own extracted RO client "data" directory:
  RO_ZRENDERER_RESOURCES=C:\path\to\inner\data  npm run render:job-sit

If zrenderer errors on missing Korean paths (sprite\인간족\...), names were likely extracted
as CP949 mojibake. Fix the sprite tree once, then re-run render:
  npm run fix:ro-sprite-names -- --apply "C:\path\to\inner\data\sprite"

render:job-sit extras (see scripts/render-job-sit-sprites.mjs):
  ZRENDERER_SIT_FRAME       (omit or "auto" = pick by ZRENDERER_SIT_HEAD_DIR below)
  ZRENDERER_SIT_HEAD_DIR    (left | right | straight — default right = middle third / often most “turned”; try left for long sit strips)
  ZRENDERER_SIT_FRAME=7     (force a specific <action>-N.png slice after multi export)
  ZRENDERER_SIT_LEGACY=1    (old single --frame mode; head often stays front-on)
  ZRENDERER_HEAD_MIN / ZRENDERER_HEAD_MAX / ZRENDERER_HEAD_SEED  (per-job hairstyle)
  ZRENDERER_HEAD=12         (same hair for every job)
  ZRENDERER_HEAD_DIR        (only with SIT_LEGACY=1)

Class picker — standing (idle) sprites, male + female, forward-facing default:
  RO_ZRENDERER_RESOURCES=C:\path\to\inner\data  npm run render:job-stand-picker
  RO_ZRENDERER_RESOURCES=C:\path\to\renewal\data  npm run render:job-stand-picker:renewal
  RO_ZRENDERER_RESOURCES=...  npm run render:job-stand-picker:all
  → writes public/job-stand-pick/JT_*--male.png and JT_*--female.png
  See scripts/render-job-stand-picker-sprites.mjs for ZRENDERER_STAND_ACTION (default 0),
  ZRENDERER_STAND_HEAD_DIR (default straight), ZRENDERER_STAND_FRAME, etc.
