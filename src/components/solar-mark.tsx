import { Sun } from "lucide-react";

/** Solar's logo: a white sun on a sunrise badge. */
export function SolarMark({ large = false }: { large?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={
        "solar-mark flex shrink-0 items-center justify-center bg-gradient-to-br from-amber-300 via-amber-500 to-rose-400 text-white shadow-[0_8px_18px_rgba(245,156,0,0.35)] " +
        (large ? "h-20 w-20 rounded-[1.75rem]" : "h-10 w-10 rounded-2xl")
      }
    >
      <Sun size={large ? 44 : 24} strokeWidth={2.4} />
    </span>
  );
}
