import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserDb } from '@/lib/auth';

export const runtime = 'nodejs';

// GET /api/auth/me — اطلاعات کاربر فعلی از دیتابیس (یا null) — کاربر حذف‌شده بلافاصله null می‌گیرد
export async function GET(req: NextRequest) {
  const user = await getSessionUserDb(req);
  return NextResponse.json({ user });
}
