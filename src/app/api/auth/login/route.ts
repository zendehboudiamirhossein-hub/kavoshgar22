import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ensureAdmin, setSessionCookie, verifyPassword } from '@/lib/auth';

export const runtime = 'nodejs';

// POST /api/auth/login — ورود کاربر
export async function POST(req: NextRequest) {
  try {
    // اطمینان از وجود حساب ادمین پیش‌فرض (2010/2010) در اولین اجرا
    await ensureAdmin();

    const body = await req.json().catch(() => ({}));
    const username = String(body?.username ?? '').trim();
    const password = String(body?.password ?? '');

    if (!username || !password) {
      return NextResponse.json({ error: 'نام کاربری و رمز عبور الزامی است' }, { status: 400 });
    }

    const user = await db.user.findUnique({ where: { username } });
    if (!user || !(await verifyPassword(password, user.password))) {
      return NextResponse.json({ error: 'نام کاربری یا رمز عبور اشتباه است' }, { status: 401 });
    }

    const sessionUser = {
      uid: user.id,
      username: user.username,
      role: user.role === 'admin' ? ('admin' as const) : ('user' as const),
    };
    const res = NextResponse.json({ user: sessionUser });
    setSessionCookie(res, sessionUser, user.tokenVersion);
    return res;
  } catch (e) {
    console.error('login error:', e);
    return NextResponse.json({ error: 'خطا در ورود — دوباره تلاش کن' }, { status: 500 });
  }
}
