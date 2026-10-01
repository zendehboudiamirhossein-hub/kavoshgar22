import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';

// ============================================================
// موتور جستجوی دیتابیس‌های TXT (شناسایی اکانت فیسبوک)
//
// چند فایل متنی بزرگ (خروجی دیتابیس) روی سرور ذخیره می‌شود و
// هر متن یا عددی که کاربر وارد کند در همه فایل‌ها جستجو می‌شود.
// در صورت یافتن، «کل خط» حاوی مورد به کاربر برگردانده می‌شود.
//
// طراحی برای فایل‌های چندصد مگابایتی تا چند گیگابایتی:
// - اسکن تکه‌تکه (چانک ۸ مگابایتی) با حافظه ثابت — فایل هرگز
//   کامل در RAM بارگذاری نمی‌شود
// - جستجو با Buffer.indexOf (کد بومی و بسیار سریع V8)
// - هم‌پوشانی ۱ مگابایتی بین تکه‌ها تا هیچ موردی بین مرز
//   تکه‌ها از دست نرود
// - جستجوی موازی چند فایل
// - تبدیل ارقام فارسی/عربی به انگلیسی به‌عنوان گونه‌های جستجو
// ============================================================

const CHUNK_SIZE = 8 * 1024 * 1024; // 8MB — تکه خواندن
const OVERLAP = 1024 * 1024; // 1MB — هم‌پوشانی مرز تکه‌ها
const MAX_RESULTS_PER_FILE = 200; // سقف نتیجه هر فایل
const MAX_LINE_CHARS = 1500; // حداکثر طول خط نمایشی (بقیه با … )
const MAX_QUERY_CHARS = 300;
const FILE_CONCURRENCY = 3; // تعداد فایل جستجوی همزمان
const ACCEPTED_EXT = ['.txt', '.csv', '.log', '.tsv', '.text', '.dat'];

const NL = 0x0a; // \n

// ---------- مسیر پوشه دیتابیس‌ها ----------

/** پوشه ذخیره فایل‌های جستجو — روی Railway داخل ولیوم پایدار است */
export function searchDbDir(): string {
  let base: string | null = null;
  if (process.env.SEARCHDB_DIR) {
    base = process.env.SEARCHDB_DIR;
  } else if (process.env.DATA_DIR) {
    base = path.join(process.env.DATA_DIR, 'searchdb');
  } else if (process.env.DATABASE_URL?.startsWith('file:')) {
    const dbPath = process.env.DATABASE_URL.slice('file:'.length).split('?')[0];
    base = path.join(path.dirname(dbPath), 'searchdb');
  }
  if (!base) base = path.join(process.cwd(), 'data', 'searchdb');
  try {
    fs.mkdirSync(base, { recursive: true });
  } catch {
    /* در محیط فقط-خواندنی بی‌صدا رد شود */
  }
  return base;
}

/** پاک‌سازی نام فایل (جلوگیری از خروج از پوشه و کاراکترهای خطرناک) */
export function sanitizeFileName(raw: string): string {
  let s = path.basename(String(raw ?? ''))
    .replace(/[\\/:*?"<>|\u0000]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/^\.+/, '')
    .trim();
  s = s.slice(0, 120);
  return s || `db-${Date.now()}.txt`;
}

// ---------- فایل‌های موقت آپلود ----------

/** پسوند فایل موقتِ آپلود چندتکه‌ای (قبل از نهایی‌شدن) */
export const PART_SUFFIX = '.part';

/** آیا این نام، فایل موقتِ در حال آپلود است؟ (نباید در فهرست/جستجو دیده شود) */
export function isTempDbFile(name: string): boolean {
  return name.endsWith(PART_SUFFIX) || /\.uploading-\d+$/.test(name);
}

// ---------- فهرست فایل‌ها ----------

export interface DbFileInfo {
  name: string;
  sizeBytes: number;
  mtimeMs: number;
}

export async function listDbFiles(): Promise<DbFileInfo[]> {
  const dir = searchDbDir();
  let entries: fs.Dirent[] = [];
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: DbFileInfo[] = [];
  for (const e of entries) {
    if (!e.isFile()) continue;
    if (e.name.startsWith('.')) continue;
    if (isTempDbFile(e.name)) continue; // آپلودهای نیمه‌کاره هرگز در فهرست نیستند
    try {
      const st = await fsp.stat(path.join(dir, e.name));
      out.push({ name: e.name, sizeBytes: st.size, mtimeMs: st.mtimeMs });
    } catch {
      /* فایل در حال حذف — رد شود */
    }
  }
  out.sort((a, b) => a.name.localeCompare(b.name, 'fa'));
  return out;
}

export function isAcceptedDbFile(name: string): boolean {
  const ext = path.extname(name).toLowerCase();
  if (!ext) return true; // بدون پسوند هم پذیرفته می‌شود
  return ACCEPTED_EXT.includes(ext);
}

// ---------- گونه‌های جستجو (نرمال‌سازی ارقام و حروف) ----------

const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';

function toAsciiDigits(s: string): string {
  let out = '';
  for (const ch of s) {
    const fi = FA_DIGITS.indexOf(ch);
    if (fi >= 0) {
      out += String(fi);
      continue;
    }
    const ai = AR_DIGITS.indexOf(ch);
    if (ai >= 0) {
      out += String(ai);
      continue;
    }
    out += ch;
  }
  return out;
}

/** گونه‌های بایتی عبارت جستجو: عین عبارت + ارقام انگلیسی + حروف کوچک/بزرگ */
export function buildVariants(query: string): string[] {
  const set = new Set<string>();
  const q = query.trim().slice(0, MAX_QUERY_CHARS);
  if (!q) return [];
  set.add(q);
  const ascii = toAsciiDigits(q);
  if (ascii !== q) set.add(ascii);
  if (/[a-z]/i.test(ascii)) {
    set.add(ascii.toLowerCase());
    set.add(ascii.toUpperCase());
  }
  return [...set].slice(0, 4);
}

// ---------- اسکن یک فایل ----------

export interface LineMatch {
  offset: number; // آفست بایتی شروع خط در فایل
  line: string; // کل خط حاوی مورد
  truncatedLine: boolean; // خط از MAX_LINE_CHARS بلندتر بود
}

interface FileScanResult {
  name: string;
  sizeBytes: number;
  matchCount: number; // تعداد خط یافت‌شده (تا سقف)
  truncated: boolean; // به سقف رسید و اسکن متوقف شد
  matches: LineMatch[]; // خطوط (تا سقف)
  elapsedMs: number;
  error?: string;
}

async function scanFile(
  filePath: string,
  name: string,
  termBufs: Buffer[]
): Promise<FileScanResult> {
  const t0 = Date.now();
  const base: FileScanResult = {
    name,
    sizeBytes: 0,
    matchCount: 0,
    truncated: false,
    matches: [],
    elapsedMs: 0,
  };
  let fh: fs.promises.FileHandle | null = null;
  try {
    fh = await fsp.open(filePath, 'r');
    const size = (await fh.stat()).size;
    base.sizeBytes = size;
    if (size === 0) {
      base.elapsedMs = Date.now() - t0;
      return base;
    }

    const buf = Buffer.allocUnsafe(Math.min(CHUNK_SIZE + OVERLAP, size + OVERLAP));
    let readPos = 0; // موقعیت خواندن بعدی از فایل (اولین بایتی که هنوز در بافر نیست)
    let carry = 0; // بایت‌های هم‌پوشانی ابتدای بافر (از تکه قبل)
    const seen = new Set<number>(); // آفست مطلق خطوط گزارش‌شده

    while (readPos < size) {
      const want = Math.min(CHUNK_SIZE, size - readPos);
      const { bytesRead } = await fh.read(buf, carry, want, readPos);
      if (bytesRead <= 0) break;
      const valid = carry + bytesRead; // ناحیه معتبر: buf[0..valid)
      const absBase = readPos - carry; // آفست مطلق متناظر با buf[0] — پوشش کامل [absBase, absBase+valid)

      for (const tb of termBufs) {
        let idx = buf.subarray(0, valid).indexOf(tb, 0);
        while (idx !== -1) {
          // ابتدای خط: آخرین \n قبل از مورد
          const lsRel = buf.subarray(0, idx).lastIndexOf(NL);
          const lineStart = lsRel === -1 ? 0 : lsRel + 1;
          const absLineStart = absBase + lineStart;
          if (!seen.has(absLineStart)) {
            seen.add(absLineStart);
            // انتهای خط: اولین \n بعد از مورد
            const le = buf.subarray(0, valid).indexOf(NL, idx + tb.length);
            const lineEnd = le === -1 ? valid : le;
            let line = buf.toString('utf8', lineStart, lineEnd).trimEnd();
            let truncatedLine = le === -1 && absBase + lineEnd < size; // خط به تکه بعدی می‌رسد
            if (line.length > MAX_LINE_CHARS) {
              line = line.slice(0, MAX_LINE_CHARS);
              truncatedLine = true;
            }
            if (line.trim().length > 0) {
              base.matches.push({ offset: absLineStart, line, truncatedLine });
              base.matchCount++;
              if (base.matchCount >= MAX_RESULTS_PER_FILE) {
                base.truncated = true;
                break;
              }
            }
          }
          idx = buf.subarray(0, valid).indexOf(tb, idx + tb.length);
          if (base.truncated) break;
        }
        if (base.truncated) break;
      }

      if (base.truncated) break;

      // آماده‌سازی تکه بعد: انتقال دنباله (هم‌پوشانی) به ابتدای بافر
      const newCarry = Math.min(OVERLAP, bytesRead);
      if (newCarry > 0) {
        buf.copy(buf, 0, valid - newCarry, valid);
      }
      carry = newCarry;
      readPos += bytesRead;
    }

    base.elapsedMs = Date.now() - t0;
    return base;
  } catch (e) {
    base.error = e instanceof Error ? e.message : String(e);
    base.elapsedMs = Date.now() - t0;
    return base;
  } finally {
    try {
      await fh?.close();
    } catch {
      /* ignore */
    }
  }
}

// ---------- جستجوی همه فایل‌ها ----------

export interface SearchDbResult {
  query: string;
  variants: string[];
  totalFiles: number;
  totalMatches: number;
  elapsedMs: number;
  files: FileScanResult[];
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

/** جستجوی عبارت در همه فایل‌های دیتابیس — خروجی: کل خطوط منطبق */
export async function searchDbFiles(query: string): Promise<SearchDbResult> {
  const t0 = Date.now();
  const dir = searchDbDir();
  const files = await listDbFiles();
  const variants = buildVariants(query);
  const termBufs = variants.map((v) => Buffer.from(v, 'utf8'));

  if (!variants.length || !files.length || !termBufs.length) {
    return {
      query,
      variants,
      totalFiles: files.length,
      totalMatches: 0,
      elapsedMs: Date.now() - t0,
      files: [],
    };
  }

  const results = await mapLimit(files, FILE_CONCURRENCY, (f) =>
    scanFile(path.join(dir, f.name), f.name, termBufs)
  );

  const totalMatches = results.reduce((a, r) => a + r.matchCount, 0);
  return {
    query,
    variants,
    totalFiles: files.length,
    totalMatches,
    elapsedMs: Date.now() - t0,
    files: results,
  };
}
