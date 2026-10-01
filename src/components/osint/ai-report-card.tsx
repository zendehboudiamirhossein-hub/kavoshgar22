'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  RadialBarChart,
  RadialBar,
  PolarAngleAxis,
  ResponsiveContainer,
} from 'recharts';
import { BrainCircuit, ShieldAlert, KeyRound, Map, Lightbulb, Gauge, Link2 } from 'lucide-react';
import type { AiReport } from '@/lib/osint/ai';

function riskColor(score: number): string {
  if (score >= 75) return '#f43f5e';
  if (score >= 50) return '#f59e0b';
  if (score >= 25) return '#22d3ee';
  return '#10b981';
}

export function AiReportCard({ report }: { report: AiReport }) {
  const color = riskColor(report.riskScore);
  const chartData = [{ name: 'risk', value: report.riskScore, fill: color }];

  return (
    <Card className="border-emerald-500/25 bg-gradient-to-b from-emerald-500/[0.07] to-card glow-border">
      <CardContent className="p-5 sm:p-6">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center radar-pulse">
            <BrainCircuit className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <h3 className="font-black text-lg">گزارش تحلیل هوش مصنوعی</h3>
            <p className="text-xs text-muted-foreground">تولید شده توسط موتور تحلیل «کاوشگر»</p>
          </div>
          <Badge variant="outline" className="ms-auto border-emerald-500/30 text-emerald-700 text-[10px]">
            اطمینان: {report.confidence}
          </Badge>
        </div>

        <div className="grid lg:grid-cols-[200px_1fr] gap-5 items-start">
          {/* گیج ریسک */}
          <div className="flex flex-col items-center">
            <div className="relative w-full h-36">
              <ResponsiveContainer width="100%" height="100%">
                <RadialBarChart
                  data={chartData}
                  innerRadius="72%"
                  outerRadius="100%"
                  startAngle={220}
                  endAngle={-40}
                  barSize={14}
                >
                  <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
                  <RadialBar dataKey="value" cornerRadius={8} background={{ fill: '#eaf1ed' }} />
                </RadialBarChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-3xl font-black ltr-num" style={{ color }}>
                  {report.riskScore}
                </span>
                <span className="text-[10px] text-muted-foreground">از ۱۰۰</span>
              </div>
            </div>
            <Badge
              variant="outline"
              className="gap-1 mt-1"
              style={{ borderColor: color + '55', color, backgroundColor: color + '12' }}
            >
              <ShieldAlert className="w-3 h-3" />
              سطح ریسک: {report.riskLevel}
            </Badge>
          </div>

          {/* خلاصه اجرایی */}
          <div>
            <h4 className="flex items-center gap-1.5 text-sm font-bold text-emerald-700 mb-2">
              <Gauge className="w-4 h-4" /> خلاصه اجرایی
            </h4>
            <p className="text-sm leading-7 text-foreground/90 bg-white/80 border border-border/70 rounded-lg p-3.5 shadow-[0_1px_2px_rgba(13,31,23,0.04)]">
              {report.executiveSummary}
            </p>
          </div>
        </div>

        <Separator className="my-4 bg-border/60" />

        <div className="grid md:grid-cols-2 gap-4">
          {/* یافته‌های کلیدی */}
          {report.keyFindings.length > 0 && (
            <div className="rounded-lg border border-border/70 bg-white/70 p-4">
              <h4 className="flex items-center gap-1.5 text-sm font-bold text-amber-600 mb-2.5">
                <KeyRound className="w-4 h-4" /> یافته‌های کلیدی
              </h4>
              <ul className="space-y-2">
                {report.keyFindings.map((k, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs leading-6 text-foreground/85">
                    <span className="mt-2 h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" />
                    {k}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* نقشه اتصال */}
          {report.connectionMap.length > 0 && (
            <div className="rounded-lg border border-border/70 bg-white/70 p-4">
              <h4 className="flex items-center gap-1.5 text-sm font-bold text-cyan-700 mb-2.5">
                <Link2 className="w-4 h-4" /> نقشه اتصال سرنخ‌ها
              </h4>
              <ul className="space-y-2">
                {report.connectionMap.map((c, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs leading-6 text-foreground/85">
                    <span className="mt-2 h-1.5 w-1.5 rounded-full bg-cyan-500 shrink-0" />
                    {c}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* ارزیابی پروفایل */}
          {report.profileAssessment && (
            <div className="rounded-lg border border-border/70 bg-white/70 p-4 md:col-span-2">
              <h4 className="flex items-center gap-1.5 text-sm font-bold text-violet-700 mb-2.5">
                <Map className="w-4 h-4" /> ارزیابی پروفایل هدف
              </h4>
              <p className="text-xs leading-7 text-foreground/85">{report.profileAssessment}</p>
            </div>
          )}

          {/* توصیه‌ها */}
          {report.recommendations.length > 0 && (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/[0.07] p-4 md:col-span-2">
              <h4 className="flex items-center gap-1.5 text-sm font-bold text-emerald-700 mb-2.5">
                <Lightbulb className="w-4 h-4" /> گام‌های بعدی پیشنهادی
              </h4>
              <ol className="space-y-2">
                {report.recommendations.map((r, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-xs leading-6 text-foreground/85">
                    <span className="shrink-0 w-5 h-5 rounded-md bg-emerald-500/15 border border-emerald-500/35 text-emerald-700 flex items-center justify-center text-[10px] font-bold ltr-num">
                      {i + 1}
                    </span>
                    {r}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
