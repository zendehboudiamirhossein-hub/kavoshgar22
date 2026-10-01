import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSessionUserDb } from '@/lib/auth';

export const runtime = 'nodejs';

// تبدیل امن رشته JSON برچسب‌ها به آرایه — ورودی خراب هرگز کل لیست را نمی‌شکند
function parseTags(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter((t): t is string => typeof t === 'string' && t.trim().length > 0).slice(0, 20);
  } catch {
    return [];
  }
}

// GET /api/cases — فهرست پرونده‌ها (هر کاربر فقط پرونده‌های خودش؛ ادمین همه)
export async function GET(req: NextRequest) {
  const session = await getSessionUserDb(req);
  if (!session) {
    return NextResponse.json({ error: 'نشست منقضی شده — دوباره وارد شو' }, { status: 401 });
  }

  try {
    const where = session.role === 'admin' ? {} : { userId: session.uid };
    const cases = await db.case.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        id: true,
        target: true,
        targetType: true,
        status: true,
        riskScore: true,
        summary: true,
        tags: true,
        createdAt: true,
      },
    });
    // برچسب‌ها در دیتابیس به‌صورت JSON ذخیره می‌شوند — اینجا به آرایه تبدیل می‌کنیم
    const enriched = cases.map((c) => ({
      ...c,
      tags: parseTags(c.tags),
    }));
    return NextResponse.json({ cases: enriched });
  } catch (e) {
    console.error('cases list error:', e);
    return NextResponse.json({ cases: [] });
  }
}
