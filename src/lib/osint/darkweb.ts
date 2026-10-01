import type { OsintModuleResult } from './types';
import { safeFetch } from './net';

// ============================================================
// ماژول رصد وب تاریک (Dark Web)
// منبع: Ahmia.fi - موتور جستجوی قانونی ایندکس‌کننده سرویس‌های Onion
// تلاش واقعی برای جستجو؛ در صورت مسدود بودن، لینک‌های دستی ارائه می‌شود
// ============================================================

interface OnionResult {
  title: string;
  onion: string;
  link: string;
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

function parseAhmia(html: string): OnionResult[] {
  const results: OnionResult[] = [];
  // نتایج Ahmia: <li class="result"> ... <h4>...<a href="/onions/XXXX/">Title</a> ...
  const blocks = html.split('<li class="result"').slice(1);
  for (const block of blocks.slice(0, 12)) {
    const href = block.match(/href="(\/onions\/[A-Z2-7]{16}\/?[^"]*)"/i)?.[1];
    const onion = block.match(/\b([a-z2-7]{16}\.onion)\b/i)?.[1];
    const title = decodeEntities(
      block
        .match(/<h4>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/)?.[1]
        ?.replace(/<[^>]+>/g, '')
        .trim() ?? ''
    );
    if (onion) {
      results.push({
        title: title || 'بدون عنوان',
        onion: onion.toLowerCase(),
        link: href ? `https://ahmia.fi${href}` : `https://ahmia.fi/search/?q=${onion}`,
      });
    }
  }
  // ساختار جایگزین: لینک مستقیم onion در body
  if (results.length === 0) {
    const seen = new Set<string>();
    const re = /\b([a-z2-7]{16}\.onion)\b/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      const o = m[1].toLowerCase();
      if (!seen.has(o)) {
        seen.add(o);
        results.push({ title: 'نتیجه فهرست‌نشده', onion: o, link: `https://ahmia.fi/search/?q=${o}` });
        if (results.length >= 10) break;
      }
    }
  }
  return results;
}

export async function darkwebModule(target: string): Promise<OsintModuleResult> {
  const started = Date.now();
  const q = target.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/^@/, '').trim();
  const findings: OsintModuleResult['findings'] = [];

  let results: OnionResult[] = [];
  let reached = false;

  try {
    const r = await safeFetch(`https://ahmia.fi/search/?q=${encodeURIComponent(q)}`, {
      timeoutMs: 10000,
      headers: { 'accept-language': 'en-US,en;q=0.9' },
    });
    if (r.status === 200 && r.body.includes('onion')) {
      reached = true;
      results = parseAhmia(r.body);
    }
  } catch {
    /* fallback پایین */
  }

  const direct = results.filter((x) => x.onion.includes(q.toLowerCase()) || x.title.toLowerCase().includes(q.toLowerCase()));

  if (reached && results.length) {
    results.slice(0, 8).forEach((r) => {
      findings.push({
        label: `Onion • ${r.onion.slice(0, 8)}…`,
        value: r.title.slice(0, 120),
        severity: direct.some((d) => d.onion === r.onion) ? 'high' : 'medium',
        link: r.link,
      });
    });
    findings.push({
      label: 'جمع‌بندی',
      value: `${results.length} سرویس Onion مرتبط یافت شد (${direct.length} مورد تطابق مستقیم با «${q}»)`,
      severity: direct.length > 0 ? 'high' : 'medium',
    });
  } else {
    findings.push({
      label: 'جستجوی دستی Tor Browser',
      value: `Ahmia — موتور جستجوی وب تاریک برای «${q}»`,
      severity: 'info',
      link: `https://ahmia.fi/search/?q=${encodeURIComponent(q)}`,
    });
    findings.push({
      label: 'ایندکس Onionland',
      value: 'کاوش موازی در ایندکس دیگر',
      severity: 'info',
      link: `https://onionlandsearchengine.com/search?q=${encodeURIComponent(q)}`,
    });
    findings.push({
      label: 'LeakSite Monitor',
      value: 'فهرست نشت‌های اعلامی باج‌افزارها',
      severity: 'info',
      link: `https://www.ransomlook.io/recent`,
    });
  }

  const relevance = direct.length;

  return {
    module: 'darkweb',
    title: 'رصد وب تاریک (Dark Web)',
    icon: 'Ghost',
    status: reached ? (results.length > 0 ? 'success' : 'partial') : 'partial',
    source: reached ? 'live' : 'simulated',
    summary: reached
      ? `ایندکس Ahmia جستجو شد — ${results.length} سرویس Onion در خروجی بود و ${relevance} مورد تطابق مستقیم با «${q}» دارد. برای مشاهده محتوای Onion به Tor Browser نیاز است.`
      : `دسترسی به موتور جستجوی وب تاریک از این شبکه ممکن نشد — لینک‌های جستجوی دستی برای استفاده در Tor Browser آماده شد.`,
    findings,
    metrics: [
      { label: 'نتایج Onion', value: results.length },
      { label: 'تطابق مستقیم', value: relevance },
    ],
    raw: { results, reached },
    durationMs: Date.now() - started,
  };
}
