import { safeFetch } from './net';

// ============================================================
// کلاینت HikerAPI (hikerapi.com) — داده مستقیم و قطعی اینستاگرام با کلید API
// احراز هویت: هدر x-access-key
//   POST /v1/user/by/username  {"username": u}  → اطلاعات کامل پروفایل
//   POST /v1/user/medias       {"user_id", "count"} → آخرین پست‌ها (تحلیل تعامل)
// این لایه فقط وقتی کلید موجود است فعال می‌شود؛ بدون کلید هیچ درخواستی
// زده نمی‌شود و در صورت خطا هیچ عددی جعل نمی‌شود — علت شفاف گزارش می‌شود.
// کش اشتراکی بین ماژول اینستاگرام و شرلوک: هر یوزرنیم فقط یک‌بار کریدیت مصرف می‌کند.
// ============================================================

const BASE = 'https://api.hikerapi.com';

export interface HikerUser {
  pk?: number | string;
  username: string;
  fullName?: string;
  biography?: string;
  followers?: number;
  following?: number;
  postsCount?: number;
  isPrivate?: boolean;
  isVerified?: boolean;
  hasBusiness?: boolean;
  externalUrl?: string;
  profilePic?: string;
  category?: string;
}

export interface HikerPost {
  pk?: string | number;
  like: number;
  comment: number;
  date: string;
  caption: string;
}

export interface HikerFan {
  username: string;
  fullName?: string;
  isPrivate?: boolean;
  isVerified?: boolean;
  likes: number;
  comments: number;
  commentTexts: string[];
  score: number;
  profileUrl: string;
}

export interface HikerFansResult {
  ok: boolean;
  fans: HikerFan[];
  postsSampled: number;
  likersTotal: number;
  commentsTotal: number;
  error?: HikerError;
  message?: string;
}

export type HikerError =
  | 'no-key'
  | 'invalid-key'
  | 'no-credits'
  | 'not-found'
  | 'rate-limited'
  | 'network'
  | 'parse';

export interface HikerProfileResult {
  ok: boolean;
  user?: HikerUser;
  posts?: HikerPost[];
  error?: HikerError;
  message?: string;
}

function num(v: unknown): number | undefined {
  if (typeof v === 'number' && isFinite(v)) return Math.round(v);
  if (typeof v === 'string' && v.trim() && isFinite(Number(v.replace(/,/g, '')))) {
    return Math.round(Number(v.replace(/,/g, '')));
  }
  return undefined;
}

/** پارس tolerant کاربر — هم شکل private API اینستاگرام (follower_count) و هم شکل Graph (edge_followed_by.count) */
function mapUser(j: any): HikerUser | null {
  const u = j?.data?.user ?? j?.user ?? j;
  if (!u || typeof u !== 'object') return null;
  const username = u.username ?? u.user?.username;
  if (!username) return null;
  return {
    pk: u.pk ?? u.id,
    username,
    fullName: u.full_name || undefined,
    biography: u.biography || undefined,
    followers: num(u.follower_count) ?? num(u.edge_followed_by?.count) ?? num(u.followers),
    following: num(u.following_count) ?? num(u.edge_follow?.count) ?? num(u.following),
    postsCount: num(u.media_count) ?? num(u.edge_owner_to_timeline_media?.count) ?? num(u.posts),
    isPrivate: typeof u.is_private === 'boolean' ? u.is_private : undefined,
    isVerified: typeof u.is_verified === 'boolean' ? u.is_verified : undefined,
    hasBusiness: !!u.business_category_name || !!u.is_business,
    externalUrl: u.external_url || undefined,
    profilePic: u.profile_pic_url_hd ?? u.profile_pic_url ?? undefined,
    category: u.category || undefined,
  };
}

export function hikerErrorMessage(err: HikerError, extra?: string): string {
  switch (err) {
    case 'no-key':
      return 'کلید API تنظیم نشده است';
    case 'invalid-key':
      return `کلید API نامعتبر است${extra ? ` — ${extra}` : ''}`;
    case 'no-credits':
      return 'اعتبار (کریدیت) کلید API تمام شده است';
    case 'not-found':
      return 'چنین حسابی وجود ندارد (پاسخ قطعی ۴۰۴)';
    case 'rate-limited':
      return 'محدودیت نرخ درخواست — چند لحظه بعد دوباره تلاش کنید';
    case 'network':
      return extra ?? 'اتصال به HikerAPI برقرار نشد';
    case 'parse':
      return extra ?? 'پاسخ HikerAPI قابل تفسیر نبود';
  }
}

async function callHiker(
  path: string,
  key: string,
  params?: Record<string, string | number>,
  body?: unknown
): Promise<{ status: number; json?: any; err?: HikerError; msg?: string }> {
  const qs = params
    ? '?' +
      Object.entries(params)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join('&')
    : '';
  const res = await safeFetch(`${BASE}${path}${qs}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      'x-access-key': key,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
    timeoutMs: 15000,
  });

  if (res.error || res.status === 0) {
    return { status: 0, err: 'network', msg: 'اتصال به HikerAPI برقرار نشد' };
  }

  let json: any;
  const trimmed = res.body.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      json = JSON.parse(trimmed);
    } catch {
      json = undefined;
    }
  }

  const apiMsg = typeof json?.message === 'string' ? json.message : typeof json?.error === 'string' ? json.error : '';

  if (res.status === 401 || res.status === 403) {
    return {
      status: res.status,
      err: /credit|balance|quota|payment/i.test(apiMsg) ? 'no-credits' : 'invalid-key',
      msg: apiMsg,
    };
  }
  if (res.status === 402) return { status: res.status, err: 'no-credits', msg: apiMsg };
  if (res.status === 404) return { status: res.status, err: 'not-found', msg: apiMsg };
  if (res.status === 429) return { status: res.status, err: 'rate-limited', msg: apiMsg };
  if (!res.ok) return { status: res.status, err: 'network', msg: `خطای سرویس HikerAPI (کد ${res.status})` };
  return { status: res.status, json };
}

/** پاسخ‌های HikerAPI ممکن است آرایه ساده، آرایه آرایه (chunk) یا شیء با items/comments باشند */
function flattenItems(json: any, listKeys: string[]): any[] {
  if (Array.isArray(json)) return Array.isArray(json[0]) ? json.flat() : json;
  if (json && typeof json === 'object') {
    for (const k of listKeys) {
      const v = json?.[k] ?? json?.data?.[k];
      if (Array.isArray(v)) return Array.isArray(v[0]) ? v.flat() : v;
    }
  }
  return [];
}

// ────────────────────────────────────────────────────────────
// درگاه اصلی با کش و اشتراک درخواست همزمان
// کلید کش شامل اثر کلید است تا تعویض کلید نتیجه کهنه ندهد
// ────────────────────────────────────────────────────────────
const CACHE_TTL_MS = 10 * 60 * 1000;
const resultCache = new Map<string, { at: number; value: HikerProfileResult }>();
const inFlight = new Map<string, Promise<HikerProfileResult>>();

export async function fetchHikerProfile(username: string, key: string): Promise<HikerProfileResult> {
  const u = username.toLowerCase().replace(/^@/, '').trim();
  const k = key.trim();
  if (!k) return { ok: false, error: 'no-key', message: hikerErrorMessage('no-key') };

  const cacheKey = `${u}:${k.slice(-8)}`;
  const cached = resultCache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value;
  const pending = inFlight.get(cacheKey);
  if (pending) return pending;

  const promise = (async (): Promise<HikerProfileResult> => {
    // ── ۱) اطلاعات پروفایل — فرمت رسمی مستندات: GET با query param ──
    // در صورت ۴۰۴/۴۰۵ یک تلاش POST (بدنه JSON) هم می‌شود تا هر دو شکل API پوشش داده شود
    let r1 = await callHiker('/v1/user/by/username', k, { username: u });
    if (r1.status === 404 || r1.status === 405) {
      const rPost = await callHiker('/v1/user/by/username', k, undefined, { username: u });
      // ۴۰۴ دوم = پاسخ قطعی «حساب وجود ندارد»؛ ۲۰۰ = API فقط POST را می‌پذیرفت
      if (rPost.status !== 404 && rPost.status !== 405) r1 = rPost;
    }
    if (r1.err) {
      return { ok: false, error: r1.err, message: hikerErrorMessage(r1.err, r1.msg) };
    }
    const user = mapUser(r1.json);
    if (!user) {
      return { ok: false, error: 'parse', message: hikerErrorMessage('parse') };
    }

    // ── ۲) آخرین پست‌ها برای تحلیل تعامل (اختیاری — خطا نادیده گرفته می‌شود) ──
    // نکته: /v1/user/medias منسوخ شده است؛ اول /v1/user/medias/chunk (فرمت فعلی) و بعد فرمت قدیمی
    const posts: HikerPost[] = [];
    if (user.pk !== undefined && user.isPrivate !== true) {
      try {
        let r2 = await callHiker('/v1/user/medias/chunk', k, { user_id: String(user.pk) });
        if (r2.status === 404 || r2.status === 405) {
          let rOld = await callHiker('/v1/user/medias', k, { user_id: String(user.pk), count: 12 });
          if (rOld.status === 404 || rOld.status === 405) {
            rOld = await callHiker('/v1/user/medias', k, undefined, { user_id: user.pk, count: 12 });
          }
          if (rOld.status !== 404 && rOld.status !== 405) r2 = rOld;
        }
        if (!r2.err && r2.json) {
          const items = flattenItems(r2.json, ['items', 'medias', 'media']);
          for (const m of items.slice(0, 12)) {
            const like = num(m.like_count) ?? num(m.edge_liked_by?.count) ?? num(m.edge_media_preview_like?.count) ?? 0;
            const comment = num(m.comment_count) ?? num(m.edge_media_to_comment?.count) ?? 0;
            const ts =
              num(m.taken_at_ts) ??
              (typeof m.taken_at === 'string' && Date.parse(m.taken_at)
                ? Math.floor(Date.parse(m.taken_at) / 1000)
                : num(m.taken_at)) ??
              Math.floor(Date.now() / 1000);
            const capText =
              (typeof m.caption_text === 'string' && m.caption_text) ||
              (typeof m.caption === 'object' && m.caption !== null ? m.caption?.text : m.caption) ||
              m.title ||
              '';
            posts.push({
              pk: m.pk,
              like,
              comment,
              date: new Date(ts * 1000).toISOString(),
              caption: String(capText).slice(0, 120),
            });
          }
        }
      } catch {
        /* پست‌ها اختیاری‌اند؛ پروفایل معتبر کافی است */
      }
    }

    return { ok: true, user, posts };
  })();

  inFlight.set(cacheKey, promise);
  try {
    const value = await promise;
    resultCache.set(cacheKey, { at: Date.now(), value });
    return value;
  } finally {
    inFlight.delete(cacheKey);
  }
}

// ────────────────────────────────────────────────────────────
// تحلیل «بیشترین لایک و کامنت» — فن‌های برتر پیج هدف
// برای هر پست: GET /v1/media/likers?id= و GET /v1/media/comments/chunk?id=
// لایکرها/کامنت‌گذاران بر اساس یوزرنیم تجمیع و رتبه‌بندی می‌شوند
// (هر لایک = ۱ امتیاز، هر کامنت = ۲ امتیاز)
// کش مستقل ۱۰ دقیقه‌ای: اسکن مجدد همان هدف کریدیت جدید مصرف نمی‌کند
// ────────────────────────────────────────────────────────────

const fansCache = new Map<string, { at: number; value: HikerFansResult }>();
const fansInFlight = new Map<string, Promise<HikerFansResult>>();

export async function fetchHikerMediaFans(
  username: string,
  key: string,
  mediaIds: Array<string | number>,
  opts?: { maxPosts?: number }
): Promise<HikerFansResult> {
  const k = key.trim();
  const u = username.toLowerCase().replace(/^@/, '').trim();
  if (!k) return { ok: false, fans: [], postsSampled: 0, likersTotal: 0, commentsTotal: 0, error: 'no-key', message: hikerErrorMessage('no-key') };

  const maxPosts = Math.min(Math.max(opts?.maxPosts ?? 6, 1), 12);
  const ids = mediaIds.filter((x) => x !== undefined && x !== null && String(x).trim() !== '').slice(0, maxPosts);
  if (!ids.length) {
    return { ok: false, fans: [], postsSampled: 0, likersTotal: 0, commentsTotal: 0, error: 'parse', message: 'پستی برای تحلیل لایک و کامنت در دسترس نبود' };
  }

  const cacheKey = `${u}:${k.slice(-8)}:${ids.length}`;
  const cached = fansCache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value;
  const pending = fansInFlight.get(cacheKey);
  if (pending) return pending;

  const promise = (async (): Promise<HikerFansResult> => {
    const agg = new Map<string, HikerFan>();
    const ensure = (
      username: unknown,
      fullName?: unknown,
      isPrivate?: unknown,
      isVerified?: unknown
    ): HikerFan | undefined => {
      const uname = typeof username === 'string' ? username.trim() : '';
      if (!uname) return undefined; // لایکرهای مخفی بدون یوزرنیم شمرده نمی‌شوند
      const keyL = uname.toLowerCase();
      let f = agg.get(keyL);
      if (!f) {
        f = {
          username: uname,
          fullName: typeof fullName === 'string' && fullName ? fullName : undefined,
          isPrivate: isPrivate === true,
          isVerified: isVerified === true,
          likes: 0,
          comments: 0,
          commentTexts: [],
          score: 0,
          profileUrl: `https://www.instagram.com/${uname}/`,
        };
        agg.set(keyL, f);
      }
      return f;
    };

    let likersTotal = 0;
    let commentsTotal = 0;
    let postsSampled = 0;

    // پست‌ها به‌ترتیب (ملایم با نرخ سرویس)؛ لایکر و کامنت هر پست موازی
    for (const mid of ids) {
      try {
        const [lk, cm] = await Promise.all([
          callHiker('/v1/media/likers', k, { id: String(mid) }),
          callHiker('/v1/media/comments/chunk', k, { id: String(mid) }),
        ]);
        let touched = false;

        if (!lk.err && lk.json) {
          for (const usr of flattenItems(lk.json, ['users', 'likers'])) {
            const f = ensure(usr.username, usr.full_name, usr.is_private, usr.is_verified);
            if (f) {
              f.likes += 1;
              likersTotal++;
              touched = true;
            }
          }
        }

        if (!cm.err && cm.json) {
          for (const c of flattenItems(cm.json, ['comments'])) {
            const f = ensure(c.user?.username, c.user?.full_name, c.user?.is_private, c.user?.is_verified);
            if (!f) continue;
            f.comments += 1;
            commentsTotal++;
            touched = true;
            const t = String(c.text ?? '').trim();
            if (t && f.commentTexts.length < 3 && !f.commentTexts.includes(t)) {
              f.commentTexts.push(t.slice(0, 100));
            }
          }
        }

        if (touched) postsSampled++;
      } catch {
        /* پست مشکوک رد می‌شود؛ بقیه ادامه پیدا می‌کنند */
      }
    }

    const fans = [...agg.values()]
      .map((f) => ({ ...f, score: f.likes + f.comments * 2 }))
      .sort((a, b) => b.score - a.score || b.likes - a.likes)
      .slice(0, 10);

    return { ok: fans.length > 0, fans, postsSampled, likersTotal, commentsTotal };
  })();

  fansInFlight.set(cacheKey, promise);
  try {
    const value = await promise;
    fansCache.set(cacheKey, { at: Date.now(), value });
    return value;
  } finally {
    fansInFlight.delete(cacheKey);
  }
}

// ────────────────────────────────────────────────────────────
// تست صحت کلید API — فقط یک درخواست سبک پروفایل (بدون پست‌ها)
// برای دکمه «تست کلید» پنل ادمین؛ حداقل کریدیت ممکن مصرف می‌شود
// ────────────────────────────────────────────────────────────

export interface HikerKeyTestResult {
  ok: boolean;
  error?: HikerError;
  message?: string;
  /** یوزرنیم حساب تستی که با موفقیت خوانده شد */
  probe?: string;
}

export async function testHikerKey(key: string): Promise<HikerKeyTestResult> {
  const k = key.trim();
  if (!k) return { ok: false, error: 'no-key', message: hikerErrorMessage('no-key') };

  // حساب رسمی اینستاگرام — همیشه موجود؛ تنها یک درخواست پروفایل زده می‌شود
  const probe = 'instagram';
  try {
    let r = await callHiker('/v1/user/by/username', k, { username: probe });
    if (r.status === 404 || r.status === 405) {
      const rPost = await callHiker('/v1/user/by/username', k, undefined, { username: probe });
      if (rPost.status !== 404 && rPost.status !== 405) r = rPost;
    }
    if (r.err) {
      return { ok: false, error: r.err, message: hikerErrorMessage(r.err, r.msg) };
    }
    const user = mapUser(r.json);
    if (!user) {
      return { ok: false, error: 'parse', message: hikerErrorMessage('parse') };
    }
    return { ok: true, probe, message: `کلید معتبر است — اتصال موفق به HikerAPI (حساب تستی: @${probe})` };
  } catch {
    return { ok: false, error: 'network', message: hikerErrorMessage('network') };
  }
}
