import { NextRequest, NextResponse } from 'next/server';
import fsp from 'fs/promises';
import { getSessionUserDb } from '@/lib/auth';
import { listDbFiles, sanitizeFileName, searchDbDir } from '@/lib/searchdb';

export const runtime = 'nodejs';

// GET /api/admin/searchdb — فهرست فایل‌های دیتابیس جستجو (فقط ادمین)
export async function GET(req: NextRequest) {
  const session = await getSessionUserDb(req);
  if (!session) return NextResponse.json({ error: 'ابتدا وارد شوید' }, { status: 401 });
  if (session.role !== 'admin') return NextResponse.json({ error: 'دسترسی فقط برای مدیر' }, { status: 403 });

  try {
    const files = await listDbFiles();
    const totalBytes = files.reduce((a, f) => a + f.sizeBytes, 0);
    return NextResponse.json({ files, totalBytes, dir: searchDbDir() });
  } catch (e) {
    console.error('searchdb list error:', e);
    return NextResponse.json({ error: 'خطا در فهرست فایل‌ها' }, { status: 500 });
  }
}

// DELETE /api/admin/searchdb?name=... — حذف یک فایل (فقط ادمین)
export async function DELETE(req: NextRequest) {
  const session = await getSessionUserDb(req);
  if (!session) return NextResponse.json({ error: 'ابتدا وارد شوید' }, { status: 401 });
  if (session.role !== 'admin') return NextResponse.json({ error: 'دسترسی فقط برای مدیر' }, { status: 403 });

  const name = sanitizeFileName(req.nextUrl.searchParams.get('name') ?? '');
  if (!name) return NextResponse.json({ error: 'نام فایل نامعتبر است' }, { status: 400 });

  try {
    await fsp.unlink(`${searchDbDir()}/${name}`);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'حذف فایل ناموفق بود — ممکن است وجود نداشته باشد' }, { status: 404 });
  }
}
