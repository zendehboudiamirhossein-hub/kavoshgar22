import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSessionUserDb, hashPassword } from '@/lib/auth';

export const runtime = 'nodejs';

// GET /api/admin/users — فهرست کاربران با تعداد جستجو و پرونده (فقط ادمین)
export async function GET(req: NextRequest) {
  const session = await getSessionUserDb(req);
  if (!session) return NextResponse.json({ error: 'ابتدا وارد شوید' }, { status: 401 });
  if (session.role !== 'admin') return NextResponse.json({ error: 'دسترسی فقط برای مدیر' }, { status: 403 });

  try {
    const users = await db.user.findMany({
      orderBy: [{ role: 'desc' }, { createdAt: 'asc' }], // ادمین اول
      select: {
        id: true,
        username: true,
        role: true,
        createdAt: true,
        _count: { select: { searches: true, cases: true } },
      },
    });
    return NextResponse.json({
      users: users.map((u) => ({
        id: u.id,
        username: u.username,
        role: u.role,
        createdAt: u.createdAt,
        searchCount: u._count.searches,
        caseCount: u._count.cases,
      })),
    });
  } catch (e) {
    console.error('admin users list error:', e);
    return NextResponse.json({ error: 'خطا در دریافت فهرست کاربران' }, { status: 500 });
  }
}

// POST /api/admin/users — ایجاد کاربر جدید (فقط ادمین)
export async function POST(req: NextRequest) {
  const session = await getSessionUserDb(req);
  if (!session) return NextResponse.json({ error: 'ابتدا وارد شوید' }, { status: 401 });
  if (session.role !== 'admin') return NextResponse.json({ error: 'دسترسی فقط برای مدیر' }, { status: 403 });

  try {
    const body = await req.json().catch(() => ({}));
    const username = String(body?.username ?? '').trim();
    const password = String(body?.password ?? '');
    const role = body?.role === 'admin' ? 'admin' : 'user';

    if (!/^[A-Za-z0-9._-]{3,32}$/.test(username)) {
      return NextResponse.json(
        { error: 'نام کاربری باید ۳ تا ۳۲ کاراکتر و فقط شامل حروف انگلیسی، عدد، نقطه، خط تیره یا زیرخط باشد' },
        { status: 400 }
      );
    }
    if (password.length < 4 || password.length > 72) {
      return NextResponse.json({ error: 'رمز عبور باید حداقل ۴ کاراکتر باشد' }, { status: 400 });
    }

    const exists = await db.user.findUnique({ where: { username } });
    if (exists) {
      return NextResponse.json({ error: 'این نام کاربری قبلاً ثبت شده است' }, { status: 409 });
    }

    const user = await db.user.create({
      data: { username, password: await hashPassword(password), role },
      select: { id: true, username: true, role: true, createdAt: true },
    });
    return NextResponse.json({ user });
  } catch (e) {
    console.error('admin user create error:', e);
    return NextResponse.json({ error: 'خطا در ایجاد کاربر' }, { status: 500 });
  }
}
