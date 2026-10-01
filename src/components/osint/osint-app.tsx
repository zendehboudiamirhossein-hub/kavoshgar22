'use client';

import { useMemo, useState } from 'react';
import { ScanPanel } from './scan-panel';
import { IdentitySearch } from './identity-search';
import { FacebookSearch } from './facebook-search';
import { ModuleCard } from './module-card';
import { AiReportCard } from './ai-report-card';
import { ChartsPanel } from './charts-panel';
import { CasesTab } from './cases-tab';
import { ToolsTab } from './tools-tab';
import { ChatTab } from './chat-tab';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Radar,
  ScanSearch,
  FolderOpen,
  Wrench,
  MessageSquareText,
  Satellite,
  FlaskConical,
  ListChecks,
  Timer,
  BrainCircuit,
  Loader2,
  AlertTriangle,
  ShieldCheck,
  UserRound,
  LogOut,
} from 'lucide-react';
import { TARGET_TYPE_LABELS } from '@/lib/osint/detect';
import type { ScanResponse, TargetType } from '@/lib/osint/types';
import type { AiReport } from '@/lib/osint/ai';
import type { SessionUserInfo } from '@/lib/auth-types';

type Tab = 'scan' | 'cases' | 'tools' | 'chat';

const TABS: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'scan', label: 'اسکن جدید', icon: ScanSearch },
  { id: 'cases', label: 'پرونده‌ها', icon: FolderOpen },
  { id: 'tools', label: 'ابزارها', icon: Wrench },
  { id: 'chat', label: 'تحلیلگر', icon: MessageSquareText },
];

interface ScanState extends ScanResponse {
  caseId?: string | null;
}

interface OsintAppProps {
  user: SessionUserInfo;
  onOpenAdmin?: () => void;
  onLogout?: () => void;
}

export function OsintApp({ user, onOpenAdmin, onLogout }: OsintAppProps) {
  // تب اولیه از پارامتر URL (میان‌برهای PWA مثل /?tab=cases)
  const [tab, setTab] = useState<Tab>(() => {
    if (typeof window === 'undefined') return 'scan';
    const t = new URLSearchParams(window.location.search).get('tab');
    return t === 'cases' || t === 'tools' || t === 'chat' ? (t as Tab) : 'scan';
  });
  const [scanning, setScanning] = useState(false);
  const [scan, setScan] = useState<ScanState | null>(null);
  const [aiReport, setAiReport] = useState<AiReport | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [casesRefresh, setCasesRefresh] = useState(0);

  const stats = useMemo(() => {
    if (!scan) return null;
    const findings = scan.results.reduce((a, r) => a + (r.findings?.length ?? 0), 0);
    const live = scan.results.filter((r) => r.source === 'live').length;
    const sim = scan.results.filter((r) => r.source !== 'live').length;
    const totalMs = scan.results.reduce((a, r) => a + (r.durationMs ?? 0), 0);
    return { modules: scan.results.length, findings, live, sim, totalMs };
  }, [scan]);

  const startScan = async (target: string, hikerKey?: string) => {
    setScanning(true);
    setScan(null);
    setAiReport(null);
    setError(null);
    setTab('scan');
    try {
      const res = await fetch('/api/osint/scan', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ target, hikerKey }),
      });
      const j = await res.json();
      if (res.status === 401) {
        onLogout?.();
        throw new Error('نشست منقضی شده — لطفاً دوباره وارد شو');
      }
      if (!res.ok || j.error) throw new Error(j.error ?? 'اسکن ناموفق بود');
      setScan(j);
      setCasesRefresh((k) => k + 1);

      // گزارش تحلیل هوش مصنوعی
      setReportLoading(true);
      try {
        const r2 = await fetch('/api/osint/ai-report', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            target: j.target,
            targetType: j.targetType,
            results: j.results,
            caseId: j.caseId,
          }),
        });
        const j2 = await r2.json();
        if (j2.report) setAiReport(j2.report);
      } catch {
        /* گزارش اختیاری است */
      }
      setReportLoading(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'خطای نامشخص در اسکن');
    } finally {
      setScanning(false);
      setReportLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* ---------- هدر ---------- */}
      <header className="sticky top-0 z-40 border-b border-border/70 bg-white/75 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-3 sm:px-4 h-14 sm:h-16 flex items-center gap-2 sm:gap-3">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 border border-emerald-500/30 flex items-center justify-center radar-pulse shrink-0 shadow-[0_4px_14px_-4px_rgba(16,185,129,0.5)]">
            <Radar className="w-4.5 h-4.5 sm:w-5 sm:h-5 text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="font-black text-sm sm:text-lg leading-tight truncate">
              کاوشگر <span className="text-emerald-600">| سامانه هوشمند اوسینت</span>
            </h1>
            <p className="text-[10px] text-muted-foreground leading-tight hidden sm:block">
              جمع‌آوری اطلاعات از منابع باز + تحلیل هوش مصنوعی
            </p>
          </div>

          {/* کاربر و پنل ادمین */}
          <div className="ms-auto flex items-center gap-1 sm:gap-1.5 shrink-0">
            {user.role === 'admin' && onOpenAdmin && (
              <Button
                variant="outline"
                size="sm"
                onClick={onOpenAdmin}
                className="h-9 px-2 sm:px-3 border-amber-500/40 text-amber-700 hover:bg-amber-500/10 hover:text-amber-800"
                aria-label="پنل مدیریت"
                title="پنل مدیریت"
              >
                <ShieldCheck className="w-4 h-4" />
                <span className="hidden lg:inline text-xs">پنل مدیریت</span>
              </Button>
            )}
            <div
              className="hidden sm:flex items-center gap-1.5 h-9 px-2.5 rounded-xl bg-secondary/70 border border-border/70"
              title={`کاربر: ${user.username}`}
            >
              <UserRound className="w-4 h-4 text-emerald-600" />
              <span dir="ltr" className="text-xs font-bold max-w-[120px] truncate">{user.username}</span>
              {user.role === 'admin' && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-700 border border-amber-500/30">مدیر</span>}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={onLogout}
              className="h-9 px-2.5 border-border text-muted-foreground hover:text-rose-600 hover:bg-rose-500/10 hover:border-rose-500/40"
              aria-label="خروج از حساب"
              title="خروج از حساب"
            >
              <LogOut className="w-4 h-4" />
            </Button>
          </div>

          {/* ناوبری */}
          <nav className="flex items-center gap-0.5 sm:gap-1 bg-secondary/70 border border-border/70 rounded-xl p-1 shrink-0" aria-label="ناوبری اصلی">
            {TABS.map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`flex items-center gap-1.5 px-2 sm:px-3.5 h-9 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
                    tab === t.id
                      ? 'bg-emerald-500/15 text-emerald-700 shadow-[inset_0_0_0_1px_rgba(5,150,105,0.28)]'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                  aria-label={t.label}
                  aria-current={tab === t.id ? 'page' : undefined}
                >
                  <Icon className="w-4 h-4" />
                  <span className="hidden sm:inline">{t.label}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      {/* ---------- محتوا ---------- */}
      <main className="flex-1 w-full max-w-6xl mx-auto px-3 sm:px-4 py-4 sm:py-6">
        {tab === 'scan' && (
          <div className="space-y-5">
            <ScanPanel scanning={scanning} onStart={startScan} />

            {/* شناسایی هویت از نام، شماره و کدملی ایرانیان (ربات تلگرام) */}
            <IdentitySearch />

            {/* شناسایی اکانت فیسبوک — جستجو در دیتابیس‌های TXT بارگذاری‌شده */}
            <FacebookSearch />

            {error && (
              <Card className="border-rose-500/30 bg-rose-500/10">
                <CardContent className="p-4 flex items-center gap-2.5 text-sm text-rose-700">
                  <AlertTriangle className="w-5 h-5 shrink-0" />
                  {error}
                </CardContent>
              </Card>
            )}

            {/* نوار آمار اسکن */}
            {scan && stats && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {[
                  { icon: ListChecks, label: 'ماژول اجراشده', value: stats.modules.toString(), cls: 'text-emerald-600' },
                  { icon: ScanSearch, label: 'یافته اطلاعاتی', value: stats.findings.toString(), cls: 'text-cyan-600' },
                  {
                    icon: Satellite,
                    label: 'داده واقعی / جایگزین',
                    value: `${stats.live}/${stats.sim}`,
                    cls: 'text-amber-600',
                  },
                  { icon: Timer, label: 'زمان کل (ثانیه)', value: (stats.totalMs / 1000).toFixed(1), cls: 'text-violet-600' },
                ].map((s) => {
                  const Icon = s.icon;
                  return (
                    <Card key={s.label} className="border-border/80 bg-white/85 soft-shadow">
                      <CardContent className="p-3 sm:p-3.5 flex items-center gap-2.5 sm:gap-3">
                        <div className="w-9 h-9 rounded-lg bg-secondary/80 border border-border/70 flex items-center justify-center shrink-0">
                          <Icon className={`w-4.5 h-4.5 ${s.cls}`} />
                        </div>
                        <div className="min-w-0">
                          <div className={`font-black text-base sm:text-lg leading-tight ltr-num ${s.cls}`}>{s.value}</div>
                          <div className="text-[10px] text-muted-foreground truncate">{s.label}</div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}

            {/* شناسنامه هدف */}
            {scan && (
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="max-w-full bg-emerald-500/15 text-emerald-700 border border-emerald-500/30 hover:bg-emerald-500/15">
                  <Radar className="w-3 h-3 ml-1 shrink-0" />
                  <span className="truncate">هدف: <span dir="auto" className="font-bold">{scan.target}</span></span>
                </Badge>
                <Badge variant="outline" className="border-cyan-500/30 text-cyan-700 text-xs">
                  نوع: {TARGET_TYPE_LABELS[scan.targetType as TargetType] ?? scan.targetType}
                </Badge>
                <span className="text-[11px] text-muted-foreground">
                  پرونده با شناسه محرمانه ذخیره شد — در تب «پرونده‌ها» قابل بازبینی است
                </span>
              </div>
            )}

            {/* گزارش AI */}
            {reportLoading && (
              <Card className="border-emerald-500/25 bg-gradient-to-b from-emerald-500/[0.07] to-card glow-border">
                <CardContent className="p-6">
                  <div className="flex items-center gap-2.5 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center radar-pulse">
                      <BrainCircuit className="w-5 h-5 text-emerald-600" />
                    </div>
                    <div className="flex items-center gap-2 font-bold">
                      <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
                      تحلیلگر هوش مصنوعی در حال کشف الگوها و تدوین گزارش است…
                    </div>
                  </div>
                  <div className="grid lg:grid-cols-[200px_1fr] gap-5">
                    <Skeleton className="h-36 rounded-xl bg-secondary/60" />
                    <div className="space-y-2.5">
                      <Skeleton className="h-4 w-3/4 bg-secondary/60" />
                      <Skeleton className="h-4 w-full bg-secondary/60" />
                      <Skeleton className="h-4 w-5/6 bg-secondary/60" />
                      <Skeleton className="h-4 w-2/3 bg-secondary/60" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
            {aiReport && <AiReportCard report={aiReport} />}

            {/* نمودارها */}
            {scan && <ChartsPanel results={scan.results} riskScore={aiReport?.riskScore ?? null} />}

            {/* کارت ماژول‌ها */}
            {scan && (
              <div className="grid lg:grid-cols-2 gap-4 items-start">
                {scan.results.map((r, i) => (
                  <ModuleCard key={r.module} result={r} index={i} />
                ))}
              </div>
            )}

            {/* حالت خالی */}
            {!scan && !scanning && !error && (
              <Card className="border-dashed border-border bg-white/50">
                <CardContent className="py-12 sm:py-16 text-center">
                  <div className="relative w-20 h-20 mx-auto mb-5">
                    <span className="absolute inset-0 rounded-full border border-emerald-500/25" />
                    <span className="absolute inset-3 rounded-full border border-emerald-500/35" />
                    <span className="absolute inset-6 rounded-full border border-emerald-500/45" />
                    <span className="absolute inset-0 rounded-full radar-pulse" />
                    <Radar className="absolute inset-0 m-auto w-8 h-8 text-emerald-600" />
                  </div>
                  <h2 className="font-bold text-lg mb-1.5">آماده جمع‌آوری اطلاعات</h2>
                  <p className="text-sm text-muted-foreground max-w-md mx-auto leading-7">
                    یک هدف وارد کن — یوزرنیم اینستاگرام یا توییتر، ایمیل، شماره تلفن، دامنه، IP، مکان جغرافیایی یا آدرس بیت‌کوین. کاوشگر به‌صورت خودکار نوع
                    هدف را تشخیص می‌دهد، ماژول‌های مناسب را همزمان اجرا می‌کند و گزارش تحلیلی هوشمند تولید می‌کند.
                  </p>
                  <div className="flex flex-wrap justify-center gap-2 mt-5 text-[11px] text-muted-foreground">
                    {['اینستاگرام', 'توییتر X', 'تلگرام', 'گیت‌هاب', 'ردیابی ۳۵ پلتفرم', 'ایمیل و نشت داده', 'دامنه و WHOIS', 'مکان‌یابی IP', 'تلفن و اپراتور', 'رصد اخبار', 'آرشیو وب', 'GEOINT نقشه', 'بیت‌کوین', 'وب تاریک', 'EXIF تصویر'].map(
                      (x) => (
                        <span key={x} className="px-2.5 py-1 rounded-full border border-border/70 bg-secondary/40">
                          {x}
                        </span>
                      )
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {tab === 'cases' && <CasesTab refreshKey={casesRefresh} />}
        {tab === 'tools' && <ToolsTab />}
        {tab === 'chat' && <ChatTab caseId={scan?.caseId ?? null} caseTarget={scan?.target ?? null} />}
      </main>

      {/* ---------- فوتر ---------- */}
      <footer className="mt-auto border-t border-border/70 bg-white/60">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-center text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <FlaskConical className="w-3.5 h-3.5 text-emerald-500/80" />
            کاوشگر — سامانه هوشمند جمع‌آوری و تحلیل اطلاعات منابع باز
          </span>
        </div>
      </footer>
    </div>
  );
}
