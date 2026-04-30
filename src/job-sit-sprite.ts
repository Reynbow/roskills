import { jobArtKey, jobPreviewSpriteUrl } from "./job-previews";

/**
 * Sitting sprite files live under `public/job-sit/{jobKey}--{gender}.png` (zrenderer action 17 = sit).
 * Generate them locally — Divine Pride hotlinks are not usable (placeholder PNGs).
 *
 *   npm run setup:zrenderer
 *   RO_ZRENDERER_RESOURCES="C:\path\to\client\data" npm run render:job-sit
 *
 * Renewal classes (3rd/4th jobs, etc.) need renewal client data:
 *   RO_ZRENDERER_RESOURCES="C:\path\to\renewal\data" npm run render:job-sit:renewal
 *
 * Requires [zrenderer](https://github.com/zhad3/zrenderer) CLI + unpacked client data; see
 * zrenderer RESOURCES.md. Optional: ZRENDERER_CMD, ZRENDERER_GENDER, ZRENDERER_HEAD,
 * ZRENDERER_SIT_FRAME (default 2 = diagonal-ish facing).
 *
 * The UI loads the local sit PNG first, then falls back to the job-picker portrait if missing.
 * Class picker uses separate standing renders under `public/job-stand-pick/` (`npm run render:job-stand-picker*`).
 */
export type JobSitGender = "male" | "female";

export function jobSitLocalPngUrl(jobKey: string, gender: JobSitGender): string {
  const base = import.meta.env.BASE_URL;
  return `${base}job-sit/${jobArtKey(jobKey)}--${gender}.png`;
}

export function jobSitPortraitFallbackUrl(jobKey: string): string | undefined {
  return jobPreviewSpriteUrl(jobKey);
}
