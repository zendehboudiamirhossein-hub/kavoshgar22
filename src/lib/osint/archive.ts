import type { OsintModuleResult } from './types';
import { safeFetch, fmtNum, fmtDate } from './net';

// ============================================================
// ماژول آرشیو وب Wayback Machine (واقعی)
// API عمومی CDX + Availability بدون احراز هویت
// ============================================================

interface Snap {
  ts: string;
  status: string;
  original: string;
}

export async function archiveModule(domain: string): Promise<OsintModuleResult> {
  const started = Date.now();
  const findings: OsintModuleResult['findings'] = [];

  // سال‌شمار اسنپ‌شات‌ها (collapse=timestamp:4 یعنی یکی به ازای هر سال)
  const cdx = await safeFetch(
    `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(domain)}&output=json&fl=timestamp,statuscode,original&collapse=timestamp:4&limit=60`,
    { timeoutMs: 12000 }
  );

  // دسترسی سریع به نزدیک‌ترین اسنپ‌شات
  const avail = await safeFetch(
    `https://archive.org/wayback/available?url=${encodeURIComponent(domain)}`,
    { timeoutMs: 8000 }
  );

  // اگر هر دو درخواست در سطح شبکه شکست خوردند، آرشیو از این شبکه در دسترس نیست
  const networkBlocked = (cdx.status === 0 && avail.status === 0) || (cdx.status === 0 && !cdx.body && avail.status === 403);

  let snapshots: Snap[] = [];
  try {
    if (cdx.body.trim().startsWith('[')) {
      const arr = JSON.parse(cdx.body) as string[][];
      snapshots = arr.slice(1).map((row) => ({ ts: row[0], status: row[1], original: row[2] }));
    }
  } catch {
    /* parse error */
  }

  let closestUrl = '';
  let closestTs = '';
  try {
    if (avail.body.trim().startsWith('{')) {
      const j = JSON.parse(avail.body);
      const c = j?.archived_snapshots?.closest;
      if (c?.url) {
        closestUrl = String(c.url).replace(/^http:/, 'https:');
        closestTs = String(c.timestamp ?? '');
      }
    }
  } catch {
    /* ignore */
  }

  const totalKnown =
    // شمارش دقیق‌تر با یک درخواست سبک فقط شمارش ردیف‌ها
    snapshots.length;

  if (networkBlocked) {
    return {
      module: 'archive',
      title: 'آرشیو وب (Wayback Machine)',
      icon: 'Archive',
      status: 'failed',
      source: 'live',
      summary: `اتصال به سرورهای archive.org از این شبکه برقرار نشد — سرویس آرشیو موقتاً در دسترس نیست.`,
      findings: [
        { label: 'نتیجه', value: 'اتصال به Wayback Machine برقرار نشد (مسدودی شبکه)', severity: 'info' },
        { label: 'جستجوی دستی', value: 'مرور تاریخی دامنه در آرشیو', severity: 'info', link: `https://web.archive.org/web/*/${domain}/*` },
      ],
      metrics: [{ label: 'سال‌های آرشیو', value: 0 }],
      durationMs: Date.now() - started,
      error: 'web.archive.org از این شبکه در دسترس نیست',
    };
  }

  if (totalKnown === 0 && !closestUrl) {
    return {
      module: 'archive',
      title: 'آرشیو وب (Wayback Machine)',
      icon: 'Archive',
      status: 'partial',
      source: 'live',
      summary: `هیچ اسنپ‌شات آرشیوی برای «${domain}» یافت نشد — یا دامنه جدید است یا هرگز شاخص نشده.`,
      findings: [
        { label: 'اسنپ‌شات آرشیو', value: 'یافت نشد', severity: 'info' },
        { label: 'نتیجه‌گیری', value: 'تاریخچه عمومی قابل بازیابی وجود ندارد', severity: 'info' },
      ],
      metrics: [{ label: 'سال‌های آرشیو', value: 0 }],
      durationMs: Date.now() - started,
    };
  }

  const first = snapshots[0];
  const last = snapshots[snapshots.length - 1];

  if (first) {
    const f = first.ts;
    findings.push({
      label: 'اولین آرشیو ثبت‌شده',
      value: `${f.slice(0, 4)}/${f.slice(4, 6)}/${f.slice(6, 8)} — وضعیت ${first.status}`,
      severity: 'medium',
      link: `https://web.archive.org/web/${f}/${first.original}`,
    });
  }
  if (last) {
    const l = last.ts;
    findings.push({
      label: 'آخرین آرشیو ثبت‌شده',
      value: `${l.slice(0, 4)}/${l.slice(4, 6)}/${l.slice(6, 8)} — وضعیت ${last.status}`,
      severity: 'medium',
      link: `https://web.archive.org/web/${l}/${last.original}`,
    });
  }
  if (closestUrl) {
    findings.push({
      label: 'نزدیک‌ترین نسخه ذخیره‌شده',
      value: 'آخرین نسخه موجود از صفحه اصلی سایت',
      severity: 'low',
      link: closestUrl,
    });
  }
  findings.push({
    label: 'کاوشگر آرشیو',
    value: `مرور کامل تاریخی دامنه ${domain}`,
    severity: 'info',
    link: `https://web.archive.org/web/*/${domain}/*`,
  });

  const years = snapshots.map((s) => s.ts.slice(0, 4));
  const spanYears = years.length > 1 ? Number(years[years.length - 1]) - Number(years[0]) + 1 : years.length ? 1 : 0;

  return {
    module: 'archive',
    title: 'آرشیو وب (Wayback Machine)',
    icon: 'Archive',
    status: 'success',
    source: 'live',
    summary: `دامنه «${domain}» از سال ${first ? first.ts.slice(0, 4) : '—'} تا ${last ? last.ts.slice(0, 4) : '—'} در آرشیو ثبت شده است (${fmtNum(totalKnown)} سال نمونه‌برداری‌شده، بازه ${fmtNum(spanYears)} ساله). نسخه‌های قدیمی ممکن است حذف‌شده‌ها را افشا کنند.`,
    findings,
    metrics: [
      { label: 'سال‌های آرشیو', value: totalKnown },
      { label: 'بازه آرشیو (سال)', value: spanYears },
    ],
    timeline: snapshots
      .filter((s) => s.status.startsWith('2') || s.status.startsWith('3'))
      .map((s) => ({
        date: `${s.ts.slice(0, 4)}-06-01`,
        label: `اسنپ‌شات ${s.ts.slice(0, 4)}`,
        value: 1,
      })),
    raw: { snapshots, closestUrl, closestTs },
    durationMs: Date.now() - started,
  };
}
