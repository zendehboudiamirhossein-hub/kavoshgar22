import crypto from 'crypto';
import type { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { db } from '@/lib/db';
import type { SessionUserInfo } from '@/lib/auth-types';

// سشن پارس‌شده + نسخه توکن برای تطبیق با دیتابیس
type ParsedSession = SessionUserInfo & { ver: number };

const SECRET = process.env.AUTH_SECRET || 'kavoshgar-session-secret-change-in-production';
export const SESSION_COOKIE = 'kavoshgar_session';
const SESSION_MAX_AGE = 7 * 24 * 60 * 60; // ثانیه — ۷ روز

// ---------- توکن نشست (HMAC-SHA256 امضاشده) ----------

function sign(payload: string): string {
  return crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
}

export function createSessionToken(u: SessionUserInfo, ver = 0): string {
  const payload = Buffer.from(JSON.stringify({ ...u, ver, iat: Date.now() }), 'utf8').toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token?: string | null): ParsedSession | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  const expected = sign(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!data?.uid || !data?.username || (data?.role !== 'admin' && data?.role !== 'user')) return null;
    if (Date.now() - Number(data.iat ?? 0) > SESSION_MAX_AGE * 1000) return null;
    return {
      uid: String(data.uid),
      username: String(data.username),
      role: data.role,
      ver: Number.isFinite(Number(data.ver)) ? Number(data.ver) : -1,
    };
  } catch {
    return null;
  }
}

// ---------- کمکی‌های درخواست/پاسخ ----------

export function getSessionUser(req: NextRequest): SessionUserInfo | null {
  return verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
}

/**
 * نسخه دیتابیسی سشن — علاوه بر امضای کوکی، وجود کاربر و نسخه توکن را در دیتابیس چک می‌کند:
 * کاربر حذف‌شده یا صاحب سشن قدیمی (بعد از تغییر رمز) بلافاصله بلاک می‌شود و
 * نقش/نام کاربری همیشه مقدار به‌روز دیتابیس است.
 */
export async function getSessionUserDb(req: NextRequest): Promise<SessionUserInfo | null> {
  const parsed = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!parsed) return null;
  try {
    const u = await db.user.findUnique({
      where: { id: parsed.uid },
      select: { username: true, role: true, tokenVersion: true },
    });
    if (!u) return null;
    if (parsed.ver !== u.tokenVersion) return null; // سشن قدیمی بعد از تغییر رمز
    return { uid: parsed.uid, username: u.username, role: u.role === 'admin' ? 'admin' : 'user' };
  } catch {
    return null;
  }
}

export function setSessionCookie(res: NextResponse, u: SessionUserInfo, ver = 0): void {
  res.cookies.set(SESSION_COOKIE, createSessionToken(u, ver), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE,
    secure: false, // هم با http پیش‌نمایش و هم https کار می‌کند
  });
}

export function clearSessionCookie(res: NextResponse): void {
  res.cookies.set(SESSION_COOKIE, '', { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 0 });
}

/** استخراج IP کاربر از هدرهای پروکسی (گیت‌وی Caddy) با fallback */
export function getClientIp(req: NextRequest): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  return (
    req.headers.get('x-real-ip')?.trim() ||
    req.headers.get('cf-connecting-ip')?.trim() ||
    'نامشخص'
  );
}

/** هش رمز عبور */
export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

/** مقایسه رمز عبور با هش */
export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

// ---------- بذر ادمین (2010/2010) ----------

/**
 * اطمینان از وجود حساب ادمین با نام کاربری و رمز «2010».
 * اگر هیچ ادمینی وجود نداشته باشد، ساخته می‌شود (بدون بازنشانی رمز تغییر کرده).
 */
export async function ensureAdmin(): Promise<void> {
  try {
    const anyAdmin = await db.user.findFirst({ where: { role: 'admin' } });
    if (anyAdmin) return;
    const existing = await db.user.findUnique({ where: { username: '2010' } });
    if (existing) {
      await db.user.update({ where: { id: existing.id }, data: { role: 'admin' } });
      return;
    }
    await db.user.create({
      data: {
        username: '2010',
        password: await hashPassword('2010'),
        role: 'admin',
      },
    });
  } catch (e) {
    console.error('ensureAdmin failed:', e);
  }
}
