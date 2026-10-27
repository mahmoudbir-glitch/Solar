'use client';

import Link from 'next/link';
import { LayoutGrid, Lightbulb, BatteryFull, Zap, Coins, SlidersHorizontal } from 'lucide-react';
import { usePathname } from 'next/navigation';

/* Idle tabs are a calm grey; on the phone the open tab is a solid circle in the colour of what it is about (the same colours its page
 * header and numbers use): overview indigo, home sky, battery emerald, solar
 * energy amber, money teal, settings rose. Full class strings for Tailwind. */
type NavTone = { icon: string; idle: string; desktop: string; line: string; label: string; grad: string };
const TONES: Record<string, NavTone> = {
  indigo: { icon: 'text-indigo-500', idle: 'hover:bg-indigo-50 active:bg-indigo-100', desktop: 'bg-indigo-50 text-indigo-700 ring-indigo-200/80', line: 'border-indigo-500', label: 'text-indigo-700', grad: 'from-indigo-400 to-indigo-600' },
  sky: { icon: 'text-sky-500', idle: 'hover:bg-sky-50 active:bg-sky-100', desktop: 'bg-sky-50 text-sky-700 ring-sky-200/80', line: 'border-sky-500', label: 'text-sky-700', grad: 'from-sky-400 to-sky-600' },
  emerald: { icon: 'text-emerald-500', idle: 'hover:bg-emerald-50 active:bg-emerald-100', desktop: 'bg-emerald-50 text-emerald-700 ring-emerald-200/80', line: 'border-emerald-500', label: 'text-emerald-700', grad: 'from-emerald-500 to-emerald-700' },
  amber: { icon: 'text-amber-500', idle: 'hover:bg-amber-50 active:bg-amber-100', desktop: 'bg-amber-50 text-amber-700 ring-amber-200/80', line: 'border-amber-500', label: 'text-amber-700', grad: 'from-amber-500 to-orange-600' },
  teal: { icon: 'text-teal-500', idle: 'hover:bg-teal-50 active:bg-teal-100', desktop: 'bg-teal-50 text-teal-700 ring-teal-200/80', line: 'border-teal-500', label: 'text-teal-700', grad: 'from-teal-500 to-teal-700' },
  rose: { icon: 'text-rose-500', idle: 'hover:bg-rose-50 active:bg-rose-100', desktop: 'bg-rose-50 text-rose-600 ring-rose-200/80', line: 'border-rose-500', label: 'text-rose-700', grad: 'from-rose-400 to-rose-600' },
};

export const navItems: { href: string; label: string; Icon: typeof LayoutGrid; tone: keyof typeof TONES }[] = [
  { href: '/', label: 'الرئيسية', Icon: LayoutGrid, tone: 'indigo' },
  { href: '/home-consumption', label: 'المنزل', Icon: Lightbulb, tone: 'sky' },
  { href: '/battery', label: 'البطارية', Icon: BatteryFull, tone: 'emerald' },
  { href: '/energy', label: 'الطاقة', Icon: Zap, tone: 'amber' },
  { href: '/money', label: 'المال', Icon: Coins, tone: 'teal' },
  { href: '/settings', label: 'الإعدادات', Icon: SlidersHorizontal, tone: 'rose' },
];

export function isNavActive(path: string, href: string) {
  const aliases: Record<string, string[]> = {
    '/home-consumption': ['/home-consumption', '/home'],
    '/energy': ['/energy', '/energy-forecast', '/forecast'],
    '/money': ['/money', '/savings'],
  };
  return href === '/'
    ? path === '/'
    : (aliases[href] ?? [href]).some((route) => path === route || path.startsWith(route + '/'));
}

/** The page the owner is on (or none, e.g. the admin pages): its title and colour lead the top bar. */
export function currentNav(path: string) {
  return navItems.find((item) => isNavActive(path, item.href)) ?? null;
}

/** The top bar's colour for this page (a gradient in the page's own colour). */
export function navGradient(path: string) {
  return TONES[currentNav(path)?.tone ?? 'indigo'].grad;
}

export function DesktopNav() {
  const path = usePathname();
  if (path === '/login') return null;

  return (
    <nav aria-label="التنقل الرئيسي" className="hidden md:block">
      <div className="mx-auto flex max-w-3xl items-center gap-1.5 lg:max-w-4xl rounded-2xl border border-slate-200/80 bg-white/90 p-1.5 shadow-sm backdrop-blur">
        {navItems.map(({ href, label, Icon, tone }) => {
          const active = isNavActive(path, href);
          const t = TONES[tone];
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={
                'flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl px-3 text-sm font-extrabold transition-all ' +
                (active ? 'shadow-sm ring-1 ' + t.desktop : 'text-slate-600 ' + t.idle)
              }
            >
              <Icon size={21} strokeWidth={active ? 2.7 : 2.2} aria-hidden="true" className={active ? undefined : t.icon} />
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

/* On the phone: a bar docked to the bottom edge. Idle tabs are a calm grey;
 * the open tab takes its page's colour, with a line along its top edge. */
export function BottomNav() {
  const path = usePathname();
  if (path === '/login') return null;

  return (
    <nav
      aria-label="التنقل السفلي"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200/80 bg-white pb-[env(safe-area-inset-bottom)] shadow-[0_-6px_24px_rgba(15,23,42,0.08)] md:hidden"
    >
      <div className="mx-auto grid max-w-lg grid-cols-6">
        {navItems.map(({ href, label, Icon, tone }) => {
          const active = isNavActive(path, href);
          const t = TONES[tone];
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={
                'flex flex-col items-center gap-1 border-t-[3px] pb-2.5 pt-2 text-[11px] transition-colors active:scale-95 ' +
                (active ? t.line + ' font-black ' + t.label : 'border-transparent font-bold text-slate-500')
              }
            >
              <Icon size={22} strokeWidth={active ? 2.5 : 2} aria-hidden="true" className={active ? t.icon : 'text-slate-400'} />
              <span className="leading-none">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
