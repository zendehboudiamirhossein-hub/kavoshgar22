import ZAI from 'z-ai-web-dev-sdk';
import { sandboxAiAvailable } from './ai';

// ============================================================
// منبع داده واقعی اینستاگرام — بدون هیچ عدد ساختگی
// لایه ۲-الف: Socialblade با page_reader (داده ساختاریافته کامل)
// لایه ۲-ب: ردیاب‌های ایندکس‌شده در جستجو (instrack، hypeauditor و…)
// فقط دامنه‌های ردیابِ شناخته‌شده پذیرفته می‌شوند؛ متن خبری و
// اعداد تاریخی رد می‌شوند. هیچ عددی در این فایل ساخته نمی‌شود.
// ============================================================

export interface TrackerProfile {
  followers?: number;
  following?: number;
  posts?: number;
  er?: number;
  avgLikes?: number;
  avgComments?: number;
  verified?: boolean;
  fullName?: string;
  domains: string[];
}

/** دامنه‌های مجاز — فقط ردیاب‌های آماری اینستاگرام و خود اینستاگرام */
const TRACKER_DOMAINS: Array<{ domain: string; trust: number }> = [
  { domain: 'instagram.com', trust: 100 },
  { domain: 'instrack.app', trust: 90 },
  { domain: 'instastatistics.com', trust: 88 },
  { domain: 'socialblade.com', trust: 85 },
  { domain: 'followerstat.com', trust: 85 },
  { domain: 'hypeauditor.com', trust: 80 },
  { domain: 'zaver.one', trust: 80 },
  { domain: 'speakrj.com', trust: 75 },
  { domain: 'notjustanalytics.com', trust: 75 },
  { domain: 'socialstatix.com', trust: 70 },
  { domain: 'starngage.com', trust: 70 },
  { domain: 'inbeat.co', trust: 70 },
  { domain: 'instracker.io', trust: 70 },
];

/** تبدیل «679,448,495» یا «679M» یا «4,135» یا «336,700.88» به عدد */
export function parseIgNum(raw: string): number | undefined {
  const m = raw.trim().match(/^([\d.,]+)\s*([KMB])?$/i);
  if (!m) return undefined;
  let n = parseFloat(m[1].replace(/,/g, ''));
  if (!isFinite(n)) return undefined;
  const unit = (m[2] || '').toUpperCase();
  if (unit === 'K') n *= 1e3;
  else if (unit === 'M') n *= 1e6;
  else if (unit === 'B') n *= 1e9;
  n = Math.round(n);
  if (n < 0 || n > 8e9) return undefined;
  return n;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** تطبیق سخت‌گیرانه هویت: فقط @username در متن یا /username/ در URL —
 * کلمهٔ خالی (مثل NASA در بیوی یک کاربر دیگر) به‌هیچ‌وجه تطبیق داده نمی‌شود */
function mentionsUsername(text: string, u: string): boolean {
  // @handle با احتمال فاصله‌گذاری موتور جستجو: «@ nasa»
  const handleRe = new RegExp(`@\\s*${escapeRe(u)}(?![a-z0-9_.])`, 'i');
  if (handleRe.test(text)) return true;
  // مسیر URL: /nasa یا /nasa/ یا /nasa?
  const pathRe = new RegExp(`/${escapeRe(u)}(/|$|\\?)`, 'i');
  return pathRe.test(text);
}

function median(nums: number[]): number | undefined {
  if (!nums.length) return undefined;
  const s = nums.slice().sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

interface Candidate {
  n: number;
  exact: boolean;
  trust: number;
}

/**
 * استخراج مقدار با دو الگو:
 * ۱) عدد قبل از برچسب: «679M followers» ، «679,708,686 followers»
 * ۲) عدد بعد از برچسب: «Followers. 679,448,495» (فرمت instrack/socialblade)
 */
function extractLabelValue(
  text: string,
  beforeRe: RegExp,
  afterRe: RegExp
): { n: number; exact: boolean } | undefined {
  const before = text.match(beforeRe);
  if (before) {
    const n = parseIgNum(before[1]);
    if (n) return { n, exact: /^\d[\d,]*$/.test(before[1].trim()) };
  }
  const after = text.match(afterRe);
  if (after) {
    const n = parseIgNum(after[1]);
    if (n) return { n, exact: /^\d[\d,]*$/.test(after[1].trim()) };
  }
  return undefined;
}

function pick(cands: Candidate[]): number | undefined {
  if (!cands.length) return undefined;
  const exact = cands.filter((c) => c.exact);
  let chosen = exact.length ? exact : cands;
  const med = median(chosen.map((c) => c.n))!;
  // حذف پرت‌ها (بیش از ۳۰٪ فاصله از میانه)
  const inliers = chosen.filter((c) => Math.abs(c.n - med) / med <= 0.3);
  if (inliers.length) chosen = inliers;
  chosen = chosen.slice().sort((a, b) => b.trust - a.trust);
  return median(chosen.map((c) => c.n));
}

// ────────────────────────────────────────────────────────────
// لایه ۲-الف: Socialblade با page_reader — داده ساختاریافته
// ────────────────────────────────────────────────────────────
async function fetchFromSocialblade(u: string, depth = 0): Promise<TrackerProfile | null> {
  // در محیط خودمیزبان (بدون موتور سندباکس) این لایه در دسترس نیست — بدون تلاش بیهوده رد شود
  if (!sandboxAiAvailable()) return null;
  try {
    const zai = await ZAI.create();
    const page = await zai.functions.invoke('page_reader', {
      url: `https://socialblade.com/instagram/user/${encodeURIComponent(u)}`,
    });
    const html = page?.data?.html || '';
    if (!html) throw new Error('empty');
    const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

    // گارد هویت: صفحه باید همان @handle را داشته باشد
    if (!mentionsUsername(text, u)) return null;

    const followers = parseIgNum((text.match(/followers\s*([\d,]+(?:\.\d+)?)/i) || [])[1] ?? '');
    const following = parseIgNum((text.match(/following\s*([\d,]+(?:\.\d+)?)/i) || [])[1] ?? '');
    const posts = parseIgNum((text.match(/media\s*Count\s*([\d,]+(?:\.\d+)?)/i) || [])[1] ?? '');
    const erRaw = (text.match(/engagement\s*Rate\s*([\d.]+)/i) || [])[1];
    const avgLikesRaw = (text.match(/average\s*Likes\s*([\d,]+(?:\.\d+)?)/i) || [])[1];
    const avgCommentsRaw = (text.match(/average\s*Comments\s*([\d,]+(?:\.\d+)?)/i) || [])[1];

    if (followers === undefined && following === undefined && posts === undefined) return null;

    // استخراج نام کامل: ابتدا عبارات قالبی صفحه حذف می‌شوند تا فقط «نام @handle» بماند
    const clean = text
      .replace(/You must be logged in to view Instagram statistics/gi, ' ')
      .replace(/Sign in or Sign up/gi, ' ')
      .replace(/Login to Favorite/gi, ' ')
      .replace(/Refresh stats/gi, ' ')
      .replace(/View on Instagram/gi, ' ')
      .replace(/Login Now/gi, ' ')
      .replace(/\bLogin\b/gi, ' ');
    let fullName: string | undefined;
    const handleIdx = clean.search(new RegExp(`\\@${escapeRe(u)}\\s+Instagram\\b`, 'i'));
    if (handleIdx > -1) {
      // آخرین ۱ تا ۵ کلمهٔ Title-Case قبل از هندل = نام نمایشی
      const before = clean.slice(0, handleIdx).trim();
      const words = before.split(/[\s\u200c]+/);
      const name: string[] = [];
      for (let i = words.length - 1; i >= 0 && name.length < 5; i--) {
        const w = words[i];
        if (!w || /[^A-Za-z0-9.'\-&]/.test(w)) break;
        if (!/^[A-Z0-9]/.test(w)) break;
        name.unshift(w);
      }
      const candidate = name.join(' ');
      if (
        candidate.length >= 2 &&
        candidate.length <= 45 &&
        !/statistics|instagram|socialblade|view|login|stats|analytics|now/i.test(candidate)
      ) {
        fullName = candidate;
      }
    }

    return {
      followers,
      following,
      posts,
      er: erRaw ? Number(parseFloat(erRaw).toFixed(2)) : undefined,
      avgLikes: avgLikesRaw ? parseIgNum(avgLikesRaw) : undefined,
      avgComments: avgCommentsRaw ? parseIgNum(avgCommentsRaw) : undefined,
      fullName,
      domains: ['socialblade.com'],
    };
  } catch {
    // یک تلاش مجدد برای خطای گذرا (محدودیت نرخ page_reader)
    if (depth === 0) {
      await new Promise((r) => setTimeout(r, 1200));
      return fetchFromSocialblade(u, 1);
    }
    return null;
  }
}

// ────────────────────────────────────────────────────────────
// لایه ۲-ب: ردیاب‌های ایندکس‌شده در جستجو — اجماع اعداد
// ────────────────────────────────────────────────────────────
async function fetchFromSearchTrackers(u: string): Promise<TrackerProfile | null> {
  const runSearch = async (): Promise<Array<{ name?: string; url?: string; snippet?: string }>> => {
    if (!sandboxAiAvailable()) return [];
    const zai = await ZAI.create();
    const [r1, r2] = await Promise.allSettled([
      zai.functions.invoke('web_search', { query: `${u} instagram profile statistics`, num: 10 }),
      zai.functions.invoke('web_search', { query: `"${u}" instagram statistics followers following posts`, num: 10 }),
    ]);
    const results: Array<{ name?: string; url?: string; snippet?: string }> = [];
    if (r1.status === 'fulfilled') results.push(...(r1.value ?? []));
    if (r2.status === 'fulfilled') results.push(...(r2.value ?? []));
    return results;
  };

  let results = [] as Array<{ name?: string; url?: string; snippet?: string }>;
  try {
    results = await runSearch();
    if (!results.length) {
      await new Promise((r) => setTimeout(r, 900));
      results = await runSearch();
    }
  } catch {
    return null;
  }
  if (!results.length) return null;

  const followersCand: Candidate[] = [];
  const followingCand: Candidate[] = [];
  const postsCand: Candidate[] = [];
  const erCand: number[] = [];
  const avgLikesCand: number[] = [];
  const domains = new Set<string>();
  let verified = false;
  let fullName: string | undefined;

  for (const r of results) {
    let domain = '';
    try {
      domain = new URL(r.url ?? '').hostname.replace(/^www\./, '');
    } catch {
      continue;
    }
    const tracker = TRACKER_DOMAINS.find((t) => domain === t.domain || domain.endsWith('.' + t.domain));
    if (!tracker) continue; // فقط ردیاب‌ها؛ خبر و مقاله رد می‌شود

    const text = `${r.name ?? ''} ${r.snippet ?? ''}`;
    const url = r.url ?? '';
    // هویت: @handle در متن/عنوان، یا /username/ در مسیر URL
    if (!mentionsUsername(text, u) && !mentionsUsername(url, u)) continue;

    const f = extractLabelValue(
      text,
      /([\d][\d,.]*\s*[KMB]?)\s*Followers/i,
      /Followers\s*[.:·—-]?\s*([\d][\d,.]*\s*[KMB]?)/i
    );
    const w = extractLabelValue(
      text,
      /([\d][\d,.]*\s*[KMB]?)\s*Following/i,
      /Following\s*[.:·—-]?\s*([\d][\d,.]*\s*[KMB]?)/i
    );
    const p = extractLabelValue(
      text,
      /([\d][\d,.]*\s*[KMB]?)\s*(?:Posts|Media\s*Count)/i,
      /(?:Posts|Media\s*Count)\s*[.:·—-]?\s*([\d][\d,.]*\s*[KMB]?)/i
    );

    // ── اعتبارسنجی ساختاری ──
    // اسنیپت ردیابِ واقعی بلوک آماری دارد؛ متن با عدد پراکنده رد می‌شود
    if (/Followers/i.test(text)) {
      if (f) followersCand.push({ ...f, trust: tracker.trust });
      // سقف فالوینگ اینستاگرام ۷,۵۰۰ است؛ عدد بزرگ‌تر یعنی داده پراکنده/غلط
      if (w && w.n <= 10_000) followingCand.push({ ...w, trust: tracker.trust });
      // هیچ حساب اینستاگرامی بیش از ۵ میلیون پست ندارد
      if (p && p.n <= 5_000_000) postsCand.push({ ...p, trust: tracker.trust });
      const e = text.match(/Engagement\s*Rate\s*[.:·—-]?\s*([\d.]+)\s*%?/i);
      if (e) {
        const v = parseFloat(e[1]);
        if (isFinite(v) && v >= 0 && v <= 100) erCand.push(v);
      }
      const al = text.match(/Average\s*Likes\s*[.:·—-]?\s*([\d][\d,.]*)/i);
      if (al) {
        const v = parseIgNum(al[1]);
        if (v && v <= 5e8) avgLikesCand.push(v);
      }
    }
    domains.add(tracker.domain);

    if (/verified/i.test(r.snippet ?? '') && (f || w)) verified = true;

    // نام کامل فقط از خود اینستاگرام: «Cristiano Ronaldo (@cristiano)»
    if (!fullName && tracker.domain === 'instagram.com' && r.name) {
      const nm = r.name.match(new RegExp(`^([^@()]+?)\\s*\\(@${escapeRe(u)}\\)`, 'i'));
      if (nm) fullName = nm[1].trim();
    }
  }

  const followers = pick(followersCand);
  const following = pick(followingCand);
  const posts = pick(postsCand);
  const er = erCand.length ? Number(median(erCand)!.toFixed(2)) : undefined;
  const avgLikes = avgLikesCand.length ? median(avgLikesCand) : undefined;

  if (followers === undefined && following === undefined && posts === undefined && avgLikes === undefined && !fullName) {
    return null;
  }

  return {
    followers,
    following,
    posts,
    er,
    avgLikes,
    verified: verified ? true : undefined,
    fullName,
    domains: [...domains].slice(0, 4),
  };
}

/** ادغام دو لایه: اعداد ساختاریافته socialblade اولویت دارند؛ بقیه مکمل */
function mergeProfiles(a: TrackerProfile | null, b: TrackerProfile | null): TrackerProfile | null {
  if (!a) return b;
  if (!b) return a;
  return {
    followers: a.followers ?? b.followers,
    following: a.following ?? b.following,
    posts: a.posts ?? b.posts,
    er: a.er ?? b.er,
    avgLikes: a.avgLikes ?? b.avgLikes,
    avgComments: a.avgComments ?? b.avgComments,
    verified: a.verified || b.verified ? true : undefined,
    fullName: a.fullName || b.fullName,
    domains: [...new Set([...a.domains, ...b.domains])].slice(0, 4),
  };
}

// ────────────────────────────────────────────────────────────
// درگاه اصلی با کش و اشتراک درخواست همزمان
// (ماژول اینستاگرام و شرلوک برای یک یوزرنیم فقط یک‌بار جستجو می‌کنند)
// ────────────────────────────────────────────────────────────
const CACHE_TTL_MS = 10 * 60 * 1000;
const resultCache = new Map<string, { at: number; value: TrackerProfile | null }>();
const inFlight = new Map<string, Promise<TrackerProfile | null>>();

export function fetchInstagramViaTrackers(username: string): Promise<TrackerProfile | null> {
  const u = username.toLowerCase().replace(/^@/, '');
  const cached = resultCache.get(u);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return Promise.resolve(cached.value);

  const pending = inFlight.get(u);
  if (pending) return pending;

  const promise = (async () => {
    // هر دو لایه موازی؛ حداکثر زمان = کندترین لایه
    const [sb, search] = await Promise.allSettled([fetchFromSocialblade(u), fetchFromSearchTrackers(u)]);
    const sbP = sb.status === 'fulfilled' ? sb.value : null;
    const seP = search.status === 'fulfilled' ? search.value : null;
    const merged = mergeProfiles(sbP, seP);
    if (!merged) return null;
    // بدون هیچ عدد واقعی، پروفایل معنادار نیست
    if (merged.followers === undefined && merged.posts === undefined && merged.following === undefined) {
      return null;
    }
    return merged;
  })()
    .then((value) => {
      resultCache.set(u, { at: Date.now(), value });
      return value;
    })
    .finally(() => {
      inFlight.delete(u);
    });

  inFlight.set(u, promise);
  return promise;
}
