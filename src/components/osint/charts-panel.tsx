'use client';

import { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
  Cell,
} from 'recharts';
import { Activity, Waves, BarChart3 } from 'lucide-react';
import type { OsintModuleResult } from '@/lib/osint/types';

const TOOLTIP_STYLE = {
  backgroundColor: '#ffffff',
  border: '1px solid #e0e8e3',
  borderRadius: '10px',
  fontSize: '12px',
  color: '#0d1f17',
  boxShadow: '0 8px 24px -10px rgba(13, 31, 23, 0.18)',
  direction: 'rtl' as const,
};

interface ChartProps {
  results: OsintModuleResult[];
  riskScore: number | null;
}

export function ChartsPanel({ results, riskScore }: ChartProps) {
  // ابعاد رادار پروفایل اطلاعاتی - استخراج از نتایج واقعی ماژول‌ها
  const radarData = useMemo(() => {
    const find = (m: string) => results.find((r) => r.module === m);
    const metric = (m: string, label: string) => find(m)?.metrics?.find((x) => x.label === label)?.value ?? 0;

    const userRes = find('username');
    const emailRes = find('email');
    const domainRes = find('domain');
    const ig = find('instagram');
    const tw = find('twitter');

    const exposureRaw = userRes ? Math.min(100, (metric('username', 'حساب‌های یافت‌شده') / Math.max(metric('username', 'پلتفرم‌های بررسی‌شده'), 1)) * 100 * 3) : 0;
    const breachRaw = emailRes ? Math.min(100, metric('email', 'رخدادهای نشت') * 25 + metric('email', 'Gravatar') * 10) : 0;
    const socialRaw = ig || tw ? Math.min(100, ((metric('instagram', 'فالوور') || metric('twitter', 'فالوور')) / 5000) * 10) : 0;
    const activityRaw = Math.min(100, (metric('instagram', 'میانگین لایک') + metric('twitter', 'توییت‌ها') / 100) / 5);
    const infraRaw = domainRes ? (domainRes.status === 'success' ? 70 : 20) + (riskScore ?? 50) / 4 : 0;
    const techRaw = find('github') ? Math.min(100, 40 + metric('github', 'مخازن عمومی') * 3) : 0;

    const dims = [
      { dim: 'افشای هویت', v: Math.round(exposureRaw) },
      { dim: 'نشت داده', v: Math.round(breachRaw) },
      { dim: 'حضور اجتماعی', v: Math.round(socialRaw) },
      { dim: 'فعالیت', v: Math.round(activityRaw) },
      { dim: 'زیرساخت', v: Math.round(infraRaw) },
      { dim: 'رد فنی', v: Math.round(techRaw) },
    ];
    return dims.some((d) => d.v > 0) ? dims : null;
  }, [results, riskScore]);

  // تایم‌لاین ترکیبی فعالیت‌ها
  const timelineData = useMemo(() => {
    const points = results
      .flatMap((r) => r.timeline ?? [])
      .map((p) => ({ ...p, ts: new Date(p.date).getTime() }))
      .filter((p) => !Number.isNaN(p.ts) && p.ts > 0)
      .sort((a, b) => a.ts - b.ts)
      .slice(-40);
    if (points.length < 2) return null;
    return points.map((p) => ({
      date: new Intl.DateTimeFormat('fa-IR', { month: 'short', day: 'numeric' }).format(new Date(p.ts)),
      value: p.value,
      label: p.label,
    }));
  }, [results]);

  // مقایسه پلتفرم‌های اجتماعی
  const socialBars = useMemo(() => {
    const rows = results
      .filter((r) => r.module === 'instagram' || r.module === 'twitter')
      .map((r) => ({
        name: r.module === 'instagram' ? 'اینستاگرام' : 'توییتر',
        فالوور: r.metrics?.find((m) => m.label === 'فالوور')?.value ?? 0,
        تعامل: Math.round(((r.raw as any)?.er ?? 0) * 100),
      }))
      .filter((x) => x.فالوور > 0);
    return rows.length ? rows : null;
  }, [results]);

  if (!radarData && !timelineData && !socialBars) return null;

  return (
    <div className="grid md:grid-cols-2 gap-4">
      {radarData && (
        <Card className="border-border/80 bg-white soft-shadow">
          <CardContent className="p-4 sm:p-5">
            <h3 className="flex items-center gap-2 text-sm font-bold mb-1">
              <Activity className="w-4 h-4 text-emerald-600" />
              رادار پروفایل اطلاعاتی
            </h3>
            <p className="text-[11px] text-muted-foreground mb-2">ابعاد شش‌گانه اکتشاف‌پذیری هدف (۰ تا ۱۰۰)</p>
            <div className="h-64" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData} outerRadius="72%">
                  <PolarGrid stroke="#dbe6df" />
                  <PolarAngleAxis dataKey="dim" tick={{ fill: '#5c6f66', fontSize: 11 }} />
                  <Radar dataKey="v" stroke="#059669" fill="#10b981" fillOpacity={0.3} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [v, 'امتیاز']} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {timelineData && (
        <Card className="border-border/80 bg-white soft-shadow">
          <CardContent className="p-4 sm:p-5">
            <h3 className="flex items-center gap-2 text-sm font-bold mb-1">
              <Waves className="w-4 h-4 text-cyan-600" />
              تایم‌لاین فعالیت
            </h3>
            <p className="text-[11px] text-muted-foreground mb-2">روند زمانی محتوا و فعالیت شناسایی‌شده</p>
            <div className="h-64" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={timelineData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                  <defs>
                    <linearGradient id="tlGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.45} />
                      <stop offset="100%" stopColor="#06b6d4" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#eef3ef" />
                  <XAxis dataKey="date" tick={{ fill: '#5c6f66', fontSize: 10 }} interval="preserveStartEnd" tickLine={false} axisLine={{ stroke: '#dbe6df' }} />
                  <YAxis tick={{ fill: '#5c6f66', fontSize: 10 }} width={44} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Area type="monotone" dataKey="value" stroke="#0891b2" strokeWidth={2} fill="url(#tlGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {socialBars && (
        <Card className="border-border/80 bg-white soft-shadow md:col-span-2">
          <CardContent className="p-4 sm:p-5">
            <h3 className="flex items-center gap-2 text-sm font-bold mb-1">
              <BarChart3 className="w-4 h-4 text-amber-600" />
              مقایسه حضور اجتماعی
            </h3>
            <p className="text-[11px] text-muted-foreground mb-2">دنبال‌کننده و تعامل (×۱۰۰ نرخ) در پلتفرم‌های یافت‌شده</p>
            <div className="h-52" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={socialBars} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                  <CartesianGrid stroke="#eef3ef" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: '#5c6f66', fontSize: 12 }} tickLine={false} axisLine={{ stroke: '#dbe6df' }} />
                  <YAxis tick={{ fill: '#5c6f66', fontSize: 10 }} width={54} tickLine={false} axisLine={false} tickFormatter={(v) => (v >= 1000 ? (v / 1000).toFixed(0) + 'K' : String(v))} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'rgba(16,185,129,0.06)' }} />
                  <Bar dataKey="فالوور" radius={[6, 6, 0, 0]} barSize={46}>
                    <Cell fill="#059669" />
                    <Cell fill="#0891b2" />
                  </Bar>
                  <Bar dataKey="تعامل" radius={[6, 6, 0, 0]} barSize={46} fill="#f59e0b" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
