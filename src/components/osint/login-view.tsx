'use client';

import { useState } from 'react';
import { Radar, User, Lock, Eye, EyeOff, Loader2, AlertTriangle, ShieldCheck } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { SessionUserInfo } from '@/lib/auth-types';

export function LoginView({ onLogin }: { onLogin: (u: SessionUserInfo) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const j = await res.json();
      if (!res.ok || !j.user) {
        setError(j.error ?? 'ورود ناموفق بود');
        return;
      }
      onLogin(j.user);
    } catch {
      setError('خطای ارتباط با سرور — اتصال اینترنت را بررسی کن');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center px-4 py-8">
      {/* لوگو و معرفی */}
      <div className="text-center mb-7">
        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 border border-emerald-500/30 flex items-center justify-center radar-pulse shadow-[0_8px_24px_-6px_rgba(16,185,129,0.55)]">
          <Radar className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-2xl font-black">
          کاوشگر <span className="text-emerald-600">| سامانه هوشمند اوسینت</span>
        </h1>
        <p className="text-sm text-muted-foreground mt-2">
          جمع‌آوری اطلاعات از منابع باز + تحلیل هوش مصنوعی — دسترسی فقط برای کاربران مجاز
        </p>
      </div>

      {/* کارت ورود */}
      <Card className="w-full max-w-sm bg-white soft-shadow border-border/80">
        <CardContent className="p-5 sm:p-6">
          <h2 className="font-bold text-base flex items-center gap-2 mb-1">
            <ShieldCheck className="w-4.5 h-4.5 text-emerald-600" />
            ورود به سامانه
          </h2>
          <p className="text-xs text-muted-foreground mb-5">نام کاربری و رمز عبور توسط مدیر سامانه ایجاد می‌شود.</p>

          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="login-username">نام کاربری</Label>
              <div className="relative">
                <User className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                <Input
                  id="login-username"
                  dir="ltr"
                  className="ps-9 text-base h-11 bg-white"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="username"
                  autoComplete="username"
                  autoFocus
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="login-password">رمز عبور</Label>
              <div className="relative">
                <Lock className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                <Input
                  id="login-password"
                  dir="ltr"
                  type={showPass ? 'text' : 'password'}
                  className="ps-9 pe-10 text-base h-11 bg-white"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPass((v) => !v)}
                  className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={showPass ? 'پنهان کردن رمز' : 'نمایش رمز'}
                >
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2.5 text-xs text-rose-700">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                {error}
              </div>
            )}

            <Button
              type="submit"
              disabled={loading || !username.trim() || !password}
              className="w-full h-11 text-sm font-bold bg-gradient-to-l from-emerald-600 to-teal-500 hover:from-emerald-700 hover:to-teal-600 text-white shadow-[0_6px_18px_-6px_rgba(16,185,129,0.6)] disabled:opacity-60"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> در حال بررسی…
                </>
              ) : (
                'ورود به کاوشگر'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
