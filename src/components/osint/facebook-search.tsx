'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Facebook,
  Database,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Search,
  FileText,
  Copy,
  Check,
  Download,
  Timer,
  Files,
  Hash,
  ShieldQuestion,
} from 'lucide-react';

// ============================================================
// شناسایی اکانت فیسبوک — جستجوی هر متن یا عدد در دیتابیس‌های TXT
// فایل‌ها را مدیر سامانه از پنل مدیریت بارگذاری می‌کند و روی
// سرور (ولیوم Railway) ذخیره می‌شوند. در صورت یافتن، کل خط
// حاوی مورد به کاربر نمایش داده می‌شود.
// ============================================================

interface LineMatch {
  offset: number;
  line: string;
  truncatedLine: boolean;
}

interface FileScan {
  name: string;
  sizeBytes: number;
  matchCount: number;
  truncated: boolean;
  matches: LineMatch[];
  elapsedMs: number;
  error?: string;
}

interface SearchDbResp {
  query: string;
  variants: string[];
  totalFiles: number;
  totalMatches: number;
  elapsedMs: number;
  files: FileScan[];
}

const STAGES = [
  'اتصال به فایل‌های دیتابیس…',
  'جستجو در میان داده‌ها…',
  'استخراج خطوط منطبق…',
];

function fmtBytes(n: number): string {
  if (!n || n <= 0) return '۰';
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1073741824) return `${(n / 1048576).toFixed(1)} MB`;
  return `${(n / 1073741824).toFixed(2)} GB`;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** هایلایت موارد منطبق داخل خط */
function Highlighted({ line, terms }: { line: string; terms: string[] }) {
  const parts = buildParts(line, terms);
  return (
    <>
      {parts.map((p, i) =>
        p.hit ? (
          <mark key={i} className="rounded bg-blue-500/20 px-0.5 font-bold text-blue-800">
            {p.text}
          </mark>
        ) : (
          <span key={i}>{p.text}</span>
        )
      )}
    </>
  );
}

function buildParts(line: string, terms: string[]): { text: string; hit: boolean }[] {
  const valid = terms.filter((t) => t.length >= 1);
  if (!valid.length) return [{ text: line, hit: false }];
  try {
    const re = new RegExp(`(${valid.map(escapeRe).join('|')})`, 'gi');
    return line.split(re).map((seg) => ({
      text: seg,
      hit: valid.some((t) => seg.toLowerCase() === t.toLowerCase()),
    }));
  } catch {
    return [{ text: line, hit: false }];
  }
}

export function FacebookSearch() {
  const [value, setValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SearchDbResp | null>(null);
  const [files, setFiles] = useState<number | null>(null); // null = هنوز مشخص نشده
  const [copiedLine, setCopiedLine] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // وضعیت دیتابیس (فایل بارگذاری شده یا نه)
  useEffect(() => {
    fetch('/api/osint/facebook-search')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setFiles(j ? Number(j.files ?? 0) : null))
      .catch(() => setFiles(null));
  }, []);

  // انیمیشن مراحل + زمان‌سنج
  useEffect(() => {
    if (loading) {
      setStage(0);
      setElapsed(0);
      timerRef.current = setInterval(() => setStage((s) => Math.min(s + 1, STAGES.length - 1)), 4000);
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
      const res = await fetch('/api/osint/facebook-search', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: v }),
      });
      const j = await res.json();
      if (res.status === 401) throw new Error('نشست منقضی شده — لطفاً دوباره وارد شو');
      if (!res.ok || j.error) throw new Error(j.error ?? 'جستجو ناموفق بود');
      setResult(j);
      setFiles(j.totalFiles ?? files);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'خطای نامشخص در جستجو');
    } finally {
      setLoading(false);
    }
  };

  const copyLine = async (key: number, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedLine(key);
      setTimeout(() => setCopiedLine(null), 1500);
    } catch {
      /* دسترسی کلیپ‌بورد نبود */
    }
  };

  const downloadResults = () => {
    if (!result) return;
    const lines: string[] = [`نتیجه جستجوی «${result.query}» در دیتابیس کاوشگر`];
    for (const f of result.files) {
      lines.push('', `───── ${f.name} (${fmtBytes(f.sizeBytes)}) — ${f.matchCount} مورد ─────`);
      for (const m of f.matches) lines.push(m.line);
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `facebook-search-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  // گونه‌های جستجو برای هایلایت
  const highlightTerms = result ? [result.query, ...result.variants.slice(1)] : [];

  return (
    <div className="relative rounded-2xl border border-blue-500/25 bg-white/85 backdrop-blur soft-shadow overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-l from-transparent via-blue-400/80 to-transparent" />
      <div className="pointer-events-none absolute -top-24 -start-24 w-64 h-64 rounded-full bg-blue-400/10 blur-3xl" />
      <div className="p-4 sm:p-6 relative">
        {/* سربرگ */}
        <div className="flex items-start gap-3 mb-5">
          <div className="relative w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 border border-blue-400/40 flex items-center justify-center shrink-0 shadow-[0_8px_20px_-6px_rgba(37,99,235,0.55)]">
            <Facebook className="w-6 h-6 text-white" />
            <span className="absolute -bottom-1 -end-1 w-4 h-4 rounded-full bg-white border border-blue-500/30 flex items-center justify-center">
              <Database className="w-2.5 h-2.5 text-blue-600" />
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-black text-base sm:text-lg leading-tight">شناسایی اکانت فیسبوک</h2>
              {files !== null && files > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  </span>
                  دیتابیس فعال — <span className="ltr-num">{files}</span> فایل
                </span>
              )}
            </div>
            <p className="text-[11px] sm:text-xs text-muted-foreground leading-5 mt-1">
              جستجوی هر متن، عدد، شماره تلفن، ایمیل یا نام کاربری در دیتابیس‌های بارگذاری‌شده روی سرور — نمایش کل سطرِ حاوی مورد
            </p>
          </div>
        </div>

        {/* ورودی جستجو — هر متن یا عددی */}
        <div className="flex flex-col sm:flex-row gap-2.5">
          <div className="relative flex-1">
            <Search className="absolute start-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-600/60 pointer-events-none" />
            <Input
              dir="auto"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && search()}
              disabled={loading}
              placeholder="هر متن یا عدد — مثلاً شماره تلفن، ایمیل، نام کاربری یا نام…"
              className="h-12 ps-10 text-base bg-white border-input focus-visible:ring-blue-500/30 focus-visible:border-blue-500/60"
              aria-label="عبارت جستجو در دیتابیس فیسبوک"
            />
          </div>
          <Button
            onClick={search}
            disabled={loading || !value.trim()}
            size="lg"
            className="h-12 w-full sm:w-auto px-6 justify-center font-bold bg-gradient-to-l from-blue-600 to-indigo-500 hover:from-blue-500 hover:to-indigo-400 text-white shadow-[0_8px_24px_-8px_rgba(37,99,235,0.65)]"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" /> در حال جستجو…
              </>
            ) : (
              <>
                <Search className="w-5 h-5" /> جستجو در دیتابیس
              </>
            )}
          </Button>
        </div>

        {/* اطلاع تنظیم نبودن توسط مدیر */}
        {files === 0 && !loading && (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-3 text-[11px] leading-5 text-amber-800">
            <ShieldQuestion className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <p>
              هنوز هیچ فایل دیتابیسی بارگذاری نشده است. مدیر سامانه باید از <b>پنل مدیریت ← دیتابیس جستجو</b> فایل‌های TXT را
              بارگذاری کند تا این جستجو برای همه کاربران فعال شود.
            </p>
          </div>
        )}

        {/* کنسول مراحل جستجو */}
        {loading && (
          <div className="mt-4 rounded-xl border border-blue-500/25 bg-gradient-to-b from-[#041830] to-[#030f1f] overflow-hidden shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
            <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-blue-500/15 bg-blue-400/[0.06]">
              <div className="flex items-center gap-2">
                <Database className="w-3.5 h-3.5 text-blue-300 shrink-0" />
                <span className="text-[11px] font-bold text-blue-100">در حال جستجو در دیتابیس‌ها…</span>
              </div>
              <span className="inline-flex items-center gap-1 text-[10px] text-blue-300/80">
                <Timer className="w-3 h-3" />
                <span className="ltr-num">{elapsed}</span> ثانیه
              </span>
            </div>
            <div className="h-1 bg-blue-950/70">
              <div
                className="h-full bg-gradient-to-l from-blue-400 to-indigo-400 transition-all duration-700 ease-out"
                style={{ width: `${((stage + 1) / STAGES.length) * 100}%` }}
              />
            </div>
            <div className="px-4 py-3 relative">
              <div className="absolute inset-x-0 h-8 bg-gradient-to-b from-blue-400/10 to-transparent scanline" />
              <div className="space-y-2 relative">
                {STAGES.slice(0, stage + 1).map((s, i) => (
                  <div key={s} className="flex items-center gap-2 text-xs text-blue-100/95">
                    {i === stage ? (
                      <Loader2 className="w-3 h-3 animate-spin shrink-0 text-blue-300" />
                    ) : (
                      <CheckCircle2 className="w-3 h-3 text-blue-500/60 shrink-0" />
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

        {/* نتایج */}
        {result && (
          <div className="mt-4 space-y-3">
            {/* نوار خلاصه */}
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="bg-blue-500/15 text-blue-700 border border-blue-500/30 hover:bg-blue-500/15 text-[10px] gap-1">
                <Files className="w-3 h-3" />
                <span className="ltr-num">{result.totalFiles}</span> فایل بررسی شد
              </Badge>
              <Badge
                className={`text-[10px] gap-1 border ${
                  result.totalMatches > 0
                    ? 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30 hover:bg-emerald-500/15'
                    : 'bg-secondary/60 text-muted-foreground border-border'
                }`}
              >
                <Hash className="w-3 h-3" />
                <span className="ltr-num">{result.totalMatches}</span> سطر منطبق
              </Badge>
              <Badge variant="outline" className="border-border text-[10px] text-muted-foreground gap-1">
                <Timer className="w-3 h-3" />
                <span className="ltr-num">{(result.elapsedMs / 1000).toFixed(1)}s</span>
              </Badge>
              {result.totalMatches > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={downloadResults}
                  className="ms-auto h-8 px-3 text-[11px] border-blue-500/30 text-blue-700 hover:bg-blue-500/10"
                >
                  <Download className="w-3.5 h-3.5" /> دانلود نتایج
                </Button>
              )}
            </div>

            {result.totalMatches === 0 ? (
              <div className="rounded-xl border border-border/70 bg-secondary/40 px-4 py-3.5 text-xs text-muted-foreground leading-6">
                هیچ سطری حاوی این عبارت در دیتابیس‌ها یافت نشد. شفاف می‌گوییم: نتیجه‌ای وجود ندارد.
              </div>
            ) : (
              <div className="space-y-3 max-h-[28rem] overflow-y-auto pe-1">
                {result.files
                  .filter((f) => f.matchCount > 0)
                  .map((f) => (
                    <div key={f.name} className="rounded-xl border border-border/70 bg-white overflow-hidden">
                      {/* سربرگ فایل */}
                      <div className="flex flex-wrap items-center gap-2 px-3.5 py-2 bg-blue-500/[0.06] border-b border-border/60">
                        <FileText className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                        <span className="text-[11px] font-bold text-foreground/80" dir="ltr">
                          {f.name}
                        </span>
                        <span className="text-[9px] text-muted-foreground ltr-num">{fmtBytes(f.sizeBytes)}</span>
                        <Badge variant="outline" className="border-blue-500/25 text-blue-700 text-[9px] px-1.5 py-0">
                          <span className="ltr-num">{f.matchCount}</span> سطر
                        </Badge>
                        {f.truncated && (
                          <span className="text-[9px] text-amber-600">
                            (نمایش تا <span className="ltr-num">{f.matches.length}</span> سطر اول)
                          </span>
                        )}
                        <span className="text-[9px] text-muted-foreground ltr-num ms-auto">
                          {(f.elapsedMs / 1000).toFixed(1)}s
                        </span>
                      </div>
                      {/* خطوط منطبق */}
                      <div className="divide-y divide-border/40">
                        {f.matches.map((m, i) => (
                          <div key={m.offset} className="group flex items-start gap-2 px-3.5 py-2">
                            <span className="text-[9px] text-muted-foreground/70 ltr-num pt-1 w-12 shrink-0 text-end" dir="ltr">
                              {i + 1}
                            </span>
                            <p className="text-xs leading-6 break-all whitespace-pre-wrap min-w-0 flex-1" dir="auto">
                              <Highlighted line={m.line} terms={highlightTerms} />
                              {m.truncatedLine && <span className="text-amber-600"> …</span>}
                            </p>
                            <button
                              type="button"
                              onClick={() => copyLine(m.offset, m.line)}
                              className="opacity-0 group-hover:opacity-100 transition-opacity rounded-lg border border-border/60 bg-secondary/50 p-1.5 text-muted-foreground hover:text-blue-700 hover:border-blue-500/40 shrink-0"
                              aria-label="کپی سطر"
                              title="کپی سطر"
                            >
                              {copiedLine === m.offset ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                            </button>
                          </div>
                        ))}
                      </div>
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
