"use client";

import { useEffect, useRef, useState } from "react";

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
const phrases = [
  "¡Yo aquí, listo!",
  "Tu correo abre el camino.",
  "Prometo no mirar la clave.",
  "¿Café y automatizamos?",
] as const;

export function LoginMascot() {
  const layerRef = useRef<HTMLDivElement>(null);
  const guideRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number | null>(null);
  const [phraseIndex, setPhraseIndex] = useState(0);

  useEffect(() => {
    const layer = layerRef.current;
    const guide = guideRef.current;
    if (!layer || !guide) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const updateLook = (event: PointerEvent) => {
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
      frameRef.current = window.requestAnimationFrame(() => {
        const bounds = guide.getBoundingClientRect();
        const lookX = clamp((event.clientX - (bounds.left + bounds.width / 2)) / 45, -5, 5);
        const lookY = clamp((event.clientY - (bounds.top + bounds.height / 2)) / 48, -3.5, 3.5);
        layer.style.setProperty("--guide-look-x", `${lookX}px`);
        layer.style.setProperty("--guide-look-y", `${lookY}px`);
      });
    };

    window.addEventListener("pointermove", updateLook, { passive: true });

    return () => {
      window.removeEventListener("pointermove", updateLook);
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
    };
  }, []);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const phraseTimer = window.setInterval(() => {
      setPhraseIndex((current) => (current + 1) % phrases.length);
    }, 4200);

    return () => window.clearInterval(phraseTimer);
  }, []);

  return (
    <div ref={layerRef} className="login-guide-layer" aria-hidden="true">
      <div ref={guideRef} className="login-guide">
        <span className="login-guide-bubble">
          <span key={phraseIndex} className="login-guide-phrase">{phrases[phraseIndex]}</span>
        </span>
        <svg viewBox="0 0 140 150" role="presentation">
          <g className="login-guide-trail">
            <circle cx="21" cy="114" r="7" />
            <circle cx="10" cy="127" r="4" />
            <circle cx="28" cy="136" r="3" />
          </g>

          <g className="login-guide-backpack">
            <rect x="30" y="75" width="23" height="42" rx="10" />
            <path d="M34 105c-7 8-9 16-7 24" />
          </g>

          <path className="login-guide-leg" d="M59 112c-1 10-4 17-10 24" />
          <path className="login-guide-leg" d="M83 112c2 10 6 17 13 23" />
          <ellipse className="login-guide-boot" cx="46" cy="138" rx="13" ry="7" transform="rotate(-18 46 138)" />
          <ellipse className="login-guide-boot" cx="100" cy="137" rx="13" ry="7" transform="rotate(18 100 137)" />

          <rect className="login-guide-suit" x="44" y="73" width="55" height="51" rx="24" />
          <path className="login-guide-suit-seam" d="M57 108h29" />
          <rect className="login-guide-badge" x="62" y="91" width="20" height="13" rx="5" />
          <text className="login-guide-badge-text" x="72" y="100">I·H</text>

          <g className="login-guide-arm-left">
            <path d="M48 84c-14 4-20 13-22 24" />
            <circle cx="25" cy="112" r="8" />
          </g>
          <g className="login-guide-arm-right">
            <path d="M95 84c12-5 20-14 24-25" />
            <circle cx="121" cy="55" r="8" />
          </g>

          <path className="login-guide-antenna" d="M72 17V7" />
          <circle className="login-guide-antenna-light" cx="72" cy="5" r="5" />
          <circle className="login-guide-helmet" cx="72" cy="49" r="38" />
          <path className="login-guide-helmet-shine" d="M48 29c8-9 20-13 32-11" />
          <rect className="login-guide-visor" x="42" y="32" width="60" height="40" rx="20" />
          <g className="login-guide-eyes">
            <ellipse cx="61" cy="51" rx="5" ry="7" />
            <ellipse cx="83" cy="51" rx="5" ry="7" />
            <circle className="login-guide-eye-light" cx="63" cy="48" r="1.5" />
            <circle className="login-guide-eye-light" cx="85" cy="48" r="1.5" />
          </g>
          <path className="login-guide-smile" d="M65 62c4 3 10 3 14 0" />
          <circle className="login-guide-cheek" cx="53" cy="61" r="3" />
          <circle className="login-guide-cheek" cx="91" cy="61" r="3" />
        </svg>
      </div>
    </div>
  );
}
