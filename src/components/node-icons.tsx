import React from "react";

/*
 * Solar's icons for the energy-flow nodes. Each sits on a filled circle in its
 * node's colour (sun amber, grid purple, home blue), so the drawing itself is
 * white; on an idle, grey circle it turns grey. Drawn on a 48×48 grid so they
 * stay crisp at the 40px they are shown at.
 */
const WHITE = "#ffffff";
const IDLE = "#96a1c0";

export function SolarPanelIcon({ active = true, className = "h-10 w-10" }: { active?: boolean; className?: string }) {
  const ink = active ? WHITE : IDLE;
  const cell = active ? "#f59c00" : "#eaeef8";
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      {/* sun in the corner */}
      <circle cx="14" cy="13" r="5.5" fill={ink} />
      <g stroke={ink} strokeWidth="2.2" strokeLinecap="round">
        <line x1="14" y1="3" x2="14" y2="5" />
        <line x1="4" y1="13" x2="6" y2="13" />
        <line x1="6.9" y1="5.9" x2="8.3" y2="7.3" />
        <line x1="21.1" y1="5.9" x2="19.7" y2="7.3" />
      </g>
      {/* panel seen from the front: a frame with six cells */}
      <rect x="9" y="22" width="32" height="19" rx="3.5" fill={ink} />
      <g fill={cell}>
        <rect x="12" y="25" width="7.6" height="5.4" rx="1" />
        <rect x="21.2" y="25" width="7.6" height="5.4" rx="1" />
        <rect x="30.4" y="25" width="7.6" height="5.4" rx="1" />
        <rect x="12" y="32.6" width="7.6" height="5.4" rx="1" />
        <rect x="21.2" y="32.6" width="7.6" height="5.4" rx="1" />
        <rect x="30.4" y="32.6" width="7.6" height="5.4" rx="1" />
      </g>
    </svg>
  );
}

export function GridTowerIcon({ active = true, className = "h-10 w-10" }: { active?: boolean; className?: string }) {
  const ink = active ? WHITE : IDLE;
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true" fill="none" stroke={ink} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
      {/* utility pole with two cross-arms */}
      <path d="M24 7 V41" />
      <path d="M13 15 H35 M17 24 H31" />
      {/* insulators */}
      <g fill={ink} stroke="none">
        <circle cx="13" cy="15" r="2.5" />
        <circle cx="35" cy="15" r="2.5" />
        <circle cx="17" cy="24" r="2.3" />
        <circle cx="31" cy="24" r="2.3" />
      </g>
      {/* lines leaving to both sides */}
      <path d="M5 20 Q9.5 22 13 15 M35 15 Q38.5 22 43 20" strokeWidth="1.9" />
      <path d="M18.5 41 H29.5" />
    </svg>
  );
}

export function HouseIcon({ className = "h-10 w-10" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true" strokeLinejoin="round" strokeLinecap="round">
      {/* roof */}
      <path d="M6 24 L24 8 L42 24" fill="none" stroke={WHITE} strokeWidth="3.2" />
      {/* walls with a door and a lit window */}
      <path d="M11 23.5 V40 H37 V23.5 L24 12 Z" fill={WHITE} />
      <rect x="16" y="29" width="7" height="11" rx="1.4" fill="#2077f0" />
      <rect x="26.5" y="28" width="6.5" height="6.5" rx="1.3" fill="#ffcb4a" />
    </svg>
  );
}

/**
 * The inverter by what it does: direct current (the straight and dashed lines
 * of the DC symbol) goes in at the top and comes out below as an AC wave.
 */
export function InverterIcon({ active = true, className = "h-10 w-10" }: { active?: boolean; className?: string }) {
  const ink = active ? WHITE : IDLE;
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true" fill="none" stroke={ink} strokeLinecap="round" strokeLinejoin="round">
      {/* DC in */}
      <path d="M13 10 H35" strokeWidth="3" />
      <path d="M13 16 H35" strokeWidth="2.6" strokeDasharray="4.4 4.4" />
      {/* converted */}
      <path d="M24 21 V28.5" strokeWidth="2.6" />
      <path d="M20 25.5 L24 29.5 L28 25.5" strokeWidth="2.6" />
      {/* AC out */}
      <path d="M11 38 q3.25 -8.5 6.5 0 t6.5 0 t6.5 0 t6.5 0" strokeWidth="3" />
    </svg>
  );
}
