import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSessionUserDb } from '@/lib/auth';

export const runtime = 'nodejs';

// GET /api/admin/searches — گزارش کامل همه جستجوها با زمان/IP/کاربر (فقط ادمین)
export async function GET(req: NextRequest) {
  const session = await getSessionUserDb(req);
  if (!session) return NextResponse.json({ error: 'ابتدا وارد شوید' }, { status: 401 });
  if (session.role !== 'admin') return NextResponse.json({ error: 'دسترسی فقط برای مدیر' }, { status: 403 });

  try {
    const sp = req.nextUrl.searchParams;
    const page = Math.max(1, parseInt(sp.get('page') ?? '1', 10) || 1);
    const pageSize = Math.min(100, Math.max(5, parseInt(sp.get('pageSize') ?? '20', 10) || 20));
    const username = sp.get('username')?.trim() || '';
    const q = sp.get('q')?.trim() || '';

    const where: { username?: string; target?: { contains: string } } = {};
    if (username) where.username = username;
    if (q) where.target = { contains: q };

    const [logs, total, totalAll, todayCount, userCount, uniqueTargets] = await Promise.all([
      db.searchLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.searchLog.count({ where }),
      db.searchLog.count(),
      db.searchLog.count({
        where: { createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
      }),
      db.user.count(),
      db.searchLog.groupBy({ by: ['target'] }),
    ]);

    return NextResponse.json({
      logs,
      total,
      page,
      pageSize,
      pages: Math.max(1, Math.ceil(total / pageSize)),
      stats: {
        totalSearches: totalAll,
        todaySearches: todayCount,
        totalUsers: userCount,
        uniqueTargets: uniqueTargets.length,
      },
    });
  } catch (e) {
    console.error('admin searches error:', e);
    return NextResponse.json({ error: 'خطا در دریافت گزارش جستجوها' }, { status: 500 });
  }
}
