/**
 * Shared fixed-position tooltip (MSQ / Free-to-play Equipment) using `.ro-tooltip-floater` styles.
 */
export function setupRoTooltipFloater(
  hoverRoot: HTMLElement,
  tipEl: HTMLElement,
  options: {
    hitSelector: string;
    renderTip: (target: HTMLElement) => string | null;
  },
): () => void {
  let tipActive: HTMLElement | null = null;

  const hideTip = (): void => {
    tipEl.classList.remove("ro-tooltip-floater--visible");
    tipEl.classList.remove("ro-tooltip-floater--below");
    tipEl.setAttribute("aria-hidden", "true");
    tipEl.innerHTML = "";
    tipActive = null;
  };

  const showTip = (target: HTMLElement): void => {
    const html = options.renderTip(target);
    if (!html) {
      hideTip();
      return;
    }
    if (tipActive === target && tipEl.classList.contains("ro-tooltip-floater--visible")) return;
    tipActive = target;

    tipEl.innerHTML = html;
    tipEl.setAttribute("aria-hidden", "false");
    tipEl.classList.remove("ro-tooltip-floater--visible");
    tipEl.classList.remove("ro-tooltip-floater--below");
    void tipEl.offsetWidth;

    const r = target.getBoundingClientRect();
    const gap = 12;
    const cx = r.left + r.width / 2;
    tipEl.style.left = `${cx}px`;
    tipEl.style.top = `${r.top - gap}px`;

    requestAnimationFrame(() => {
      const tr = tipEl.getBoundingClientRect();
      if (tr.top < 8) {
        tipEl.classList.add("ro-tooltip-floater--below");
        tipEl.style.top = `${r.bottom + gap}px`;
      }
      const tr2 = tipEl.getBoundingClientRect();
      const pad = 8;
      let shift = 0;
      if (tr2.left < pad) shift = pad - tr2.left;
      else if (tr2.right > window.innerWidth - pad) shift = window.innerWidth - pad - tr2.right;
      if (shift !== 0) {
        const cur = parseFloat(tipEl.style.left) || cx;
        tipEl.style.left = `${cur + shift}px`;
      }
      requestAnimationFrame(() => {
        tipEl.classList.add("ro-tooltip-floater--visible");
      });
    });
  };

  const onOver = (e: PointerEvent): void => {
    const el = (e.target as HTMLElement | null)?.closest(options.hitSelector) as HTMLElement | null;
    if (!el || !hoverRoot.contains(el)) return;
    showTip(el);
  };

  const onOut = (e: PointerEvent): void => {
    const related = e.relatedTarget as Node | null;
    if (related && hoverRoot.contains(related)) {
      const toEl = (related as HTMLElement).closest(options.hitSelector) as HTMLElement | null;
      if (toEl) {
        showTip(toEl);
        return;
      }
    }
    hideTip();
  };

  hoverRoot.addEventListener("pointerover", onOver);
  hoverRoot.addEventListener("pointerout", onOut);
  window.addEventListener("scroll", hideTip, true);
  window.addEventListener("resize", hideTip);

  return (): void => {
    hoverRoot.removeEventListener("pointerover", onOver);
    hoverRoot.removeEventListener("pointerout", onOut);
    window.removeEventListener("scroll", hideTip, true);
    window.removeEventListener("resize", hideTip);
    hideTip();
  };
}
