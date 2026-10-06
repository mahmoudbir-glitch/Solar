import React from "react";

/*
 * Solar's icons for the energy-flow nodes: flat, filled shapes in the warm
 * palette (gold sun, brown panel, dusty-blue grid, terracotta home), drawn on a
 * 48×48 grid so they stay crisp at the 40px they are shown at.
 */

export function SolarPanelIcon({ active = true, className = "h-10 w-10" }: { active?: boolean; className?: string }) {
  const sun = active ? "#d99a2b" : "#dccbb7";
  const frame = active ? "#594338" : "#b5a393";
  const cell = active ? "#f4d58d" : "#f7f1e8";
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      {/* sun in the corner */}
      <circle cx="13" cy="12" r="6" fill={sun} />
      <g stroke={sun} strokeWidth="2.2" strokeLinecap="round">
        <line x1="13" y1="1.5" x2="13" y2="3.5" />
        <line x1="2.5" y1="12" x2="4.5" y2="12" />
        <line x1="5.6" y1="4.6" x2="7" y2="6" />
        <line x1="20.4" y1="4.6" x2="19" y2="6" />
      </g>
      {/* panel seen from the front: a frame with six cells */}
      <rect x="9" y="21" width="34" height="21" rx="3.5" fill={frame} />
      <g fill={cell}>
        <rect x="12" y="24" width="8.5" height="6.5" rx="1" />
        <rect x="21.75" y="24" width="8.5" height="6.5" rx="1" />
        <rect x="31.5" y="24" width="8.5" height="6.5" rx="1" />
        <rect x="12" y="32.5" width="8.5" height="6.5" rx="1" />
        <rect x="21.75" y="32.5" width="8.5" height="6.5" rx="1" />
        <rect x="31.5" y="32.5" width="8.5" height="6.5" rx="1" />
      </g>
    </svg>
  );
}

export function GridTowerIcon({ active = true, className = "h-10 w-10" }: { active?: boolean; className?: string }) {
  const c = active ? "#41647f" : "#b5a393";
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true" fill="none" stroke={c} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      {/* utility pole with two cross-arms */}
      <path d="M24 5 V43" />
      <path d="M12 14 H36 M16 23 H32" />
      {/* insulators */}
      <g fill={c} stroke="none">
        <circle cx="12" cy="14" r="2.4" />
        <circle cx="36" cy="14" r="2.4" />
        <circle cx="16" cy="23" r="2.2" />
        <circle cx="32" cy="23" r="2.2" />
      </g>
      {/* lines leaving to both sides */}
      <path d="M3 19 Q8 21 12 14 M36 14 Q40 21 45 19" strokeWidth="1.8" />
      <path d="M18 43 H30" stroke={active ? "#bcd0df" : "#dccbb7"} />
    </svg>
  );
}

export function HouseIcon({ className = "h-10 w-10" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true" strokeLinejoin="round">
      {/* walls */}
      <path d="M10 23 H38 V42 H10 Z" fill="#fbf1ec" stroke="#8f4e33" strokeWidth="2" />
      {/* solid roof */}
      <path d="M4 24 L24 6 L44 24 Z" fill="#c8795a" stroke="#8f4e33" strokeWidth="2" />
      <circle cx="24" cy="17" r="2.6" fill="#fdf6e3" />
      {/* door and window */}
      <rect x="14" y="30" width="8" height="12" rx="1.5" fill="#8f4e33" />
      <rect x="27" y="29" width="7" height="7" rx="1.2" fill="#ecc35f" stroke="#8f4e33" strokeWidth="1.6" />
    </svg>
  );
}

/** The inverter as the wall unit it is: a case with a charging bolt on its screen. */
export function InverterIcon({ active = true, className = "h-10 w-10" }: { active?: boolean; className?: string }) {
  const edge = active ? "#a87044" : "#b5a393";
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="5" width="30" height="38" rx="6" fill={active ? "#fbf3e8" : "#f7f1e8"} stroke={edge} strokeWidth="2.2" />
      <rect x="13.5" y="10" width="21" height="14" rx="3" fill={active ? "#594338" : "#dccbb7"} />
      {/* charging bolt */}
      <path d="M25.8 11.6 L19.6 18.2 H23.6 L22.2 22.4 L28.4 15.8 H24.4 Z" fill={active ? "#ecc35f" : "#f7f1e8"} stroke={active ? "#ecc35f" : "#f7f1e8"} strokeWidth="0.8" />
      <circle cx="17" cy="33" r="2.3" fill={active ? "#16866a" : "#b5a393"} />
      <path d="M23.5 31 H33 M23.5 35.5 H30" fill="none" stroke={edge} strokeWidth="2" />
    </svg>
  );
}
