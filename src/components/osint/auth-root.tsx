'use client';

import { useCallback, useEffect, useState } from 'react';
import { Radar } from 'lucide-react';
import { LoginView } from './login-view';
import { OsintApp } from './osint-app';
import { AdminPanel } from './admin-panel';
import type { SessionUserInfo } from '@/lib/auth-types';

type View = 'app' | 'admin';

export function AuthRoot() {
  const [user, setUser] = useState<SessionUserInfo | null>(null);
  const [booting, setBooting] = useState(true);
  const [view, setView] = useState<View>('app');

  // بررسی نشست هنگام بارگذاری
  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((j) => {
        if (j?.user) setUser(j.user);
      })
      .catch(() => null)
      .finally(() => setBooting(false));
  }, []);

  const logout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => null);
    setUser(null);
    setView('app');
  }, []);

  // پرده بوت — بررسی نشست
  if (booting) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center gap-4">
        <div className="relative w-16 h-16">
          <span className="absolute inset-0 rounded-full border border-emerald-500/25" />
          <span className="absolute inset-3 rounded-full border border-emerald-500/35" />
          <span className="absolute inset-0 rounded-full radar-pulse" />
          <Radar className="absolute inset-0 m-auto w-7 h-7 text-emerald-600" />
        </div>
        <p className="text-sm text-muted-foreground">در حال بررسی نشست…</p>
      </div>
    );
  }

  // بدون نشست → صفحه ورود
  if (!user) return <LoginView onLogin={setUser} />;

  // پنل مدیریت (فقط ادمین)
  if (view === 'admin' && user.role === 'admin') {
    return <AdminPanel user={user} onBack={() => setView('app')} onLogout={logout} />;
  }

  // اپ اصلی کاوشگر
  return (
    <OsintApp
      user={user}
      onOpenAdmin={user.role === 'admin' ? () => setView('admin') : undefined}
      onLogout={logout}
    />
  );
}
