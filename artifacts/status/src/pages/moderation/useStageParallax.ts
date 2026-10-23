import { useEffect, type RefObject } from "react";

const clamp = (v: number) => Math.max(-1, Math.min(1, v));

/**
 * Pe desktop (cu mouse), cardul se înclină ușor după cursor, sigiliul și
 * fundalul se mișcă în straturi, iar lumina cardului urmărește cursorul.
 * Nu face nimic pe ecrane tactile sau când utilizatorul a cerut mai puțină
 * mișcare.
 *
 * `prefix` este prefixul variabilelor CSS ale paginii (`ocp` pentru
 * `--ocp-mx`, `--ocp-my`, `--ocp-px`, `--ocp-py`).
 */
export function useStageParallax(root: RefObject<HTMLElement | null>, prefix: string) {
  useEffect(() => {
    const el = root.current;
    if (!el || typeof window === "undefined" || !window.matchMedia) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;

    let tx = 0;
    let ty = 0;
    let cx = 0;
    let cy = 0;
    let raf = 0;
    const tick = () => {
      cx += (tx - cx) * 0.07;
      cy += (ty - cy) * 0.07;
      el.style.setProperty(`--${prefix}-mx`, cx.toFixed(4));
      el.style.setProperty(`--${prefix}-my`, cy.toFixed(4));
      raf = Math.abs(tx - cx) + Math.abs(ty - cy) > 0.002 ? requestAnimationFrame(tick) : 0;
    };
    const kick = () => {
      if (!raf) raf = requestAnimationFrame(tick);
    };
    const move = (e: PointerEvent) => {
      tx = clamp((e.clientX / window.innerWidth) * 2 - 1);
      ty = clamp((e.clientY / window.innerHeight) * 2 - 1);
      // Lumina urmărește cursorul pe cardul de sub el.
      const card = e.target instanceof Element ? e.target.closest<HTMLElement>(".card") : null;
      if (card && el.contains(card)) {
        const r = card.getBoundingClientRect();
        card.style.setProperty(`--${prefix}-px`, Math.round(e.clientX - r.left) + "px");
        card.style.setProperty(`--${prefix}-py`, Math.round(e.clientY - r.top) + "px");
      }
      kick();
    };
    const leave = () => {
      tx = 0;
      ty = 0;
      kick();
    };
    window.addEventListener("pointermove", move, { passive: true });
    document.documentElement.addEventListener("mouseleave", leave);
    return () => {
      window.removeEventListener("pointermove", move);
      document.documentElement.removeEventListener("mouseleave", leave);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [root, prefix]);
}
