import type { OsintModuleResult } from './types';
import { safeFetch, fmtNum, engagementRate } from './net';
import { fetchInstagramViaTrackers } from './ig-trackers';
import { fetchHikerProfile, fetchHikerMediaFans, hikerErrorMessage, type HikerError, type HikerFansResult } from './hiker';

// ============================================================
// ماژول اوسینت اینستاگرام — ۱۰۰٪ داده واقعی، بدون هیچ عدد ساختگی
// لایه ۰: HikerAPI با کلید API کاربر (قطعی‌ترین مسیر — پروفایل + پست + ER)
// لایه ۱: API عمومی اینستاگرام (کامل‌ترین داده: پست، لایک، ER)
// لایه ۲: ردیاب‌های تحلیلی ایندکس‌شده (فالوور/فالوینگ/پست واقعی)
// لایه ۳: در دسترس نبودن شفاف — هیچ عددی جعل نمی‌شود
// ============================================================

interface IgPost {
  pk?: string | number; // شناسه پست برای استخراج لایکر/کامنت از API
  like: number;
  comment: number;
  date: string;
  caption: string;
}

interface IgData {
  username: string;
  fullName: string;
  biography: string;
  followers?: number;
  following?: number;
  postsCount?: number;
  isPrivate?: boolean;
  isVerified?: boolean;
  hasBusiness?: boolean;
  externalUrl: string;
  profilePic: string;
  posts: IgPost[];
  avgLikes?: number;
  avgComments?: number;
  er?: number;
  trackerDomains: string[];
}

function profileLink(u: string) {
  return `https://www.instagram.com/${u}/`;
}

export async function instagramModule(
  username: string,
  opts?: { hikerKey?: string }
): Promise<OsintModuleResult> {
  const started = Date.now();
  const u = username.toLowerCase().replace(/^@/, '');
  let source: 'live' | 'tracker' | 'unavailable' = 'unavailable';
  let data: IgData | null = null;
  let error: string | undefined;
  let hikerNote: string | undefined; // اگر کلید بود ولی جواب نگرفت، علت شفاف گزارش می‌شود
  let viaHiker = false;
  let fansResult: HikerFansResult | null = null;
  const hikerKey = (opts?.hikerKey ?? process.env.HIKER_API_KEY ?? '').trim();

  // ─── لایه ۰: HikerAPI با کلید API (داده مستقیم و قطعی اینستاگرام) ───
  if (hikerKey) {
    try {
      const h = await fetchHikerProfile(u, hikerKey);
      if (h.ok && h.user) {
        source = 'live';
        viaHiker = true;
        const followers = h.user.followers;
        const posts: IgPost[] = (h.posts ?? []).map((p) => ({
          pk: p.pk,
          like: p.like,
          comment: p.comment,
          date: p.date,
          caption: p.caption,
        }));
        const totalLikes = posts.reduce((a, p) => a + p.like, 0);
        const totalComments = posts.reduce((a, p) => a + p.comment, 0);
        data = {
          username: h.user.username,
          fullName: h.user.fullName ?? '',
          biography: h.user.biography ?? '',
          followers,
          following: h.user.following,
          postsCount: h.user.postsCount,
          isPrivate: h.user.isPrivate,
          isVerified: h.user.isVerified,
          hasBusiness: h.user.hasBusiness,
          externalUrl: h.user.externalUrl ?? '',
          profilePic: h.user.profilePic ?? '',
          posts,
          avgLikes: posts.length ? Math.round(totalLikes / posts.length) : undefined,
          avgComments: posts.length ? Math.round(totalComments / posts.length) : undefined,
          er:
            followers && posts.length
              ? engagementRate(totalLikes / posts.length, totalComments / posts.length, followers)
              : undefined,
          trackerDomains: [],
        };
      } else if (h.error === 'not-found') {
        // پاسخ قطعی سرویس: چنین حسابی وجود ندارد
        return {
          module: 'instagram',
          title: 'تحلیل اینستاگرام',
          icon: 'Instagram',
          status: 'failed',
          source: 'live',
          summary: `حساب @${u} در اینستاگرام وجود ندارد (پاسخ قطعی از سرویس API — HikerAPI).`,
          findings: [
            { label: 'نام کاربری', value: '@' + u },
            { label: 'وضعیت', value: 'حساب یافت نشد (۴۰۴ از سرویس API)', severity: 'high' },
            { label: 'منبع', value: 'HikerAPI — کلید API', severity: 'info' },
            { label: 'لینک صفحه', value: profileLink(u), link: profileLink(u) },
          ],
          raw: { username: u, exists: false },
          durationMs: Date.now() - started,
          error: 'حساب در اینستاگرام یافت نشد (۴۰۴ از HikerAPI)',
        };
      } else {
        const e: HikerError = h.error ?? 'network';
        // h.message از قبل پیام فارسی کامل است؛ دوباره wrap نمی‌شود
        hikerNote = `کلید API (HikerAPI): ${h.message ?? hikerErrorMessage(e)}`;
        error = hikerNote;
      }

      // ─── تحلیل «بیشترین لایک و کامنت» — فقط با داده مستقیم API (لایکرها/کامنت‌گذاران واقعی) ───
      if (viaHiker && data && data.posts.length) {
        const mediaIds = data.posts
          .map((p) => p.pk)
          .filter((x): x is string | number => x !== undefined && x !== null);
        if (mediaIds.length) {
          fansResult = await fetchHikerMediaFans(u, hikerKey, mediaIds, { maxPosts: 6 });
        } else {
          fansResult = {
            ok: false,
            fans: [],
            postsSampled: 0,
            likersTotal: 0,
            commentsTotal: 0,
            error: 'parse',
            message: 'شناسه پست‌ها برای استخراج لایکر/کامنت در دسترس نبود',
          };
        }
      }
    } catch {
      hikerNote = 'کلید API (HikerAPI): خطای نامشخص در دریافت داده';
      error = hikerNote;
    }
  }

  // ─── لایه ۱: API عمومی اینستاگرام ───
  let directBlocked = false;
  try {
    const res = await safeFetch(
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
    if (res.ok && res.body.trim().startsWith('{')) {
      const j = JSON.parse(res.body);
      const user = j?.data?.user;
      if (user) {
        source = 'live';
        const edges = user.edge_owner_to_timeline_media?.edges ?? [];
        const posts: IgPost[] = edges.slice(0, 12).map((e: any) => ({
          like: e.node?.edge_liked_by?.count ?? e.node?.edge_media_preview_like?.count ?? 0,
          comment: e.node?.edge_media_to_comment?.count ?? 0,
          date: new Date((e.node?.taken_at_timestamp ?? Date.now() / 1000) * 1000).toISOString(),
          caption: e.node?.edge_media_to_caption?.edges?.[0]?.node?.text?.slice(0, 120) ?? '',
        }));
        const totalLikes = posts.reduce((a, p) => a + p.like, 0);
        const totalComments = posts.reduce((a, p) => a + p.comment, 0);
        const followers = user.edge_followed_by?.count ?? undefined;
        data = {
          username: user.username,
          fullName: user.full_name ?? '',
          biography: user.biography ?? '',
          followers,
          following: user.edge_follow?.count ?? undefined,
          postsCount: user.edge_owner_to_timeline_media?.count ?? undefined,
          isPrivate: !!user.is_private,
          isVerified: !!user.is_verified,
          hasBusiness: !!user.business_category_name,
          externalUrl: user.external_url ?? '',
          profilePic: user.profile_pic_url_hd ?? user.profile_pic_url ?? '',
          posts,
          avgLikes: posts.length ? Math.round(totalLikes / posts.length) : undefined,
          avgComments: posts.length ? Math.round(totalComments / posts.length) : undefined,
          er:
            followers && posts.length
              ? engagementRate(totalLikes / posts.length, totalComments / posts.length, followers)
              : undefined,
          trackerDomains: [],
        };
      } else {
        error = 'اینستاگرام پاسخ داد اما پروفایل برگردانده نشد.' + (hikerNote ? ` — ${hikerNote}` : '');
        directBlocked = true;
      }
    } else if (res.status === 404) {
      // پاسخ قطعی اینستاگرام: چنین حسابی وجود ندارد
      return {
        module: 'instagram',
        title: 'تحلیل اینستاگرام',
        icon: 'Instagram',
        status: 'failed',
        source: 'live',
        summary: `حساب @${u} در اینستاگرام وجود ندارد (پاسخ قطعی ۴۰۴ از سرور اینستاگرام).`,
        findings: [
          { label: 'نام کاربری', value: '@' + u },
          { label: 'وضعیت', value: 'حساب یافت نشد (۴۰۴ از اینستاگرام)', severity: 'high' },
          { label: 'لینک صفحه', value: profileLink(u), link: profileLink(u) },
        ],
        raw: { username: u, exists: false },
        durationMs: Date.now() - started,
        error: 'حساب در اینستاگرام یافت نشد (۴۰۴)',
      };
    } else {
      directBlocked = true;
      error = hikerNote
        ? `${hikerNote} — دسترسی مستقیم به API اینستاگرام هم مسدود است (کد ${res.status || 'شبکه'})`
        : `دسترسی مستقیم به API اینستاگرام مسدود است (کد ${res.status || 'شبکه'})`;
    }
  } catch {
    directBlocked = true;
    error = hikerNote ? `${hikerNote} — اتصال مستقیم به اینستاگرام هم برقرار نشد` : 'اتصال مستقیم به اینستاگرام برقرار نشد';
  }

  // ─── لایه ۲: ردیاب‌های تحلیلی (داده واقعی ایندکس‌شده) ───
  if (!data) {
    const tracker = await fetchInstagramViaTrackers(u);
    if (tracker) {
      source = 'tracker';
      data = {
        username: u,
        fullName: tracker.fullName ?? '',
        biography: '',
        followers: tracker.followers,
        following: tracker.following,
        postsCount: tracker.posts,
        isVerified: tracker.verified,
        externalUrl: '',
        profilePic: '',
        posts: [],
        avgLikes: tracker.avgLikes,
        avgComments: tracker.avgComments,
        er: tracker.er,
        trackerDomains: tracker.domains,
      };
      error = directBlocked
        ? `${error} — داده واقعی از ردیاب‌های تحلیلی (${tracker.domains.join('، ')}) بازیابی شد`
        : `داده از ردیاب‌های تحلیلی (${tracker.domains.join('، ')}) بازیابی شد`;
    }
  }

  // ─── لایه ۳: در دسترس نبودن شفاف (بدون هیچ عدد ساختگی) ───
  if (!data) {
    return {
      module: 'instagram',
      title: 'تحلیل اینستاگرام',
      icon: 'Instagram',
      status: 'partial',
      source: 'unavailable',
      summary: hikerNote
        ? `داده واقعی برای @${u} در دسترس نبود و هیچ عددی نمایش داده نمی‌شود. ${hikerNote}. دسترسی مستقیم اینستاگرام از سرور مسدود است و ردیاب‌های تحلیلی هم این یوزرنیم را ایندکس نکرده‌اند. پس از اصلاح کلید/اعتبار API دوباره اسکن کنید.`
        : `داده واقعی برای @${u} در دسترس نبود و هیچ عددی نمایش داده نمی‌شود. اینستاگرام دسترسی ناشناس از سرورهای داده‌مرکزی را مسدود می‌کند و ردیاب‌های تحلیلی نیز این یوزرنیم را ایندکس نکرده‌اند (احتمال: حساب کوچک/جدید/خصوصی است). برای دریافت قطعی، یک کلید API (مثل HikerAPI) در تنظیمات پنل اسکن وارد کنید.`,
      findings: [
        { label: 'نام کاربری', value: '@' + u },
        { label: 'دنبال‌کننده', value: 'در دسترس نیست', severity: 'info' },
        { label: 'دنبال‌شده', value: 'در دسترس نیست', severity: 'info' },
        { label: 'تعداد پست', value: 'در دسترس نیست', severity: 'info' },
        {
          label: 'علت',
          value: 'مسدود بودن دسترسی ناشناس اینستاگرام + نبود داده ایندکس‌شده در ردیاب‌ها',
          severity: 'medium',
        },
        { label: 'لینک صفحه', value: profileLink(u), link: profileLink(u) },
      ],
      raw: { username: u, available: false },
      durationMs: Date.now() - started,
      error: error ?? 'داده واقعی در دسترس نبود',
    };
  }

  // ─── ساخت خروجی بر اساس داده واقعی ───
  const findings: OsintModuleResult['findings'] = [
    { label: 'نام کاربری', value: '@' + data.username },
  ];
  if (viaHiker) {
    findings.push({ label: 'منبع داده', value: 'HikerAPI — کلید API (داده مستقیم اینستاگرام)', severity: 'info' });
  }
  if (data.fullName) findings.push({ label: 'نام کامل', value: data.fullName });
  if (data.biography) findings.push({ label: 'بیوگرافی', value: data.biography.slice(0, 200) });
  findings.push({
    label: 'دنبال‌کننده',
    value: data.followers !== undefined ? fmtNum(data.followers) : 'در دسترس نیست',
  });
  findings.push({
    label: 'دنبال‌شده',
    value: data.following !== undefined ? fmtNum(data.following) : 'در دسترس نیست',
  });
  findings.push({
    label: 'تعداد پست',
    value: data.postsCount !== undefined ? fmtNum(data.postsCount) : 'در دسترس نیست',
  });
  if (data.isPrivate !== undefined) {
    findings.push({ label: 'نوع حساب', value: data.isPrivate ? 'خصوصی 🔒' : 'عمومی' });
  }
  findings.push({
    label: 'تأیید شده',
    value: data.isVerified === true ? 'بله ✓' : data.isVerified === undefined ? 'نامشخص' : 'خیر',
  });
  if (source === 'tracker' && data.trackerDomains.length) {
    findings.push({ label: 'منبع داده واقعی', value: data.trackerDomains.join('، ') });
  }
  // داده تعاملی فقط از مسیر live یا ردیابِ دارای ER معنا دارد
  if (source === 'live' && data.avgLikes !== undefined) {
    findings.push({ label: 'میانگین لایک پست', value: fmtNum(data.avgLikes) });
    if (data.avgComments !== undefined)
      findings.push({ label: 'میانگین کامنت پست', value: fmtNum(data.avgComments) });
    if (data.er !== undefined)
      findings.push({
        label: 'نرخ تعامل (ER)',
        value: data.er + '٪',
        severity: (data.er > 3 ? 'info' : data.er > 1 ? 'low' : 'medium') as 'info',
      });
  } else if (source === 'tracker' && data.avgLikes !== undefined) {
    findings.push({ label: 'میانگین لایک پست', value: fmtNum(data.avgLikes) + ' (ردیاب)' });
    if (data.avgComments !== undefined)
      findings.push({ label: 'میانگین کامنت پست', value: fmtNum(data.avgComments) + ' (ردیاب)' });
    if (data.er !== undefined)
      findings.push({
        label: 'نرخ تعامل (ER)',
        value: data.er + '٪ (ردیاب)',
        severity: (data.er > 3 ? 'info' : data.er > 1 ? 'low' : 'medium') as 'info',
      });
  } else if (source === 'tracker') {
    findings.push({
      label: 'تحلیل تعامل پست‌ها',
      value: 'نیازمند دسترسی مستقیم به API اینستاگرام',
      severity: 'info',
    });
  }

  // ─── تحلیل «بیشترین لایک و کامنت» — از لایکرها/کامنت‌گذاران واقعی پست‌های نمونه ───
  if (fansResult && fansResult.fans.length > 0) {
    findings.push({
      label: 'بیشترین لایک و کامنت',
      value: `نمونه از ${fmtNum(fansResult.postsSampled)} پست اخیر — ${fmtNum(fansResult.likersTotal)} لایک و ${fmtNum(fansResult.commentsTotal)} کامنت تحلیل شد (هر کامنت ۲ امتیاز)`,
      severity: 'info',
    });
    for (const fan of fansResult.fans.slice(0, 6)) {
      findings.push({
        label: `@${fan.username} — ${fmtNum(fan.likes)} لایک ، ${fmtNum(fan.comments)} کامنت`,
        value: fan.commentTexts.length
          ? 'کامنت‌ها: ' + fan.commentTexts.map((t) => `«${t}»`).join(' | ')
          : 'در پست‌های نمونه فقط لایک داشت (کامنت ثبت نشده)',
        severity: 'medium',
        link: fan.profileUrl,
      });
    }
  } else if (fansResult && !fansResult.fans.length && fansResult.message) {
    findings.push({
      label: 'بیشترین لایک و کامنت',
      value: `در دسترس نیست — ${fansResult.message}`,
      severity: 'info',
    });
  } else if (!hikerKey) {
    findings.push({
      label: 'بیشترین لایک و کامنت',
      value: 'برای شناسایی افرادی که بیشترین لایک و کامنت را دارند، کلید API (مثل HikerAPI) را در تنظیمات پنل اسکن وارد کنید',
      severity: 'info',
    });
  }
  if (data.externalUrl) {
    findings.push({ label: 'لینک خارجی در بیو', value: data.externalUrl, severity: 'medium' });
  }
  findings.push({ label: 'لینک صفحه', value: profileLink(u), link: profileLink(u) });

  // تحلیل مشکوک بودن فقط با داده واقعی تعامل
  const suspicious =
    data.er !== undefined && data.followers
      ? data.followers > 1000 && data.er < 0.5
        ? 'نرخ تعامل بسیار پایین نسبت به فالوور — احتمال استفاده از فالوور فِیک'
        : data.following && data.following > data.followers * 5
          ? 'نسبت فالوینگ به فالوور غیرعادی — الگوی رشد دستی/باتی'
          : 'الگوی حساب عادی به نظر می‌رسد'
      : source === 'tracker'
        ? 'تحلیل فالوور فیک نیازمند داده تعاملی پست‌ها است (دسترسی مستقیم)'
        : '';

  const metrics: OsintModuleResult['metrics'] = [];
  if (data.followers !== undefined) metrics.push({ label: 'فالوور', value: data.followers });
  if (data.following !== undefined) metrics.push({ label: 'فالوینگ', value: data.following });
  if (data.postsCount !== undefined) metrics.push({ label: 'تعداد پست', value: data.postsCount });
  if (source === 'live' && data.avgLikes !== undefined)
    metrics.push({ label: 'میانگین لایک', value: data.avgLikes });
  if (source === 'live' && data.avgComments !== undefined)
    metrics.push({ label: 'میانگین کامنت', value: data.avgComments });
  if (source === 'tracker' && data.avgLikes !== undefined)
    metrics.push({ label: 'میانگین لایک', value: data.avgLikes });
  if (source === 'tracker' && data.avgComments !== undefined)
    metrics.push({ label: 'میانگین کامنت', value: data.avgComments });

  const viaPart = viaHiker ? ' از طریق کلید API (HikerAPI)' : '';
  const fansPart =
    fansResult && fansResult.fans.length
      ? ` — بیشترین تعامل: @${fansResult.fans[0].username} (${fmtNum(fansResult.fans[0].likes)} لایک، ${fmtNum(fansResult.fans[0].comments)} کامنت از ${fmtNum(fansResult.postsSampled)} پست نمونه)`
      : '';
  const summary =
    source === 'live'
      ? `پروفایل واقعی @${u} مستقیماً${viaPart} دریافت شد — ${fmtNum(data.followers)} فالوور${data.er !== undefined ? `، نرخ تعامل ${data.er}٪` : ''}.${fansPart} ${suspicious}`
      : `آمار واقعی @${u} از ردیاب‌های تحلیلی اینستاگرام (${data.trackerDomains.join('، ')}) بازیابی شد${data.followers !== undefined ? ` — ${fmtNum(data.followers)} فالوور` : ''}. ${suspicious}`;

  return {
    module: 'instagram',
    title: 'تحلیل اینستاگرام',
    icon: 'Instagram',
    status: source === 'unavailable' ? 'partial' : 'success',
    source,
    summary,
    findings,
    metrics,
    timeline:
      source === 'live'
        ? data.posts
            .slice()
            .reverse()
            .map((p) => ({ date: p.date, label: p.caption.slice(0, 30) || 'پست', value: p.like }))
        : undefined,
    raw: fansResult
      ? { ...data, fans: fansResult.fans, fansMeta: { postsSampled: fansResult.postsSampled, likersTotal: fansResult.likersTotal, commentsTotal: fansResult.commentsTotal } }
      : data,
    durationMs: Date.now() - started,
    error,
  };
}
