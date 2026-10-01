'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Radar, Search, CheckCircle2, Loader2, KeyRound, ChevronDown, ExternalLink, Eye, EyeOff, Landmark } from 'lucide-react';
import { detectTargetType, TARGET_TYPE_LABELS } from '@/lib/osint/detect';

const EXAMPLES: { label: string; value: string }[] = [
  { label: 'یوزرنیم', value: 'elonmusk' },
  { label: 'ایمیل', value: 'bill.gates88@gmail.com' },
  { label: 'دامنه', value: 'github.com' },
  { label: 'IP', value: '8.8.8.8' },
  { label: 'تلفن', value: '+989121234567' },
  { label: 'مکان', value: 'تهران' },
  { label: 'بیت‌کوین', value: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa' },
];

const CONSOLE_SCRIPT = [
  'بیدارسازی هسته کاوشگر…',
  'اتصال به رله‌های اطلاعاتی…',
  'هماهنگ‌سازی ماژول‌های جمع‌آوری…',
  'ارسال درخواست‌های موازی به منابع…',
  'در حال دریافت و پالایش پاسخ‌ها…',
  'تبادل سرنخ‌ها بین ماژول‌ها…',
  'کشورسازی یافته‌ها…',
  'تدوین پرونده اطلاعاتی…',
];

const HIKER_KEY_STORAGE = 'kavoshgar_hiker_key';

export function ScanPanel({
  scanning,
  onStart,
}: {
  scanning: boolean;
  onStart: (target: string, hikerKey?: string) => void;
}) {
  const [value, setValue] = useState('');
  const [focused, setFocused] = useState(false);
  const [consoleLines, setConsoleLines] = useState<string[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // کلید API اینستاگرام (HikerAPI) — در localStorage ذخیره می‌شود
  const [apiKey, setApiKey] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [keySavedFlash, setKeySavedFlash] = useState(false);
  // کلیدهای سازمانی که مدیر فعال کرده (بدون افشای خود کلیدها)
  const [orgKey, setOrgKey] = useState(false);
  const [orgTc, setOrgTc] = useState(false);

  useEffect(() => {
    try {
      setApiKey(localStorage.getItem(HIKER_KEY_STORAGE) ?? '');
    } catch {
      /* localStorage در دسترس نیست */
    }
    fetch('/api/osint/key-status')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        setOrgKey(!!j?.global);
        setOrgTc(!!j?.truecaller);
      })
      .catch(() => null);
  }, []);

  const saveApiKey = (v: string) => {
    setApiKey(v);
    try {
      localStorage.setItem(HIKER_KEY_STORAGE, v.trim());
    } catch {
      /* ignore */
    }
    setKeySavedFlash(true);
    setTimeout(() => setKeySavedFlash(false), 1500);
  };

  const detected = value.trim() ? detectTargetType(value.trim()) : null;

  // انیمیشن کنسول در حین اسکن
  useEffect(() => {
    if (scanning) {
      setConsoleLines([CONSOLE_SCRIPT[0]]);
      let i = 1;
      timerRef.current = setInterval(() => {
        setConsoleLines((prev) => [...prev.slice(-6), CONSOLE_SCRIPT[i % CONSOLE_SCRIPT.length]]);
        i++;
      }, 1400);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      setConsoleLines([]);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [scanning]);

  const submit = () => {
    const v = value.trim();
    if (v && !scanning) onStart(v, apiKey.trim() || undefined);
  };

  return (
    <div className="relative rounded-2xl border border-emerald-500/25 bg-white/85 backdrop-blur radar-bg soft-shadow overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-l from-transparent via-emerald-400/80 to-transparent" />
      <div className="p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row gap-2.5 sm:gap-3">
          <div className="relative flex-1">
            <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-muted-foreground pointer-events-none" />
            <Input
              dir="auto"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              disabled={scanning}
              placeholder="هدف را وارد کنید: یوزرنیم، ایمیل، شماره تلفن، دامنه، IP یا لینک…"
              className={`h-12 pr-11 text-base bg-white border-input transition-shadow ${
                focused ? 'shadow-[0_0_0_3px_rgba(16,185,129,0.15)] border-emerald-500/60' : ''
              }`}
              aria-label="هدف اوسینت"
            />
            {detected && !scanning && (
              <Badge className="absolute left-3 top-1/2 -translate-y-1/2 bg-emerald-500/15 text-emerald-700 border border-emerald-500/30 hover:bg-emerald-500/15 text-[10px] pointer-events-none">
                {TARGET_TYPE_LABELS[detected]}
              </Badge>
            )}
          </div>
          <Button
            onClick={submit}
            disabled={scanning || !value.trim()}
            size="lg"
            className="h-12 w-full sm:w-auto px-6 justify-center font-bold bg-gradient-to-l from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white shadow-[0_8px_24px_-8px_rgba(16,185,129,0.65)]"
          >
            {scanning ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" /> در حال اسکن…
              </>
            ) : (
              <>
                <Radar className="w-5 h-5" /> شروع اسکن اوسینت
              </>
            )}
          </Button>
        </div>

        {/* نمونه‌ها + تنظیمات */}
        <div className="flex flex-wrap items-center gap-1.5 mt-3">
          <span className="text-[11px] text-muted-foreground">نمونه:</span>
          {EXAMPLES.map((ex) => (
            <button
              key={ex.value}
              onClick={() => !scanning && setValue(ex.value)}
              className="text-[11px] px-2.5 py-1 rounded-full border border-border bg-secondary/60 text-muted-foreground hover:text-emerald-700 hover:border-emerald-500/40 transition-colors"
              type="button"
            >
              {ex.label}
            </button>
          ))}

          {/* دکمه تنظیمات کلید API */}
          <button
            type="button"
            onClick={() => setShowSettings((s) => !s)}
            aria-expanded={showSettings}
            className="ms-auto flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full border transition-colors font-semibold"
            style={{
              borderColor: apiKey || orgKey || orgTc ? 'rgba(5,150,105,0.45)' : undefined,
              color: apiKey || orgKey || orgTc ? 'rgb(4,120,87)' : undefined,
              background: apiKey || orgKey || orgTc ? 'rgba(16,185,129,0.1)' : undefined,
            }}
          >
            <KeyRound className="w-3.5 h-3.5" />
            {apiKey ? 'کلید API فعال' : orgKey || orgTc ? 'کلید سازمانی فعال' : 'کلید API'}
            <ChevronDown className={`w-3 h-3 transition-transform ${showSettings ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {/* پنل تنظیم کلید API (HikerAPI) */}
        {showSettings && (
          <div className="mt-3 rounded-xl border border-border/80 bg-secondary/40 p-3.5 space-y-2.5">
            {/* وضعیت کلیدهای سازمانی مدیر */}
            {(orgKey || orgTc) && (
              <div className="flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5 text-[11px] text-emerald-800 leading-5">
                <Landmark className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <p>
                  <b>کلیدهای سازمانی توسط مدیر فعال شده‌اند.</b>
                  {orgKey ? ' جستجوی کامل اینستاگرام بدون کلید شخصی انجام می‌شود؛' : ''}
                  {orgTc ? ' نام ثبت‌شده شماره موبایل در Truecaller و NumberBox در نتایج جستجوی تلفن نمایش داده می‌شود.' : ''}
                  {' '}اگر کلید شخصی خودتان را وارد کنید، همان استفاده خواهد شد.
                </p>
              </div>
            )}
            <div className="flex items-start gap-2 text-[11px] text-muted-foreground leading-5">
              <KeyRound className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <p>
                برای دریافت داده <b className="text-foreground">مستقیم و قطعی</b> اینستاگرام (فالوور، بیو، پست‌ها و نرخ تعامل بدون
                هیچ محدودیتی)، کلید API خود از سرویسی مثل{' '}
                <a
                  href="https://hikerapi.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-emerald-700 underline decoration-emerald-500/40 hover:decoration-emerald-600 inline-flex items-center gap-0.5"
                >
                  HikerAPI <ExternalLink className="w-3 h-3" />
                </a>{' '}
                را وارد و ذخیره کنید. بدون کلید، کاوشگر از ردیاب‌های عمومی استفاده می‌کند و اگر داده‌ای نباشد، شفاف «در دسترس
                نیست» می‌گوید — هیچ عددی جعل نمی‌شود.
              </p>
            </div>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  dir="ltr"
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => saveApiKey(e.target.value)}
                  disabled={scanning}
                  placeholder="HikerAPI access key…"
                  autoComplete="off"
                  className="h-9 text-xs font-mono bg-white pe-9"
                  aria-label="کلید API اینستاگرام (HikerAPI)"
                />
                <button
                  type="button"
                  onClick={() => setShowKey((s) => !s)}
                  className="absolute end-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={showKey ? 'پنهان کردن کلید' : 'نمایش کلید'}
                >
                  {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
              {keySavedFlash && (
                <Badge className="bg-emerald-500/15 text-emerald-700 border border-emerald-500/30 text-[10px] shrink-0">
                  ذخیره شد ✓
                </Badge>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground leading-4">
              کلید فقط در مرورگر شما (localStorage) ذخیره می‌شود و همراه هر اسکن به سرور ارسال می‌گردد. برای ذخیره سراسری
              می‌توانید متغیر محیطی <code className="font-mono text-emerald-700/90" dir="ltr">HIKER_API_KEY</code> را نیز تنظیم کنید.
            </p>
          </div>
        )}

        {/* کنسول اسکن */}
        {scanning && consoleLines.length > 0 && (
          <div className="mt-4 rounded-xl border border-emerald-500/25 bg-gradient-to-b from-[#05301f] to-[#032016] p-4 relative overflow-hidden shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
            <div className="absolute inset-x-0 h-8 bg-gradient-to-b from-emerald-400/15 to-transparent scanline" />
            <div className="space-y-1.5">
              {consoleLines.map((line, i) => (
                <div key={i + line} className="console-line flex items-center gap-2 text-xs text-emerald-200/95">
                  {i === consoleLines.length - 1 ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-3 h-3 text-emerald-500/60" />
                  )}
                  <span>{line}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
