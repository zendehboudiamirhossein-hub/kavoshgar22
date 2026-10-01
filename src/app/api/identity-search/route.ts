import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getClientIp, getSessionUserDb } from '@/lib/auth';
import {
  getTelegramConfig,
  isTelegramConfigured,
  normalizeIranMobile,
  normalizeFullName,
  normalizeCardNumber,
  isValidNationalId,
  isValidCardNumber,
  runIdentitySearch,
  IDENTITY_TYPE_LABELS,
  type IdentityType,
} from '@/lib/telegram';

export const runtime = 'nodejs';
export const maxDuration = 120;

// GET /api/identity-search — وضعیت فعال بودن ماژول برای UI (هر کاربر واردشده)
export async function GET(req: NextRequest) {
  const session = await getSessionUserDb(req);
  if (!session) return NextResponse.json({ error: 'ابتدا وارد شوید' }, { status: 401 });
  const cfg = await getTelegramConfig();
  return NextResponse.json({
    configured: isTelegramConfigured(cfg) && !!cfg.botUsername,
    botUsername: cfg.botUsername || null,
  });
}

// POST /api/identity-search — جستجوی هویت از طریق ربات تلگرام (هر کاربر واردشده)
// بدنه: { type: 'name' | 'national_id' | 'mobile' | 'card', value: string }
export async function POST(req: NextRequest) {
  const session = await getSessionUserDb(req);
  if (!session) return NextResponse.json({ error: 'نشست منقضی شده — دوباره وارد شو' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const type = String(body?.type ?? '') as IdentityType;
  const value = String(body?.value ?? '').trim();

  if (!['name', 'national_id', 'mobile', 'card'].includes(type)) {
    return NextResponse.json({ error: 'نوع داده نامعتبر است' }, { status: 400 });
  }
  if (!value || value.length > 80) {
    return NextResponse.json({ error: 'مقدار جستجو خالی یا بیش از حد طولانی است' }, { status: 400 });
  }

  // اعتبارسنجی/یکسان‌سازی بر اساس نوع داده
  let normalized = value;
  if (type === 'mobile') {
    const m = normalizeIranMobile(value);
    if (!m) return NextResponse.json({ error: 'شماره موبایل نامعتبر است — مثلاً 09121234567 یا +989121234567' }, { status: 400 });
    normalized = m;
  } else if (type === 'national_id') {
    const digits = value.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
    if (!/^\d{10}$/.test(digits)) {
      return NextResponse.json({ error: 'کد ملی باید ۱۰ رقم باشد' }, { status: 400 });
    }
    if (!isValidNationalId(value)) {
      return NextResponse.json({ error: 'کد ملی وارد شده معتبر نیست (رقم کنترل درست نیست)' }, { status: 400 });
    }
    normalized = digits;
  } else if (type === 'card') {
    const digits = normalizeCardNumber(value);
    if (!digits) {
      return NextResponse.json({ error: 'شماره کارت باید ۱۶ رقم باشد — مثلاً 6037997512345670' }, { status: 400 });
    }
    if (!isValidCardNumber(digits)) {
      return NextResponse.json({ error: 'شماره کارت وارد شده معتبر نیست (رقم کنترل درست نیست) — کارت را دقیق وارد کنید' }, { status: 400 });
    }
    normalized = digits;
  } else {
    const n = normalizeFullName(value);
    if (!n) return NextResponse.json({ error: 'نام و نام خانوادگی را کامل وارد کنید (حداقل دو واژه)' }, { status: 400 });
    normalized = n;
  }

  try {
    const result = await runIdentitySearch(type, normalized);

    // ثبت دائمی در گزارش جستجوها — مثل بقیه ماژول‌ها
    try {
      await db.searchLog.create({
        data: {
          userId: session.uid,
          username: session.username,
          target: normalized,
          targetType: `identity_${type}`,
          modules: JSON.stringify(['telegram_bot']),
          status: 'completed',
          ip: getClientIp(req),
          userAgent: req.headers.get('user-agent') ?? undefined,
        },
      });
    } catch (e) {
      console.error('identity search log failed:', e);
    }

    return NextResponse.json({
      ...result,
      query: { ...result.query, label: IDENTITY_TYPE_LABELS[type] },
    });
  } catch (e) {
    // ثبت جستجوی ناموفق
    try {
      await db.searchLog.create({
        data: {
          userId: session.uid,
          username: session.username,
          target: normalized,
          targetType: `identity_${type}`,
          modules: JSON.stringify(['telegram_bot']),
          status: 'failed',
          ip: getClientIp(req),
          userAgent: req.headers.get('user-agent') ?? undefined,
        },
      });
    } catch {
      /* ignore */
    }
    if (e instanceof Error && e.name === 'TelegramUserError') {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    console.error('identity search error:', e);
    const detail = e instanceof Error && e.message ? e.message : String(e ?? '');
    return NextResponse.json(
      { error: `خطای جستجوی هویت: ${detail || 'نامشخص'} — چند لحظه بعد دوباره تلاش کنید` },
      { status: 500 }
    );
  }
}
