import { NextRequest, NextResponse } from 'next/server';
import { runScan } from '@/lib/osint/scan';
import { db } from '@/lib/db';
import { getClientIp, getSessionUserDb } from '@/lib/auth';
import { getGlobalHikerKey, getGlobalTcToken } from '@/lib/settings';

export const runtime = 'nodejs';
export const maxDuration = 120;

// POST /api/osint/scan — اجرای اسکن اوسینت (نیازمند ورود)
export async function POST(req: NextRequest) {
  const session = await getSessionUserDb(req);
  if (!session) {
    return NextResponse.json({ error: 'نشست منقضی شده — دوباره وارد شو' }, { status: 401 });
  }

  // بدنه فقط یک‌بار خوانده می‌شود و برای مسیر خطا هم نگه داشته می‌شود
  const body = await req.json().catch(() => ({}));
  const target = String(body?.target ?? '').trim();
  const modules: string[] | undefined = Array.isArray(body?.modules) ? body.modules : undefined;
  // کلید API اینستاگرام (مثل HikerAPI) — زنجیره اولویت:
  // ۱) کلید شخصی کاربر (بدنه درخواست)  ۲) کلید سازمانی که مدیر تنظیم کرده  ۳) متغیر محیطی HIKER_API_KEY
  const bodyKey = String(body?.hikerKey ?? '').trim();
  const globalKey = await getGlobalHikerKey();
  const hikerKey = bodyKey || globalKey || (process.env.HIKER_API_KEY ?? '').trim();

  // توکن Truecaller (نام ثبت‌شده شماره‌ها) — همان زنجیره اولویت
  const bodyTc = String(body?.truecallerToken ?? '').trim();
  const globalTc = await getGlobalTcToken();
  const truecallerToken = bodyTc || globalTc || (process.env.TRUECALLER_TOKEN ?? '').trim();

  try {
    if (!target || target.length > 200) {
      return NextResponse.json({ error: 'هدف نامعتبر است' }, { status: 400 });
    }

    const scan = await runScan(target, modules, {
      hikerKey: hikerKey || undefined,
      truecallerToken: truecallerToken || undefined,
    });

    // ذخیره پرونده در دیتابیس — متعلق به کاربر فعلی
    let caseId: string | null = null;
    try {
      const saved = await db.case.create({
        data: {
          userId: session.uid,
          target: scan.target,
          targetType: scan.targetType,
          status: 'completed',
          results: JSON.stringify(scan.results),
        },
      });
      caseId = saved.id;
    } catch (e) {
      console.error('DB save failed:', e);
    }

    // ثبت دائمی جستجو در گزارش سرور (زمان + کاربر + IP) — هرگز حذف نمی‌شود
    try {
      await db.searchLog.create({
        data: {
          userId: session.uid,
          username: session.username,
          target: scan.target,
          targetType: scan.targetType,
          modules: JSON.stringify(scan.results.map((r) => r.module)),
          status: 'completed',
          ip: getClientIp(req),
          userAgent: req.headers.get('user-agent') ?? undefined,
        },
      });
    } catch (e) {
      console.error('search log failed:', e);
    }

    return NextResponse.json({ ...scan, caseId });
  } catch (e) {
    console.error('scan error:', e);
    // ثبت جستجوی ناموفق هم در گزارش دائمی
    try {
      if (target) {
        await db.searchLog.create({
          data: {
            userId: session.uid,
            username: session.username,
            target,
            status: 'failed',
            ip: getClientIp(req),
            userAgent: req.headers.get('user-agent') ?? undefined,
          },
        });
      }
    } catch {
      /* ignore */
    }
    return NextResponse.json({ error: 'خطا در اجرای اسکن' }, { status: 500 });
  }
}
