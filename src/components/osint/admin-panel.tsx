'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Radar,
  ArrowRight,
  LogOut,
  ScrollText,
  Users,
  SearchCheck,
  CalendarClock,
  Fingerprint,
  RefreshCw,
  ShieldCheck,
  Loader2,
  UserRound,
  Plus,
  Eye,
  EyeOff,
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  AlertTriangle,
  UserPlus,
  KeyRound,
  Trash2,
  Pencil,
  FlaskConical,
  Landmark,
  PhoneIncoming,
  Smartphone,
  MessageSquareCode,
  Bot,
  Send,
  Database,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TARGET_TYPE_LABELS } from '@/lib/osint/detect';
import type { SessionUserInfo } from '@/lib/auth-types';
import type { TargetType } from '@/lib/osint/types';
import { SearchDbTab } from './admin-searchdb-tab';

// ---------- تایپ‌ها ----------

interface SearchLogRow {
  id: string;
  userId: string | null;
  username: string;
  target: string;
  targetType: string | null;
  modules: string | null;
  status: string;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
}

interface SearchesResponse {
  logs: SearchLogRow[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
  stats: { totalSearches: number; todaySearches: number; totalUsers: number; uniqueTargets: number };
}

interface AdminUserRow {
  id: string;
  username: string;
  role: string;
  createdAt: string;
  searchCount: number;
  caseCount: number;
}

type Tab = 'searches' | 'users' | 'apikey' | 'telegram' | 'searchdb';

interface OrgKeyStatusUI {
  configured: boolean;
  masked: string | null;
  updatedAt: string | null;
  envConfigured: boolean;
}

interface SettingsResponseUI {
  hiker: OrgKeyStatusUI;
  truecaller: OrgKeyStatusUI;
}

// ---------- کمکی‌ها ----------

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

// ---------- کامپوننت اصلی ----------

export function AdminPanel({ user, onBack, onLogout }: { user: SessionUserInfo; onBack: () => void; onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>('searches');

  // گزارش جستجوها
  const [logs, setLogs] = useState<SearchLogRow[]>([]);
  const [stats, setStats] = useState<SearchesResponse['stats'] | null>(null);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState('');
  const [usernameFilter, setUsernameFilter] = useState('all');
  const [logsLoading, setLogsLoading] = useState(true);

  // کاربران
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);

  // ویرایش و حذف کاربر
  const [editingUser, setEditingUser] = useState<AdminUserRow | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadLogs = useCallback(async (p = page, query = q, uf = usernameFilter) => {
    setLogsLoading(true);
    try {
      const sp = new URLSearchParams({ page: String(p), pageSize: '20' });
      if (query.trim()) sp.set('q', query.trim());
      if (uf && uf !== 'all') sp.set('username', uf);
      const res = await fetch(`/api/admin/searches?${sp.toString()}`);
      const j: SearchesResponse = await res.json();
      if (res.ok) {
        setLogs(j.logs ?? []);
        setStats(j.stats ?? null);
        setPage(j.page);
        setPages(j.pages);
        setTotal(j.total);
      }
    } catch {
      /* ignore */
    } finally {
      setLogsLoading(false);
    }
  }, [page, q, usernameFilter]);

  const loadUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const res = await fetch('/api/admin/users');
      const j = await res.json();
      if (res.ok) setUsers(j.users ?? []);
    } catch {
      /* ignore */
    } finally {
      setUsersLoading(false);
    }
  }, []);

  // حذف کاربر با تأیید دومرحله‌ای — کلیک اول دکمه را قرمز می‌کند، کلیک دوم تا ۴ ثانیه بعد حذف می‌کند
  const deleteUser = useCallback(
    async (u: AdminUserRow) => {
      if (deletingId !== u.id) {
        setDeletingId(u.id);
        setTimeout(() => setDeletingId((cur) => (cur === u.id ? null : cur)), 4000);
        return;
      }
      setDeletingId(null);
      setActionError(null);
      try {
        const res = await fetch(`/api/admin/users/${u.id}`, { method: 'DELETE' });
        const j = await res.json();
        if (!res.ok) {
          setActionError(j.error ?? 'حذف کاربر ناموفق بود');
          return;
        }
        await loadUsers();
        loadLogs(1, q, usernameFilter);
      } catch {
        setActionError('خطای ارتباط با سرور');
      }
    },
    [deletingId, loadUsers, loadLogs, q, usernameFilter]
  );

  useEffect(() => {
    loadLogs(1, '', 'all');
    loadUsers();
  }, []);

  // فیلتر ادمین روی خودش هم اعمال می‌شود؛ reset صفحه هنگام تغییر فیلتر
  const applyFilters = (query = q, uf = usernameFilter) => loadLogs(1, query, uf);

  const focusUser = (username: string) => {
    setUsernameFilter(username);
    setTab('searches');
    loadLogs(1, q, username);
  };

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => null);
    onLogout();
  };

  const statCards = [
    { icon: SearchCheck, label: 'کل جستجوها', value: stats ? faNum(stats.totalSearches) : '—', cls: 'text-emerald-600' },
    { icon: CalendarClock, label: 'جستجوی امروز', value: stats ? faNum(stats.todaySearches) : '—', cls: 'text-cyan-600' },
    { icon: Users, label: 'کاربران سامانه', value: stats ? faNum(stats.totalUsers) : '—', cls: 'text-violet-600' },
    { icon: Fingerprint, label: 'اهداف یکتا', value: stats ? faNum(stats.uniqueTargets) : '—', cls: 'text-amber-600' },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      {/* ---------- هدر ---------- */}
      <header className="sticky top-0 z-40 border-b border-border/70 bg-white/75 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-3 sm:px-4 h-14 sm:h-16 flex items-center gap-2 sm:gap-3">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 border border-emerald-500/30 flex items-center justify-center radar-pulse shrink-0 shadow-[0_4px_14px_-4px_rgba(16,185,129,0.5)]">
            <ShieldCheck className="w-4.5 h-4.5 sm:w-5 sm:h-5 text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="font-black text-sm sm:text-lg leading-tight truncate">
              پنل مدیریت <span className="text-emerald-600">| کاوشگر</span>
            </h1>
            <p className="text-[10px] text-muted-foreground leading-tight hidden sm:block">
              مدیریت کاربران، کلید API و پایش کامل جستجوها با زمان و آی‌پی
            </p>
          </div>

          <div className="ms-auto flex items-center gap-1.5 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={onBack}
              className="h-9 border-border text-xs sm:text-sm"
            >
              <ArrowRight className="w-4 h-4" />
              <span className="hidden sm:inline">بازگشت به کاوشگر</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={logout}
              className="h-9 border-rose-500/30 text-rose-600 hover:bg-rose-500/10 hover:text-rose-700 px-2.5"
              aria-label="خروج از حساب"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden md:inline text-xs sm:text-sm">خروج</span>
            </Button>
          </div>
        </div>
      </header>

      {/* ---------- محتوا ---------- */}
      <main className="flex-1 w-full max-w-6xl mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-5">
        {/* خوش‌آمد */}
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="bg-emerald-500/15 text-emerald-700 border border-emerald-500/30 hover:bg-emerald-500/15">
            <ShieldCheck className="w-3 h-3 ml-1 shrink-0" />
            مدیر سامانه: <span className="font-bold">{user.username}</span>
          </Badge>
          <span className="text-[11px] text-muted-foreground">تمام جستجوهای کاربران به‌صورت دائمی در سرور ذخیره می‌شود و قابل حذف نیست.</span>
        </div>

        {/* کارت‌های آمار */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {statCards.map((s) => {
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

        {/* ناوبری تب‌ها */}
        <nav className="flex items-center gap-1 w-fit bg-secondary/70 border border-border/70 rounded-xl p-1" aria-label="ناوبری پنل مدیریت">
          {([
            { id: 'searches' as Tab, label: 'گزارش جستجوها', icon: ScrollText },
            { id: 'users' as Tab, label: 'کاربران', icon: Users },
            { id: 'apikey' as Tab, label: 'کلید API', icon: KeyRound },
            { id: 'telegram' as Tab, label: 'تلگرام', icon: Bot },
            { id: 'searchdb' as Tab, label: 'دیتابیس جستجو', icon: Database },
          ]).map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 px-3 sm:px-4 h-9 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
                  tab === t.id
                    ? 'bg-emerald-500/15 text-emerald-700 shadow-[inset_0_0_0_1px_rgba(5,150,105,0.28)]'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                aria-current={tab === t.id ? 'page' : undefined}
              >
                <Icon className="w-4 h-4" />
                {t.label}
              </button>
            );
          })}
        </nav>

        {/* ---------- تب گزارش جستجوها ---------- */}
        {tab === 'searches' && (
          <Card className="border-border/80 bg-white soft-shadow">
            <CardContent className="p-3 sm:p-5 space-y-4">
              {/* فیلترها */}
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1">
                  <SearchCheck className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                  <Input
                    dir="auto"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && applyFilters()}
                    placeholder="جستجو در اهداف…"
                    className="ps-9 text-base sm:text-sm bg-white"
                  />
                </div>
                <Select
                  value={usernameFilter}
                  onValueChange={(v) => {
                    setUsernameFilter(v);
                    loadLogs(1, q, v);
                  }}
                >
                  <SelectTrigger className="w-full sm:w-48 h-10 sm:h-9 bg-white text-sm">
                    <UserRound className="w-4 h-4 me-1.5 text-muted-foreground" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">همه کاربران</SelectItem>
                    {users.map((u) => (
                      <SelectItem key={u.id} value={u.username} dir="ltr">
                        {u.username}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex gap-2">
                  <Button onClick={() => applyFilters()} size="sm" className="h-10 sm:h-9 flex-1 sm:flex-none bg-emerald-600 hover:bg-emerald-700 text-white">
                    <SearchCheck className="w-4 h-4" /> اعمال
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setQ('');
                      setUsernameFilter('all');
                      loadLogs(1, '', 'all');
                    }}
                    className="h-10 sm:h-9 border-border"
                    aria-label="حذف فیلترها و بروزرسانی"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* جدول */}
              {logsLoading ? (
                <div className="flex items-center justify-center py-14 gap-2 text-muted-foreground">
                  <Loader2 className="w-5 h-5 animate-spin" /> در حال بارگذاری گزارش…
                </div>
              ) : logs.length === 0 ? (
                <div className="py-14 text-center text-muted-foreground">
                  <ScrollText className="w-10 h-10 mx-auto mb-3 opacity-40" />
                  <p className="text-sm">جستجویی با این فیلترها ثبت نشده است.</p>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto -mx-3 sm:mx-0 px-3 sm:px-0">
                    <Table className="min-w-[760px]">
                      <TableHeader>
                        <TableRow className="border-border/70 hover:bg-transparent">
                          <TableHead className="text-start w-10">#</TableHead>
                          <TableHead className="text-start">زمان</TableHead>
                          <TableHead className="text-start">کاربر</TableHead>
                          <TableHead className="text-start">هدف</TableHead>
                          <TableHead className="text-start">نوع</TableHead>
                          <TableHead className="text-start">وضعیت</TableHead>
                          <TableHead className="text-start">آی‌پی</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {logs.map((l, i) => (
                          <TableRow key={l.id} className="border-border/60">
                            <TableCell className="text-muted-foreground text-xs ltr-num">
                              {faNum((page - 1) * 20 + i + 1)}
                            </TableCell>
                            <TableCell className="text-xs whitespace-nowrap ltr-num">{fmtDateFa(l.createdAt)}</TableCell>
                            <TableCell>
                              <span className="inline-flex items-center gap-1.5">
                                <span dir="ltr" className="font-semibold text-xs">{l.username}</span>
                                {users.find((u) => u.username === l.username)?.role === 'admin' && (
                                  <ShieldCheck className="w-3.5 h-3.5 text-amber-500" aria-label="مدیر" />
                                )}
                              </span>
                            </TableCell>
                            <TableCell className="max-w-[220px]">
                              <span dir="auto" className="block truncate text-xs font-medium" title={l.target}>
                                {l.target}
                              </span>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                              {l.targetType ? (TARGET_TYPE_LABELS[l.targetType as TargetType] ?? l.targetType) : '—'}
                            </TableCell>
                            <TableCell>
                              {l.status === 'completed' ? (
                                <Badge className="bg-emerald-500/15 text-emerald-700 border border-emerald-500/30 hover:bg-emerald-500/15 text-[10px]">
                                  موفق
                                </Badge>
                              ) : (
                                <Badge className="bg-rose-500/15 text-rose-700 border border-rose-500/30 hover:bg-rose-500/15 text-[10px]">
                                  ناموفق
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              <span dir="ltr" className="font-mono text-xs text-muted-foreground">
                                {l.ip ?? '—'}
                              </span>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {/* صفحه‌بندی */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <p className="text-[11px] text-muted-foreground ltr-num">
                      صفحه {faNum(page)} از {faNum(pages)} — مجموع {faNum(total)} جستجو
                    </p>
                    <div className="flex items-center gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={page <= 1}
                        onClick={() => loadLogs(page - 1)}
                        className="h-8 border-border"
                        aria-label="صفحه قبل"
                      >
                        <ChevronRight className="w-4 h-4" /> قبلی
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={page >= pages}
                        onClick={() => loadLogs(page + 1)}
                        className="h-8 border-border"
                        aria-label="صفحه بعد"
                      >
                        بعدی <ChevronLeft className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* ---------- تب کاربران ---------- */}
        {tab === 'users' && (
          <div className="grid lg:grid-cols-[380px_1fr] gap-4 items-start">
            <CreateUserCard onCreated={() => { loadUsers(); loadLogs(1, q, usernameFilter); }} />
            <Card className="border-border/80 bg-white soft-shadow">
              <CardContent className="p-3 sm:p-5">
                <h3 className="font-bold text-sm flex items-center gap-2 mb-4">
                  <Users className="w-4.5 h-4.5 text-emerald-600" />
                  فهرست کاربران ({usersLoading ? '…' : faNum(users.length)})
                </h3>
                {actionError && (
                  <div className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2.5 text-xs text-rose-700 mb-3">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    {actionError}
                  </div>
                )}
                {usersLoading ? (
                  <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
                    <Loader2 className="w-5 h-5 animate-spin" /> در حال بارگذاری…
                  </div>
                ) : (
                  <div className="overflow-x-auto -mx-3 sm:mx-0 px-3 sm:px-0">
                    <Table className="min-w-[640px]">
                      <TableHeader>
                        <TableRow className="border-border/70 hover:bg-transparent">
                          <TableHead className="text-start">نام کاربری</TableHead>
                          <TableHead className="text-start">نقش</TableHead>
                          <TableHead className="text-start">تاریخ ایجاد</TableHead>
                          <TableHead className="text-start">جستجوها</TableHead>
                          <TableHead className="text-start">پرونده‌ها</TableHead>
                          <TableHead className="text-start">عملیات</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {users.map((u) => (
                          <TableRow key={u.id} className="border-border/60">
                            <TableCell>
                              <span className="inline-flex items-center gap-1.5">
                                <span dir="ltr" className="font-bold text-sm">{u.username}</span>
                                {u.username === user.username && (
                                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 border border-emerald-500/30">شما</span>
                                )}
                              </span>
                            </TableCell>
                            <TableCell>
                              {u.role === 'admin' ? (
                                <Badge className="bg-amber-500/15 text-amber-700 border border-amber-500/30 hover:bg-amber-500/15 text-[10px]">
                                  <ShieldCheck className="w-3 h-3 ml-0.5" /> مدیر
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-[10px] border-border text-muted-foreground">
                                  <UserRound className="w-3 h-3 ml-0.5" /> کاربر
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground ltr-num whitespace-nowrap">{fmtDateFa(u.createdAt)}</TableCell>
                            <TableCell>
                              <button
                                onClick={() => focusUser(u.username)}
                                className="text-xs font-bold ltr-num text-emerald-700 hover:underline underline-offset-4"
                                title="نمایش جستجوهای این کاربر"
                              >
                                {faNum(u.searchCount)}
                              </button>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground ltr-num">{faNum(u.caseCount)}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-0.5">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 px-2 text-muted-foreground hover:text-cyan-700 hover:bg-cyan-500/10"
                                  onClick={() => setEditingUser(u)}
                                  title="ویرایش نام کاربری و رمز عبور"
                                  aria-label={`ویرایش کاربر ${u.username}`}
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </Button>
                                {u.id !== user.uid && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className={`h-8 px-2 ${deletingId === u.id ? 'bg-rose-500/15 text-rose-700 hover:bg-rose-500/20' : 'text-muted-foreground hover:text-rose-600 hover:bg-rose-500/10'}`}
                                    onClick={() => deleteUser(u)}
                                    title={deletingId === u.id ? 'دوباره کلیک کن تا حذف شود' : 'حذف کاربر'}
                                    aria-label={deletingId === u.id ? `تأیید حذف ${u.username}` : `حذف کاربر ${u.username}`}
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    {deletingId === u.id && <span className="text-[10px] font-bold">تأیید حذف</span>}
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
                <p className="text-[10px] text-muted-foreground mt-3 leading-5">
                  با حذف کاربر، دسترسی‌اش فوراً قطع می‌شود اما گزارش جستجوها و پرونده‌هایش به‌صورت آرشیو باقی می‌ماند (فقط مدیر می‌بیند).
                </p>
              </CardContent>
            </Card>
          </div>
        )}
        {/* ---------- تب کلید API ---------- */}
        {tab === 'apikey' && (
          <div className="grid lg:grid-cols-[440px_1fr] gap-4 items-start">
            <ApiKeySection />
            <Card className="border-border/80 bg-white soft-shadow">
              <CardContent className="p-4 sm:p-5 space-y-4">
                <h3 className="font-bold text-sm flex items-center gap-2">
                  <FlaskConical className="w-4.5 h-4.5 text-emerald-600" />
                  کلیدهای سازمانی چطور کار می‌کنند؟
                </h3>
                <ol className="space-y-3 text-xs leading-6 text-muted-foreground">
                  <li className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-emerald-500/15 text-emerald-700 border border-emerald-500/30 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5 ltr-num">۱</span>
                    <span>
                      مدیر کلید سرویس‌دهنده (مثل <b className="text-foreground">HikerAPI</b> برای اینستاگرام و <b className="text-foreground">توکن Truecaller</b> برای نام شماره‌ها) را یک‌بار در همین بخش
                      فعال می‌کند؛ مقادیر به‌صورت امن در دیتابیس سرور نگه‌داری می‌شوند و <b className="text-foreground">هیچ‌وقت کامل نمایش داده نمی‌شوند</b>.
                    </span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-emerald-500/15 text-emerald-700 border border-emerald-500/30 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5 ltr-num">۲</span>
                    <span>
                      از این لحظه <b className="text-foreground">همه کاربران</b> می‌توانند جستجوی کامل اینستاگرام و نمایش نام ثبت‌شده شماره موبایل
                      (Truecaller و NumberBox) را بدون داشتن کلید شخصی انجام دهند.
                    </span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-emerald-500/15 text-emerald-700 border border-emerald-500/30 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5 ltr-num">۳</span>
                    <span>
                      اولویت استفاده: کلید شخصی کاربر (اگر خودش وارد کرده باشد) ← کلید سازمانی مدیر ← متغیر محیطی سرور. کاربران
                      کلیدهای سازمانی را کامل نمی‌بینند و فقط وضعیت «فعال» آن‌ها برایشان نمایش داده می‌شود.
                    </span>
                  </li>
                </ol>
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-3 flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-[11px] leading-5 text-amber-800">
                    جستجوهای اینستاگرام با کلید HikerAPI از اعتبار حساب شما مصرف می‌کند. سرویس Truecaller هم جستجو را به‌ازای هر حساب
                    محدود می‌کند؛ اگر مصرف اعتبار مهم است، کلیدها را فقط در صورت نیاز فعال نگه دارید و بعداً از همین بخش حذف کنید.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
        {/* ---------- تب تلگرام — شناسایی هویت ---------- */}
        {tab === 'telegram' && (
          <div className="grid lg:grid-cols-[440px_1fr] gap-4 items-start">
            <TelegramAccountCard />
            <div className="space-y-4">
              <TelegramBotCard />
              <Card className="border-border/80 bg-white soft-shadow">
                <CardContent className="p-4 sm:p-5 space-y-4">
                  <h3 className="font-bold text-sm flex items-center gap-2">
                    <Bot className="w-4.5 h-4.5 text-cyan-600" />
                    شناسایی هویت چطور کار می‌کند؟
                  </h3>
                  <ol className="space-y-3 text-xs leading-6 text-muted-foreground">
                    <li className="flex items-start gap-2.5">
                      <span className="w-5 h-5 rounded-full bg-cyan-500/15 text-cyan-700 border border-cyan-500/30 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5 ltr-num">۱</span>
                      <span>
                        اکانت تلگرام سازمانی را در کارت «اکانت تلگرام» وارد کنید — تلگرام کد ورود می‌فرستد و اگر رمز دومرحله‌ای
                        داشته باشد همان‌جا وارد می‌شود. سشن به‌صورت امن در دیتابیس ذخیره می‌شود و هرگز نمایش داده نمی‌شود.
                      </span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <span className="w-5 h-5 rounded-full bg-cyan-500/15 text-cyan-700 border border-cyan-500/30 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5 ltr-num">۲</span>
                      <span>
                        اکانت باید <b className="text-foreground">عضو ربات جستجو</b> باشد (یک‌بار از داخل تلگرام استارت بزنید). آیدی
                        ربات و دستور هر نوع داده را در کارت «ربات و دستورات» ثبت کنید.
                      </span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <span className="w-5 h-5 rounded-full bg-cyan-500/15 text-cyan-700 border border-cyan-500/30 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5 ltr-num">۳</span>
                      <span>
                        از این لحظه همه کاربران در تب «اسکن جدید» فیلد «شناسایی هویت از نام، شماره و کدملی ایرانیان» را دارند؛ سامانه
                        دستور را می‌فرستد، مقدار کاربر را ارسال می‌کند و <b className="text-foreground">پاسخ واقعی ربات</b> بدون تغییر نمایش
                        داده می‌شود. همه جستجوها در گزارش ثبت می‌شود.
                      </span>
                    </li>
                  </ol>
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-3 flex items-start gap-2.5">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <p className="text-[11px] leading-5 text-amber-800">
                      اکانت تلگرام به‌صورت سازمانی از طریق سشن استفاده می‌شود. اگر اکانت را در دستگاه دیگری لاگ‌اوت کنید یا تلگرام سشن را
                      باطل کند، باید دوباره وارد شوید. برای اطمینان از محدودیت‌های ربات (سقف جستجوی روزانه و…) فقط دستوراتی را وارد کنید
                      که خودتان در ربات تست کرده‌اید.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* ---------- تب دیتابیس جستجو ---------- */}
        {tab === 'searchdb' && <SearchDbTab />}
      </main>

      {/* ---------- دیالوگ ویرایش کاربر ---------- */}
      {editingUser && (
        <EditUserDialog
          target={editingUser}
          selfId={user.uid}
          onClose={() => setEditingUser(null)}
          onSaved={() => {
            loadUsers();
            loadLogs(1, q, usernameFilter);
          }}
        />
      )}
      <footer className="mt-auto border-t border-border/70 bg-white/60">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-center text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Radar className="w-3.5 h-3.5 text-emerald-500/80" />
            پنل مدیریت کاوشگر — دسترسی محدود به مدیر سامانه
          </span>
        </div>
      </footer>
    </div>
  );
}

// ---------- کارت ایجاد کاربر جدید ----------

function CreateUserCard({ onCreated }: { onCreated: () => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'user' | 'admin'>('user');
  const [showPass, setShowPass] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (creating) return;
    setError(null);
    setSuccess(null);
    setCreating(true);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password, role }),
      });
      const j = await res.json();
      if (!res.ok) {
        setError(j.error ?? 'ایجاد کاربر ناموفق بود');
        return;
      }
      setSuccess(`کاربر «${j.user.username}» با موفقیت ایجاد شد`);
      setUsername('');
      setPassword('');
      setRole('user');
      onCreated();
    } catch {
      setError('خطای ارتباط با سرور');
    } finally {
      setCreating(false);
    }
  };

  return (
    <Card className="border-border/80 bg-white soft-shadow">
      <CardContent className="p-4 sm:p-5">
        <h3 className="font-bold text-sm flex items-center gap-2 mb-1">
          <UserPlus className="w-4.5 h-4.5 text-emerald-600" />
          ایجاد کاربر جدید
        </h3>
        <p className="text-[11px] text-muted-foreground mb-4">
          فقط مدیر سامانه می‌تواند نام کاربری و رمز عبور برای کاربران بسازد.
        </p>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="new-username">نام کاربری</Label>
            <Input
              id="new-username"
              dir="ltr"
              className="text-base sm:text-sm bg-white"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="username"
              autoComplete="off"
              required
            />
            <p className="text-[10px] text-muted-foreground">۳ تا ۳۲ کاراکتر — حروف انگلیسی، عدد و . _ -</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="new-password">رمز عبور</Label>
            <div className="relative">
              <Input
                id="new-password"
                dir="ltr"
                type={showPass ? 'text' : 'password'}
                className="pe-10 text-base sm:text-sm bg-white"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
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
            <p className="text-[10px] text-muted-foreground">حداقل ۴ کاراکتر</p>
          </div>

          <div className="space-y-1.5">
            <Label>سطح دسترسی</Label>
            <Select value={role} onValueChange={(v) => setRole(v === 'admin' ? 'admin' : 'user')}>
              <SelectTrigger className="w-full h-10 bg-white text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="user">
                  <span className="inline-flex items-center gap-1.5">
                    <UserRound className="w-3.5 h-3.5" /> کاربر عادی
                  </span>
                </SelectItem>
                <SelectItem value="admin">
                  <span className="inline-flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5" /> مدیر (دسترسی کامل)
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2.5 text-xs text-rose-700">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}
          {success && (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5 text-xs text-emerald-700">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              {success}
            </div>
          )}

          <Button
            type="submit"
            disabled={creating || !username.trim() || !password}
            className="w-full h-11 text-sm font-bold bg-gradient-to-l from-emerald-600 to-teal-500 hover:from-emerald-700 hover:to-teal-600 text-white shadow-[0_6px_18px_-6px_rgba(16,185,129,0.6)] disabled:opacity-60"
          >
            {creating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> در حال ایجاد…
              </>
            ) : (
              <>
                <Plus className="w-4 h-4" /> ایجاد کاربر
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

// ---------- دیالوگ ویرایش کاربر (نام کاربری / رمز عبور / نقش) ----------

function EditUserDialog({
  target,
  selfId,
  onClose,
  onSaved,
}: {
  target: AdminUserRow;
  selfId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [username, setUsername] = useState(target.username);
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'user' | 'admin'>(target.role === 'admin' ? 'admin' : 'user');
  const [showPass, setShowPass] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isSelf = target.id === selfId;

  const submit = async () => {
    if (saving) return;
    setError(null);
    if (!username.trim()) {
      setError('نام کاربری نمی‌تواند خالی باشد');
      return;
    }
    if (password && password.length < 4) {
      setError('رمز عبور جدید حداقل ۴ کاراکتر باشد');
      return;
    }
    setSaving(true);
    try {
      const body: Record<string, string> = { username: username.trim() };
      if (password) body.password = password;
      if (!isSelf) body.role = role; // نقش حساب خودت قابل تغییر نیست
      const res = await fetch(`/api/admin/users/${target.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j = await res.json();
      if (!res.ok) {
        setError(j.error ?? 'بروزرسانی ناموفق بود');
        return;
      }
      onSaved();
      onClose();
      // ویرایش حساب خودت → صفحه رفرش می‌شود تا نام کاربری جدید همه‌جا اعمال شود
      if (isSelf && (password || username.trim() !== target.username)) {
        setTimeout(() => window.location.reload(), 500);
      }
    } catch {
      setError('خطای ارتباط با سرور');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[calc(100vw-1.5rem)] sm:max-w-md bg-background">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Pencil className="w-4.5 h-4.5 text-cyan-600" />
            ویرایش کاربر: <span dir="ltr">{target.username}</span>
          </DialogTitle>
          <DialogDescription>نام کاربری و رمز عبور جدید را وارد کن — رمز خالی یعنی بدون تغییر.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="edit-username">نام کاربری</Label>
            <Input
              id="edit-username"
              dir="ltr"
              className="text-base sm:text-sm bg-white"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="username"
              autoComplete="off"
            />
            <p className="text-[10px] text-muted-foreground">۳ تا ۳۲ کاراکتر — حروف انگلیسی، عدد و . _ -</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-password">رمز عبور جدید</Label>
            <div className="relative">
              <Input
                id="edit-password"
                dir="ltr"
                type={showPass ? 'text' : 'password'}
                className="pe-10 text-base sm:text-sm bg-white"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="خالی = بدون تغییر"
                autoComplete="new-password"
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
            <p className="text-[10px] text-muted-foreground">
              حداقل ۴ کاراکتر — بعد از تغییر، سشن‌های قبلی آن کاربر بلافاصله بی‌اعتبار می‌شوند.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>سطح دسترسی</Label>
            <Select value={role} onValueChange={(v) => setRole(v === 'admin' ? 'admin' : 'user')} disabled={isSelf}>
              <SelectTrigger className="w-full h-10 bg-white text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="user">
                  <span className="inline-flex items-center gap-1.5">
                    <UserRound className="w-3.5 h-3.5" /> کاربر عادی
                  </span>
                </SelectItem>
                <SelectItem value="admin">
                  <span className="inline-flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5" /> مدیر (دسترسی کامل)
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
            {isSelf && <p className="text-[10px] text-muted-foreground">نقش حساب خودت قابل تغییر نیست.</p>}
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2.5 text-xs text-rose-700">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          <div className="flex items-center gap-2 pt-1">
            <Button
              onClick={submit}
              disabled={saving || !username.trim()}
              className="flex-1 h-11 text-sm font-bold bg-gradient-to-l from-emerald-600 to-teal-500 hover:from-emerald-700 hover:to-teal-600 text-white shadow-[0_6px_18px_-6px_rgba(16,185,129,0.6)] disabled:opacity-60"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> در حال ذخیره…
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" /> ذخیره تغییرات
                </>
              )}
            </Button>
            <Button variant="outline" onClick={onClose} disabled={saving} className="h-11 px-4 border-border text-sm">
              انصراف
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------- بخش کلیدهای سازمانی (HikerAPI + Truecaller) ----------

function ApiKeySection() {
  const [settings, setSettings] = useState<SettingsResponseUI | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/settings');
      const j = await res.json();
      if (res.ok) {
        setSettings({
          hiker: { configured: !!j.hiker?.configured, masked: j.hiker?.masked ?? null, updatedAt: j.hiker?.updatedAt ?? null, envConfigured: !!j.hiker?.envConfigured },
          truecaller: { configured: !!j.truecaller?.configured, masked: j.truecaller?.masked ?? null, updatedAt: j.truecaller?.updatedAt ?? null, envConfigured: !!j.truecaller?.envConfigured },
        });
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-4">
      <HikerKeyCard status={settings?.hiker ?? null} loading={loading} reload={load} />
      <TruecallerCard status={settings?.truecaller ?? null} loading={loading} reload={load} />
    </div>
  );
}

// ---------- جعبه وضعیت مشترک ----------

function OrgStatusBox({ status, notSetText }: { status: OrgKeyStatusUI | null; notSetText: string }) {
  if (!status?.configured) {
    return (
      <div className="rounded-xl border border-border/80 bg-secondary/50 px-3.5 py-3 flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold text-foreground">وضعیت</span>
        <span className="text-[11px] text-muted-foreground">{notSetText}</span>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-3 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold text-foreground flex items-center gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> فعال
        </span>
        <span dir="ltr" className="font-mono text-[11px] text-emerald-700 bg-white/70 border border-emerald-500/30 rounded-md px-2 py-0.5">
          {status.masked}
        </span>
      </div>
      {status.updatedAt && <p className="text-[10px] text-muted-foreground ltr-num">آخرین بروزرسانی: {fmtDateFa(status.updatedAt)}</p>}
      {status.envConfigured && (
        <p className="text-[10px] text-muted-foreground">متغیر محیطی سرور نیز تنظیم شده و به‌عنوان آخرین گزینه استفاده می‌شود.</p>
      )}
    </div>
  );
}

function OrgFeedback({ error, success }: { error: string | null; success: string | null }) {
  if (error) {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2.5 text-xs text-rose-700 leading-5">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
        {error}
      </div>
    );
  }
  if (success) {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5 text-xs text-emerald-700 leading-5">
        <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
        {success}
      </div>
    );
  }
  return null;
}

// ---------- کارت کلید HikerAPI (اینستاگرام) ----------

function HikerKeyCard({ status, loading, reload }: { status: OrgKeyStatusUI | null; loading: boolean; reload: () => Promise<void> }) {
  const [key, setKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState<'test-save' | 'save' | 'clear' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const save = async (testFirst: boolean) => {
    const k = key.trim();
    if (!k || busy) return;
    setError(null);
    setSuccess(null);
    setBusy(testFirst ? 'test-save' : 'save');
    try {
      // در حالت «تست و ذخیره» ابتدا صحت کلید سنجیده می‌شود؛ در صورت خطا ذخیره نمی‌شود
      if (testFirst) {
        const t = await fetch('/api/admin/settings/test', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ setting: 'hiker', value: k }),
        });
        const tj = await t.json();
        if (!t.ok || !tj.ok) {
          setError(`تست کلید ناموفق بود: ${tj.message ?? tj.error ?? 'کلید نامعتبر است'} — می‌توانید با «ذخیره بدون تست» ادامه دهید.`);
          return;
        }
        setSuccess(tj.message ?? 'کلید معتبر است');
      }

      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ setting: 'hiker', value: k }),
      });
      const j = await res.json();
      if (!res.ok) {
        setError(j.error ?? 'ذخیره کلید ناموفق بود');
        return;
      }
      setSuccess((prev) => (prev && testFirst ? `${prev} — ${j.message ?? 'ذخیره شد'}` : j.message ?? 'کلید سازمانی ذخیره شد'));
      setKey('');
      await reload();
    } catch {
      setError('خطای ارتباط با سرور');
    } finally {
      setBusy(null);
    }
  };

  const clear = async () => {
    if (busy) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 4000);
      return;
    }
    setError(null);
    setSuccess(null);
    setConfirmDelete(false);
    setBusy('clear');
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ setting: 'hiker', clear: true }),
      });
      const j = await res.json();
      if (!res.ok) {
        setError(j.error ?? 'حذف کلید ناموفق بود');
        return;
      }
      setSuccess(j.message ?? 'کلید سازمانی حذف شد');
      await reload();
    } catch {
      setError('خطای ارتباط با سرور');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card className="border-border/80 bg-white soft-shadow">
      <CardContent className="p-4 sm:p-5 space-y-4">
        <div>
          <h3 className="font-bold text-sm flex items-center gap-2">
            <Landmark className="w-4.5 h-4.5 text-emerald-600" />
            افزودن API فعال — HikerAPI (اینستاگرام)
          </h3>
          <p className="text-[11px] text-muted-foreground mt-1 leading-5">
            کلید سرویس اینستاگرام را برای همه کاربران فعال کنید تا بدون کلید شخصی بتوانند جستجوی کامل اینستاگرام انجام دهند.
          </p>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> در حال دریافت وضعیت…
          </div>
        ) : (
          <OrgStatusBox status={status} notSetText="تنظیم نشده" />
        )}

        <div className="space-y-1.5">
          <Label htmlFor="global-hiker-key">کلید API جدید</Label>
          <div className="relative">
            <Input
              id="global-hiker-key"
              dir="ltr"
              type={showKey ? 'text' : 'password'}
              className="pe-10 text-base sm:text-sm bg-white font-mono"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="HikerAPI access key…"
              autoComplete="off"
            />
            <button
              type="button"
              onClick={() => setShowKey((v) => !v)}
              className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              aria-label={showKey ? 'پنهان کردن کلید' : 'نمایش کلید'}
            >
              {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <p className="text-[10px] text-muted-foreground">
            کلید از{' '}
            <a
              href="https://hikerapi.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-emerald-700 underline decoration-emerald-500/40 hover:decoration-emerald-600"
              dir="ltr"
            >
              hikerapi.com
            </a>{' '}
            — پس از ذخیره، کامل نمایش داده نمی‌شود.
          </p>
        </div>

        <OrgFeedback error={error} success={success} />

        <div className="grid grid-cols-2 gap-2">
          <Button
            onClick={() => save(true)}
            disabled={!key.trim() || !!busy}
            className="h-11 text-sm font-bold bg-gradient-to-l from-emerald-600 to-teal-500 hover:from-emerald-700 hover:to-teal-600 text-white shadow-[0_6px_18px_-6px_rgba(16,185,129,0.6)] disabled:opacity-60"
          >
            {busy === 'test-save' ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> در حال تست…
              </>
            ) : (
              <>
                <FlaskConical className="w-4 h-4" /> تست و ذخیره
              </>
            )}
          </Button>
          <Button variant="outline" onClick={() => save(false)} disabled={!key.trim() || !!busy} className="h-11 text-sm border-border">
            {busy === 'save' ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
            ذخیره بدون تست
          </Button>
        </div>

        {status?.configured && (
          <Button
            variant="outline"
            onClick={clear}
            disabled={!!busy}
            className={`w-full h-10 text-xs border-rose-500/30 text-rose-600 hover:bg-rose-500/10 hover:text-rose-700 ${confirmDelete ? 'bg-rose-500/10' : ''}`}
          >
            {busy === 'clear' ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> در حال حذف…
              </>
            ) : confirmDelete ? (
              <>
                <AlertTriangle className="w-4 h-4" /> مطمئنید؟ کلیک کنید تا حذف شود
              </>
            ) : (
              <>
                <Trash2 className="w-4 h-4" /> حذف کلید سازمانی
              </>
            )}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

// ---------- کارت توکن Truecaller (نام ثبت‌شده شماره‌ها) ----------

function TruecallerCard({ status, loading, reload }: { status: OrgKeyStatusUI | null; loading: boolean; reload: () => Promise<void> }) {
  // ورود با کد تأیید پیامکی
  const [otpStep, setOtpStep] = useState<'idle' | 'sent'>('idle');
  const [otpPhone, setOtpPhone] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [requestId, setRequestId] = useState('');
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);

  // توکن دستی
  const [manualToken, setManualToken] = useState('');
  const [busy, setBusy] = useState<'save' | 'test' | 'clear' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const sendOtp = async () => {
    const p = otpPhone.trim();
    if (!p || sending) return;
    setOtpError(null);
    setError(null);
    setSuccess(null);
    setSending(true);
    try {
      const res = await fetch('/api/admin/truecaller/otp', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'send', phone: p }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) {
        setOtpError(j.message ?? j.error ?? 'ارسال کد تأیید ناموفق بود');
        return;
      }
      setRequestId(j.requestId ?? '');
      setOtpStep('sent');
      setSuccess('کد تأیید پیامک شد — کد ۴ تا ۶ رقمی دریافتی را وارد کنید');
    } catch {
      setOtpError('خطای ارتباط با سرور');
    } finally {
      setSending(false);
    }
  };

  const verifyOtp = async () => {
    const code = otpCode.trim();
    if (!code || verifying) return;
    setOtpError(null);
    setVerifying(true);
    try {
      const res = await fetch('/api/admin/truecaller/otp', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'verify', phone: otpPhone.trim(), requestId, otp: code }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) {
        setOtpError(j.message ?? j.error ?? 'تأیید کد ناموفق بود');
        return;
      }
      setSuccess(j.message ?? 'توکن Truecaller ذخیره شد');
      setOtpStep('idle');
      setOtpPhone('');
      setOtpCode('');
      setRequestId('');
      await reload();
    } catch {
      setOtpError('خطای ارتباط با سرور');
    } finally {
      setVerifying(false);
    }
  };

  const saveManual = async () => {
    const t = manualToken.trim();
    if (!t || busy) return;
    setError(null);
    setSuccess(null);
    setBusy('save');
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ setting: 'truecaller', value: t }),
      });
      const j = await res.json();
      if (!res.ok) {
        setError(j.error ?? 'ذخیره توکن ناموفق بود');
        return;
      }
      setSuccess(j.message ?? 'توکن سازمانی ذخیره شد');
      setManualToken('');
      await reload();
    } catch {
      setError('خطای ارتباط با سرور');
    } finally {
      setBusy(null);
    }
  };

  const testToken = async () => {
    if (busy) return;
    setError(null);
    setSuccess(null);
    setBusy('test');
    try {
      const res = await fetch('/api/admin/settings/test', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ setting: 'truecaller' }),
      });
      const j = await res.json();
      if (j.ok) setSuccess(j.message ?? 'توکن معتبر است');
      else setError(`تست توکن ناموفق بود: ${j.message ?? j.error ?? 'خطای نامشخص'}`);
    } catch {
      setError('خطای ارتباط با سرور');
    } finally {
      setBusy(null);
    }
  };

  const clear = async () => {
    if (busy) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 4000);
      return;
    }
    setError(null);
    setSuccess(null);
    setConfirmDelete(false);
    setBusy('clear');
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ setting: 'truecaller', clear: true }),
      });
      const j = await res.json();
      if (!res.ok) {
        setError(j.error ?? 'حذف توکن ناموفق بود');
        return;
      }
      setSuccess(j.message ?? 'توکن سازمانی حذف شد');
      await reload();
    } catch {
      setError('خطای ارتباط با سرور');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card className="border-border/80 bg-white soft-shadow">
      <CardContent className="p-4 sm:p-5 space-y-4">
        <div>
          <h3 className="font-bold text-sm flex items-center gap-2">
            <PhoneIncoming className="w-4.5 h-4.5 text-emerald-600" />
            توکن Truecaller — نام ثبت‌شده شماره‌ها
          </h3>
          <p className="text-[11px] text-muted-foreground mt-1 leading-5">
            با فعال‌سازی این بخش، نام ثبت‌شده هر شماره موبایل در Truecaller (و NumberBox) در نتایج جستجوی شماره نمایش داده می‌شود.
          </p>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> در حال دریافت وضعیت…
          </div>
        ) : (
          <OrgStatusBox status={status} notSetText="تنظیم نشده — نام شماره‌ها فعلاً در دسترس نیست" />
        )}

        {/* روش ۱: ورود با کد تأیید */}
        <div className="rounded-xl border border-border/80 bg-secondary/40 p-3.5 space-y-2.5">
          <p className="text-[11px] font-semibold text-foreground flex items-center gap-1.5">
            <Smartphone className="w-3.5 h-3.5 text-emerald-600" />
            روش ۱ — ورود با شماره موبایل (دریافت خودکار توکن)
          </p>
          {otpStep === 'idle' ? (
            <div className="flex gap-2">
              <Input
                dir="ltr"
                className="h-9 text-xs font-mono bg-white flex-1"
                value={otpPhone}
                onChange={(e) => setOtpPhone(e.target.value)}
                placeholder="+989121234567"
                autoComplete="tel"
                aria-label="شماره موبایل برای ورود Truecaller"
              />
              <Button
                type="button"
                size="sm"
                onClick={sendOtp}
                disabled={!otpPhone.trim() || sending}
                className="h-9 px-3 text-xs bg-emerald-600 hover:bg-emerald-700 text-white shrink-0"
              >
                {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MessageSquareCode className="w-3.5 h-3.5" />}
                ارسال کد
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex gap-2">
                <Input
                  dir="ltr"
                  className="h-9 text-xs font-mono bg-white flex-1"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value)}
                  placeholder="کد تأیید پیامک‌شده"
                  autoComplete="one-time-code"
                  aria-label="کد تأیید Truecaller"
                />
                <Button
                  type="button"
                  size="sm"
                  onClick={verifyOtp}
                  disabled={!otpCode.trim() || verifying}
                  className="h-9 px-3 text-xs bg-emerald-600 hover:bg-emerald-700 text-white shrink-0"
                >
                  {verifying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                  تأیید و ذخیره
                </Button>
              </div>
              <button
                type="button"
                onClick={() => {
                  setOtpStep('idle');
                  setOtpCode('');
                  setOtpError(null);
                }}
                className="text-[10px] text-muted-foreground hover:text-foreground underline underline-offset-2"
              >
                تغییر شماره / ارسال مجدد کد
              </button>
            </div>
          )}
          {otpError && (
            <div className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 py-2 text-[10px] text-rose-700 leading-4">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              {otpError}
            </div>
          )}
          <p className="text-[10px] text-muted-foreground leading-4">
            شماره همه کشورها پذیرفته می‌شود — با پیشوند بین‌المللی وارد کنید (+98…، +1…، +44… یا 00…). کد تأیید به همین شماره پیامک می‌شود و توکن حساب به‌صورت خودکار برای همه کاربران فعال می‌گردد.
          </p>
        </div>

        {/* روش ۲: توکن دستی */}
        <div className="space-y-1.5">
          <Label htmlFor="global-tc-token">روش ۲ — ورود دستی توکن (installationId)</Label>
          <div className="relative">
            <Input
              id="global-tc-token"
              dir="ltr"
              type="password"
              className="text-base sm:text-sm bg-white font-mono"
              value={manualToken}
              onChange={(e) => setManualToken(e.target.value)}
              placeholder="Truecaller installationId…"
              autoComplete="off"
            />
          </div>
          <p className="text-[10px] text-muted-foreground">
            توکن را می‌توانید با ابزار متن‌باز <span dir="ltr" className="font-mono">truecallerjs</span> روی سیستم شخصی خود بسازید و اینجا وارد کنید.
          </p>
        </div>

        <OrgFeedback error={error} success={success} />

        <div className="grid grid-cols-2 gap-2">
          <Button
            onClick={testToken}
            disabled={!!busy || !status?.configured}
            className="h-10 text-xs font-bold bg-gradient-to-l from-emerald-600 to-teal-500 hover:from-emerald-700 hover:to-teal-600 text-white shadow-[0_6px_18px_-6px_rgba(16,185,129,0.6)] disabled:opacity-60"
          >
            {busy === 'test' ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> در حال تست…
              </>
            ) : (
              <>
                <FlaskConical className="w-4 h-4" /> تست توکن ذخیره‌شده
              </>
            )}
          </Button>
          <Button variant="outline" onClick={saveManual} disabled={!manualToken.trim() || !!busy} className="h-10 text-xs border-border">
            {busy === 'save' ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
            ذخیره توکن دستی
          </Button>
        </div>

        {status?.configured && (
          <Button
            variant="outline"
            onClick={clear}
            disabled={!!busy}
            className={`w-full h-10 text-xs border-rose-500/30 text-rose-600 hover:bg-rose-500/10 hover:text-rose-700 ${confirmDelete ? 'bg-rose-500/10' : ''}`}
          >
            {busy === 'clear' ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> در حال حذف…
              </>
            ) : confirmDelete ? (
              <>
                <AlertTriangle className="w-4 h-4" /> مطمئنید؟ کلیک کنید تا حذف شود
              </>
            ) : (
              <>
                <Trash2 className="w-4 h-4" /> حذف توکن سازمانی
              </>
            )}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

// ---------- تب تلگرام: کارت اکانت سازمانی ----------

interface TgStatusUI {
  account: {
    configured: boolean;
    phone: string;
    name: string;
    username: string;
    credentialsSaved?: boolean;
    savedApiId?: string;
  };
  bot: { configured: boolean; username: string; commands: { name: string; nationalId: string; mobile: string } };
}

function TelegramAccountCard() {
  const [status, setStatus] = useState<TgStatusUI | null>(null);
  const [loading, setLoading] = useState(true);

  // فرم ورود
  const [apiId, setApiId] = useState('');
  const [apiHash, setApiHash] = useState('');
  const [phone, setPhone] = useState('+98');
  const [code, setCode] = useState('');
  const [twofa, setTwofa] = useState('');
  const [needPassword, setNeedPassword] = useState(false);
  const [step, setStep] = useState<'idle' | 'code-sent'>('idle');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [confirmLogout, setConfirmLogout] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/telegram');
      const j = await res.json();
      if (res.ok) {
        setStatus(j);
        if (j?.bot?.commands) {
          // دستورات در کارت ربات پر می‌شوند — اینجا فقط وضعیت اکانت مهم است
        }
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const resetLoginState = () => {
    setStep('idle');
    setCode('');
    setTwofa('');
    setNeedPassword(false);
  };

  const sendCode = async () => {
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch('/api/admin/telegram/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'send-code', apiId: apiId.trim(), apiHash: apiHash.trim(), phone: phone.trim() }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? 'دریافت کد ناموفق بود');
      setStep('code-sent');
      setSuccess(j.message ?? 'کد ارسال شد');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'خطای ارتباط با سرور');
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch('/api/admin/telegram/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'verify', code: code.trim(), password: twofa }),
      });
      const j = await res.json();
      if (!res.ok) {
        if (j.step === 'need-password') {
          setNeedPassword(true);
          throw new Error('این اکانت رمز دومرحله‌ای دارد — رمز را وارد و دوباره «ورود» را بزنید');
        }
        throw new Error(j.error ?? 'ورود ناموفق بود');
      }
      setSuccess(`${j.message} — اکانت: ${j.account?.name ?? ''}`);
      resetLoginState();
      setApiId('');
      setApiHash('');
      setPhone('+98');
      await loadStatus();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'خطای ارتباط با سرور');
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    if (!confirmLogout) {
      setConfirmLogout(true);
      setTimeout(() => setConfirmLogout(false), 4000);
      return;
    }
    setConfirmLogout(false);
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch('/api/admin/telegram/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'logout' }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? 'خروج ناموفق بود');
      setSuccess(j.message ?? 'اکانت قطع شد');
      await loadStatus();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'خطای ارتباط با سرور');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="border-border/80 bg-white soft-shadow">
      <CardContent className="p-4 sm:p-5 space-y-4">
        <h3 className="font-bold text-sm flex items-center gap-2">
          <Send className="w-4.5 h-4.5 text-cyan-600" />
          اکانت تلگرام سازمانی
        </h3>

        {loading ? (
          <div className="flex items-center justify-center py-10 gap-2 text-muted-foreground text-xs">
            <Loader2 className="w-4 h-4 animate-spin" /> در حال دریافت وضعیت…
          </div>
        ) : status?.account?.configured ? (
          <div className="space-y-3">
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-3 space-y-1.5">
              <p className="text-xs font-bold text-emerald-800 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                اکانت متصل است
              </p>
              <p className="text-[11px] text-emerald-800/90 leading-5">
                {status.account.name && <>نام: <b>{status.account.name}</b> — </>}
                {status.account.username && (
                  <>
                    آیدی: <span dir="ltr">@{status.account.username}</span> —{' '}
                  </>
                )}
                شماره: <span dir="ltr" className="font-mono">{status.account.phone}</span>
              </p>
            </div>
            <Button
              variant="outline"
              onClick={logout}
              disabled={busy}
              className={`w-full h-10 text-xs border-rose-500/30 text-rose-600 hover:bg-rose-500/10 hover:text-rose-700 ${confirmLogout ? 'bg-rose-500/10' : ''}`}
            >
              {busy ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> در حال قطع اتصال…
                </>
              ) : confirmLogout ? (
                <>
                  <AlertTriangle className="w-4 h-4" /> مطمئنید؟ کلیک کنید تا قطع شود
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" /> قطع اتصال اکانت (لاگ‌اوت)
                </>
              )}
            </Button>
            <p className="text-[10px] text-muted-foreground leading-4">
              با قطع اتصال، سشن از سرور حذف و از تلگرام هم لاگ‌اوت می‌شود؛ جستجوی هویت برای کاربران غیرفعال خواهد شد.
            </p>
          </div>
        ) : (
          <div className="space-y-3.5">
            {step === 'idle' ? (
              <>
                {status?.account?.credentialsSaved && (
                  <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[11px] text-emerald-800 leading-5">
                    API ID و API Hash روی سرور ذخیره شده است (API ID: <span dir="ltr" className="font-mono">{status.account.savedApiId}</span>)
                    — می‌توانید این دو فیلد را خالی بگذارید و فقط شماره را وارد کنید.
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label htmlFor="tg-api-id">API ID تلگرام</Label>
                  <Input
                    id="tg-api-id"
                    dir="ltr"
                    value={apiId}
                    onChange={(e) => setApiId(e.target.value)}
                    placeholder="مثلاً 20401234"
                    className="h-9 text-xs font-mono bg-white"
                    autoComplete="off"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="tg-api-hash">API Hash تلگرام</Label>
                  <Input
                    id="tg-api-hash"
                    dir="ltr"
                    value={apiHash}
                    onChange={(e) => setApiHash(e.target.value)}
                    placeholder="32 کاراکتر هگز از my.telegram.org"
                    className="h-9 text-xs font-mono bg-white"
                    autoComplete="off"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="tg-phone">شماره موبایل اکانت تلگرام</Label>
                  <Input
                    id="tg-phone"
                    dir="ltr"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="09121234567 یا +989121234567"
                    className="h-9 text-xs font-mono bg-white"
                    autoComplete="tel"
                    inputMode="tel"
                  />
                </div>
                <Button
                  onClick={sendCode}
                  disabled={busy || !phone.trim() || (!status?.account?.credentialsSaved && (!apiId.trim() || !apiHash.trim()))}
                  className="w-full h-10 text-xs font-bold bg-gradient-to-l from-cyan-600 to-sky-500 hover:from-cyan-500 hover:to-sky-400 text-white shadow-[0_6px_18px_-6px_rgba(6,182,212,0.6)]"
                >
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  دریافت کد ورود
                </Button>
                <p className="text-[10px] text-muted-foreground leading-4">
                  API ID و API Hash را از <span dir="ltr" className="font-mono">my.telegram.org → API development tools</span> بگیرید (بار اول که وارد کنید، روی سرور ذخیره می‌شود).
                  شماره را با هر فرمتی می‌توانید وارد کنید (۰۹…، 98912…، 0098… یا +98…) — سامانه خودکار به فرمت بین‌المللی تبدیل می‌کند.
                  کد ورود به اکانت تلگرام شما پیام می‌شود.
                </p>
              </>
            ) : (
              <>
                <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-[11px] text-cyan-800 leading-5">
                  کد به اکانت تلگرام شما ارسال شد — کد ۵ رقمی را وارد کنید.
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="tg-code">کد ورود</Label>
                  <Input
                    id="tg-code"
                    dir="ltr"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="12345"
                    className="h-9 text-xs font-mono bg-white tracking-[0.3em] text-center"
                    autoComplete="one-time-code"
                  />
                </div>
                {needPassword && (
                  <div className="space-y-1.5">
                    <Label htmlFor="tg-2fa">رمز دومرحله‌ای (2FA)</Label>
                    <Input
                      id="tg-2fa"
                      dir="ltr"
                      type="password"
                      value={twofa}
                      onChange={(e) => setTwofa(e.target.value)}
                      placeholder="رمز اکانت تلگرام"
                      className="h-9 text-xs bg-white"
                      autoComplete="current-password"
                    />
                  </div>
                )}
                <Button
                  onClick={verify}
                  disabled={busy || !code.trim() || (needPassword && !twofa.trim())}
                  className="w-full h-10 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  ورود به تلگرام
                </Button>
                <button
                  type="button"
                  onClick={resetLoginState}
                  className="text-[10px] text-muted-foreground hover:text-foreground underline underline-offset-2"
                >
                  تغییر شماره / ارسال مجدد کد
                </button>
              </>
            )}
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[11px] text-rose-700 leading-5">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            {error}
          </div>
        )}
        {success && !error && (
          <div className="flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[11px] text-emerald-700 leading-5">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            {success}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------- تب تلگرام: کارت ربات و دستورات ----------

function TelegramBotCard() {
  const [botUsername, setBotUsername] = useState('');
  const [cmdName, setCmdName] = useState('');
  const [cmdNational, setCmdNational] = useState('');
  const [cmdMobile, setCmdMobile] = useState('');
  const [cmdCard, setCmdCard] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch('/api/admin/telegram')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (j?.bot) {
          setBotUsername(j.bot.username ?? '');
          setCmdName(j.bot.commands?.name ?? '');
          setCmdNational(j.bot.commands?.nationalId ?? '');
          setCmdMobile(j.bot.commands?.mobile ?? '');
          setCmdCard(j.bot.commands?.card ?? '');
        }
      })
      .catch(() => null)
      .finally(() => setLoaded(true));
  }, []);

  const save = async () => {
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch('/api/admin/telegram/config', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ botUsername: botUsername.trim(), cmdName: cmdName.trim(), cmdNationalId: cmdNational.trim(), cmdMobile: cmdMobile.trim(), cmdCard: cmdCard.trim() }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? 'ذخیره ناموفق بود');
      setSuccess(j.message ?? 'ذخیره شد');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'خطای ارتباط با سرور');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="border-border/80 bg-white soft-shadow">
      <CardContent className="p-4 sm:p-5 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-bold text-sm flex items-center gap-2">
            <Bot className="w-4.5 h-4.5 text-cyan-600" />
            ربات و دستورات جستجو
          </h3>
          {loaded && botUsername && (
            <Badge className="bg-emerald-500/15 text-emerald-700 border border-emerald-500/30 hover:bg-emerald-500/15 text-[10px]">
              تنظیم شده: <span dir="ltr">@{botUsername}</span>
            </Badge>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="tg-bot">آیدی ربات جستجو</Label>
          <Input
            id="tg-bot"
            dir="ltr"
            value={botUsername}
            onChange={(e) => setBotUsername(e.target.value)}
            placeholder="مثلاً MySearchBot یا لینک t.me/MySearchBot"
            className="h-9 text-xs font-mono bg-white"
            autoComplete="off"
          />
          <p className="text-[10px] text-muted-foreground">اکانت تلگرام سامانه باید عضو این ربات باشد (یک‌بار استارت بزنید). برای حذف اتصال ربات، این فیلد را خالی کنید و ذخیره بزنید.</p>
        </div>

        <div className="grid sm:grid-cols-2 gap-2.5">
          <div className="space-y-1.5">
            <Label htmlFor="tg-cmd-name">دستور «نام و نام خانوادگی»</Label>
            <Input
              id="tg-cmd-name"
              dir="ltr"
              value={cmdName}
              onChange={(e) => setCmdName(e.target.value)}
              placeholder="مثلاً /name"
              className="h-9 text-xs font-mono bg-white"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tg-cmd-nid">دستور «کد ملی»</Label>
            <Input
              id="tg-cmd-nid"
              dir="ltr"
              value={cmdNational}
              onChange={(e) => setCmdNational(e.target.value)}
              placeholder="مثلاً /nationalcode"
              className="h-9 text-xs font-mono bg-white"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tg-cmd-mob">دستور «شماره موبایل»</Label>
            <Input
              id="tg-cmd-mob"
              dir="ltr"
              value={cmdMobile}
              onChange={(e) => setCmdMobile(e.target.value)}
              placeholder="مثلاً /mobile"
              className="h-9 text-xs font-mono bg-white"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tg-cmd-card">دستور «شماره کارت»</Label>
            <Input
              id="tg-cmd-card"
              dir="ltr"
              value={cmdCard}
              onChange={(e) => setCmdCard(e.target.value)}
              placeholder="مثلاً /card"
              className="h-9 text-xs font-mono bg-white"
            />
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground leading-4">
          جریان جستجو: ابتدا دستور انتخاب‌شده به ربات ارسال می‌شود، بعد از چند لحظه مقدار موردنظر کاربر فرستاده می‌شود و پاسخ‌های ربات
          تا سکوت کامل جمع‌آوری و عیناً نمایش داده می‌شود. اگر ربات بدون دستور کار می‌کند، همان دستور خاص ربات را وارد کنید (مثلاً
          <span dir="ltr" className="font-mono"> /start</span>).
        </p>

        <Button
          onClick={save}
          disabled={busy || !botUsername.trim()}
          className="w-full h-10 text-xs font-bold bg-gradient-to-l from-cyan-600 to-sky-500 hover:from-cyan-500 hover:to-sky-400 text-white shadow-[0_6px_18px_-6px_rgba(6,182,212,0.6)]"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
          ذخیره تنظیمات ربات
        </Button>

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[11px] text-rose-700 leading-5">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            {error}
          </div>
        )}
        {success && !error && (
          <div className="flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[11px] text-emerald-700 leading-5">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            {success}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
