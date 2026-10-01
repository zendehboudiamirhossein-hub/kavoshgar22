import type { OsintModuleResult } from './types';
import { safeFetch, fmtNum } from './net';
import { fetchInstagramViaTrackers } from './ig-trackers';
import { fetchHikerProfile } from './hiker';

// ============================================================
// ماژول ردیابی نام کاربری در ۳۴+ پلتفرم (سبک Sherlock)
// هر پلتفرم دو لینک دارد:
//   url  → آدرس بررسی (ممکن است API باشد)
//   page → لینک ورود واقعی پروفایل که به کاربر نمایش داده می‌شود
// تشخیص وجود حساب فقط با نشانگرهای تأییدشده انجام می‌شود تا
// مثبت کاذب (لینک به صفحه ناموجود) نداشته باشیم.
// ============================================================

interface SiteDef {
  name: string;
  /** URL مورد استفاده برای بررسی وجود حساب (ممکن است API باشد) */
  url: (u: string) => string;
  /** URL صفحه واقعی پروفایل که به کاربر نشان داده می‌شود (اختیاری - پیش‌فرض url) */
  page?: (u: string) => string;
  /** تشخیص وجود حساب بر اساس پاسخ HTTP */
  exists?: (r: { status: number; body: string }) => boolean;
  /** بررسی مبتنی بر API - خروجی null یعنی غیرقابل راستی‌آزمایی (مسدود) */
  apiCheck?: (u: string, ctx?: { hikerKey?: string }) => Promise<boolean | null>;
  category: 'social' | 'dev' | 'media' | 'forum' | 'blog' | 'other' | 'gaming';
}

const SITES: SiteDef[] = [
  {
    name: 'GitHub',
    category: 'dev',
    url: (u) => `https://github.com/${u}`,
    exists: (r) => r.status === 200 && !r.body.includes('Not Found'),
  },
  {
    name: 'GitLab',
    category: 'dev',
    url: (u) => `https://gitlab.com/${u}`,
    exists: (r) => r.status === 200 && !r.body.includes('Page not found'),
  },
  {
    name: 'Instagram',
    category: 'social',
    url: (u) => `https://www.instagram.com/${u}/`,
    // بررسی با API رسمی؛ با کلید API (HikerAPI) پاسخ قطعی می‌شود؛ در صورت مسدود بودن، راستی‌آزمایی با ردیاب‌های تحلیلی
    apiCheck: async (u, ctx) => {
      // لایه ۰: HikerAPI با کلید API — پاسخ قطعی موجود/ناموجود بدون مسدودی
      // (کش مشترک با ماژول اینستاگرام: در یک اسکن فقط یک‌بار کریدیت مصرف می‌شود)
      const hikerKey = (ctx?.hikerKey ?? process.env.HIKER_API_KEY ?? '').trim();
      if (hikerKey) {
        try {
          const h = await fetchHikerProfile(u, hikerKey);
          if (h.ok && h.user) return true;
          if (h.error === 'not-found') return false;
          // کلید نامعتبر/کریدیت تمام/شبکه → ادامه با لایه‌های بعدی
        } catch {
          /* fallthrough */
        }
      }
      const r = await safeFetch(
        `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(u)}`,
        {
          headers: {
            'x-ig-app-id': '936619743392459',
            accept: '*/*',
            'accept-language': 'en-US,en;q=0.9',
          },
          timeoutMs: 7000,
        }
      );
      if (r.ok && r.body.trim().startsWith('{')) {
        const j = JSON.parse(r.body);
        return j?.data?.user ? true : false;
      }
      if (r.status === 404) return false;
      // مسدود/محدود → راستی‌آزمایی با داده واقعی ردیاب‌ها (فقط تأیید مثبت؛ ناموجود را نمی‌توان از سکوت ردیاب نتیجه گرفت)
      try {
        const tracker = await fetchInstagramViaTrackers(u);
        if (tracker && (tracker.followers !== undefined || tracker.posts !== undefined)) return true;
      } catch {
        /* ignore */
      }
      return null; // غیرقابل راستی‌آزمایی
    },
  },
  {
    name: 'X (Twitter)',
    category: 'social',
    url: (u) => `https://api.fxtwitter.com/${u}`,
    page: (u) => `https://x.com/${u}`,
    exists: (r) => {
      if (r.status !== 200) return false;
      try {
        const j = JSON.parse(r.body);
        return j?.code === 200;
      } catch {
        return false;
      }
    },
  },
  {
    name: 'Telegram',
    category: 'social',
    url: (u) => `https://t.me/${u}`,
    exists: (r) => r.status === 200 && r.body.includes('tgme_page_title') && !r.body.includes('tgme_page_status'),
  },
  {
    name: 'Reddit',
    category: 'forum',
    url: (u) => `https://www.reddit.com/user/${u}/about.json`,
    page: (u) => `https://www.reddit.com/user/${u}`,
    exists: (r) => r.status === 200 && r.body.includes('"name"'),
  },
  {
    name: 'YouTube',
    category: 'media',
    url: (u) => `https://www.youtube.com/@${u}`,
    exists: (r) => r.status === 200 && (r.body.includes('"channelId"') || r.body.includes('channelHeaderRenderer')),
  },
  {
    name: 'Pinterest',
    category: 'social',
    url: (u) => `https://www.pinterest.com/${u}/`,
    // پروفایل واقعی شامل og:title و full_name است؛ صفحه ناموجود هر دو را ندارد
    exists: (r) => r.status === 200 && r.body.includes('og:title') && r.body.includes('full_name'),
  },
  {
    name: 'TikTok',
    category: 'social',
    url: (u) => `https://www.tiktok.com/@${u}`,
    exists: (r) => r.status === 200 && r.body.includes('"uniqueId"'),
  },
  {
    name: 'Dev.to',
    category: 'dev',
    url: (u) => `https://dev.to/${u}`,
    exists: (r) => r.status === 200 && !r.body.includes('This page does not exist'),
  },
  {
    name: 'npm',
    category: 'dev',
    url: (u) => `https://www.npmjs.com/~${u}`,
    exists: (r) => r.status === 200 && !r.body.includes('Not Found'),
  },
  {
    name: 'Docker Hub',
    category: 'dev',
    url: (u) => `https://hub.docker.com/v2/users/${u}/`,
    page: (u) => `https://hub.docker.com/u/${u}`,
    exists: (r) => r.status === 200 && r.body.includes('"username"'),
  },
  {
    name: 'Mastodon',
    category: 'social',
    url: (u) => `https://mastodon.social/api/v1/accounts/lookup?acct=${u}`,
    page: (u) => `https://mastodon.social/@${u}`,
    exists: (r) => r.status === 200 && r.body.includes('"acct"'),
  },
  {
    name: 'Linktree',
    category: 'other',
    url: (u) => `https://linktr.ee/${u}`,
    exists: (r) => r.status === 200 && r.body.includes('og:title'),
  },
  {
    name: 'Steam',
    category: 'gaming',
    url: (u) => `https://steamcommunity.com/id/${u}`,
    exists: (r) => r.status === 200 && !r.body.includes('The specified profile could not be found'),
  },
  {
    name: 'Twitch',
    category: 'media',
    url: (u) => `https://www.twitch.tv/${u}`,
    exists: (r) => r.status === 200 && r.body.includes('"login"'),
  },
  {
    name: 'SoundCloud',
    category: 'media',
    url: (u) => `https://soundcloud.com/${u}`,
    exists: (r) => r.status === 200 && !r.body.includes('soundcloud:catch-all'),
  },
  {
    name: 'Tumblr',
    category: 'blog',
    url: (u) => `https://${u}.tumblr.com`,
    exists: (r) => r.status === 200 && !r.body.includes('There&#39;s nothing here'),
  },
  {
    name: 'WordPress',
    category: 'blog',
    url: (u) => `https://${u}.wordpress.com`,
    exists: (r) => r.status === 200 && !r.body.includes('Do you want to register'),
  },
  {
    name: 'Blogger',
    category: 'blog',
    url: (u) => `https://${u}.blogspot.com`,
    exists: (r) => r.status === 200 && !r.body.includes('does not exist'),
  },
  {
    name: 'Vimeo',
    category: 'media',
    url: (u) => `https://vimeo.com/${u}`,
    exists: (r) => r.status === 200 && !r.body.includes('Sorry, we couldn'),
  },
  {
    name: 'Dribbble',
    category: 'dev',
    url: (u) => `https://dribbble.com/${u}`,
    exists: (r) => r.status === 200 && !r.body.includes('Whoops, that page is gone'),
  },
  {
    name: 'Behance',
    category: 'dev',
    url: (u) => `https://www.behance.net/${u}`,
    exists: (r) => r.status === 200 && !r.body.includes('Oops! We can'),
  },
  {
    name: 'Keybase',
    category: 'other',
    url: (u) => `https://keybase.io/${u}`,
    exists: (r) => r.status === 200 && !r.body.includes('not a valid user'),
  },
  {
    name: 'Chess.com',
    category: 'gaming',
    url: (u) => `https://api.chess.com/pub/player/${u}`,
    page: (u) => `https://www.chess.com/member/${u}`,
    exists: (r) => r.status === 200 && r.body.includes('"username"'),
  },
  {
    name: 'HackTheBox Forum',
    category: 'forum',
    url: (u) => `https://forum.hackthebox.com/u/${u}.json`,
    page: (u) => `https://forum.hackthebox.com/u/${u}`,
    exists: (r) => r.status === 200 && r.body.includes('"user"'),
  },
  {
    name: 'Wikipedia',
    category: 'forum',
    url: (u) => `https://en.wikipedia.org/wiki/User:${u}`,
    exists: (r) => r.status === 200 && !r.body.includes('noarticletext'),
  },
  {
    name: 'VK',
    category: 'social',
    url: (u) => `https://vk.com/${u}`,
    exists: (r) => r.status === 200 && !r.body.includes('Страница не найдена'),
  },
  {
    name: 'OK.ru',
    category: 'social',
    url: (u) => `https://ok.ru/${u}`,
    exists: (r) => r.status === 200 && !r.body.includes('Страница не найдена'),
  },
  {
    name: 'Replit',
    category: 'dev',
    url: (u) => `https://replit.com/@${u}`,
    exists: (r) => r.status === 200 && !r.body.includes('Page not found'),
  },
  {
    name: 'Codeforces',
    category: 'gaming',
    url: (u) => `https://codeforces.com/api/user.info?handle=${u}`,
    page: (u) => `https://codeforces.com/profile/${u}`,
    exists: (r) => r.status === 200 && r.body.includes('"status":"OK"'),
  },
  {
    name: 'itch.io',
    category: 'gaming',
    url: (u) => `https://${u}.itch.io`,
    exists: (r) => r.status === 200 && !r.body.includes('page not found'),
  },
  {
    name: 'Last.fm',
    category: 'media',
    url: (u) => `https://www.last.fm/user/${u}`,
    exists: (r) => r.status === 200 && !r.body.includes('Page Not Found'),
  },
];

interface FoundSite {
  site: string;
  url: string;
  category: string;
}

export async function usernameModule(
  username: string,
  opts?: { hikerKey?: string }
): Promise<OsintModuleResult> {
  const started = Date.now();
  const u = username.replace(/^@/, '');
  const hikerKey = opts?.hikerKey;

  let unchecked = 0; // پلتفرم‌های غیرقابل راستی‌آزمایی (مثلاً اینستاگرام مسدود)

  const tasks = SITES.map(async (site): Promise<FoundSite | null> => {
    try {
      if (site.apiCheck) {
        const verdict = await site.apiCheck(u, { hikerKey });
        if (verdict === null) {
          unchecked++;
          return null;
        }
        return verdict ? { site: site.name, url: site.page ? site.page(u) : site.url(u), category: site.category } : null;
      }
      const r = await safeFetch(site.url(u), { timeoutMs: 6000 });
      if (site.exists && site.exists({ status: r.status, body: r.body })) {
        // لینک ورود انسانی: در صورت وجود page از آن استفاده کن (مثلاً x.com به جای API)
        return { site: site.name, url: site.page ? site.page(u) : site.url(u), category: site.category };
      }
      return null;
    } catch {
      return null;
    }
  });

  const settled = await Promise.allSettled(tasks);
  const found = settled
    .map((s) => (s.status === 'fulfilled' ? s.value : null))
    .filter((x): x is FoundSite => x !== null);

  const checked = SITES.length - unchecked;
  const catCount: Record<string, number> = {};
  found.forEach((f) => {
    catCount[f.category] = (catCount[f.category] ?? 0) + 1;
  });

  const findings: OsintModuleResult['findings'] = found.map((f) => ({
    label: f.site,
    value: 'حساب شناسایی شد ✓',
    severity: 'medium' as const,
    link: f.url,
  }));

  const notFound = checked - found.length;
  const summaryParts: string[] = [
    `${fmtNum(found.length)} حساب فعال شناسایی شد`,
    `${fmtNum(notFound)} مورد یافت نشد`,
  ];
  if (unchecked > 0) summaryParts.push(`${fmtNum(unchecked)} پلتفرم قابل راستی‌آزمایی قطعی نبود`);

  findings.push({
    label: 'جمع‌بندی',
    value: `${fmtNum(found.length)} حساب از ${fmtNum(checked)} پلتفرم بررسی‌شده — ${summaryParts.slice(1).join(' • ')}`,
    severity: found.length > 5 ? 'high' : found.length > 2 ? 'medium' : 'info',
  });
  if (unchecked > 0) {
    findings.push({
      label: 'راستی‌آزمایی ناموفق',
      value: `${fmtNum(unchecked)} پلتفرم درخواست را مسدود کردند (Cloudflare/Rate-Limit) — برای نتیجه قطعی‌تر دوباره اسکن کنید`,
      severity: 'info',
    });
  }

  const exposure = found.length >= 8 ? 'بالا' : found.length >= 4 ? 'متوسط' : 'پایین';

  return {
    module: 'username',
    title: 'ردیابی نام کاربری (Sherlock)',
    icon: 'Fingerprint',
    status: found.length > 0 ? 'success' : 'partial',
    source: 'live',
    summary: `نام کاربری «${u}» در ${fmtNum(SITES.length)} پلتفرم بررسی شد — ${summaryParts.join(' • ')}. سطح افشای هویت: ${exposure}.`,
    findings,
    metrics: [
      { label: 'حساب‌های یافت‌شده', value: found.length },
      { label: 'پلتفرم‌های بررسی‌شده', value: checked },
      ...Object.entries(catCount).map(([k, v]) => ({ label: 'دسته ' + k, value: v })),
    ],
    raw: { found, checked, unchecked, username: u },
    durationMs: Date.now() - started,
  };
}
