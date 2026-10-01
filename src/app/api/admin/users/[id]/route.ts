import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSessionUserDb, hashPassword, setSessionCookie } from '@/lib/auth';

export const runtime = 'nodejs';

const USERNAME_RE = /^[A-Za-z0-9._-]{3,32}$/;

// PATCH /api/admin/users/[id] — ویرایش نام کاربری / رمز عبور / نقش (فقط ادمین)
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUserDb(req);
  if (!session) return NextResponse.json({ error: 'نشست منقضی شده — دوباره وارد شو' }, { status: 401 });
  if (session.role !== 'admin') return NextResponse.json({ error: 'دسترسی فقط برای مدیر' }, { status: 403 });

  try {
    const { id } = await ctx.params;
    const target = await db.user.findUnique({ where: { id } });
    if (!target) return NextResponse.json({ error: 'کاربر یافت نشد' }, { status: 404 });

    const body = await req.json().catch(() => ({}));
    const username = body?.username !== undefined ? String(body.username).trim() : undefined;
    const password = body?.password !== undefined ? String(body.password) : undefined;
    const role = body?.role !== undefined ? (body.role === 'admin' ? 'admin' : 'user') : undefined;

    if (username === undefined && password === undefined && role === undefined) {
      return NextResponse.json({ error: 'چیزی برای بروزرسانی ارسال نشده است' }, { status: 400 });
    }

    const data: { username?: string; password?: string; role?: string; tokenVersion?: { increment: number } } = {};

    if (username !== undefined && username !== target.username) {
      if (!USERNAME_RE.test(username)) {
        return NextResponse.json(
          { error: 'نام کاربری باید ۳ تا ۳۲ کاراکتر و فقط شامل حروف انگلیسی، عدد، نقطه، خط تیره یا زیرخط باشد' },
          { status: 400 }
        );
      }
      const exists = await db.user.findUnique({ where: { username } });
      if (exists) {
        return NextResponse.json({ error: 'این نام کاربری قبلاً ثبت شده است' }, { status: 409 });
      }
      data.username = username;
    }

    if (password !== undefined && password.length > 0) {
      if (password.length < 4 || password.length > 72) {
        return NextResponse.json({ error: 'رمز عبور باید بین ۴ تا ۷۲ کاراکتر باشد' }, { status: 400 });
      }
      data.password = await hashPassword(password);
      // تغییر رمز → نسخه توکن بالا می‌رود تا سشن‌های قبلی این کاربر بلافاصله بی‌اعتبار شوند
      data.tokenVersion = { increment: 1 };
    }

    if (role !== undefined && role !== target.role) {
      // ادمین نمی‌تواند نقش خودش را تغییر دهد تا قفل نشود
      if (target.id === session.uid) {
        return NextResponse.json({ error: 'تغییر نقش حساب خودتان مجاز نیست' }, { status: 400 });
      }
      data.role = role;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({
        ok: true,
        unchanged: true,
        user: { id: target.id, username: target.username, role: target.role },
      });
    }

    const updated = await db.user.update({
      where: { id },
      data,
      select: { id: true, username: true, role: true },
    });

    const res = NextResponse.json({ ok: true, user: updated });

    // اگر ادمین حساب خودش را ویرایش کرده، کوکی نشستش با مشخصات جدید صادر می‌شود
    if (target.id === session.uid) {
      const fresh = await db.user.findUnique({
        where: { id },
        select: { username: true, role: true, tokenVersion: true },
      });
      if (fresh) {
        setSessionCookie(
          res,
          { uid: id, username: fresh.username, role: fresh.role === 'admin' ? 'admin' : 'user' },
          fresh.tokenVersion
        );
      }
    }

    return res;
  } catch (e) {
    console.error('admin user update error:', e);
    return NextResponse.json({ error: 'خطا در بروزرسانی کاربر' }, { status: 500 });
  }
}

// DELETE /api/admin/users/[id] — حذف کاربر (فقط ادمین)
// لاگ جستجوها و پرونده‌های کاربر حذف نمی‌شوند؛ مالکیت آن‌ها null می‌شود (آرشیو فقط برای ادمین)
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUserDb(req);
  if (!session) return NextResponse.json({ error: 'نشست منقضی شده — دوباره وارد شو' }, { status: 401 });
  if (session.role !== 'admin') return NextResponse.json({ error: 'دسترسی فقط برای مدیر' }, { status: 403 });

  try {
    const { id } = await ctx.params;
    if (id === session.uid) {
      return NextResponse.json({ error: 'حذف حساب کاربری خودتان امکان‌پذیر نیست' }, { status: 400 });
    }
    const target = await db.user.findUnique({ where: { id }, select: { id: true, username: true } });
    if (!target) return NextResponse.json({ error: 'کاربر یافت نشد' }, { status: 404 });

    await db.user.delete({ where: { id } });
    return NextResponse.json({ ok: true, deletedUsername: target.username });
  } catch (e) {
    console.error('admin user delete error:', e);
    return NextResponse.json({ error: 'خطا در حذف کاربر' }, { status: 500 });
  }
}
