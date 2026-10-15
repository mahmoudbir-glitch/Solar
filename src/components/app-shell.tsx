"use client";

import React, { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { BottomNav, DesktopNav, navGradient } from '@/components/bottom-nav';
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
    <div className="min-h-screen w-full bg-[linear-gradient(165deg,#eef0ff_0%,#f4f6fc_38%,#f5efff_70%,#fff8e5_100%)]">
      {/* One bar in the open page's colour: brand (with the connection dot beside the name) and tagline, logout. */}
      <header className={"sticky top-0 z-50 rounded-b-[1.5rem] bg-gradient-to-l pt-[env(safe-area-inset-top)] text-white shadow-[0_8px_24px_rgba(15,23,42,0.14)] transition-colors " + navGradient(pathname || '/')}>
        <div className="mx-auto flex min-h-[4.5rem] max-w-5xl items-center justify-between gap-3 px-3 py-2.5 sm:px-6 lg:max-w-6xl">
          <div className="flex min-w-0 items-center gap-2.5" aria-label="Solar">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/90 shadow-sm"><SolarMark size={36} /></span>
            <div className="min-w-0">
              <div className="flex items-center gap-2"><span className="truncate text-xl font-black leading-tight">Solar</span><StatusBar compact /></div>
              <div className="truncate text-xs font-extrabold text-white/90">الطاقة البديلة</div>
            </div>
          </div>
          <LogoutButton onColor />
        </div>
      </header>
      <div className="mx-auto hidden max-w-5xl px-4 pt-3 sm:px-6 md:block lg:max-w-6xl">
        <DesktopNav />
      </div>
      <main className="mx-auto min-h-[calc(100vh-120px)] w-full max-w-3xl px-3 py-3 pb-28 sm:px-5 sm:py-6 md:pb-8 lg:max-w-6xl">
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
