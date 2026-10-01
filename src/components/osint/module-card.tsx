'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Instagram,
  Twitter,
  Send,
  Github,
  Fingerprint,
  Mail,
  Globe,
  Phone,
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  ChevronDown,
  ExternalLink,
  Satellite,
  FlaskConical,
  Blend,
  Newspaper,
  Archive,
  MapPin,
  Bitcoin,
  Ghost,
  Camera,
  UserRoundSearch,
  CircleSlash,
} from 'lucide-react';
import type { OsintModuleResult } from '@/lib/osint/types';

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Instagram,
  Twitter,
  Send,
  Github,
  Fingerprint,
  Mail,
  Globe,
  Phone,
  AlertTriangle,
  Newspaper,
  Archive,
  MapPin,
  Bitcoin,
  Ghost,
  Camera,
};

const STATUS_META: Record<string, { label: string; cls: string }> = {
  success: { label: 'موفق', cls: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30' },
  partial: { label: 'جزئی', cls: 'bg-amber-500/15 text-amber-700 border-amber-500/30' },
  failed: { label: 'بدون نتیجه', cls: 'bg-rose-500/15 text-rose-700 border-rose-500/30' },
  skipped: { label: 'رد شده', cls: 'bg-zinc-500/15 text-zinc-600 border-zinc-500/30' },
};

const SOURCE_META: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; cls: string }> = {
  live: { label: 'داده واقعی', icon: Satellite, cls: 'bg-cyan-500/15 text-cyan-700 border-cyan-500/30' },
  tracker: { label: 'واقعی — ردیاب', icon: Satellite, cls: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30' },
  unavailable: { label: 'در دسترس نیست', icon: CircleSlash, cls: 'bg-zinc-500/15 text-zinc-600 border-zinc-500/30' },
  simulated: { label: 'داده جایگزین', icon: FlaskConical, cls: 'bg-violet-500/15 text-violet-700 border-violet-500/30' },
  hybrid: { label: 'ترکیبی', icon: Blend, cls: 'bg-amber-500/15 text-amber-700 border-amber-500/30' },
};

const SEVERITY_DOT: Record<string, string> = {
  info: 'bg-cyan-400',
  low: 'bg-emerald-400',
  medium: 'bg-amber-400',
  high: 'bg-rose-400',
};

function fmtNum(n: number): string {
  return n.toLocaleString('en-US');
}

/** شبکه پروفایل‌های شناسایی‌شده شرلوک - کارت‌های کلیک‌شو */
function SherlockProfiles({ found }: { found: { site: string; url: string; category: string }[] }) {
  if (!found?.length) return null;
  return (
    <div className="mb-3 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] p-3">
      <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 mb-2.5">
        <UserRoundSearch className="w-4 h-4" />
        پروفایل‌های شناسایی‌شده — برای مشاهده صفحه کلیک کنید
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {found.map((f) => (
          <a
            key={f.site}
            href={f.url}
            target="_blank"
            rel="noreferrer noopener"
            title={f.url}
            className="group flex items-center justify-between gap-1.5 rounded-lg bg-white/90 border border-border/70 px-2.5 py-2 hover:border-emerald-500/60 hover:bg-emerald-500/10 transition-all shadow-[0_1px_2px_rgba(13,31,23,0.04)]"
          >
            <span className="text-xs font-semibold truncate" dir="auto">
              {f.site}
            </span>
            <ExternalLink className="w-3.5 h-3.5 shrink-0 text-muted-foreground group-hover:text-emerald-600" />
          </a>
        ))}
      </div>
    </div>
  );
}

export function ModuleCard({ result, index }: { result: OsintModuleResult; index: number }) {
  const [open, setOpen] = useState(index < 2);
  const Icon = ICONS[result.icon] ?? Globe;
  const status = STATUS_META[result.status] ?? STATUS_META.skipped;
  const source = SOURCE_META[result.source] ?? SOURCE_META.unavailable;
  const SourceIcon = source.icon;

  const sherlockFound =
    result.module === 'username' && (result.raw as any)?.found
      ? ((result.raw as any).found as { site: string; url: string; category: string }[])
      : null;

  return (
    <Card
      className="border-border/80 bg-white soft-shadow overflow-hidden transition-all hover:border-emerald-500/40 hover:shadow-[0_10px_32px_-14px_rgba(5,150,105,0.3)]"
      style={{ animation: `consoleFade 0.4s ease-out ${index * 0.08}s both` }}
    >
      <div className="h-0.5 w-full bg-gradient-to-l from-emerald-500/70 via-cyan-500/40 to-transparent" />
      <CardContent className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <div className="w-9 h-9 rounded-lg bg-emerald-500/12 border border-emerald-500/25 flex items-center justify-center">
            <Icon className="w-4.5 h-4.5 text-emerald-600" />
          </div>
          <h3 className="font-bold text-base">{result.title}</h3>
          <Badge variant="outline" className={`text-[10px] px-1.5 ${status.cls}`}>
            {result.status === 'success' ? <CheckCircle2 className="w-3 h-3 ml-0.5" /> : result.status === 'failed' ? <AlertTriangle className="w-3 h-3 ml-0.5" /> : <CircleDashed className="w-3 h-3 ml-0.5" />}
            {status.label}
          </Badge>
          <Badge variant="outline" className={`text-[10px] px-1.5 ${source.cls}`}>
            <SourceIcon className="w-3 h-3 ml-0.5" />
            {source.label}
          </Badge>
          <span className="text-[10px] text-muted-foreground ms-auto ltr-num">{(result.durationMs / 1000).toFixed(1)}s</span>
        </div>

        <p className="text-sm text-muted-foreground leading-6 mb-3">{result.summary}</p>

        {result.metrics && result.metrics.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
            {result.metrics.slice(0, 4).map((m) => (
              <div key={m.label} className="rounded-lg bg-secondary/60 border border-border/70 px-2.5 py-2 text-center">
                <div className="text-base font-extrabold text-emerald-700 ltr-num">{fmtNum(m.value)}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">{m.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* کارت‌های پروفایل شرلوک - کلیک مستقیم به صفحه */}
        {sherlockFound && <SherlockProfiles found={sherlockFound} />}

        {result.findings.length > 0 && (
          <Collapsible open={open} onOpenChange={setOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="w-full justify-between text-xs text-muted-foreground hover:text-foreground h-8 px-2">
                <span>مشاهده {result.findings.length} یافته اطلاعاتی</span>
                <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-2 space-y-1.5 max-h-72 overflow-y-auto pl-1">
                {result.findings.map((f, i) => {
                  const inner = (
                    <>
                      <span className={`mt-1.5 h-1.5 w-1.5 rounded-full shrink-0 ${SEVERITY_DOT[f.severity ?? 'info']}`} />
                      <div className="min-w-0 flex-1">
                        <span className="text-muted-foreground">{f.label}: </span>
                        <span className="break-words" dir="auto">
                          {f.value}
                        </span>
                      </div>
                      {f.link && (
                        <span className="shrink-0 inline-flex items-center gap-1 rounded-md bg-emerald-500/12 border border-emerald-500/30 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 group-hover:bg-emerald-500/20 transition-colors">
                          <ExternalLink className="w-3 h-3" />
                          مشاهده صفحه
                        </span>
                      )}
                    </>
                  );
                  // یافته دارای لینک = کل ردیف قابل کلیک برای باز کردن صفحه
                  return f.link ? (
                    <a
                      key={i}
                      href={f.link}
                      target="_blank"
                      rel="noreferrer noopener"
                      title={f.link}
                      className="group flex items-start gap-2 rounded-md bg-secondary/50 border border-border/60 px-3 py-2 text-xs hover:border-emerald-500/50 hover:bg-emerald-500/[0.06] transition-all cursor-pointer"
                    >
                      {inner}
                    </a>
                  ) : (
                    <div
                      key={i}
                      className="flex items-start gap-2 rounded-md bg-secondary/50 border border-border/60 px-3 py-2 text-xs"
                    >
                      {inner}
                    </div>
                  );
                })}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        {result.error && (
          <div className="mt-2 flex items-start gap-2 text-[11px] text-amber-700 bg-amber-500/10 border border-amber-500/25 rounded-md px-3 py-2">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span dir="auto">{result.error}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
