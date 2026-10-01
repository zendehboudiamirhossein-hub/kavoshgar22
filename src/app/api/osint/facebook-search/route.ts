import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getClientIp, getSessionUserDb } from '@/lib/auth';
import { listDbFiles, searchDbFiles } from '@/lib/searchdb';

export const runtime = 'nodejs';
// جستجو در فایل‌های حجیم ممکن است چند ده ثانیه طول بکشد
export const maxDuration = 300;

// GET /api/osint/facebook-search — وضعیت دیتابیس جستجو برای UI (هر کاربر واردشده)
export async function GET(req: NextRequest) {
  const session = await getSessionUserDb(req);
  if (!session) return NextResponse.json({ error: 'ابتدا وارد شوید' }, { status: 401 });

  try {
    const files = await listDbFiles();
    const totalBytes = files.reduce((a, f) => a + f.sizeBytes, 0);
    return NextResponse.json({ configured: files.length > 0, files: files.length, totalBytes });
  } catch {
    return NextResponse.json({ configured: false, files: 0, totalBytes: 0 });
  }
}

// POST /api/osint/facebook-search — شناسایی اکانت فیسبوک: جستجوی هر متن/عدد
// در همه فایل‌های دیتابیس بارگذاری‌شده توسط مدیر؛ خروجی: کل خطوط منطبق
export async function POST(req: NextRequest) {
  const session = await getSessionUserDb(req);
  if (!session) return NextResponse.json({ error: 'نشست منقضی شده — دوباره وارد شو' }, { status: 401 });

  try {
    const body = await req.json().catch(() => ({}));
    const query = String(body?.query ?? '').trim();
    if (!query) {
      return NextResponse.json({ error: 'عبارت جستجو را وارد کنید' }, { status: 400 });
    }
    if (query.length > 300) {
      return NextResponse.json({ error: 'عبارت جستجو بیش از حد طولانی است (حداکثر ۳۰۰ نویسه)' }, { status: 400 });
    }

    const files = await listDbFiles();
    if (!files.length) {
      return NextResponse.json(
        { error: 'هنوز دیتابیسی بارگذاری نشده است. مدیر سامانه باید از پنل مدیریت فایل‌های TXT را بارگذاری کند.' },
        { status: 409 }
      );
    }

    const result = await searchDbFiles(query);

    // ثبت جستجو در گزارش ادمین
    try {
      await db.searchLog.create({
        data: {
          userId: session.uid,
          username: session.username,
          target: query,
          targetType: 'facebook',
          modules: `db-search(${result.totalFiles} files, ${result.totalMatches} hits)`,
          status: result.totalMatches > 0 ? 'success' : 'empty',
          ip: getClientIp(req),
          userAgent: req.headers.get('user-agent') ?? null,
        },
      });
    } catch (e) {
      console.error('facebook search log failed:', e);
    }

    return NextResponse.json(result);
  } catch (e) {
    console.error('facebook search error:', e);
    return NextResponse.json({ error: 'خطا در جستجوی دیتابیس' }, { status: 500 });
  }
}
