import type { OsintModuleResult } from './types';
import { safeFetch, fmtNum, fmtDate } from './net';

// ============================================================
// ماژول رصد اخبار و رسانه‌ها (واقعی)
// منبع: RSS رسمی Google News - جستجوی زنجیره‌ای چند کوئری
// ============================================================

interface NewsItem {
  title: string;
  link: string;
  source: string;
  date: string;
}

function stripCdata(s: string): string {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

function parseRss(xml: string, limit: number): NewsItem[] {
  const items: NewsItem[] = [];
  const blocks = xml.split(/<item>/).slice(1);
  for (const block of blocks.slice(0, limit)) {
    const title = decodeEntities(stripCdata(block.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? ''));
    const link = stripCdata(block.match(/<link>([\s\S]*?)<\/link>/)?.[1] ?? '');
    const pubDate = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] ?? '';
    const source = decodeEntities(stripCdata(block.match(/<source[^>]*>([\s\S]*?)<\/source>/)?.[1] ?? 'رسانه'));
    if (title && link) {
      items.push({ title, link, source, date: pubDate });
    }
  }
  return items;
}

export async function newsModule(target: string, targetType: string): Promise<OsintModuleResult> {
  const started = Date.now();
  const q = target.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/^@/, '').trim();
  const findings: OsintModuleResult['findings'] = [];

  // چند کوئری موازی برای پوشش بیشتر
  const queries = [
    { label: 'بین‌المللی', url: `https://news.google.com/rss/search?q=${encodeURIComponent(`"${q}"`)}&hl=en-US&gl=US&ceid=US:en` },
    { label: 'فارسی', url: `https://news.google.com/rss/search?q=${encodeURIComponent(`"${q}"`)}&hl=fa&gl=IR&ceid=IR:fa` },
  ];

  const all: NewsItem[] = [];
  const settled = await Promise.allSettled(
    queries.map(async (qq) => {
      const r = await safeFetch(qq.url, { timeoutMs: 8000 });
      if (!r.ok && !r.body) return [];
      return parseRss(r.body, 12).map((n) => ({ ...n, lang: qq.label }));
    })
  );
  let networkError = false;
  for (const s of settled) {
    if (s.status === 'fulfilled') {
      (s.value as (NewsItem & { lang?: string })[]).forEach((n) => all.push(n));
    } else {
      networkError = true;
    }
  }

  // حذف تکراری بر اساس عنوان
  const seen = new Set<string>();
  const unique = all.filter((n) => {
    const k = n.title.toLowerCase().slice(0, 80);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  unique.slice(0, 10).forEach((n) => {
    findings.push({
      label: `${n.source}${n.date ? ` • ${fmtDate(n.date)}` : ''}`,
      value: n.title,
      severity: 'medium',
      link: n.link,
    });
  });

  const total = unique.length;
  findings.push({
    label: 'جمع‌بندی',
    value: total
      ? `${fmtNum(total)} اشاره خبری برای «${q}» ثبت شد — قدیمی‌ترین و جدیدترین موارد بالا`
      : 'هیچ اشاره خبری شاخصی در Google News یافت نشد',
    severity: total > 10 ? 'high' : total > 0 ? 'medium' : 'info',
  });

  return {
    module: 'news',
    title: 'رصد اخبار و رسانه‌ها',
    icon: 'Newspaper',
    status: total > 0 ? 'success' : networkError ? 'failed' : 'partial',
    source: 'live',
    summary: total
      ? `نام هدف در ${fmtNum(total)} عنوان خبری از رسانه‌های جهانی و فارسی‌زبان شناسایی شد. بررسی تیترها برای ارزیابی شهرت، رسوایی یا رخدادهای امنیتی توصیه می‌شود.`
      : networkError
        ? 'اتصال به سرویس اخبار برقرار نشد — در زمان دیگر تلاش کنید.'
        : `اشاره خبری مستقیمی برای «${q}» در Google News شاخص نشده است — برای اشخاص کم‌شتاب رسانه‌ای طبیعی است.`,
    findings,
    metrics: [
      { label: 'اشاره خبری', value: total },
      { label: 'منبع ورودی', value: queries.length },
    ],
    timeline: unique
      .slice(0, 20)
      .map((n) => ({ date: n.date, label: n.title.slice(0, 40), value: 1 }))
      .filter((t) => t.date),
    raw: { items: unique.slice(0, 20) },
    durationMs: Date.now() - started,
  };
}
