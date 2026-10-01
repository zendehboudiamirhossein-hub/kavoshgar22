import { NextRequest, NextResponse } from 'next/server';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import type { ReadableStream as NodeWebReadableStream } from 'stream/web';
import fs from 'fs';
import fsp from 'fs/promises';
import { getSessionUserDb } from '@/lib/auth';
import { PART_SUFFIX, isTempDbFile, sanitizeFileName, searchDbDir } from '@/lib/searchdb';

export const runtime = 'nodejs';
// آپلود فایل‌های حجیم — بدون محدودیت حجم
export const maxDuration = 600;

// ============================================================
// آپلود چندتکه‌ای قابل ازسرگیری (چرا؟)
//
// پروکسی Railway بدنهٔ درخواست‌های بزرگ‌تر از ~۱۰۰ مگابایت را در
// میانهٔ راه قطع می‌کند → خطای شبکه در آپلود تک‌درخواستی.
// راه‌حل: فایل در مرورگر به تکه‌های ۱۶ مگابایتی شکسته می‌شود و هر
// تکه جداگانه با «آفست دقیق» ارسال و بلافاصله روی دیسک ثبت می‌گردد.
//
// مزایا:
// - هر تکه زیر سقف پروکسی است → دیگر خطای شبکه نمی‌گیریم
// - قطعی شبکه فقط یک تکه را خراب می‌کند؛ همان تکه دوباره تلاش می‌شود
// - اگر کل ارتباط قطع شد، با انتخاب دوباره فایل، از محل .part ادامه
//   می‌یابد (هیچ بایتی دوباره فرستاده نمی‌شود)
// - ثبت هر تکه «idempotent» است: آفست بررسی و در صورت لزوم فایل
//   truncate می‌شود تا هیچ‌گاه بایت تکراری نوشته نشود
//
// پروتکل:
//   GET  ?name=X                      → { partSize }  (سرنخِ ازسرگیری)
//   POST ?name=X&offset=N  (raw)      → { received }  (ثبت تکه)
//   POST ?name=X&done=1&total=T       → { name, sizeBytes }  (نهایی‌سازی)
// فایل نیمه‌کاره در «X.part» نگه داشته می‌شود و با done به نام نهایی
// تغییر نام می‌یابد (اتمیک — هرگز در جستجو دیده نمی‌شود).
// ============================================================

async function partPath(name: string): Promise<string> {
  return `${searchDbDir()}/${name}${PART_SUFFIX}`;
}

async function partSize(part: string): Promise<number> {
  try {
    return (await fsp.stat(part)).size;
  } catch {
    return 0;
  }
}

/** پاک‌سازی تکه‌های رهاشدهٔ قدیمی (بیش از ۲۴ ساعت) */
async function cleanupStaleParts(): Promise<void> {
  const dir = searchDbDir();
  let entries: fs.Dirent[] = [];
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  const cutoff = Date.now() - 24 * 3600 * 1000;
  for (const e of entries) {
    if (!e.isFile() || !isTempDbFile(e.name)) continue;
    try {
      const st = await fsp.stat(`${dir}/${e.name}`);
      if (st.mtimeMs < cutoff) await fsp.unlink(`${dir}/${e.name}`);
    } catch {
      /* ignore */
    }
  }
}

async function requireAdmin(req: NextRequest) {
  const session = await getSessionUserDb(req);
  if (!session) {
    return { error: NextResponse.json({ error: 'نشست منقضی شده — دوباره وارد شو' }, { status: 401 }) };
  }
  if (session.role !== 'admin') {
    return { error: NextResponse.json({ error: 'دسترسی فقط برای مدیر' }, { status: 403 }) };
  }
  return { session };
}

// GET ?name=X — موقعیت فعلی تکهٔ نیمه‌کاره برای ادامهٔ آپلود
export async function GET(req: NextRequest) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  const name = sanitizeFileName(req.nextUrl.searchParams.get('name') ?? '');
  if (!name) return NextResponse.json({ error: 'نام فایل نامعتبر است' }, { status: 400 });

  cleanupStaleParts().catch(() => {});
  return NextResponse.json({ ok: true, partSize: await partSize(await partPath(name)) });
}

// POST — دو حالت: ثبت یک تکه (بدون done) یا نهایی‌سازی (با done=1)
export async function POST(req: NextRequest) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  const sp = req.nextUrl.searchParams;
  const name = sanitizeFileName(sp.get('name') ?? `db-${Date.now()}.txt`);
  if (!name) return NextResponse.json({ error: 'نام فایل نامعتبر است' }, { status: 400 });

  // ---------- نهایی‌سازی ----------
  if (sp.get('done') === '1') {
    const part = await partPath(name);
    const size = await partSize(part);
    if (size === 0) {
      return NextResponse.json({ error: 'هیچ داده‌ای برای نهایی‌سازی یافت نشد' }, { status: 404 });
    }
    const total = Number(sp.get('total') ?? '');
    if (Number.isFinite(total) && total > 0 && total !== size) {
      return NextResponse.json(
        { error: 'حجم دریافتی با حجم فایل یکسان نیست — آپلود ناتمام است', partSize: size },
        { status: 409 }
      );
    }
    try {
      // اطمینان از نشستن داده روی دیسک قبل از تغییر نام
      const fh = await fsp.open(part, 'r+');
      await fh.sync();
      await fh.close();
      const target = `${searchDbDir()}/${name}`;
      await fsp.rename(part, target); // اتمیک — جایگزین نسخهٔ قبلی
      return NextResponse.json({ ok: true, name, sizeBytes: size });
    } catch (e) {
      console.error('searchdb finalize error:', e);
      return NextResponse.json({ error: 'نهایی‌سازی آپلود ناموفق بود' }, { status: 500 });
    }
  }

  // ---------- ثبت یک تکه ----------
  if (!req.body) return NextResponse.json({ error: 'بدنهٔ تکه خالی است' }, { status: 400 });

  const offset = Math.max(0, Number(sp.get('offset') ?? 0) || 0);
  const part = await partPath(name);

  try {
    const current = await partSize(part);

    // هم‌گام‌سازی آفست — ثبت تکه idempotent است
    if (offset > current) {
      // شکاف! کلاینت باید از current ادامه دهد
      return NextResponse.json(
        { error: 'آفست با سرور هم‌خوان نیست', partSize: current },
        { status: 409 }
      );
    }
    try {
      await fsp.access(part);
    } catch {
      await fsp.writeFile(part, '', { flag: 'wx' });
    }
    // offset < current → بایت‌های اضافی نیمه‌کاره قبلی حذف می‌شوند؛ offset == current → بی‌اثر
    await fsp.truncate(part, offset);

    // تکه به‌صورت استریمی به انتهای فایل (موقعیت offset) نوشته می‌شود
    const ws = fs.createWriteStream(part, { flags: 'a', start: offset });
    await pipeline(Readable.fromWeb(req.body as unknown as NodeWebReadableStream), ws);
    const received = await partSize(part);
    return NextResponse.json({ ok: true, received });
  } catch (e) {
    console.error('searchdb chunk error:', e);
    return NextResponse.json(
      { error: 'ثبت تکه ناموفق بود', partSize: await partSize(part).catch(() => 0) },
      { status: 500 }
    );
  }
}
