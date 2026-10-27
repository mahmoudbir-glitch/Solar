import React from "react";
import { BOLT_COLORS, boltBlinks, type BoltMode } from "@/lib/bolt-mode";

/*
 * Solar's icons for the energy-flow nodes. Each sits on a filled circle in its
 * node's colour (sun amber, grid purple, home blue), so the drawing itself is
 * white; on an idle, grey circle it turns grey. Drawn on a 48×48 grid so they
 * stay crisp at the 40px they are shown at.
 */
const WHITE = "#ffffff";
const IDLE = "#96a1c0";

export function SolarPanelIcon({ active = true, className = "h-10 w-10" }: { active?: boolean; className?: string }) {
  // The same drawing as the logo beside the "Solar" name (solar-mark.tsx): a sun
  // over a tilted panel seen in perspective, rather than a flat front view.
  const id = React.useId().replace(/:/g, "");
  const sun = active ? WHITE : IDLE;
  const top = active ? "#1f3a8a" : "#d5dbea";
  const bottom = active ? "#0f1f55" : "#b4bdd4";
  const lines = active ? "#7ea6ff" : "#eef1f8";
  return (
    <svg viewBox="96 60 320 390" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={`panel-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={top} />
          <stop offset="1" stopColor={bottom} />
        </linearGradient>
      </defs>
      <g stroke={sun} strokeWidth="18" strokeLinecap="round">
        <line x1="256" y1="72" x2="256" y2="100" />
        <line x1="339" y1="107" x2="320" y2="126" />
        <line x1="173" y1="107" x2="192" y2="126" />
        <line x1="374" y1="190" x2="346" y2="190" />
        <line x1="138" y1="190" x2="166" y2="190" />
      </g>
      <circle cx="256" cy="190" r="66" fill={sun} />
      <path d="M256 392 L256 430 M206 432 H306" stroke={active ? WHITE : IDLE} strokeWidth="16" strokeLinecap="round" />
      <path d="M150 262 H362 L404 396 H108 Z" fill={`url(#panel-${id})`} stroke={WHITE} strokeWidth="10" strokeLinejoin="round" />
      <g stroke={lines} strokeWidth="5" fill="none">
        <path d="M136 307 H376" />
        <path d="M122 352 H390" />
        <path d="M203 262 L182 396" />
        <path d="M256 262 V396" />
        <path d="M309 262 L330 396" />
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
 * The inverter as an energy core: a bold amber lightning bolt for the power it
 * handles, the same mark Shamsak uses. Grey when no power is flowing.
 */
export function InverterIcon({ active = true, mode, className = "h-10 w-10" }: { active?: boolean; mode?: BoltMode; className?: string }) {
  const id = React.useId().replace(/:/g, "");
  // With a battery mode the bolt takes that mode's colour and blinks while charging (see bolt-mode.ts).
  const colors = mode ? BOLT_COLORS[mode] : active ? { top: "#fcd34d", bottom: "#f97316", edge: "#ea580c" } : BOLT_COLORS.idle;
  return (
    <svg viewBox="0 0 48 48" className={className + (mode && boltBlinks(mode) ? " bolt-blink" : "")} aria-hidden="true" strokeLinecap="round" strokeLinejoin="round">
      <defs>
        <linearGradient id={`bolt-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={colors.top} />
          <stop offset="100%" stopColor={colors.bottom} />
        </linearGradient>
      </defs>
      <path transform="translate(0 2)" d="M27.5 3 L12 25.5 H22.5 L19.5 41 L36 17.5 H25.5 Z" fill={`url(#bolt-${id})`} stroke={colors.edge} strokeWidth="1.6" />
    </svg>
  );
}
