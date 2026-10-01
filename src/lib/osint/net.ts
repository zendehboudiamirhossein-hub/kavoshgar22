// ============================================================
// ابزارهای مشترک شبکه برای ماژول‌های اوسینت
// ============================================================

export const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

export interface FetchOutcome {
  ok: boolean;
  status: number;
  body: string;
  headers: Record<string, string>;
  error?: string;
  durationMs: number;
}

/** fetch با تایم‌اوت و مدیریت خطا - مناسب محیط‌های محدود */
export async function safeFetch(
  url: string,
  opts: {
    method?: string;
    headers?: Record<string, string>;
    timeoutMs?: number;
    body?: string;
  } = {}
): Promise<FetchOutcome> {
  const started = Date.now();
  const { method = 'GET', headers = {}, timeoutMs = 6000, body } = opts;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, {
      method,
      headers: { 'user-agent': UA, ...headers },
      signal: controller.signal,
      redirect: 'follow',
      body,
    });
    clearTimeout(timer);
    const outHeaders: Record<string, string> = {};
    res.headers.forEach((v, k) => {
      outHeaders[k.toLowerCase()] = v;
    });
    const reader = res.body?.getReader();
    let text = '';
    if (reader) {
      const chunks: Uint8Array[] = [];
      let total = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(value);
          total += value.length;
          if (total > 512 * 1024) break; // سقف ۵۱۲ کیلوبایت
        }
      }
      text = Buffer.concat(chunks).toString('utf-8');
      try {
        await reader.cancel();
      } catch {
        /* ignore */
      }
    }
    return { ok: res.ok, status: res.status, body: text, headers: outHeaders, durationMs: Date.now() - started };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, status: 0, body: '', headers: {}, error: msg, durationMs: Date.now() - started };
  }
}

/** تبدیل عدد به فرمت فارسی‌خوان */
export function fmtNum(n: number | undefined | null): string {
  if (n === undefined || n === null) return '—';
  return new Intl.NumberFormat('en-US').format(n);
}

/** تاریخ شمسی‌سازی ساده (میلادی خوانا) */
export function fmtDate(d: string | number | Date | undefined | null): string {
  if (!d) return '—';
  try {
    const date = new Date(d);
    return new Intl.DateTimeFormat('fa-IR', { year: 'numeric', month: 'long', day: 'numeric' }).format(date);
  } catch {
    return String(d);
  }
}

/** درصد تعامل (Engagement Rate) */
export function engagementRate(likes: number, comments: number, followers: number): number {
  if (!followers) return 0;
  return Number((((likes + comments) / followers) * 100).toFixed(2));
}
