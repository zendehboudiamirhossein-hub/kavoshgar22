'use client';

import { useRef, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { SearchCode, Wrench, ExternalLink, Loader2, Terminal, Camera, UploadCloud, MapPin, AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { OsintModuleResult } from '@/lib/osint/types';

const SEVERITY_DOT: Record<string, string> = {
  info: 'bg-cyan-400',
  low: 'bg-emerald-400',
  medium: 'bg-amber-400',
  high: 'bg-rose-400',
};

interface Dork {
  name: string;
  query: string;
  url: string;
}
interface DorkGroup {
  title: string;
  dorks: Dork[];
}
interface ExternalTool {
  name: string;
  url: string;
  desc: string;
  category: string;
}

const TOOLS: ExternalTool[] = [
  { name: 'OSINT Framework', url: 'https://osintframework.com/', desc: 'درخت جامع ابزارهای اوسینت بر اساس نوع هدف', category: 'مرجع' },
  { name: 'Shodan', url: 'https://www.shodan.io/', desc: 'موتور جستجوی دستگاه‌ها و سرویس‌های متصل به اینترنت', category: 'زیرساخت' },
  { name: 'Censys', url: 'https://search.censys.io/', desc: 'جستجوی هاست‌ها، گواهی‌ها و سرویس‌ها', category: 'زیرساخت' },
  { name: 'Have I Been Pwned', url: 'https://haveibeenpwned.com/', desc: 'بررسی واقعی نشت داده ایمیل', category: 'ایمیل' },
  { name: 'DeHashed', url: 'https://www.dehashed.com/', desc: 'جستجو در میلیاردها رکورد نشت‌شده', category: 'ایمیل' },
  { name: 'Hudson Rock', url: 'https://cavalier.hudsonrock.com/', desc: 'بررسی آلودگی اطلاعاتی به استیلرها', category: 'ایمیل' },
  { name: 'Sherlock', url: 'https://github.com/sherlock-project/sherlock', desc: 'ردیابی یوزرنیم در ۴۰۰+ پلتفرم', category: 'نام کاربری' },
  { name: 'Maigret', url: 'https://github.com/soxoj/maigret', desc: 'ردیابی پیشرفته پروفایل با گزارش کامل', category: 'نام کاربری' },
  { name: 'Maltego', url: 'https://www.maltego.com/', desc: 'تحلیل گرافیکی ارتباطات و موجودیت‌ها', category: 'تحلیل' },
  { name: 'SpiderFoot', url: 'https://github.com/smicallef/spiderfoot', desc: 'اتوماسیون اوسینت با ۲۰۰+ ماژول', category: 'تحلیل' },
  { name: 'theHarvester', url: 'https://github.com/laramies/theHarvester', desc: 'جمع‌آوری ایمیل، زیردامنه و هاست', category: 'ایمیل' },
  { name: 'ExifTool', url: 'https://exiftool.org/', desc: 'استخراج متادیتای تصاویر و مدارک', category: 'متادیتا' },
  { name: 'PimEyes', url: 'https://pimeyes.com/', desc: 'جستجوی معکوس چهره در وب', category: 'تصویر' },
  { name: 'SunCalc', url: 'https://www.suncalc.org/', desc: 'موقعیت خورشید از سایه عکس‌ها (GEOINT)', category: 'جغرافیا' },
  { name: 'Wayback Machine', url: 'https://web.archive.org/', desc: 'آرشیو تاریخی صفحات وب', category: 'آرشیو' },
  { name: 'crt.sh', url: 'https://crt.sh/', desc: 'کشف زیردامنه از گواهی‌های SSL', category: 'زیرساخت' },
];

export function ToolsTab() {
  const [target, setTarget] = useState('');
  const [groups, setGroups] = useState<DorkGroup[] | null>(null);
  const [loading, setLoading] = useState(false);

  const generate = async () => {
    const t = target.trim();
    if (!t || loading) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/osint/dorks?target=${encodeURIComponent(t)}`);
      const j = await res.json();
      setGroups(j.groups ?? null);
    } catch {
      setGroups(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* تحلیلگر EXIF تصویر */}
      <ImageAnalyzer />
      {/* مولد داک */}
      <Card className="border-border/80 bg-white soft-shadow">
        <CardContent className="p-5">
          <h2 className="flex items-center gap-2 font-bold mb-1">
            <Terminal className="w-5 h-5 text-emerald-600" />
            مولد Google Dork حرفه‌ای
          </h2>
          <p className="text-xs text-muted-foreground mb-4">
            بر اساس نوع هدف، عملگرهای پیشرفته جستجوی گوگل را به‌صورت آماده تولید می‌کند — برای کشف اطلاعات نمایان‌شده و شاخص‌گذاری‌شده.
          </p>
          <div className="flex gap-2">
            <Input
              dir="auto"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && generate()}
              placeholder="هدف: یوزرنیم، ایمیل، دامنه، IP یا شماره…"
              className="h-11 text-base bg-white"
            />
            <Button
              onClick={generate}
              disabled={loading || !target.trim()}
              className="h-11 px-5 bg-gradient-to-l from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-bold"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <SearchCode className="w-4 h-4" />}
              تولید
            </Button>
          </div>

          {groups && (
            <div className="mt-5 grid md:grid-cols-2 gap-4">
              {groups.map((g) => (
                <div key={g.title} className="rounded-xl border border-border/70 bg-secondary/40 p-4">
                  <h3 className="text-sm font-bold text-emerald-700 mb-2.5">{g.title}</h3>
                  <div className="space-y-1.5">
                    {g.dorks.map((d) => (
                      <a
                        key={d.name}
                        href={d.url}
                        target="_blank"
                        rel="noreferrer"
                        className="block rounded-lg bg-white/90 border border-border/60 px-3 py-2 hover:border-emerald-500/45 transition-colors group shadow-[0_1px_2px_rgba(13,31,23,0.04)]"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold">{d.name}</span>
                          <ExternalLink className="w-3.5 h-3.5 text-muted-foreground group-hover:text-emerald-600 shrink-0" />
                        </div>
                        {d.query !== '—' && (
                          <code dir="ltr" className="block mt-1 text-[10.5px] text-cyan-700/90 font-mono truncate">
                            {d.query}
                          </code>
                        )}
                      </a>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* دایرکتوری ابزارهای اوسینت */}
      <Card className="border-border/80 bg-white soft-shadow">
        <CardContent className="p-5">
          <h2 className="flex items-center gap-2 font-bold mb-1">
            <Wrench className="w-5 h-5 text-cyan-600" />
            جعبه‌ابزار جهانی اوسینت
          </h2>
          <p className="text-xs text-muted-foreground mb-4">
            منتخب ابزارهای استاندارد صنعت برای تکمیل تحقیق — این سامانه از الگوریتم‌های همین ابزارها الهام گرفته و آن‌ها را یکپارچه اجرا می‌کند.
          </p>
          <ScrollArea className="h-[420px] pr-2">
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {TOOLS.map((t) => (
                <a
                  key={t.name}
                  href={t.url}
                  target="_blank"
                  rel="noreferrer"
                  className="group rounded-xl border border-border/70 bg-secondary/40 p-4 hover:border-cyan-500/45 hover:bg-cyan-500/[0.05] transition-all"
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-bold text-sm text-foreground/90">{t.name}</span>
                    <ExternalLink className="w-3.5 h-3.5 text-muted-foreground group-hover:text-cyan-600" />
                  </div>
                  <p className="text-[11px] leading-5 text-muted-foreground mb-2">{t.desc}</p>
                  <Badge variant="outline" className="text-[9px] border-cyan-500/30 text-cyan-700">
                    {t.category}
                  </Badge>
                </a>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// تحلیلگر متادیتای تصویر EXIF (آپلود واقعی فایل)
// ============================================================
function ImageAnalyzer() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<OsintModuleResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const analyze = async (file: File) => {
    setLoading(true);
    setError(null);
    setResult(null);
    setPreview(URL.createObjectURL(file));
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/osint/image', { method: 'POST', body: fd });
      const j = await res.json();
      if (j.error) throw new Error(j.error);
      setResult(j.result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'خطا در تحلیل تصویر');
    } finally {
      setLoading(false);
    }
  };

  const gps = (result?.raw as any)?.gps as { latitude: number; longitude: number } | null | undefined;

  return (
    <Card className="border-border/80 bg-white soft-shadow">
      <CardContent className="p-5">
        <h2 className="flex items-center gap-2 font-bold mb-1">
          <Camera className="w-5 h-5 text-violet-600" />
          تحلیلگر متادیتای تصویر (EXIF + GEOINT)
        </h2>
        <p className="text-xs text-muted-foreground mb-4">
          تصویر را آپلود کن — دستگاه عکاسی، زمان ثبت، نرم‌افزار پردازش و در صورت وجود، مختصات دقیق GPS استخراج می‌شود.
        </p>

        <div
          role="button"
          tabIndex={0}
          aria-label="آپلود تصویر برای تحلیل متادیتا"
          onClick={() => !loading && fileRef.current?.click()}
          onKeyDown={(e) => e.key === 'Enter' && fileRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files?.[0];
            if (f && f.type.startsWith('image/')) analyze(f);
          }}
          className={`rounded-xl border-2 border-dashed p-6 text-center transition-all cursor-pointer ${
            loading ? 'border-zinc-400/60 opacity-60' : 'border-border hover:border-violet-500/55 hover:bg-violet-500/[0.05]'
          }`}
        >
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) analyze(f);
              e.target.value = '';
            }}
          />
          <UploadCloud className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm font-semibold">{loading ? 'در حال استخراج متادیتا…' : 'فایل تصویر را اینجا رها کن یا کلیک کن'}</p>
          <p className="text-[10px] text-muted-foreground mt-1">JPG، PNG، WEBP، TIFF، HEIC — حداکثر ۱۵ مگابایت</p>
        </div>

        {loading && <SkeletonLine />}

        {error && (
          <div className="mt-3 flex items-center gap-2 text-xs text-rose-700 bg-rose-500/10 border border-rose-500/25 rounded-lg px-3 py-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {result && (
          <div className="mt-4 grid md:grid-cols-[220px_1fr] gap-4">
            {preview && (
              <div className="rounded-xl overflow-hidden border border-border/70 bg-secondary/40 aspect-square">
                <img src={preview} alt="تصویر آپلودی" className="w-full h-full object-cover" />
              </div>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <Badge className="bg-violet-500/15 text-violet-700 border border-violet-500/30 hover:bg-violet-500/15 text-[10px]">
                  <CheckCircle2 className="w-3 h-3 ml-0.5" />
                  تحلیل انجام شد
                </Badge>
                <span className="text-[10px] text-muted-foreground ltr-num">{(result.durationMs / 1000).toFixed(1)}s</span>
              </div>
              <p className="text-xs leading-6 text-muted-foreground mb-3" dir="auto">{result.summary}</p>
              <div className="space-y-1.5 max-h-64 overflow-y-auto pl-1">
                {result.findings.map((f, i) => {
                  const row = (
                    <>
                      <span className={`mt-1.5 h-1.5 w-1.5 rounded-full shrink-0 ${SEVERITY_DOT[f.severity ?? 'info']}`} />
                      <div className="min-w-0 flex-1">
                        <span className="text-muted-foreground">{f.label}: </span>
                        <span className="break-words" dir="auto">{f.value}</span>
                      </div>
                      {f.link && (
                        <span className="shrink-0 inline-flex items-center gap-1 rounded-md bg-emerald-500/12 border border-emerald-500/30 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
                          <ExternalLink className="w-3 h-3" />
                          مشاهده
                        </span>
                      )}
                    </>
                  );
                  return f.link ? (
                    <a
                      key={i}
                      href={f.link}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="group flex items-start gap-2 rounded-md bg-secondary/50 border border-border/60 px-3 py-2 text-xs hover:border-emerald-500/50 hover:bg-emerald-500/[0.06] transition-all cursor-pointer"
                    >
                      {row}
                    </a>
                  ) : (
                    <div key={i} className="flex items-start gap-2 rounded-md bg-secondary/50 border border-border/60 px-3 py-2 text-xs">
                      {row}
                    </div>
                  );
                })}
              </div>
              {gps && (
                <div className="mt-3 flex items-center gap-2 rounded-lg bg-rose-500/10 border border-rose-500/25 px-3 py-2 text-xs text-rose-700">
                  <MapPin className="w-4 h-4 shrink-0 text-rose-600" />
                  هشدار GEOINT: این تصویر مکان فیزیکی ثبت‌کننده را افشا می‌کند!
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SkeletonLine() {
  return (
    <div className="mt-4 space-y-2">
      {[80, 100, 60].map((w, i) => (
        <div key={i} className="h-3.5 rounded bg-secondary/60 animate-pulse" style={{ width: `${w}%` }} />
      ))}
    </div>
  );
}
