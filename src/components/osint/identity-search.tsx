'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  IdCard,
  Database,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  UserRoundSearch,
  ShieldQuestion,
  FileText,
  Copy,
  Check,
  UserRound,
  Smartphone,
  CreditCard,
  Hash,
  Timer,
} from 'lucide-react';

// ============================================================
// شناسایی هویت ایرانیان — نام، شماره، کدملی و کارت بانکی
// جستجو از دیتابیس متصل به سامانه (تنظیم‌شده توسط مدیر)
// ============================================================

type IdentityType = 'name' | 'national_id' | 'mobile' | 'card';

const TYPE_OPTIONS: {
  id: IdentityType;
  label: string;
  short: string;
  placeholder: string;
  icon: typeof UserRound;
}[] = [
  { id: 'name', label: 'نام و نام خانوادگی', short: 'نام و نام خانوادگی', placeholder: 'مثلاً: علی رضایی', icon: UserRound },
  { id: 'national_id', label: 'کد ملی', short: 'کد ملی', placeholder: '۱۰ رقم کد ملی — مثلاً 0499370899', icon: Hash },
  { id: 'mobile', label: 'شماره موبایل', short: 'موبایل', placeholder: 'مثلاً 09121234567 یا +989121234567', icon: Smartphone },
  { id: 'card', label: 'شماره کارت', short: 'شماره کارت', placeholder: '۱۶ رقم شماره کارت — مثلاً 6037997512345670', icon: CreditCard },
];

const STAGES = [
  'اتصال به دیتابیس…',
  'ارسال دستور جستجو…',
  'ارسال مقدار موردنظر…',
  'در انتظار پاسخ دیتابیس…',
];

interface BotReply {
  text: string;
  date: string;
  hasMedia: boolean;
  fileName?: string;
  fileText?: string;
  fileBytes?: number;
}

interface SearchResult {
  replies: BotReply[];
  botUsername: string;
  command: string;
  durationMs: number;
  query: { type: IdentityType; label: string; value: string };
}

function fmtFa(iso: string): string {
  try {
    return new Intl.DateTimeFormat('fa-IR', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
  } catch {
    return '';
  }
}

function fmtBytes(n?: number): string {
  if (!n || n <= 0) return '';
  if (n < 1024) return `${n} بایت`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} کیلوبایت`;
  return `${(n / 1048576).toFixed(1)} مگابایت`;
}

/** نمایش مرتب‌شده محتوای فایل txt پاسخ دیتابیس:
 * خطوط «کلید: مقدار» به‌صورت ردیف برچسب/مقدار مرتب می‌شوند و بقیه خطوط به همان شکل حفظ می‌شوند
 * (محتوای فایل بدون هیچ تغییری نمایش داده می‌شود — فقط چیدمان خواناتر است) */
function FileContent({ fileName, content, bytes }: { fileName?: string; content: string; bytes?: number }) {
  const [copied, setCopied] = useState(false);
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const kvRe = /^\s*([^:：/\n]{1,40})\s*[:：]\s*(.+?)\s*$/;
  const parsed = lines.map((l) => {
    const m = l.match(kvRe);
    if (!m) return null;
    const label = m[1].trim();
    if (/^https?$/i.test(label) || label.includes('//')) return null;
    return { label, value: m[2] };
  });
  const nonEmpty = lines.filter((l) => l.trim()).length;
  const okCount = parsed.filter(Boolean).length;
  const structured = nonEmpty >= 2 && okCount >= Math.ceil(nonEmpty * 0.5);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* دسترسی کلیپ‌بورد نبود — مهم نیست */
    }
  };

  return (
    <div className="rounded-xl border border-cyan-500/25 bg-cyan-500/[0.04] overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 px-3.5 py-2 bg-cyan-500/10 border-b border-cyan-500/20">
        <FileText className="w-3.5 h-3.5 text-cyan-600 shrink-0" />
        <span className="text-[10px] font-bold text-cyan-700" dir="ltr">{fileName || 'result.txt'}</span>
        {bytes ? <span className="text-[9px] text-muted-foreground ltr-num">{fmtBytes(bytes)}</span> : null}
        <span className="text-[9px] text-muted-foreground ltr-num">{nonEmpty} خط</span>
        <button
          type="button"
          onClick={copy}
          className="ms-auto inline-flex items-center gap-1 rounded-lg border border-cyan-500/30 bg-white/70 px-2 py-1 text-[10px] font-bold text-cyan-700 hover:bg-cyan-500/10 transition-colors"
        >
          {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
          {copied ? 'کپی شد' : 'کپی محتوا'}
        </button>
      </div>
      <div className="max-h-80 overflow-y-auto px-3.5 py-2.5">
        {structured ? (
          <div className="divide-y divide-border/50">
            {parsed.map((row, i) =>
              row ? (
                <div key={`kv-${i}`} className="flex items-start gap-2.5 py-1.5">
                  <span className="text-[10px] font-bold text-cyan-700 bg-cyan-500/10 border border-cyan-500/25 rounded-md px-2 py-0.5 shrink-0 max-w-44 break-words leading-5">
                    {row.label}
                  </span>
                  <span className="text-xs leading-6 break-words min-w-0" dir="auto">
                    {row.value}
                  </span>
                </div>
              ) : (
                <p key={`t-${i}`} className="text-xs leading-6 whitespace-pre-wrap break-words py-0.5" dir="auto">
                  {lines[i]}
                </p>
              )
            )}
          </div>
        ) : (
          <p className="text-xs leading-6 whitespace-pre-wrap break-words" dir="auto">
            {content}
          </p>
        )}
      </div>
    </div>
  );
}

export function IdentitySearch() {
  const [type, setType] = useState<IdentityType>('mobile');
  const [value, setValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const activeOption = TYPE_OPTIONS.find((t) => t.id === type)!;
  const ActiveIcon = activeOption.icon;

  // وضعیت فعال بودن ماژول (تنظیم دیتابیس توسط مدیر)
  useEffect(() => {
    fetch('/api/identity-search')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setConfigured(!!j?.configured))
      .catch(() => setConfigured(null));
  }, []);

  // انیمیشن مراحل جستجو + زمان‌سنج
  useEffect(() => {
    if (loading) {
      setStage(0);
      setElapsed(0);
      timerRef.current = setInterval(() => setStage((s) => Math.min(s + 1, STAGES.length - 1)), 3500);
      elapsedRef.current = setInterval(() => setElapsed((t) => t + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      if (elapsedRef.current) clearInterval(elapsedRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (elapsedRef.current) clearInterval(elapsedRef.current);
    };
  }, [loading]);

  const search = async () => {
    const v = value.trim();
    if (!v || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/identity-search', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type, value: v }),
      });
      const j = await res.json();
      if (res.status === 401) throw new Error('نشست منقضی شده — لطفاً دوباره وارد شو');
      if (!res.ok || j.error) throw new Error(j.error ?? 'جستجو ناموفق بود');
      setResult(j);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'خطای نامشخص در جستجو');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative rounded-2xl border border-cyan-500/25 bg-white/85 backdrop-blur soft-shadow overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-l from-transparent via-cyan-400/80 to-transparent" />
      {/* هاله نور پس‌زمینه */}
      <div className="pointer-events-none absolute -top-24 -start-24 w-64 h-64 rounded-full bg-cyan-400/10 blur-3xl" />
      <div className="p-4 sm:p-6 relative">
        {/* سربرگ */}
        <div className="flex items-start gap-3 mb-5">
          <div className="relative w-12 h-12 rounded-2xl bg-gradient-to-br from-cyan-500 to-sky-600 border border-cyan-400/40 flex items-center justify-center shrink-0 shadow-[0_8px_20px_-6px_rgba(6,182,212,0.55)]">
            <IdCard className="w-6 h-6 text-white" />
            <span className="absolute -bottom-1 -end-1 w-4 h-4 rounded-full bg-white border border-cyan-500/30 flex items-center justify-center">
              <Database className="w-2.5 h-2.5 text-cyan-600" />
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-black text-base sm:text-lg leading-tight">شناسایی هویت ایرانیان</h2>
              {configured === true && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  </span>
                  دیتابیس فعال
                </span>
              )}
            </div>
            <p className="text-[11px] sm:text-xs text-muted-foreground leading-5 mt-1">
              جستجوی نام و نام خانوادگی، کد ملی، شماره موبایل و شماره کارت بانکی از دیتابیس متصل به سامانه
            </p>
          </div>
        </div>

        {/* انتخاب نوع داده */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4" role="tablist" aria-label="نوع داده جستجو">
          {TYPE_OPTIONS.map((t) => {
            const Icon = t.icon;
            const active = type === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => {
                  setType(t.id);
                  setValue('');
                  setResult(null);
                  setError(null);
                }}
                disabled={loading}
                className={`group relative flex items-center gap-2 h-11 px-3 rounded-xl text-xs font-bold transition-all border overflow-hidden ${
                  active
                    ? 'bg-gradient-to-l from-cyan-600 to-sky-500 text-white border-cyan-500/50 shadow-[0_6px_16px_-6px_rgba(6,182,212,0.6)]'
                    : 'bg-secondary/60 text-muted-foreground border-border hover:text-cyan-700 hover:border-cyan-500/35 hover:bg-cyan-500/[0.06]'
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 transition-colors ${active ? 'text-white' : 'text-cyan-600/70 group-hover:text-cyan-600'}`} />
                <span className="truncate">{t.short}</span>
                {active && <span className="absolute inset-x-0 bottom-0 h-0.5 bg-white/50" />}
              </button>
            );
          })}
        </div>

        {/* ورودی جستجو */}
        <div className="flex flex-col sm:flex-row gap-2.5">
          <div className="relative flex-1">
            <ActiveIcon className="absolute start-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-cyan-600/60 pointer-events-none" />
            <Input
              dir="auto"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && search()}
              disabled={loading}
              inputMode={type === 'name' ? 'text' : 'numeric'}
              placeholder={activeOption.placeholder}
              className="h-12 ps-10 text-base bg-white border-input focus-visible:ring-cyan-500/30 focus-visible:border-cyan-500/60"
              aria-label={`مقدار ${activeOption.label}`}
            />
          </div>
          <Button
            onClick={search}
            disabled={loading || !value.trim()}
            size="lg"
            className="h-12 w-full sm:w-auto px-6 justify-center font-bold bg-gradient-to-l from-cyan-600 to-sky-500 hover:from-cyan-500 hover:to-sky-400 text-white shadow-[0_8px_24px_-8px_rgba(6,182,212,0.65)]"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" /> در حال جستجو…
              </>
            ) : (
              <>
                <UserRoundSearch className="w-5 h-5" /> جستجوی هویت
              </>
            )}
          </Button>
        </div>

        {/* اطلاع تنظیم نبودن توسط مدیر */}
        {configured === false && !loading && (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-3 text-[11px] leading-5 text-amber-800">
            <ShieldQuestion className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <p>
              این بخش هنوز فعال نشده است. مدیر سامانه باید در <b>پنل مدیریت</b> اتصال دیتابیس جستجو را تنظیم کند
              تا این جستجو برای همه کاربران فعال شود.
            </p>
          </div>
        )}

        {/* کنسول مراحل جستجو */}
        {loading && (
          <div className="mt-4 rounded-xl border border-cyan-500/25 bg-gradient-to-b from-[#04222e] to-[#03181f] overflow-hidden shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
            {/* هدر کنسول */}
            <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-cyan-500/15 bg-cyan-400/[0.06]">
              <div className="flex items-center gap-2">
                <Database className="w-3.5 h-3.5 text-cyan-300 shrink-0" />
                <span className="text-[11px] font-bold text-cyan-100">در حال پردازش درخواست…</span>
              </div>
              <span className="inline-flex items-center gap-1 text-[10px] text-cyan-300/80">
                <Timer className="w-3 h-3" />
                <span className="ltr-num">{elapsed}</span> ثانیه
              </span>
            </div>
            {/* نوار پیشرفت */}
            <div className="h-1 bg-cyan-950/70">
              <div
                className="h-full bg-gradient-to-l from-cyan-400 to-sky-400 transition-all duration-700 ease-out"
                style={{ width: `${((stage + 1) / STAGES.length) * 100}%` }}
              />
            </div>
            {/* مراحل */}
            <div className="px-4 py-3 relative">
              <div className="absolute inset-x-0 h-8 bg-gradient-to-b from-cyan-400/10 to-transparent scanline" />
              <div className="space-y-2 relative">
                {STAGES.slice(0, stage + 1).map((s, i) => (
                  <div key={s} className="flex items-center gap-2 text-xs text-cyan-100/95">
                    {i === stage ? (
                      <Loader2 className="w-3 h-3 animate-spin shrink-0 text-cyan-300" />
                    ) : (
                      <CheckCircle2 className="w-3 h-3 text-cyan-500/60 shrink-0" />
                    )}
                    <span>{s}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* خطا */}
        {error && (
          <div className="mt-3 flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-3 text-xs leading-5 text-rose-700">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            {error}
          </div>
        )}

        {/* نتیجه — پاسخ دیتابیس */}
        {result && (
          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="bg-emerald-500/15 text-emerald-700 border border-emerald-500/30 hover:bg-emerald-500/15 text-[10px] gap-1">
                <CheckCircle2 className="w-3 h-3" />
                پاسخ از دیتابیس
              </Badge>
              <Badge variant="outline" className="border-border text-[10px] text-muted-foreground">
                {result.query.label}: <span dir="auto" className="font-semibold text-foreground/80">{result.query.value}</span>
              </Badge>
              <span className="text-[10px] text-muted-foreground ltr-num">{(result.durationMs / 1000).toFixed(1)}s</span>
            </div>

            {result.replies.length === 0 ? (
              <div className="rounded-xl border border-border/70 bg-secondary/40 px-4 py-3.5 text-xs text-muted-foreground leading-6">
                برای این درخواست نتیجه‌ای در دیتابیس ثبت نشده است. ممکن است داده‌ای وجود نداشته باشد یا مقدار واردشده
                با فرمت مورد انتظار متفاوت باشد. شفاف می‌گوییم: هیچ نتیجه‌ای یافت نشد.
              </div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto pe-1">
                {result.replies.map((r, i) => (
                  <div
                    key={i}
                    className="rounded-xl border border-border/70 bg-white px-4 py-3 shadow-[0_1px_2px_rgba(13,31,23,0.05)]"
                  >
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <Database className="w-3.5 h-3.5 text-cyan-600 shrink-0" />
                      <span className="text-[10px] font-bold text-cyan-700">پاسخ دیتابیس</span>
                      <span className="text-[9px] text-muted-foreground ltr-num ms-auto">{fmtFa(r.date)}</span>
                    </div>
                    {r.fileText ? (
                      <div className="space-y-2">
                        {r.text && <p className="text-xs leading-6 whitespace-pre-wrap break-words" dir="auto">{r.text}</p>}
                        <FileContent fileName={r.fileName} content={r.fileText} bytes={r.fileBytes} />
                      </div>
                    ) : (
                      <p className="text-xs leading-6 whitespace-pre-wrap break-words" dir="auto">
                        {r.text || '— پیام چندرسانه‌ای بدون متن —'}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
