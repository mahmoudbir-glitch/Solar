'use client';

import Link from 'next/link';
import { LayoutGrid, Lightbulb, BatteryFull, Zap, Coins, SlidersHorizontal } from 'lucide-react';
import { usePathname } from 'next/navigation';

/* Idle tabs are a calm grey; on the phone the open tab is a solid pill in the colour of what it is about (the same colours its page
 * header and numbers use): overview indigo, home sky, battery emerald, solar
 * energy amber, money teal, settings rose. Full class strings for Tailwind. */
type NavTone = { icon: string; active: string; desktop: string };
const TONES: Record<string, NavTone> = {
  indigo: { icon: 'text-indigo-500', active: 'bg-indigo-500 text-white ring-indigo-500', desktop: 'text-indigo-700 ring-indigo-200/80' },
  sky: { icon: 'text-sky-500', active: 'bg-sky-500 text-white ring-sky-500', desktop: 'text-sky-700 ring-sky-200/80' },
  emerald: { icon: 'text-emerald-500', active: 'bg-emerald-600 text-white ring-emerald-600', desktop: 'text-emerald-700 ring-emerald-200/80' },
  amber: { icon: 'text-amber-500', active: 'bg-amber-500 text-white ring-amber-500', desktop: 'text-amber-700 ring-amber-200/80' },
  teal: { icon: 'text-teal-500', active: 'bg-teal-500 text-white ring-teal-500', desktop: 'text-teal-700 ring-teal-200/80' },
  rose: { icon: 'text-rose-500', active: 'bg-rose-500 text-white ring-rose-500', desktop: 'text-rose-600 ring-rose-200/80' },
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

export function DesktopNav() {
  const path = usePathname();
  if (path === '/login') return null;

  return (
    <nav aria-label="التنقل الرئيسي" className="hidden md:block">
      <div className="mx-auto flex max-w-3xl items-center gap-1.5 rounded-2xl border border-slate-200/80 bg-slate-50/80 p-1.5 shadow-sm backdrop-blur">
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
                (active
                  ? 'bg-white shadow-sm ring-1 ' + t.desktop
                  : 'text-slate-500 hover:bg-white hover:text-slate-800')
              }
            >
              <Icon size={21} strokeWidth={active ? 2.7 : 2.2} aria-hidden="true" className={active ? undefined : 'text-slate-400'} />
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export function BottomNav() {
  const path = usePathname();
  if (path === '/login') return null;

  return (
    <nav
      aria-label="التنقل السفلي"
      className="fixed inset-x-2 bottom-[calc(env(safe-area-inset-bottom)+0.5rem)] z-50 mx-auto max-w-lg rounded-full border border-slate-200/80 bg-white/95 p-1.5 shadow-[0_10px_35px_rgba(82,55,38,0.14)] backdrop-blur-xl md:hidden"
    >
      <div className="mx-auto grid max-w-lg grid-cols-6 gap-1">
        {navItems.map(({ href, label, Icon, tone }) => {
          const active = isNavActive(path, href);
          const t = TONES[tone];
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={
                'group flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-full px-1 text-[10px] font-extrabold transition-all active:scale-95 ' +
                (active
                  ? 'ring-1 ' + t.active
                  : 'text-slate-500 hover:bg-slate-50')
              }
            >
              <span className="flex h-7 w-10 items-center justify-center">
                <Icon size={21} strokeWidth={active ? 2.6 : 2.1} aria-hidden="true" className={active ? undefined : 'text-slate-400'} />
              </span>
              <span className="leading-none">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
