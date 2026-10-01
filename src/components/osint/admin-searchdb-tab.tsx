'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Database,
  UploadCloud,
  FileText,
  Trash2,
  Loader2,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  HardDrive,
  ClipboardPaste,
  Save,
  FastForward,
} from 'lucide-react';

// ============================================================
// تب «دیتابیس جستجو» در پنل مدیریت
// ۱) بارگذاری فایل‌های TXT — چندتکه‌ای، بدون محدودیت حجم، مقاوم به
//    قطعی شبکه (ادامه از محل قطع‌شده با انتخاب دوبارهٔ همان فایل)
// ۲) افزودن دستی متن با چسباندن (Paste) — ساخت فایل جدید یا الحاق
//    به انتهای فایل موجود
// فایل‌ها روی سرور (ولیوم Railway) ذخیره می‌شوند و باکس «شناسایی
// اکانت فیسبوک» صفحه اصلی روی همهٔ آن‌ها جستجو می‌کند.
// ============================================================

// تکهٔ ۱۶ مگابایتی — بسیار زیر سقف ~۱۰۰ مگابایتِ پروکسی Railway
// تا بدنهٔ درخواست هرگز در میانهٔ راه قطع نشود
const CHUNK_SIZE = 16 * 1024 * 1024;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

interface DbFile {
  name: string;
  sizeBytes: number;
  mtimeMs: number;
}

type UploadState = { percent: number; status: 'uploading' | 'done' | 'error'; error?: string; note?: string };

function fmtBytes(n: number): string {
  if (!n || n <= 0) return '۰';
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1073741824) return `${(n / 1048576).toFixed(1)} MB`;
  return `${(n / 1073741824).toFixed(2)} GB`;
}

function fmtDate(ms: number): string {
  try {
    return new Intl.DateTimeFormat('fa-IR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(ms));
  } catch {
    return '';
  }
}

export function SearchDbTab() {
  const [files, setFiles] = useState<DbFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploads, setUploads] = useState<Record<string, UploadState>>({});
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // ---------- وضعیت Paste ----------
  const [pasteText, setPasteText] = useState('');
  const [pasteName, setPasteName] = useState('');
  const [pasteMode, setPasteMode] = useState<'new' | 'append'>('new');
  const [pasteTarget, setPasteTarget] = useState('');
  const [pasteBusy, setPasteBusy] = useState(false);
  const [pasteMsg, setPasteMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const mark = (name: string, st: UploadState) =>
    setUploads((u) => ({ ...u, [name]: st }));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/searchdb');
      const j = await res.json();
      if (!res.ok || j.error) throw new Error(j.error ?? 'خطا در دریافت فهرست');
      setFiles(j.files ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'خطای نامشخص');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // ---------- آپلود چندتکه‌ای قابل ازسرگیری ----------
  // هر تکه با آفست دقیق ارسال می‌شود؛ خطای شبکه فقط همان تکه را
  // دوباره تلاش می‌کند. اگر کل ارتباط قطع شد، دفعهٔ بعد با انتخاب
  // دوبارهٔ همان فایل، سرور از محل .part ادامه می‌دهد.
  const uploadFile = async (file: File) => {
    const enc = encodeURIComponent(file.name);

    // ۱) سرنخ: آیا آپلود قبلیِ همین فایل نیمه‌کاره مانده است؟
    let offset = 0;
    try {
      const probe = await fetch(`/api/admin/searchdb/upload?name=${enc}`);
      if (probe.ok) {
        const j = await probe.json();
        offset = Math.min(Number(j.partSize ?? 0), file.size);
      }
    } catch {
      /* ادامه از صفر */
    }
    const resumed = offset > 0 && offset < file.size;
    mark(file.name, {
      percent: Math.round((offset / file.size) * 100),
      status: 'uploading',
      note: resumed ? `ادامه از ${fmtBytes(offset)}…` : undefined,
    });

    // ۲) ارسال تکه‌به‌تکه با تلاش مجدد خودکار (۵ بار، فاصلهٔ فزاینده)
    while (offset < file.size) {
      const end = Math.min(offset + CHUNK_SIZE, file.size);
      let attempt = 0;
      for (;;) {
        try {
          const res = await fetch(`/api/admin/searchdb/upload?name=${enc}&offset=${offset}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/octet-stream' },
            body: file.slice(offset, end),
          });
          if (res.status === 409) {
            // هم‌گام‌سازی آفست با سرور و ادامه
            const j = await res.json().catch(() => ({}) as { partSize?: number });
            offset = Math.min(Number(j.partSize ?? offset), file.size);
            break;
          }
          if (!res.ok) throw new Error(`پاسخ سرور: ${res.status}`);
          const j = await res.json();
          offset = Math.min(Number(j.received ?? end), file.size);
          break;
        } catch {
          attempt += 1;
          if (attempt >= 5) {
            throw new Error(
              'ارتباط در میانهٔ آپلود قطع شد — دوباره همین فایل را انتخاب کنید تا از محل قطع‌شده ادامه یابد (بخش‌های کامل‌شده دوباره فرستاده نمی‌شوند)'
            );
          }
          await sleep(Math.min(1000 * 2 ** (attempt - 1), 12000));
        }
      }
      mark(file.name, { percent: Math.round((offset / file.size) * 100), status: 'uploading' });
    }

    // ۳) نهایی‌سازی — تغییر نام اتمیک .part به نام اصلی
    const fin = await fetch(`/api/admin/searchdb/upload?name=${enc}&done=1&total=${file.size}`, {
      method: 'POST',
    });
    if (!fin.ok) {
      const j = await fin.json().catch(() => ({}) as { error?: string });
      throw new Error(j.error ?? 'نهایی‌سازی آپلود ناموفق بود');
    }
    mark(file.name, { percent: 100, status: 'done' });
  };

  const handleFiles = async (list: FileList | File[]) => {
    const arr = Array.from(list);
    if (!arr.length) return;
    setUploads((u) => {
      const next = { ...u };
      for (const f of arr) next[f.name] = { percent: 0, status: 'uploading' };
      return next;
    });
    // ترتیبی — تا چند فایل حجیم همزمان RAM/پهنای‌باند را نسوزانند
    for (const f of arr) {
      try {
        await uploadFile(f);
      } catch (e) {
        mark(f.name, {
          percent: 100,
          status: 'error',
          error: e instanceof Error ? e.message : 'آپلود ناموفق بود',
        });
      }
    }
    await load();
    // پاک‌سازی وضعیت آپلودهای موفق بعد از چند ثانیه
    setTimeout(() => {
      setUploads((u) => {
        const next = { ...u };
        for (const f of arr) {
          if (next[f.name]?.status === 'done') delete next[f.name];
        }
        return next;
      });
    }, 4000);
  };

  const removeFile = async (name: string) => {
    if (!window.confirm(`فایل «${name}» حذف شود؟ این عمل قابل بازگشت نیست.`)) return;
    setDeleting(name);
    try {
      const res = await fetch(`/api/admin/searchdb?name=${encodeURIComponent(name)}`, { method: 'DELETE' });
      const j = await res.json();
      if (!res.ok || j.error) throw new Error(j.error ?? 'حذف ناموفق بود');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'خطای نامشخص');
    } finally {
      setDeleting(null);
    }
  };

  // ---------- ذخیرهٔ متن چسبانده‌شده ----------
  const pasteLines = pasteText ? pasteText.split('\n').length : 0;

  const submitPaste = async () => {
    if (pasteBusy) return;
    if (!pasteText.trim()) {
      setPasteMsg({ kind: 'err', text: 'متنی برای ذخیره وارد کنید' });
      return;
    }
    if (pasteMode === 'append' && !pasteTarget) {
      setPasteMsg({ kind: 'err', text: 'فایل مقصد را انتخاب کنید' });
      return;
    }
    const name =
      pasteMode === 'append'
        ? pasteTarget
        : pasteName.trim() || `paste-${new Date().toISOString().slice(0, 10)}.txt`;
    setPasteBusy(true);
    setPasteMsg(null);
    try {
      const params = new URLSearchParams({ name });
      if (pasteMode === 'append') params.set('append', '1');
      const res = await fetch(`/api/admin/searchdb/paste?${params.toString()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        body: pasteText,
      });
      const j = await res.json();
      if (!res.ok || j.error) throw new Error(j.error ?? 'ذخیره ناموفق بود');
      setPasteMsg({
        kind: 'ok',
        text:
          pasteMode === 'append'
            ? `به انتهای «${j.name}» اضافه شد — حجم کل: ${fmtBytes(j.sizeBytes)}`
            : `در فایل «${j.name}» ذخیره شد — حجم: ${fmtBytes(j.sizeBytes)}`,
      });
      setPasteText('');
      setPasteName('');
      await load();
    } catch (e) {
      setPasteMsg({ kind: 'err', text: e instanceof Error ? e.message : 'خطای نامشخص' });
    } finally {
      setPasteBusy(false);
    }
  };

  const totalBytes = files.reduce((a, f) => a + f.sizeBytes, 0);
  const activeUploads = Object.entries(uploads).filter(([, s]) => s.status === 'uploading');
  const errorUploads = Object.entries(uploads).filter(([, s]) => s.status === 'error');

  return (
    <Card className="border-border/80 bg-white soft-shadow">
      <CardContent className="p-3 sm:p-5 space-y-4">
        {/* سربرگ */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-9 h-9 rounded-lg bg-blue-500/10 border border-blue-500/25 flex items-center justify-center shrink-0">
            <Database className="w-4.5 h-4.5 text-blue-600" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-black text-sm sm:text-base leading-tight">دیتابیس جستجو (فایل‌های TXT)</h2>
            <p className="text-[11px] text-muted-foreground leading-5">
              فایل‌ها روی سرور ذخیره می‌شوند و در باکس «شناسایی اکانت فیسبوک» صفحه اصلی برای همه کاربران جستجو می‌شوند —
              در صورت یافتن، کل سطرِ حاوی مورد نمایش داده می‌شود.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="h-8 px-2.5">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            <span className="hidden sm:inline text-xs">به‌روزرسانی</span>
          </Button>
        </div>

        {/* ناحیه آپلود */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files);
          }}
          className={`rounded-xl border-2 border-dashed transition-colors p-5 sm:p-6 text-center ${
            dragOver ? 'border-blue-500/60 bg-blue-500/[0.06]' : 'border-border bg-secondary/30'
          }`}
        >
          <UploadCloud className="w-8 h-8 mx-auto mb-2 text-blue-600/70" />
          <p className="text-xs sm:text-sm font-bold">فایل‌های TXT را اینجا رها کنید یا انتخاب کنید</p>
          <p className="text-[10px] text-muted-foreground mt-1 leading-5">
            بدون محدودیت حجم — ارسال تکه‌تکه (۱۶MB) مقاوم به قطعی شبکه؛ اگر آپلود نیمه‌کاره بماند، با انتخاب دوبارهٔ
            همان فایل از محل قطع‌شده ادامه می‌یابد · چند فایل هم‌زمان
          </p>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".txt,.csv,.log,.tsv,.dat,text/plain"
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) handleFiles(e.target.files);
              e.target.value = '';
            }}
          />
          <Button
            onClick={() => inputRef.current?.click()}
            size="sm"
            className="mt-3 h-9 px-4 font-bold bg-gradient-to-l from-blue-600 to-indigo-500 hover:from-blue-500 hover:to-indigo-400 text-white"
          >
            <UploadCloud className="w-4 h-4" /> انتخاب فایل‌ها
          </Button>
        </div>

        {/* وضعیت آپلودها */}
        {activeUploads.length > 0 && (
          <div className="space-y-2">
            {activeUploads.map(([name, st]) => (
              <div key={name} className="rounded-xl border border-blue-500/25 bg-blue-500/[0.05] px-3.5 py-2.5">
                <div className="flex items-center gap-2 mb-1.5">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600 shrink-0" />
                  <span className="text-[11px] font-bold truncate" dir="ltr">
                    {name}
                  </span>
                  {st.note && (
                    <span className="text-[10px] text-blue-600 flex items-center gap-1 shrink-0">
                      <FastForward className="w-3 h-3" />
                      {st.note}
                    </span>
                  )}
                  <span className="text-[10px] text-muted-foreground ltr-num ms-auto">{st.percent}٪</span>
                </div>
                <div className="h-1.5 rounded-full bg-blue-950/10 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-l from-blue-500 to-indigo-400 transition-all duration-300"
                    style={{ width: `${st.percent}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* خطا / موفقیت آپلود */}
        {errorUploads.length > 0 && (
          <div className="flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-3 text-xs text-rose-700">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              {errorUploads.map(([name, s]) => (
                <p key={name}>
                  <b dir="ltr">{name}</b>: {s.error ?? 'آپلود ناموفق'}
                </p>
              ))}
            </div>
          </div>
        )}
        {Object.values(uploads).some((s) => s.status === 'done') && (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2.5 text-xs text-emerald-700">
            <CheckCircle2 className="w-4 h-4 shrink-0" /> فایل(ها) با موفقیت روی سرور ذخیره شد
          </div>
        )}
        {error && (
          <div className="flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-3 text-xs text-rose-700">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            {error}
          </div>
        )}

        {/* ---------- افزودن دستی متن (Paste) ---------- */}
        <div className="rounded-xl border border-violet-500/25 bg-violet-500/[0.04] p-4 sm:p-5 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-violet-500/10 border border-violet-500/25 flex items-center justify-center shrink-0">
              <ClipboardPaste className="w-4 h-4 text-violet-600" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-xs sm:text-sm font-black leading-tight">افزودن دستی متن (چسباندن از فایل TXT)</h3>
              <p className="text-[10px] text-muted-foreground leading-4 mt-0.5">
                متن را از فایل کپی و اینجا بچسبانید — سطر‌به‌سطر وارد دیتابیس جستجو می‌شود.
              </p>
            </div>
            {/* انتخاب حالت ذخیره */}
            <div className="flex rounded-lg border border-violet-500/30 overflow-hidden text-[11px] font-bold shrink-0">
              <button
                type="button"
                onClick={() => setPasteMode('new')}
                className={`px-3 py-1.5 transition-colors ${
                  pasteMode === 'new' ? 'bg-violet-600 text-white' : 'bg-white text-violet-700 hover:bg-violet-500/10'
                }`}
              >
                فایل جدید
              </button>
              <button
                type="button"
                onClick={() => setPasteMode('append')}
                className={`px-3 py-1.5 transition-colors border-s border-violet-500/30 ${
                  pasteMode === 'append'
                    ? 'bg-violet-600 text-white'
                    : 'bg-white text-violet-700 hover:bg-violet-500/10'
                }`}
              >
                افزودن به فایل موجود
              </button>
            </div>
          </div>

          {/* نام فایل / فایل مقصد */}
          {pasteMode === 'new' ? (
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-[11px] font-bold shrink-0">نام فایل:</label>
              <input
                dir="ltr"
                value={pasteName}
                onChange={(e) => setPasteName(e.target.value)}
                placeholder="paste-1404.txt"
                className="h-9 flex-1 min-w-45 rounded-lg border border-border bg-white px-3 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-violet-500/30"
              />
              <span className="text-[10px] text-muted-foreground">
                خالی بگذارید تا خودکار ساخته شود · اگر هم‌نام موجود باشد، جایگزین می‌شود
              </span>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-[11px] font-bold shrink-0">فایل مقصد:</label>
              <select
                dir="ltr"
                value={pasteTarget}
                onChange={(e) => setPasteTarget(e.target.value)}
                className="h-9 flex-1 min-w-45 rounded-lg border border-border bg-white px-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-violet-500/30"
              >
                <option value="">— انتخاب کنید —</option>
                {files.map((f) => (
                  <option key={f.name} value={f.name}>
                    {f.name} ({fmtBytes(f.sizeBytes)})
                  </option>
                ))}
              </select>
              {files.length === 0 && (
                <span className="text-[10px] text-amber-600 font-bold">
                  هنوز فایلی وجود ندارد — ابتدا حالت «فایل جدید» را انتخاب کنید
                </span>
              )}
            </div>
          )}

          {/* باکس متن */}
          <textarea
            dir="auto"
            rows={7}
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder={'هر خط یک رکورد — مثال:' + '\n' + '09121234567 ali reza tehran' + '\n' + 'user@example.com 1000123'}
            className="w-full rounded-lg border border-border bg-white p-3 font-mono text-xs leading-6 focus:outline-none focus:ring-2 focus:ring-violet-500/30 resize-y"
          />

          <div className="flex flex-wrap items-center gap-2 justify-between">
            <span className="text-[10px] text-muted-foreground ltr-num">
              {pasteLines.toLocaleString('fa-IR')} خط · {pasteText.length.toLocaleString('fa-IR')} نویسه
            </span>
            {pasteText.length > 8_000_000 && (
              <span className="text-[10px] text-amber-600 font-bold">
                حجم چسبانده‌شده بسیار زیاد است — برای فایل‌های حجیم، آپلود مستقیم مطمئن‌تر و سریع‌تر است
              </span>
            )}
            <div className="flex gap-2 ms-auto">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setPasteText('');
                  setPasteMsg(null);
                }}
                disabled={pasteBusy || !pasteText}
                className="h-8"
              >
                پاک کردن
              </Button>
              <Button
                size="sm"
                onClick={submitPaste}
                disabled={pasteBusy || !pasteText.trim() || (pasteMode === 'append' && !pasteTarget)}
                className="h-8 px-4 font-bold bg-gradient-to-l from-violet-600 to-purple-500 hover:from-violet-500 hover:to-purple-400 text-white"
              >
                {pasteBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {pasteMode === 'append' ? 'افزودن به فایل' : 'ذخیره فایل'}
              </Button>
            </div>
          </div>

          {pasteMsg && (
            <div
              className={`flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-xs ${
                pasteMsg.kind === 'ok'
                  ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-700'
                  : 'border border-rose-500/30 bg-rose-500/10 text-rose-700'
              }`}
            >
              {pasteMsg.kind === 'ok' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 shrink-0" />
              )}
              {pasteMsg.text}
            </div>
          )}
        </div>

        {/* فهرست فایل‌ها */}
        <div className="rounded-xl border border-border/70 overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 px-3.5 py-2 bg-secondary/40 border-b border-border/60">
            <FileText className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-[11px] font-bold">فایل‌های ذخیره‌شده</span>
            <Badge variant="outline" className="text-[9px] border-border text-muted-foreground">
              <span className="ltr-num">{files.length}</span> فایل
            </Badge>
            <Badge variant="outline" className="text-[9px] border-border text-muted-foreground gap-1">
              <HardDrive className="w-3 h-3" />
              <span className="ltr-num">{fmtBytes(totalBytes)}</span>
            </Badge>
          </div>
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /> در حال دریافت…
            </div>
          ) : files.length === 0 ? (
            <div className="px-4 py-6 text-center text-xs text-muted-foreground leading-6">
              هنوز فایلی بارگذاری نشده است. فایل‌های TXT دیتابیس را بارگذاری کنید یا متن را در باکس «افزودن دستی»
              بچسبانید.
            </div>
          ) : (
            <div className="divide-y divide-border/40">
              {files.map((f) => (
                <div key={f.name} className="flex items-center gap-2.5 px-3.5 py-2.5">
                  <FileText className="w-4 h-4 text-blue-600/70 shrink-0" />
                  <span className="text-xs font-bold truncate flex-1" dir="ltr">
                    {f.name}
                  </span>
                  <span className="text-[10px] text-muted-foreground ltr-num shrink-0">{fmtBytes(f.sizeBytes)}</span>
                  <span className="text-[10px] text-muted-foreground/70 shrink-0 hidden sm:inline">{fmtDate(f.mtimeMs)}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => removeFile(f.name)}
                    disabled={deleting === f.name}
                    className="h-8 px-2 border-rose-500/25 text-rose-600 hover:bg-rose-500/10 shrink-0"
                    aria-label={`حذف ${f.name}`}
                  >
                    {deleting === f.name ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
