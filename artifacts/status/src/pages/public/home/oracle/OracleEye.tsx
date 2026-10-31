import { useEffect, useRef } from "react";
import { eyeGeometry } from "./geometry";

/**
 * Ochiul Oracolului. Irisul se uită după cursor (sau după locul atins pe
 * telefon); când nimeni nu se mișcă, privește singur în jur. `busy` îl face să
 * „gândească”, `spoke` îl face să clipească scurt după un răspuns.
 */
export function OracleEye({ busy, spoke }: { busy: boolean; spoke: boolean }) {
  const eye = useRef<SVGSVGElement>(null);
  const iris = useRef<SVGGElement>(null);
  const geo = eyeGeometry();

  useEffect(() => {
    const eyeEl = eye.current;
    const irisEl = iris.current;
    if (!eyeEl || !irisEl) return;
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)");
    let tx = 0;
    let ty = 0;
    let cx = 0;
    let cy = 0;
    let raf = 0;
    let last = 0;

    const tick = () => {
      const k = calm.matches ? 1 : 0.12;
      cx += (tx - cx) * k;
      cy += (ty - cy) * k;
      irisEl.setAttribute("transform", `translate(${cx.toFixed(2)} ${cy.toFixed(2)})`);
      raf = Math.abs(tx - cx) + Math.abs(ty - cy) > 0.05 ? requestAnimationFrame(tick) : 0;
    };

    const look = (e: PointerEvent) => {
      last = Date.now();
      const r = eyeEl.getBoundingClientRect();
      if (!r.width) return;
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      const d = Math.hypot(dx, dy) || 1;
      const f = Math.min(1, d / (r.width * 0.8));
      tx = (dx / d) * 36 * f;
      ty = (dy / d) * 17 * f;
      if (!raf) raf = requestAnimationFrame(tick);
    };

    window.addEventListener("pointermove", look, { passive: true });
    window.addEventListener("pointerdown", look, { passive: true });

    const wander = window.setInterval(() => {
      if (calm.matches || document.hidden || Date.now() - last < 3800) return;
      const r = eyeEl.getBoundingClientRect();
      if (r.bottom < 0 || r.top > window.innerHeight) return;
      tx = (Math.random() * 2 - 1) * 30;
      ty = (Math.random() * 2 - 1) * 13;
      if (!raf) raf = requestAnimationFrame(tick);
    }, 2600);

    return () => {
      window.removeEventListener("pointermove", look);
      window.removeEventListener("pointerdown", look);
      window.clearInterval(wander);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <svg
      ref={eye}
      className={"orcEye" + (busy ? " think" : "") + (spoke ? " spoke" : "")}
      viewBox="-200 -200 400 400"
      role="img"
      aria-label="Ochiul Oracolului, care îți urmărește cursorul"
    >
      <defs>
        <radialGradient id="oIrisS" cx=".5" cy=".5" r=".5">
          <stop offset="0" stopColor="#FFF1C9" />
          <stop offset=".32" stopColor="#FFB45E" />
          <stop offset=".72" stopColor="#FF6B3D" />
          <stop offset="1" stopColor="#3A0F06" />
        </radialGradient>
        <radialGradient id="oIris" cx="0" cy="0" r="54" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FFF4D6" />
          <stop offset=".22" stopColor="#FFE3A3" />
          <stop offset=".45" stopColor="#FFB45E" />
          <stop offset=".75" stopColor="#FF6B3D" />
          <stop offset="1" stopColor="#2E0C05" />
        </radialGradient>
        <radialGradient id="oHalo" cx="0" cy="0" r="200" gradientUnits="userSpaceOnUse">
          <stop offset=".25" stopColor="#FF6B3D" stopOpacity=".22" />
          <stop offset=".62" stopColor="#FF6B3D" stopOpacity=".06" />
          <stop offset="1" stopColor="#FF6B3D" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="oShade" cx="0" cy="0" r="124" gradientUnits="userSpaceOnUse">
          <stop offset=".5" stopColor="#000000" stopOpacity="0" />
          <stop offset="1" stopColor="#000000" stopOpacity=".8" />
        </radialGradient>
        <linearGradient id="oRim" x1="-122" y1="0" x2="122" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#8A5A22" />
          <stop offset=".5" stopColor="#F3D08E" />
          <stop offset="1" stopColor="#8A5A22" />
        </linearGradient>
        <clipPath id="oAlmClip">
          <path d="M-120 0C-73-80 73-80 120 0C73 80-73 80-120 0Z" />
        </clipPath>
      </defs>
      <circle r="200" fill="url(#oHalo)" />
      <circle className="oOut" r="188" />
      <path className="oRunes" d={geo.runesD} />
      <circle className="oOut" r="146" opacity=".6" />
      <circle className="oDash" r="137" />
      <circle className="oTicks" r="124" />
      <circle className="oFlashC" r="150" />
      <path className="oRay" d={geo.raysA} />
      <path className="oRay r2" d={geo.raysB} />
      <path className="oRay r3" d={geo.raysC} />
      <g className="oLid">
        <path className="oAlm" d="M-122 0C-74-82 74-82 122 0C74 82-74 82-122 0Z" />
        <g clipPath="url(#oAlmClip)">
          <g className="oIrisG" ref={iris}>
            <circle r="54" fill="url(#oIris)" />
            <g className="oIrisRot">
              <circle className="oStriae" r="44" />
              <circle className="oStriae" r="33" style={{ strokeDasharray: "1 3" }} />
              <circle className="oStriae" r="22" style={{ strokeDasharray: ".6 2.4" }} />
            </g>
            <path className="oPupil" d="M0-34C8-20 8 20 0 34C-8 20-8-20 0-34Z" />
            <circle className="oGlint" cx="-20" cy="-22" r="7" />
            <circle className="oGlint" cx="17" cy="19" r="2.6" opacity=".5" />
          </g>
          <path d="M-122 0C-74-82 74-82 122 0C74 82-74 82-122 0Z" fill="url(#oShade)" />
        </g>
      </g>
    </svg>
  );
}
