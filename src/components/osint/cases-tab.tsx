'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  FolderOpen,
  RefreshCw,
  Loader2,
  Radar,
  Search,
  X,
  Tag,
  Plus,
  SlidersHorizontal,
  ArrowDownWideNarrow,
  TagIcon,
} from 'lucide-react';
import { ModuleCard } from './module-card';
import { AiReportCard } from './ai-report-card';
import { TARGET_TYPE_LABELS } from '@/lib/osint/detect';
import type { OsintModuleResult } from '@/lib/osint/types';
import type { AiReport } from '@/lib/osint/ai';

interface CaseRow {
  id: string;
  target: string;
  targetType: string;
  status: string;
  riskScore: number | null;
  summary: string | null;
  tags: string[];
  createdAt: string;
}

interface CaseDetail {
  id: string;
  target: string;
  targetType: string;
  riskScore: number | null;
  tags: string[];
  results: OsintModuleResult[];
  aiReport: AiReport | null;
  createdAt: string;
}

type RiskFilter = 'all' | 'critical' | 'high' | 'low';
type SortMode = 'newest' | 'oldest' | 'risk';

const RISK_FILTERS: { id: RiskFilter; label: string }[] = [
  { id: 'all', label: 'همه' },
  { id: 'critical', label: 'بحرانی ۷۵+' },
  { id: 'high', label: 'پرخطر ۵۰+' },
  { id: 'low', label: 'کم‌ریسک' },
];

const SORT_LABELS: Record<SortMode, string> = {
  newest: 'جدیدترین',
  oldest: 'قدیمی‌ترین',
  risk: 'بالاترین ریسک',
};

function riskColor(score: number | null): string {
  if (score === null) return '#94a3b8';
  if (score >= 75) return '#f43f5e';
  if (score >= 50) return '#f59e0b';
  if (score >= 25) return '#22d3ee';
  return '#10b981';
}

function fmtDateFa(iso: string): string {
  try {
    return new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function faNum(n: number): string {
  return n.toLocaleString('fa-IR');
}

/* ---------- ویرایشگر برچسب پرونده ---------- */
function TagEditor({
  caseId,
  initialTags,
  onSaved,
  compact,
}: {
  caseId: string;
  initialTags: string[];
  onSaved: (id: string, tags: string[]) => void;
  compact?: boolean;
}) {
  const [tags, setTags] = useState<string[]>(initialTags);
  const [input, setInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTags(initialTags);
  }, [initialTags, caseId]);

  const persist = useCallback(
    async (next: string[]) => {
      setSaving(true);
      setError(null);
      try {
        const res = await fetch(`/api/cases/${caseId}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ tags: next }),
        });
        const j = await res.json();
        if (!res.ok || j.error) throw new Error(j.error ?? 'ذخیره ناموفق بود');
        const saved: string[] = j.tags ?? next;
        setTags(saved);
        onSaved(caseId, saved);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'خطای نامشخص');
      } finally {
        setSaving(false);
      }
    },
    [caseId, onSaved]
  );

  const addTag = () => {
    const t = input.trim().replace(/\s+/g, ' ').slice(0, 24);
    if (!t) return;
    if (tags.some((x) => x.toLowerCase() === t.toLowerCase())) {
      setInput('');
      return;
    }
    if (tags.length >= 20) {
      setError('حداکثر ۲۰ برچسب برای هر پرونده');
      return;
    }
    const next = [...tags, t];
    setInput('');
    persist(next);
  };

  const removeTag = (t: string) => {
    persist(tags.filter((x) => x !== t));
  };

  return (
    <div className={compact ? 'space-y-2' : 'space-y-2.5'}>
      <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addTag();
            }
          }}
          placeholder="برچسب جدید… مثل: مظنون، تهران، پروژه ملوی"
          className="h-9 text-xs bg-white border-border"
          maxLength={24}
          dir="auto"
        />
        <Button
          type="button"
          size="sm"
          onClick={addTag}
          disabled={saving || !input.trim()}
          className="h-9 px-2.5 bg-emerald-600 hover:bg-emerald-700 text-white shrink-0"
          aria-label="افزودن برچسب"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
        </Button>
      </div>
      {tags.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((t) => (
            <Badge
              key={t}
              variant="outline"
              className="pl-1 pr-2.5 py-1 text-[11px] border-emerald-500/30 bg-emerald-500/10 text-emerald-800 gap-1"
            >
              <TagIcon className="w-3 h-3 opacity-60" />
              <span dir="auto">{t}</span>
              <button
                type="button"
                onClick={() => removeTag(t)}
                disabled={saving}
                className="mr-0.5 rounded-full hover:bg-rose-500/20 p-0.5 text-emerald-700/60 hover:text-rose-600 transition-colors"
                aria-label={`حذف برچسب ${t}`}
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          ))}
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground">بدون برچسب — برای دسته‌بندی و فیلتر سریع، برچسب بساز.</p>
      )}
      {error && <p className="text-[11px] text-rose-600">{error}</p>}
    </div>
  );
}

/* ---------- تب پرونده‌ها ---------- */
export function CasesTab({ refreshKey }: { refreshKey: number }) {
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<CaseDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [open, setOpen] = useState(false);

  // جستجو و فیلتر
  const [q, setQ] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [riskFilter, setRiskFilter] = useState<RiskFilter>('all');
  const [sort, setSort] = useState<SortMode>('newest');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/cases');
      const j = await res.json();
      setCases(j.cases ?? []);
    } catch {
      setCases([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const openDetail = async (id: string) => {
    setDetailLoading(true);
    setOpen(true);
    try {
      const res = await fetch(`/api/cases/${id}`);
      const j = await res.json();
      setDetail(j);
    } catch {
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const onTagsSaved = useCallback((id: string, tags: string[]) => {
    setCases((prev) => prev.map((c) => (c.id === id ? { ...c, tags } : c)));
    setDetail((prev) => (prev && prev.id === id ? { ...prev, tags } : prev));
  }, []);

  // انواع هدف موجود در پرونده‌ها
  const usedTypes = useMemo(() => {
    const s = new Set<string>();
    cases.forEach((c) => s.add(c.targetType));
    return Array.from(s);
  }, [cases]);

  // همه برچسب‌های موجود + تعداد
  const allTags = useMemo(() => {
    const counts = new Map<string, number>();
    cases.forEach((c) => c.tags.forEach((t) => counts.set(t, (counts.get(t) ?? 0) + 1)));
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'fa'));
  }, [cases]);

  // فیلتر + جستجو + مرتب‌سازی
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let list = cases.filter((c) => {
      if (typeFilter !== 'all' && c.targetType !== typeFilter) return false;
      if (tagFilter.length > 0 && !tagFilter.every((t) => c.tags.includes(t))) return false;
      if (riskFilter === 'critical' && (c.riskScore === null || c.riskScore < 75)) return false;
      if (riskFilter === 'high' && (c.riskScore === null || c.riskScore < 50)) return false;
      if (riskFilter === 'low' && (c.riskScore === null || c.riskScore >= 50)) return false;
      if (needle) {
        const hay = `${c.target} ${c.summary ?? ''} ${c.tags.join(' ')}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
    list = [...list].sort((a, b) => {
      if (sort === 'oldest') return +new Date(a.createdAt) - +new Date(b.createdAt);
      if (sort === 'risk') return (b.riskScore ?? -1) - (a.riskScore ?? -1);
      return +new Date(b.createdAt) - +new Date(a.createdAt);
    });
    return list;
  }, [cases, q, typeFilter, tagFilter, riskFilter, sort]);

  const filtersActive = q.trim() !== '' || typeFilter !== 'all' || tagFilter.length > 0 || riskFilter !== 'all' || sort !== 'newest';

  const resetFilters = () => {
    setQ('');
    setTypeFilter('all');
    setTagFilter([]);
    setRiskFilter('all');
    setSort('newest');
  };

  const toggleTagFilter = (t: string) => {
    setTagFilter((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 font-bold">
            <FolderOpen className="w-5 h-5 text-emerald-600" />
            پرونده‌های اطلاعاتی ({faNum(cases.length)})
          </h2>
          <p className="text-[11px] text-muted-foreground mt-1">
            هر کاربر فقط جستجوهای خودش را می‌بیند — پرونده‌ها به‌صورت دائمی در سرور ذخیره می‌شوند.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} className="border-border shrink-0">
          <RefreshCw className="w-3.5 h-3.5" /> بروزرسانی
        </Button>
      </div>

      {/* ---------- جستجو و فیلتر ---------- */}
      {cases.length > 0 && (
        <Card className="border-border/80 bg-white/85 soft-shadow">
          <CardContent className="p-3 sm:p-4 space-y-3">
            {/* جستجوی متنی */}
            <div className="relative">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="جستجو در هدف، خلاصه گزارش و برچسب‌ها…"
                className="ps-9 pe-9 h-10 text-sm bg-white border-border"
              />
              {q && (
                <button
                  onClick={() => setQ('')}
                  className="absolute end-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:text-rose-600 hover:bg-rose-500/10 transition-colors"
                  aria-label="پاک کردن جستجو"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* فیلتر نوع هدف */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-bold text-muted-foreground flex items-center gap-1 me-1">
                <SlidersHorizontal className="w-3 h-3" /> نوع:
              </span>
              <button
                onClick={() => setTypeFilter('all')}
                className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-all ${
                  typeFilter === 'all'
                    ? 'bg-emerald-500/15 text-emerald-700 border-emerald-500/40'
                    : 'bg-secondary/50 text-muted-foreground border-border/70 hover:text-foreground'
                }`}
              >
                همه
              </button>
              {usedTypes.map((t) => (
                <button
                  key={t}
                  onClick={() => setTypeFilter(typeFilter === t ? 'all' : t)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-all ${
                    typeFilter === t
                      ? 'bg-emerald-500/15 text-emerald-700 border-emerald-500/40'
                      : 'bg-secondary/50 text-muted-foreground border-border/70 hover:text-foreground'
                  }`}
                >
                  {TARGET_TYPE_LABELS[t as keyof typeof TARGET_TYPE_LABELS] ?? t}
                </button>
              ))}
            </div>

            {/* فیلتر ریسک + مرتب‌سازی */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] font-bold text-muted-foreground me-1">ریسک:</span>
                {RISK_FILTERS.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => setRiskFilter(r.id)}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-all ${
                      riskFilter === r.id
                        ? 'bg-amber-500/15 text-amber-700 border-amber-500/40'
                        : 'bg-secondary/50 text-muted-foreground border-border/70 hover:text-foreground'
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-bold text-muted-foreground flex items-center gap-1">
                  <ArrowDownWideNarrow className="w-3 h-3" /> مرتب‌سازی:
                </span>
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as SortMode)}
                  className="h-7 rounded-lg border border-border/70 bg-white text-[11px] font-semibold px-2 text-foreground outline-none focus:border-emerald-500/50"
                  aria-label="مرتب‌سازی پرونده‌ها"
                >
                  {(Object.keys(SORT_LABELS) as SortMode[]).map((k) => (
                    <option key={k} value={k}>
                      {SORT_LABELS[k]}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* فیلتر برچسب */}
            {allTags.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] font-bold text-muted-foreground flex items-center gap-1 me-1">
                  <Tag className="w-3 h-3" /> برچسب:
                </span>
                {allTags.map(([t, n]) => {
                  const active = tagFilter.includes(t);
                  return (
                    <button
                      key={t}
                      onClick={() => toggleTagFilter(t)}
                      className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-all flex items-center gap-1 ${
                        active
                          ? 'bg-cyan-500/15 text-cyan-800 border-cyan-500/40'
                          : 'bg-secondary/50 text-muted-foreground border-border/70 hover:text-foreground'
                      }`}
                    >
                      {t}
                      <span className="text-[9px] opacity-60">{faNum(n)}</span>
                    </button>
                  );
                })}
                {tagFilter.length > 0 && (
                  <button
                    onClick={() => setTagFilter([])}
                    className="text-[10px] text-rose-600 hover:underline font-semibold"
                  >
                    پاک کردن انتخاب برچسب‌ها
                  </button>
                )}
              </div>
            )}

            {/* نتیجه فیلتر */}
            {filtersActive && (
              <div className="flex items-center justify-between pt-1 border-t border-border/60">
                <span className="text-[11px] text-muted-foreground">
                  {faNum(filtered.length)} از {faNum(cases.length)} پرونده نمایش داده می‌شود
                </span>
                <button onClick={resetFilters} className="text-[11px] font-semibold text-emerald-700 hover:underline">
                  حذف همه فیلترها
                </button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ---------- لیست ---------- */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
          <Loader2 className="w-5 h-5 animate-spin" /> در حال بارگذاری…
        </div>
      ) : cases.length === 0 ? (
        <Card className="border-dashed border-border bg-white/60">
          <CardContent className="py-14 text-center text-muted-foreground">
            <Radar className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm">هنوز پرونده‌ای ثبت نشده است.</p>
            <p className="text-xs mt-1">از تب «اسکن جدید» یک هدف را بررسی کن تا پرونده‌اش اینجا آرشیو شود.</p>
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed border-border bg-white/60">
          <CardContent className="py-12 text-center text-muted-foreground">
            <Search className="w-8 h-8 mx-auto mb-3 opacity-40" />
            <p className="text-sm font-semibold">هیچ پرونده‌ای با این شرایط پیدا نشد</p>
            <p className="text-xs mt-1">عبارت جستجو یا فیلترها را تغییر بده.</p>
            <Button variant="outline" size="sm" onClick={resetFilters} className="mt-4 border-border">
              حذف همه فیلترها
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((c) => (
            <Card
              key={c.id}
              className="border-border/80 bg-white soft-shadow hover:border-emerald-500/40 transition-all cursor-pointer group"
              onClick={() => openDetail(c.id)}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0">
                    <div className="font-bold text-sm truncate" dir="auto">
                      {c.target}
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      {TARGET_TYPE_LABELS[c.targetType as keyof typeof TARGET_TYPE_LABELS] ?? c.targetType} •{' '}
                      {fmtDateFa(c.createdAt)}
                    </div>
                  </div>
                  <span
                    className="shrink-0 w-11 h-11 rounded-xl border flex flex-col items-center justify-center"
                    style={{ borderColor: riskColor(c.riskScore) + '44', backgroundColor: riskColor(c.riskScore) + '10' }}
                  >
                    <span className="text-sm font-black ltr-num" style={{ color: riskColor(c.riskScore) }}>
                      {c.riskScore ?? '—'}
                    </span>
                    <span className="text-[8px] text-muted-foreground">ریسک</span>
                  </span>
                </div>
                <p className="text-[11px] leading-5 text-muted-foreground line-clamp-2 mb-2.5">
                  {c.summary ?? 'بدون گزارش تحلیلی — فقط نتایج خام ذخیره شده است.'}
                </p>
                {c.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-2.5">
                    {c.tags.slice(0, 3).map((t) => (
                      <span
                        key={t}
                        className="px-1.5 py-0.5 rounded-md text-[9px] font-semibold bg-cyan-500/10 text-cyan-800 border border-cyan-500/25"
                        dir="auto"
                      >
                        {t}
                      </span>
                    ))}
                    {c.tags.length > 3 && (
                      <span className="px-1.5 py-0.5 text-[9px] text-muted-foreground">+{faNum(c.tags.length - 3)}</span>
                    )}
                  </div>
                )}
                <div className="flex items-center justify-between" onClick={(e) => e.stopPropagation()}>
                  <Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-700">
                    {c.status === 'completed' ? 'تکمیل‌شده' : c.status}
                  </Badge>
                  {/* ویرایش سریع برچسب‌ها */}
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-[10px] text-muted-foreground hover:text-cyan-700 hover:bg-cyan-500/10"
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`ویرایش برچسب‌های ${c.target}`}
                        title="ویرایش برچسب‌ها"
                      >
                        <Tag className="w-3.5 h-3.5" />
                        <span>برچسب {c.tags.length > 0 ? `(${faNum(c.tags.length)})` : ''}</span>
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-[calc(100vw-1.5rem)] sm:max-w-md bg-background" onClick={(e) => e.stopPropagation()}>
                      <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-base" dir="auto">
                          <Tag className="w-4 h-4 text-cyan-600" />
                          برچسب‌های پرونده: {c.target}
                        </DialogTitle>
                        <DialogDescription>برچسب‌ها فقط برای خودت قابل مشاهده‌اند و در فیلتر تب پرونده‌ها به‌کار می‌روند.</DialogDescription>
                      </DialogHeader>
                      <TagEditor caseId={c.id} initialTags={c.tags} onSaved={onTagsSaved} />
                    </DialogContent>
                  </Dialog>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* دیالوگ جزئیات پرونده */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[calc(100vw-1.5rem)] sm:max-w-3xl max-h-[88dvh] overflow-y-auto bg-background">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2" dir="auto">
              <FolderOpen className="w-5 h-5 text-emerald-600" />
              پرونده: {detail?.target ?? '…'}
            </DialogTitle>
            <DialogDescription>
              {detail
                ? `${TARGET_TYPE_LABELS[detail.targetType as keyof typeof TARGET_TYPE_LABELS] ?? detail.targetType} • ${fmtDateFa(detail.createdAt)}`
                : 'در حال بارگذاری…'}
            </DialogDescription>
          </DialogHeader>
          {detailLoading || !detail ? (
            <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" /> بازخوانی پرونده…
            </div>
          ) : (
            <div className="space-y-4">
              {/* برچسب‌های پرونده */}
              <Card className="border-cyan-500/25 bg-cyan-500/[0.04]">
                <CardContent className="p-3.5">
                  <div className="flex items-center gap-1.5 mb-2.5">
                    <Tag className="w-3.5 h-3.5 text-cyan-600" />
                    <span className="text-xs font-bold">برچسب‌ها</span>
                  </div>
                  <TagEditor caseId={detail.id} initialTags={detail.tags} onSaved={onTagsSaved} compact />
                </CardContent>
              </Card>
              {detail.aiReport && <AiReportCard report={detail.aiReport} />}
              <div className="space-y-3">
                {detail.results.map((r, i) => (
                  <ModuleCard key={r.module + i} result={r} index={i} />
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
