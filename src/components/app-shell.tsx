"use client";

import React, { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { BottomNav, DesktopNav } from '@/components/bottom-nav';
import LogoutButton from '@/components/logout-button';
import { StatusBar } from '@/components/status-bar';
import { SolarMark } from '@/components/solar-mark';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLogin = pathname === '/login';

  useEffect(() => {
    if (isLogin) return;

    let active = true;

    const verifyStillAuthenticated = async () => {
      try {
        const response = await fetch('/api/auth/session', {
          method: 'GET',
          cache: 'no-store',
          credentials: 'include',
          headers: { 'Cache-Control': 'no-cache' },
        });

        if (active && response.status === 401) {
          window.location.replace('/login?next=' + encodeURIComponent(pathname || '/'));
        }
      } catch {
        // Keep the current page on transient network errors.
      }
    };

    // Re-check whenever the user navigates between protected pages.
    void verifyStillAuthenticated();

    // Browser back/forward can restore a protected page from bfcache
    // without a new server request. Verify the session when that happens.
    const handlePageShow = () => {
      void verifyStillAuthenticated();
    };

    window.addEventListener('pageshow', handlePageShow);

    return () => {
      active = false;
      window.removeEventListener('pageshow', handlePageShow);
    };
  }, [isLogin, pathname]);

  useEffect(() => {
    if (isLogin) return;
    const key = 'solar_monitoring_app_open_recorded';
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');
    void fetch('/api/monitoring/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'APP_OPEN' }),
    }).catch(() => undefined);
  }, [isLogin]);

  if (isLogin) return <>{children}</>;

  return (
    <div className="min-h-screen w-full bg-[linear-gradient(180deg,#f8fafc_0%,#f1f5f9_48%,#f8fafc_100%)]">
      <header className="sticky top-[calc(env(safe-area-inset-top)+0.5rem)] z-50 mx-2 mt-2 overflow-hidden rounded-[1.75rem] border border-slate-200/70 bg-white/90 shadow-[0_8px_28px_rgba(82,55,38,0.08)] backdrop-blur-xl sm:mx-auto sm:max-w-5xl lg:max-w-6xl">
        <div className="mx-auto flex max-w-5xl items-center lg:max-w-6xl justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3" aria-label="Solar">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <SolarMark />
                <div className="truncate text-xl font-black tracking-tight text-slate-950 sm:text-2xl">Solar</div>
                <span className="hidden rounded-full bg-emerald-50 px-2 py-1 text-[9px] font-black text-emerald-700 sm:inline-flex">
                  طاقة ذكية
                </span>
              </div>
              <div className="mt-0.5 truncate text-[11px] font-black text-black sm:text-xs">
                الشمس تعمل من أجلك
              </div>
            </div>
          </div>
          <LogoutButton />
        </div>
        <div className="mx-auto max-w-5xl px-4 pb-2 sm:px-6 lg:max-w-6xl">
          <StatusBar />
        </div>
        <div className="mx-auto max-w-5xl px-4 pb-3 sm:px-6 lg:max-w-6xl">
          <DesktopNav />
        </div>
      </header>
      <main className="mx-auto min-h-[calc(100vh-120px)] w-full max-w-3xl px-3 py-4 pb-28 sm:px-5 sm:py-6 md:pb-8 lg:max-w-6xl">
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
