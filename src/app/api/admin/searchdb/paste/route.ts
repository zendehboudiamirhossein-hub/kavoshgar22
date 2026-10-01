import { NextRequest, NextResponse } from 'next/server';
import { Readable, Transform } from 'stream';
import { pipeline } from 'stream/promises';
import type { ReadableStream as NodeWebReadableStream } from 'stream/web';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { getSessionUserDb } from '@/lib/auth';
import { sanitizeFileName, searchDbDir } from '@/lib/searchdb';

export const runtime = 'nodejs';
export const maxDuration = 600;

// ============================================================
// افزودن دستی داده (Paste) به دیتابیس جستجو — فقط مدیر
//
// مدیر متن را از فایل TXT کپی و در باکس پنل می‌چسباند؛ متن خام با
// بدنهٔ درخواست (text/plain) به‌صورت استریمی ذخیره می‌شود:
// - حالت «فایل جدید»: نوشتن در فایل موقت + fsync + تغییر نام اتمیک
// - حالت «افزودن به فایل موجود»: الحاق به انتهای فایل با مرز خطِ
//   سالم (اگر انتهای فایل با \n تمام نشده باشد، اول \n گذاشته می‌شود)
// - نرمال‌سازی خط‌ها: CRLF و CR تنها → LF + اطمینان از \n پایانی
//   (مرز \r\n بین تکه‌ها هم درست مدیریت می‌شود)
// ============================================================

/** ترنسفورم نرمال‌سازی خط‌ها روی جریان بایت (UTF-8-safe: \r و \n هرگز بخشی از نویسهٔ چندبایتی نیستند) */
function textNormalizeStream(): Transform {
  let pendingCR = false; // \r انتهای تکه قبلی — ممکن است \r\n بین‌مرزی باشد
  let lastByte = -1; // آخرین بایت خروجی تا این لحظه
  return new Transform({
    transform(chunk: Buffer, _enc, cb) {
      const out: number[] = [];
      let i = 0;
      if (pendingCR) {
        pendingCR = false;
        if (chunk.length > 0 && chunk[0] === 0x0a) {
          i = 1; // \r\n بین‌مرزی — \n آن همین‌جا مصرف می‌شود
        } else {
          out.push(0x0a); // \r تنها
        }
      }
      while (i < chunk.length) {
        const b = chunk[i];
        if (b === 0x0d) {
          out.push(0x0a);
          if (i + 1 < chunk.length) {
            if (chunk[i + 1] === 0x0a) i += 2;
            else i += 1;
          } else {
            pendingCR = true;
            i += 1;
          }
        } else {
          out.push(b);
          i += 1;
        }
      }
      if (out.length) {
        lastByte = out[out.length - 1];
        cb(null, Buffer.from(out));
      } else {
        cb();
      }
    },
    flush(cb) {
      const tail: number[] = [];
      if (pendingCR || lastByte !== 0x0a) tail.push(0x0a); // \n پایانی برای سطر آخر
      if (tail.length) cb(null, Buffer.from(tail));
      else cb();
    },
  });
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

// POST /api/admin/searchdb/paste?name=X[&append=1]
export async function POST(req: NextRequest) {
  const { error } = await requireAdmin(req);
  if (error) return error;
  if (!req.body) return NextResponse.json({ error: 'متن خالی است' }, { status: 400 });

  const sp = req.nextUrl.searchParams;
  let name = sanitizeFileName(sp.get('name') ?? '');
  if (!name) name = `paste-${Date.now()}.txt`;
  // اگر پسوند ندارد .txt اضافه شود تا در فهرست یکدست باشد
  if (!path.extname(name)) name = `${name}.txt`;

  const append = sp.get('append') === '1';
  const dir = searchDbDir();
  const target = `${dir}/${name}`;

  try {
    if (!append) {
      // ---------- فایل جدید / جایگزینی کامل ----------
      const tmp = `${target}.uploading-${Date.now()}`;
      const ws = fs.createWriteStream(tmp, { flags: 'w' });
      await pipeline(Readable.fromWeb(req.body as unknown as NodeWebReadableStream), textNormalizeStream(), ws);
      const size = (await fsp.stat(tmp).catch(() => null))?.size ?? 0;
      if (size === 0) {
        await fsp.unlink(tmp).catch(() => {});
        return NextResponse.json({ error: 'متنی برای ذخیره وارد نشده است' }, { status: 400 });
      }
      const fh = await fsp.open(tmp, 'r+');
      await fh.sync();
      await fh.close();
      await fsp.rename(tmp, target); // اتمیک
      return NextResponse.json({ ok: true, name, sizeBytes: size, appended: false });
    }

    // ---------- افزودن به انتهای فایل موجود ----------
    const st = await fsp.stat(target).catch(() => null);
    let prependNl = false;
    if (st && st.size > 0) {
      const fh = await fsp.open(target, 'r');
      const one = Buffer.alloc(1);
      await fh.read(one, 0, 1, st.size - 1);
      await fh.close();
      prependNl = one[0] !== 0x0a; // مرز خط سالم بین دادهٔ قبلی و متن چسبانده‌شده
    }
    const sizeBefore = st?.size ?? 0;
    const ws = fs.createWriteStream(target, { flags: 'a' });
    if (prependNl) ws.write('\n');
    await pipeline(Readable.fromWeb(req.body as unknown as NodeWebReadableStream), textNormalizeStream(), ws);
    const sizeAfter = (await fsp.stat(target)).size;
    const written = sizeAfter - sizeBefore - (prependNl ? 1 : 0);
    if (written <= 0 && !st) {
      return NextResponse.json({ error: 'متنی برای ذخیره وارد نشده است' }, { status: 400 });
    }
    return NextResponse.json({ ok: true, name, sizeBytes: sizeAfter, appended: true });
  } catch (e) {
    console.error('searchdb paste error:', e);
    return NextResponse.json({ error: 'ذخیرهٔ متن ناموفق بود — دوباره تلاش کنید' }, { status: 500 });
  }
}
