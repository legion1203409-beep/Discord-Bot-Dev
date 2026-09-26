import { useEffect, useRef } from "react";
import "./sword-cursor.css";

const TEXT_ENTRY_SELECTOR =
  'input:not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="checkbox"]):not([type="radio"]), textarea, select, [contenteditable="true"], [role="textbox"]';

export function SwordCursor() {
  const cursorRef = useRef<HTMLDivElement>(null);
  const swordRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
    if (!finePointer.matches) return;

    const root = document.documentElement;
    const cursor = cursorRef.current;
    root.classList.add("sword-cursor-enabled");

    let x = 0;
    let y = 0;
    let frame = 0;
    let swingTimer = 0;

    const isTextEntry = (target: EventTarget | null) =>
      target instanceof Element && Boolean(target.closest(TEXT_ENTRY_SELECTOR));

    const hide = () => cursor?.classList.remove("sword-cursor-visible");

    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerType === "touch" || !cursor) return;

      x = event.clientX - 4;
      y = event.clientY - 3;
      cursor.classList.toggle("sword-cursor-hidden", isTextEntry(event.target));
      cursor.classList.add("sword-cursor-visible");

      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        cursor.style.transform = `translate3d(${x}px, ${y}px, 0)`;
        frame = 0;
      });
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (event.pointerType === "touch" || isTextEntry(event.target) || !swordRef.current) return;

      swordRef.current.classList.remove("sword-cursor-swing");
      void swordRef.current.getBoundingClientRect();
      swordRef.current.classList.add("sword-cursor-swing");
      window.clearTimeout(swingTimer);
      swingTimer = window.setTimeout(() => {
        swordRef.current?.classList.remove("sword-cursor-swing");
      }, 380);
    };

    const handlePointerOut = (event: PointerEvent) => {
      if (!event.relatedTarget) hide();
    };

    document.addEventListener("pointermove", handlePointerMove, { passive: true });
    document.addEventListener("pointerdown", handlePointerDown, { passive: true });
    document.addEventListener("pointerout", handlePointerOut);
    window.addEventListener("blur", hide);

    return () => {
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("pointerout", handlePointerOut);
      window.removeEventListener("blur", hide);
      if (frame) window.cancelAnimationFrame(frame);
      window.clearTimeout(swingTimer);
      root.classList.remove("sword-cursor-enabled");
    };
  }, []);

  return (
    <div ref={cursorRef} className="sword-cursor" aria-hidden="true">
      <svg
        ref={swordRef}
        className="sword-cursor-blade"
        viewBox="0 0 48 48"
        fill="none"
      >
        <defs>
          <linearGradient id="sword-cursor-steel" x1="5" y1="4" x2="30" y2="31" gradientUnits="userSpaceOnUse">
            <stop stopColor="#fff5dc" />
            <stop offset=".42" stopColor="#d9c6a6" />
            <stop offset="1" stopColor="#8d7160" />
          </linearGradient>
          <linearGradient id="sword-cursor-gold" x1="21" y1="23" x2="40" y2="43" gradientUnits="userSpaceOnUse">
            <stop stopColor="#f1c988" />
            <stop offset="1" stopColor="#8d4d39" />
          </linearGradient>
        </defs>
        <path
          d="M5 4 31.8 27.1 27.2 31.8 4 5.1 5 4Z"
          fill="url(#sword-cursor-steel)"
          stroke="#38271f"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
        <path d="m7.6 7.7 19.5 20.2" stroke="#fff7e4" strokeWidth="1" strokeLinecap="round" opacity=".9" />
        <path d="m23.5 32.5 9-9 3 3-9 9-3-3Z" fill="url(#sword-cursor-gold)" stroke="#39251d" strokeWidth="1.4" strokeLinejoin="round" />
        <path d="m27 31 4-4 10 10-4 4-10-10Z" fill="#684237" stroke="#2c1c19" strokeWidth="1.4" strokeLinejoin="round" />
        <path d="m30 32 2-2 6 6-2 2-6-6Z" stroke="#e1b879" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="41" cy="41" r="2.4" fill="url(#sword-cursor-gold)" stroke="#38271f" strokeWidth="1.2" />
      </svg>
      <span className="sword-cursor-spark" />
    </div>
  );
}