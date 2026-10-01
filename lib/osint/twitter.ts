import type { OsintModuleResult } from './types';
import { safeFetch, fmtNum, fmtDate, engagementRate } from './net';

// ============================================================
// ماژول اوسینت توییتر / X — ۱۰۰٪ داده واقعی، بدون هیچ عدد ساختگی
// منابع: API عمومی fxtwitter و vxtwitter (بدون نیاز به کلید)
// در صورت در دسترس نبودن منابع، وضعیت شفاف گزارش می‌شود
// ============================================================

interface TwData {
  username: string;
  displayName: string;
  description: string;
  location: string;
  followers?: number;
  following?: number;
  tweetCount?: number;
  verified?: boolean;
  createdAt: string;
  avatar: string;
  banner: string;
}

/** پارس دفاعی پاسخ آینه‌های توییتر — داده بدون فالوور معتبر، «شِل» تلقی می‌شود */
function parseMirrorUser(j: any, u: string): TwData | null {
  const user = j?.user ?? j;
  if (!user || (j?.code !== undefined && j.code !== 200)) return null;
  const screenName: string = user.screen_name ?? user.screenName ?? '';
  if (!screenName || screenName.toLowerCase() !== u.toLowerCase()) return null;

  // فرمت fxtwitter: followers/following/tweets/joined — فرمت قدیمی: followers_count/...
  const num = (v: unknown): number | undefined => (typeof v === 'number' && isFinite(v) ? v : undefined);
  const followers = num(user.followers) ?? num(user.followers_count);
  const following = num(user.following) ?? num(user.following_count);
  const tweetCount = num(user.tweets) ?? num(user.statuses_count);
  // شِل: همه شمارنده‌ها غایب‌اند — این پاسخ قابل اتکا نیست
  if (followers === undefined && following === undefined && tweetCount === undefined) return null;

  return {
    username: screenName,
    displayName: user.name ?? '',
    description: user.description ?? '',
    location: user.location ?? '',
    followers,
    following,
    tweetCount,
    verified: user.verified === true || user.is_blue_built_in === true ? true : undefined,
    createdAt: user.joined ?? user.created_at ?? user.createdAt ?? '',
    avatar: user.avatar_url ?? user.avatarUrl ?? '',
    banner: user.banner_url ?? user.bannerUrl ?? '',
  };
}

export async function twitterModule(username: string): Promise<OsintModuleResult> {
  const started = Date.now();
  const u = username.replace(/^@/, '');
  let source: 'live' | 'unavailable' = 'unavailable';
  let data: TwData | null = null;
  let error: string | undefined;
  let notFound = false;

  // منبع ۱ و ۲: آینه‌های عمومی fxtwitter و vxtwitter
  const mirrors: Array<{ name: string; url: string }> = [
    { name: 'fxtwitter', url: `https://api.fxtwitter.com/${encodeURIComponent(u)}` },
    { name: 'vxtwitter', url: `https://api.vxtwitter.com/${encodeURIComponent(u)}` },
  ];

  for (const m of mirrors) {
    if (data) break;
    try {
      const res = await safeFetch(m.url, { timeoutMs: 8000 });
      if (res.ok && res.body.trim().startsWith('{')) {
        const j = JSON.parse(res.body);
        if (j?.code === 404 || j?.code === 50241) {
          notFound = true;
          break;
        }
        const parsed = parseMirrorUser(j, u);
        if (parsed) {
          source = 'live';
          data = parsed;
        } else {
          error = `پاسخ ناقص از ${m.name}`;
        }
      } else if (res.status === 404) {
        notFound = true;
        break;
      } else {
        error = `دسترسی به ${m.name} ناموفق (کد ${res.status || 'شبکه'})`;
      }
    } catch {
      error = `اتصال به ${m.name} برقرار نشد`;
    }
  }

  // ─── حساب یافت نشد (پاسخ قطعی آینه) ───
  if (notFound) {
    return {
      module: 'twitter',
      title: 'تحلیل توییتر (X)',
      icon: 'Twitter',
      status: 'failed',
      source: 'live',
      summary: `حساب @${u} در توییتر (X) یافت نشد یا تعلیق شده است.`,
      findings: [
        { label: 'نام کاربری', value: '@' + u },
        { label: 'وضعیت', value: 'حساب یافت نشد (۴۰۴ از منبع)', severity: 'high' },
        { label: 'لینک صفحه', value: `https://x.com/${u}`, link: `https://x.com/${u}` },
      ],
      raw: { username: u, exists: false },
      durationMs: Date.now() - started,
      error: 'حساب در توییتر یافت نشد',
    };
  }

  // ─── در دسترس نبودن شفاف (بدون هیچ عدد ساختگی) ───
  if (!data) {
    return {
      module: 'twitter',
      title: 'تحلیل توییتر (X)',
      icon: 'Twitter',
      status: 'partial',
      source: 'unavailable',
      summary: `داده واقعی برای @${u} از آینه‌های توییتر در دسترس نبود و هیچ عددی نمایش داده نمی‌شود. برای نتیجه قطعی، اجرا از IP مسکونی یا اتصال API رسمی X توصیه می‌شود.`,
      findings: [
        { label: 'نام کاربری', value: '@' + u },
        { label: 'دنبال‌کننده', value: 'در دسترس نیست', severity: 'info' },
        { label: 'تعداد توییت', value: 'در دسترس نیست', severity: 'info' },
        { label: 'علت', value: error ?? 'پاسخ نامعتبر از آینه‌های توییتر', severity: 'medium' },
        { label: 'لینک صفحه', value: `https://x.com/${u}`, link: `https://x.com/${u}` },
      ],
      raw: { username: u, available: false },
      durationMs: Date.now() - started,
      error: error ?? 'داده واقعی در دسترس نبود',
    };
  }

  // ─── ساخت خروجی از داده واقعی ───
  const findings: OsintModuleResult['findings'] = [
    { label: 'نام کاربری', value: '@' + data.username },
    { label: 'نام نمایشی', value: data.displayName || '—' },
    { label: 'بیوگرافی', value: data.description ? data.description.slice(0, 200) : '—' },
    { label: 'موقعیت مکانی (خوداظهاری)', value: data.location || '—', severity: 'medium' },
    {
      label: 'دنبال‌کننده',
      value: data.followers !== undefined ? fmtNum(data.followers) : 'در دسترس نیست',
    },
    {
      label: 'دنبال‌شده',
      value: data.following !== undefined ? fmtNum(data.following) : 'در دسترس نیست',
    },
    {
      label: 'تعداد توییت',
      value: data.tweetCount !== undefined ? fmtNum(data.tweetCount) : 'در دسترس نیست',
    },
    { label: 'تاریخ عضویت', value: data.createdAt ? fmtDate(data.createdAt) : '—' },
    {
      label: 'وضعیت تأیید',
      value: data.verified === true ? 'تأییدشده ✓' : 'خیر/نامشخص',
    },
    { label: 'لینک صفحه', value: `https://x.com/${u}`, link: `https://x.com/${u}` },
  ];

  // شاخص بات فقط با داده کامل و واقعی
  const haveFull = data.followers !== undefined && data.tweetCount !== undefined;
  const botScore = haveFull
    ? data.tweetCount! > 10000 && data.followers! < 200
      ? 85
      : Math.min(95, Math.max(5, Math.round((data.tweetCount! / Math.max(data.followers!, 1)) * 40)))
    : undefined;

  if (botScore !== undefined) {
    findings.push({
      label: 'شاخص فعالیت باتی',
      value: botScore + '/100',
      severity: (botScore > 60 ? 'high' : botScore > 35 ? 'medium' : 'low') as 'high',
    });
  }

  const metrics: OsintModuleResult['metrics'] = [];
  if (data.followers !== undefined) metrics.push({ label: 'فالوور', value: data.followers });
  if (data.following !== undefined) metrics.push({ label: 'فالوینگ', value: data.following });
  if (data.tweetCount !== undefined) metrics.push({ label: 'توییت‌ها', value: data.tweetCount });
  if (botScore !== undefined) metrics.push({ label: 'شاخص بات', value: botScore });

  const summary = haveFull
    ? `پروفایل واقعی @${u} دریافت شد — ${fmtNum(data.followers)} فالوور و ${fmtNum(data.tweetCount)} توییت. شاخص فعالیت باتی: ${botScore}/100`
    : `داده واقعی @${u} از آینه توییتر دریافت شد — برخی شمارنده‌ها در دسترس نبودند`;

  return {
    module: 'twitter',
    title: 'تحلیل توییتر (X)',
    icon: 'Twitter',
    status: 'success',
    source,
    summary,
    findings,
    metrics,
    timeline: undefined,
    raw: { ...data, botScore },
    durationMs: Date.now() - started,
    error,
  };
}
