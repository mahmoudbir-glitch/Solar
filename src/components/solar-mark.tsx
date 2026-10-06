import { Sun } from "lucide-react";

/** Solar's logo: a white sun on a sand badge. */
export function SolarMark({ large = false }: { large?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={
        "solar-mark flex shrink-0 items-center justify-center bg-gradient-to-br from-indigo-300 to-indigo-600 text-white shadow-[0_8px_18px_rgba(168,112,68,0.35)] " +
        (large ? "h-20 w-20 rounded-[1.75rem]" : "h-10 w-10 rounded-2xl")
      }
    >
      <Sun size={large ? 44 : 24} strokeWidth={2.4} />
    </span>
  );
}
