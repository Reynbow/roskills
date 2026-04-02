import { jobPreviewSpriteUrl } from "./job-previews";

/**
 * Sitting sprite files live under `public/job-sit/{jobKey}.png` (zrenderer action 17 = sit).
 * Generate them locally — Divine Pride hotlinks are not usable (placeholder PNGs).
 *
 *   npm run setup:zrenderer
 *   RO_ZRENDERER_RESOURCES="C:\path\to\client\data" npm run render:job-sit
 *
 * Requires [zrenderer](https://github.com/zhad3/zrenderer) CLI + unpacked client data; see
 * zrenderer RESOURCES.md. Optional: ZRENDERER_CMD, ZRENDERER_GENDER, ZRENDERER_HEAD,
 * ZRENDERER_SIT_FRAME (default 2 = diagonal-ish facing).
 *
 * The UI loads the local sit PNG first, then falls back to the job-picker portrait if missing.
 */
export function jobSitLocalPngUrl(jobKey: string): string {
  const base = import.meta.env.BASE_URL;
  return `${base}job-sit/${jobKey}.png`;
}

export function jobSitPortraitFallbackUrl(jobKey: string): string | undefined {
  return jobPreviewSpriteUrl(jobKey);
}
