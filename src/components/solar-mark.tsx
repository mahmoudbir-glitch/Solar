import { useId } from "react";

/** Solar's logo: the app icon's sun over a solar panel, with no background. It blinks gently. */
export function SolarMark({ large = false }: { large?: boolean }) {
  const id = useId().replace(/:/g, "");
  const sun = `solar-mark-sun-${id}`;
  const panel = `solar-mark-panel-${id}`;
  const px = large ? 80 : 44;
  return (
    <svg
      aria-hidden="true"
      className="solar-mark shrink-0"
      width={px}
      height={px}
      viewBox="96 60 320 390"
    >
      <defs>
        <radialGradient id={sun} cx="0.4" cy="0.4" r="0.7">
          <stop offset="0" stopColor="#ffe27a" />
          <stop offset="1" stopColor="#ffb21e" />
        </radialGradient>
        <linearGradient id={panel} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1f3a8a" />
          <stop offset="1" stopColor="#0f1f55" />
        </linearGradient>
      </defs>
      <g className="solar-mark-sun">
        <g stroke="#ffd34d" strokeWidth="18" strokeLinecap="round">
          <line x1="256" y1="72" x2="256" y2="100" />
          <line x1="339" y1="107" x2="320" y2="126" />
          <line x1="173" y1="107" x2="192" y2="126" />
          <line x1="374" y1="190" x2="346" y2="190" />
          <line x1="138" y1="190" x2="166" y2="190" />
        </g>
        <circle cx="256" cy="190" r="66" fill={`url(#${sun})`} />
      </g>
      <path d="M256 392 L256 430" stroke="#94a3b8" strokeWidth="16" strokeLinecap="round" />
      <path d="M206 432 H306" stroke="#94a3b8" strokeWidth="16" strokeLinecap="round" />
      <path d="M150 262 H362 L404 396 H108 Z" fill={`url(#${panel})`} stroke="#ffffff" strokeWidth="10" strokeLinejoin="round" />
      <g stroke="#7ea6ff" strokeWidth="5" fill="none">
        <path d="M136 307 H376" />
        <path d="M122 352 H390" />
        <path d="M203 262 L182 396" />
        <path d="M256 262 V396" />
        <path d="M309 262 L330 396" />
      </g>
    </svg>
  );
}
