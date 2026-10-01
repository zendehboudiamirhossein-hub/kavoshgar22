import { createRequire } from 'module';
import { db } from '@/lib/db';

// ============================================================
// ماژول تلگرام کاوشگر — شناسایی هویت ایرانیان از طریق ربات
//
// مدیر در پنل ادمین یک اکانت تلگرام را لاگین می‌کند (کد تلگرام +
// رمز دومرحله‌ای) و آیدی ربات و دستور جستجوی هر نوع داده
// (نام / کدملی / موبایل) را تنظیم می‌کند. سپس هر کاربر واردشده
// می‌تواند مقدار موردنظر را بفرستد؛ سامانه با سشن ذخیره‌شده به
// تلگرام وصل می‌شود، دستور را به ربات می‌فرستد، مقدار را ارسال
// می‌کند و پاسخ‌های ربات را جمع‌آوری و برمی‌گرداند.
//
// داده‌های حساس (سشن و api_hash) فقط در جدول Setting سمت سرور
// می‌مانند و هرگز کامل به کلاینت برنمی‌گردند.
// ============================================================

// ---------- کلیدهای جدول Setting ----------

const K_API_ID = 'tg_api_id';
const K_API_HASH = 'tg_api_hash';
const K_PHONE = 'tg_phone';
const K_SESSION = 'tg_session';
const K_TG_NAME = 'tg_account_name';
const K_TG_USERNAME = 'tg_account_username';
const K_BOT = 'tg_bot_username';
const K_CMD_NAME = 'tg_cmd_name';
const K_CMD_NATIONAL = 'tg_cmd_national_id';
const K_CMD_MOBILE = 'tg_cmd_mobile';
const K_CMD_CARD = 'tg_cmd_card';

// ---------- اعتبارنامه پیش‌فرض اکانت سازمانی ----------
// صاحب سامانه این مقادیر را به‌عنوان مقدار دائمی تعیین کرده است؛ اگر جدول Setting
// خالی باشد (مثلاً دیتابیس تازه در نسخه publish)، همین مقادیر به‌عنوان پیش‌فرض استفاده
// می‌شوند تا ادمین فقط شماره موبایل + کد تلگرام را وارد کند.
const DEFAULT_TG_API_ID = 39703773;
const DEFAULT_TG_API_HASH = 'eb00e0cce4fc4d8d419be0e73cfd187d';

// ---------- خطای قابل نمایش به کاربر ----------

export class TelegramUserError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'TelegramUserError';
  }
}

function userErr(msg: string): never {
  throw new TelegramUserError(msg);
}

// ---------- ذخیره/خواندن تنظیمات ----------

async function getVal(key: string): Promise<string> {
  try {
    const row = await db.setting.findUnique({ where: { key } });
    return (row?.value ?? '').trim();
  } catch (e) {
    console.error(`telegram getVal(${key}) failed:`, e);
    return '';
  }
}

async function setVal(key: string, value: string): Promise<void> {
  await db.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
}

async function delVal(key: string): Promise<void> {
  await db.setting.deleteMany({ where: { key } });
}

export type IdentityType = 'name' | 'national_id' | 'mobile' | 'card';

export interface TelegramFullConfig {
  apiId: number | null;
  apiHash: string;
  phone: string;
  session: string;
  accountName: string;
  accountUsername: string;
  botUsername: string;
  commands: { name: string; nationalId: string; mobile: string; card: string };
}

export async function getTelegramConfig(): Promise<TelegramFullConfig> {
  const [apiId, apiHash, phone, session, accountName, accountUsername, bot, cmdName, cmdNational, cmdMobile, cmdCard] =
    await Promise.all([
      getVal(K_API_ID),
      getVal(K_API_HASH),
      getVal(K_PHONE),
      getVal(K_SESSION),
      getVal(K_TG_NAME),
      getVal(K_TG_USERNAME),
      getVal(K_BOT),
      getVal(K_CMD_NAME),
      getVal(K_CMD_NATIONAL),
      getVal(K_CMD_MOBILE),
      getVal(K_CMD_CARD),
    ]);
  return {
    // اگر روی سرور ذخیره نشده بود، اعتبارنامه پیش‌فرض سازمانی استفاده می‌شود
    apiId: apiId ? Number(apiId) : DEFAULT_TG_API_ID,
    apiHash: apiHash || DEFAULT_TG_API_HASH,
    phone,
    session,
    accountName,
    accountUsername,
    botUsername: bot,
    commands: { name: cmdName, nationalId: cmdNational, mobile: cmdMobile, card: cmdCard },
  };
}

export function isTelegramConfigured(cfg: TelegramFullConfig): boolean {
  return !!(cfg.session && cfg.apiId && cfg.apiHash);
}

// ---------- وضعیت لاگین نیمه‌تمام ----------
// در جدول Setting ذخیره می‌شود (نه حافظه) تا ری‌استارت یا publish مجدد سرور بین دو مرحله
// «دریافت کد» و «تایید کد» جریان ورود را قطع نکند. حاوی سشن مرحله دریافت کد است.

const K_PENDING = 'tg_pending_login';

interface PendingLogin {
  phone: string;
  apiId: number;
  apiHash: string;
  phoneCodeHash: string;
  /** سشنِ همان کلاینتی که auth.SendCode را صدا زد — کد تلگرام به همین auth-key گره خورده
   * و اگر مرحله تایید با سشن/کلید دیگری برود، تلگرام PHONE_CODE_EXPIRED می‌دهد. */
  session: string;
  createdAt: number;
}

async function getPending(): Promise<PendingLogin | null> {
  const raw = await getVal(K_PENDING);
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as PendingLogin;
    if (!p?.phoneCodeHash || !p?.session || !p?.phone) return null;
    // اعتبار ۱۰ دقیقه
    if (Date.now() - p.createdAt > 10 * 60 * 1000) {
      await delVal(K_PENDING);
      return null;
    }
    return p;
  } catch {
    return null;
  }
}

async function setPending(p: PendingLogin): Promise<void> {
  await setVal(K_PENDING, JSON.stringify(p));
}

async function clearPending(): Promise<void> {
  await delVal(K_PENDING);
}

// ---------- GramJS helpers (import داینامیک — پکیج سنگین CJS) ----------

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function withTimeout<T>(p: Promise<T>, ms: number, msg: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      p,
      new Promise<never>((_, rej) => {
        timer = setTimeout(() => rej(new TelegramUserError(msg)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

type AnyClient = {
  connect(): Promise<unknown>;
  disconnect(): Promise<unknown>;
  invoke(request: unknown): Promise<unknown>;
  getEntity(entity: string): Promise<unknown>;
  sendMessage(entity: unknown, opts: { message: string }): Promise<unknown>;
  getMessages(entity: unknown, opts: { limit: number }): Promise<unknown[]>;
  getMe(): Promise<unknown>;
  downloadMedia(message: unknown, opts?: Record<string, unknown>): Promise<unknown>;
  session: { save(): string };
};

interface TgModules {
  TelegramClient: new (session: unknown, apiId: number, apiHash: string, opts: Record<string, unknown>) => AnyClient;
  Api: any;
  StringSession: new (s: string) => unknown;
  computeCheck: (info: unknown, password: string) => Promise<unknown>;
  LogLevel: Record<string, unknown>;
}

const gt = globalThis as unknown as { __tgModules?: TgModules };

/** بازکردن namespace ماژول CJS از import داینامیک — module.exports داخل default است */
function unwrapCjs(ns: unknown): Record<string, unknown> {
  const m = ns as { default?: unknown } | null;
  if (m && typeof m === 'object' && m.default && (typeof m.default === 'object' || typeof m.default === 'function')) {
    return m.default as Record<string, unknown>;
  }
  return (ns ?? {}) as Record<string, unknown>;
}

/**
 * مسیر ۱ — import قابل‌ردیابی برای باندلر (کلید حل مشکل publish):
 * با serverExternalPackages در next.config، این import ها external می‌مانند و ردیاب
 * فایل Next هنگام build پکیج telegram را در .next/standalone/node_modules کپی می‌کند.
 * لودر قبلی با eval('require') و createRequire برای باندلر نامرئی بود؛ نتیجه: در نسخه
 * publish (خروجی standalone) پکیج کپی نمی‌شد و «Cannot find package 'telegram'» می‌داد.
 *
 * نکته حیاتی: فقط و فقط از specifier واحد «telegram» استفاده می‌کنیم — پکیج GramJS خودش
 * همه چیز را re-export می‌کند (sessions ،password ،Api ،TelegramClient). اگر subpath های
 * جدا (telegram/sessions و…) را import کنیم، در Bun نسخه‌های جدا از همان کلاس ساخته می‌شود
 * و چک instanceof داخل GramJS می‌شکند: «Only StringSession and StoreSessions supported».
 * با یک specifier، همه کلاس‌ها از یک گراف require واحد می‌آیند → همیشه سازگار.
 */
async function loadViaImport(): Promise<TgModules> {
  const mod = await import('telegram');
  const t = unwrapCjs(mod);
  if (!t.TelegramClient) throw new Error('telegram module loaded but TelegramClient missing');
  let LogLevel: Record<string, unknown> = { ERROR: 'error' };
  try {
    // LogLevel فقط یک enum است و در چک instanceof نقش ندارد — subpath مشکلی نمی‌سازد
    const logger = await import('telegram/extensions/Logger');
    LogLevel = ((unwrapCjs(logger) as Record<string, unknown>).LogLevel ?? LogLevel) as Record<string, unknown>;
  } catch {
    /* fallback پیش‌فرض */
  }
  const sessions = (t.sessions ?? {}) as Record<string, unknown>;
  const password = (t.password ?? {}) as Record<string, unknown>;
  return {
    TelegramClient: t.TelegramClient as TgModules['TelegramClient'],
    Api: t.Api,
    StringSession: sessions.StringSession as unknown as TgModules['StringSession'],
    computeCheck: password.computeCheck as TgModules['computeCheck'],
    LogLevel,
  };
}

/**
 * مسیر ۲ (fallback) — ساخت require بومی با چند استراتژی و «لود واقعی» پکیج به‌عنوان معیار.
 * ترتیب: require بومی همان باندل (eval('require')) ← import.meta.url ← __filename ← cwd.
 * در Node و Bun و خارج از باندلر کار می‌کند؛ زیرا require-cache سراسری است و همه
 * مسیرها در نهایت به همان یک نمونه ماژول می‌رسند.
 * اگر هیچ‌کدام جواب نداد، خطای شفاف فارسی با راهنمای دقیق می‌دهد (بدون «خطای نامشخص»).
 */
function createTelegramRequire(): NodeRequire {
  type ReqMaker = { label: string; make: () => NodeRequire };
  const candidates: ReqMaker[] = [];

  // ۱) require واقعی محیط اجرای همان فایل باندل‌شده (CJS در Node و Bun)
  try {
    const native = eval('require') as NodeRequire | undefined;
    if (typeof native === 'function') candidates.push({ label: 'native-require', make: () => native });
  } catch {
    /* در ESM خالص وجود ندارد */
  }
  // ۲) مبتنی بر URL ماژول
  try {
    const metaUrl = (import.meta as unknown as { url?: string } | undefined)?.url;
    if (metaUrl) candidates.push({ label: 'import.meta.url', make: () => createRequire(metaUrl) });
  } catch {
    /* در خروجی CJS ممکن است import.meta موجود نباشد */
  }
  // ۳) مبتنی بر __filename باندل
  try {
    const filename = (globalThis as unknown as { __filename?: string }).__filename;
    if (filename) candidates.push({ label: '__filename', make: () => createRequire(filename) });
  } catch {
    /* ignore */
  }
  // ۴ و ۵) مبتنی بر پوشه اجرا
  candidates.push({ label: 'cwd', make: () => createRequire(process.cwd() + '/') });
  candidates.push({ label: 'cwd-index', make: () => createRequire(process.cwd() + '/index.js') });

  let lastErr: unknown = null;
  let lastLabel = '';
  for (const c of candidates) {
    try {
      const req = c.make();
      const telegram = req('telegram') as { TelegramClient?: unknown } | undefined; // لود واقعی — معیار نهایی
      if (telegram && telegram.TelegramClient) return req;
      lastErr = new Error('module loaded but TelegramClient missing');
      lastLabel = c.label;
    } catch (e) {
      lastErr = e;
      lastLabel = c.label;
    }
  }
  throw new TelegramUserError(
    `پکیج «telegram» روی سرور پیدا نشد — مطمئن شوید در پوشه پروژه هستید و دستور «npm install» (یا در Bun: «bun install») را اجرا کرده‌اید و سرور را دوباره راه‌اندازی کنید (آخرین تلاش: ${lastLabel} — جزئیات: ${String(lastErr)})`
  );
}

/**
 * بارگذاری GramJS — همه subpath ها همیشه از یک نمونه ماژول واحد می‌آیند تا چک‌های
 * instanceof داخل خود پکیج کار کند.
 * ترتیب: اول import قابل‌ردیابی (برای build و publish)؛ اگر نشد، require بومی چندمبنایی.
 */
async function tg(): Promise<TgModules> {
  if (gt.__tgModules) return gt.__tgModules;
  try {
    const mods = await loadViaImport();
    gt.__tgModules = mods;
    return mods;
  } catch (importErr) {
    console.error('[telegram] import() failed, falling back to native require:', importErr);
  }
  const req = createTelegramRequire();
  // اینجا هم فقط از specifier واحد «telegram» استفاده می‌کنیم (re-export کامل داخل خودش هست)
  const telegram = req('telegram') as Record<string, unknown>;
  const sessions = (telegram.sessions ?? {}) as Record<string, unknown>;
  const password = (telegram.password ?? {}) as Record<string, unknown>;
  let LogLevel: Record<string, unknown> = { ERROR: 'error' };
  try {
    LogLevel = ((req('telegram/extensions/Logger') as Record<string, unknown>).LogLevel ?? LogLevel) as Record<string, unknown>;
  } catch {
    /* fallback پیش‌فرض */
  }
  gt.__tgModules = {
    TelegramClient: telegram.TelegramClient as TgModules['TelegramClient'],
    Api: telegram.Api,
    StringSession: sessions.StringSession as unknown as TgModules['StringSession'],
    computeCheck: password.computeCheck as TgModules['computeCheck'],
    LogLevel,
  };
  return gt.__tgModules;
}

async function makeClient(session: string, apiId: number, apiHash: string): Promise<AnyClient> {
  const { TelegramClient, StringSession, LogLevel } = await tg();
  const client = new TelegramClient(new StringSession(session), apiId, apiHash, {
    connectionRetries: 3,
    retryDelay: 1200,
    timeout: 12, // حداکثر انتظار هر تلاش اتصال TCP (ثانیه)
    requestRetries: 2,
    autoReconnect: false,
    // FLOOD_WAIT فوراً به‌صورت خطا برگردد نه سکوت طولانی (پیش‌فرض ۶۰ ثانیه درخواست را معلق می‌کند)
    floodSleepThreshold: 2,
  });
  try {
    // لاگ پرحجم GramJS خاموش شود
    (client as unknown as { setLogLevel(level: unknown): void }).setLogLevel(LogLevel.ERROR);
  } catch {
    /* نسخه‌های قدیمی لاگر متفاوت دارند — مهم نیست */
  }
  return client as unknown as AnyClient;
}

/** قطع کامل کلاینت + متوقف کردن حلقه آپدینت داخلی GramJS.
 * اگر فقط disconnect کنیم، حلقه _updateLoop داخلی GramJS به پینگ زدن روی اتصال بسته
 * ادامه می‌دهد و هر بار خطای «TIMEOUT» را با console.error پرینت می‌کند (اسپم بی‌پایان لاگ).
 * ست کردن _destroyed باعث می‌شود while (!client._destroyed) در همان چک بعدی خارج شود. */
async function killClient(client: AnyClient): Promise<void> {
  try {
    (client as unknown as { _destroyed?: boolean })._destroyed = true;
  } catch {
    /* ignore */
  }
  await client.disconnect().catch(() => null);
}

/** اتصال با کانفیگ سخت‌گیرانه: GramJS هنگام شکست همه تلاش‌های داخلی به‌جای throw،
 * false برمی‌گرداند — اگر چک نکنیم، درخواست بعدی روی کلاینت مرده می‌رود و خطای مبهم می‌دهد. */
async function connectClient(client: AnyClient): Promise<void> {
  let res: unknown;
  try {
    res = await withTimeout(
      client.connect(),
      45000,
      'اتصال به سرورهای تلگرام طول کشید — چند لحظه بعد دوباره تلاش کنید'
    );
  } catch (e) {
    if (e instanceof TelegramUserError) throw e;
    userErr(faTelegramError(e));
  }
  if (res === false) {
    userErr('اتصال به سرورهای تلگرام برقرار نشد — اتصال شبکه سرور را بررسی کنید و چند لحظه بعد دوباره تلاش کنید');
  }
}

/** ترجمه خطاهای رایج تلگرام به پیام فارسی */
function faTelegramError(e: unknown): string {
  const raw = String(
    (e as { errorMessage?: string })?.errorMessage ??
      (e as { message?: string })?.message ??
      ''
  );
  if (raw.includes('PHONE_NUMBER_INVALID')) return 'شماره موبایل نامعتبر است — با کد کشور وارد کنید (مثلاً +98912...)';
  if (raw.includes('PHONE_NUMBER_FLOOD')) return 'ارسال کد ورود بیش از حد مجاز است — چند دقیقه بعد دوباره تلاش کنید';
  if (raw.includes('PHONE_CODE_EMPTY')) return 'کد ورود را وارد کنید';
  if (/not connected/i.test(raw)) return 'اتصال به تلگرام قطع شد — چند لحظه بعد دوباره تلاش کنید';
  if (raw.includes('Maximum reconnection retries')) return 'اتصال به تلگرام برقرار نشد — چند لحظه بعد دوباره تلاش کنید';
  if (raw.includes('PHONE_NUMBER_UNOCCUPIED')) return 'این شماره در تلگرام ثبت نشده است';
  if (raw.includes('PHONE_CODE_INVALID')) return 'کد وارد شده اشتباه است — همان کد آخر تلگرام را دقیق وارد کنید';
  if (raw.includes('PHONE_CODE_EXPIRED')) return 'کد منقضی شده — دوباره «دریافت کد» را بزنید و کد جدید را بلافاصله وارد کنید';
  if (raw.includes('SESSION_PASSWORD_NEEDED')) return 'NEED_PASSWORD';
  if (raw.includes('PASSWORD_HASH_INVALID')) return 'رمز دومرحله‌ای اشتباه است';
  if (raw.includes('API_ID_INVALID')) return 'API ID یا API Hash نامعتبر است — از my.telegram.org درست کپی کنید';
  if (raw.includes('API_ID_PUBLISHED_FLOOD')) return 'این API ID به‌صورت عمومی افشا شده و توسط تلگرام بلاک است';
  if (raw.includes('PHONE_NUMBER_BANNED')) return 'این شماره در تلگرام مسدود شده است';
  const flood = raw.match(/FLOOD_WAIT_(\d+)/);
  if (flood) return `تلگرام محدودیت زمانی داده — ${flood[1]} ثانیه دیگر تلاش کنید`;
  if (raw.includes('AUTH_KEY_UNREGISTERED')) return 'سشن تلگرام باطل شده — دوباره وارد شوید';
  if (raw.toLowerCase().includes('timeout') || raw.toLowerCase().includes('econn') || raw.toLowerCase().includes('dns')) {
    return 'اتصال به سرورهای تلگرام برقرار نشد — اینترنت سرور را بررسی کنید';
  }
  return raw ? `خطای تلگرام: ${raw}` : 'خطای ناشناخته تلگرام — چند لحظه بعد دوباره تلاش کنید';
}

// ---------- اعتبارسنجی ورودی‌های جستجو ----------

/** یکسان‌سازی شماره موبایل ایران به شکل 09xxxxxxxxx (یا پاسsthrough بین‌المللی +) */
export function normalizeIranMobile(raw: string): string | null {
  let s = raw.replace(/[\s\-()٫]/g, '');
  // ارقام فارسی/عربی به انگلیسی
  s = s.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
  if (s.startsWith('0098')) s = `0${s.slice(4)}`;
  else if (s.startsWith('+98')) s = `0${s.slice(3)}`;
  else if (/^989\d{9}$/.test(s)) s = `0${s.slice(2)}`;
  else if (/^9\d{9}$/.test(s)) s = `0${s}`;
  if (/^09\d{9}$/.test(s)) return s;
  // شماره بین‌المللی غیر ایران — همان‌طور پاس بده
  if (/^\+\d{8,15}$/.test(s)) return s;
  return null;
}

/** اعتبارسنجی کد ملی ایران با رقم کنترل (الگوریتم رسمی) */
export function isValidNationalId(raw: string): boolean {
  const s = raw.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/\D/g, '');
  if (!/^\d{10}$/.test(s)) return false;
  if (/^(\d)\1{9}$/.test(s)) return false; // همه ارقام یکسان
  const sum = s
    .slice(0, 9)
    .split('')
    .reduce((acc, d, i) => acc + Number(d) * (10 - i), 0);
  const rem = sum % 11;
  const check = Number(s[9]);
  return rem < 2 ? check === rem : check === 11 - rem;
}

/** یکسان‌سازی شماره کارت بانکی — ارقام فارسی/عربی به انگلیسی، حذف جداکننده‌ها، خروجی ۱۶ رقمی */
export function normalizeCardNumber(raw: string): string | null {
  let s = String(raw ?? '')
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[\s\-–_.]/g, '')
    .trim();
  if (!/^\d{16}$/.test(s)) return null;
  return s;
}

/** اعتبارسنجی شماره کارت بانکی ایران (شتاب) با الگوریتم Luhn — مثل کدملی رقم کنترل دارد */
export function isValidCardNumber(raw: string): boolean {
  const s = raw.replace(/[\D]/g, '');
  if (!/^\d{16}$/.test(s)) return false;
  if (/^(\d)\1{15}$/.test(s)) return false; // همه ارقام یکسان
  let sum = 0;
  for (let i = 0; i < 16; i++) {
    let d = Number(s[i]);
    if (i % 2 === 0) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

/** پاکسازی نام و نام خانوادگی — حداقل دو واژه */
export function normalizeFullName(raw: string): string | null {
  const s = raw.trim().replace(/\s+/g, ' ');
  if (s.length < 4 || s.length > 60) return null;
  if (!/^[\p{L}\u200c\s.'-]+$/u.test(s)) return null;
  const words = s.split(' ').filter((w) => w.length > 0);
  if (words.length < 2) return null;
  return s;
}

/** پاکسازی آیدی ربات: @bot یا https://t.me/bot → bot */
export function normalizeBotUsername(raw: string): string | null {
  let s = raw.trim().replace(/^https?:\/\/(www\.)?t\.me\//i, '').replace(/^@/, '').trim();
  if (/^[a-zA-Z][a-zA-Z0-9_]{3,63}$/.test(s) && !/__/.test(s)) return s.toLowerCase();
  return null;
}

/** پاکسازی دستور ربات */
export function normalizeBotCommand(raw: string): string {
  return raw.trim().slice(0, 64);
}

/**
 * نرمال‌سازی شماره برای لاگین تلگرام — خروجی همیشه فرمت بین‌المللی +…
 * تلگرام شماره را فقط بین‌المللی قبول می‌کند؛ «09123456789» خام همان PHONE_NUMBER_INVALID می‌دهد.
 * پشتیبانی: ۰۹۱۲…، 09…، 9…، 989…، 0098…، +98… و شماره‌های بین‌المللی با +
 */
export function normalizeLoginPhone(raw: string): string | null {
  let s = String(raw ?? '')
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[\s\-().]/g, '')
    .trim();
  if (!s) return null;
  if (s.startsWith('00')) s = `+${s.slice(2)}`;
  if (!s.startsWith('+')) {
    if (/^09\d{9}$/.test(s)) s = `+98${s.slice(1)}`;
    else if (/^9\d{9}$/.test(s)) s = `+98${s}`;
    else if (/^98\d{10}$/.test(s)) s = `+${s}`;
    else return null; // شماره خارج از ایران حتماً باید + داشته باشد
  }
  if (!/^\+\d{8,15}$/.test(s)) return null;
  return s;
}

// ---------- ورود اکانت (ادمین) ----------

/** مرحله ۱: دریافت کد ورود از تلگرام.
 * اگر فرم ادمین خالی باشد، از API ID/Hash ذخیره‌شده روی سرور استفاده می‌شود؛
 * اگر مقادیر جدید وارد شود، همان‌ها استفاده و برای دفعات بعد ذخیره می‌شوند. */
export async function telegramSendCode(apiIdRaw: string, apiHashRaw: string, phoneRaw: string): Promise<{ phone: string }> {
  const providedId = String(apiIdRaw ?? '').trim();
  const providedHash = String(apiHashRaw ?? '').trim();

  let apiId: number;
  let apiHash: string;
  if (!providedId && !providedHash) {
    const saved = await getTelegramConfig();
    if (!saved.apiId || !saved.apiHash) {
      userErr('API ID و API Hash ذخیره نشده‌اند — در فرم وارد کنید تا روی سرور ذخیره شود');
    }
    apiId = saved.apiId as number;
    apiHash = saved.apiHash;
  } else {
    apiId = Number(providedId);
    apiHash = providedHash;
    if (!Number.isInteger(apiId) || apiId <= 0 || apiId > 2147483647) userErr('API ID نامعتبر است — عدد صحیح از my.telegram.org وارد کنید');
    if (apiHash.length < 30 || apiHash.length > 64) userErr('API Hash نامعتبر است — ۳۲ کاراکتر هگز از my.telegram.org وارد کنید');
    // مقادیر وارد‌شده برای دفعات بعد روی سرور ذخیره شود
    await setVal(K_API_ID, String(apiId));
    await setVal(K_API_HASH, apiHash);
  }

  const phone = normalizeLoginPhone(phoneRaw);
  if (!phone) userErr('شماره موبایل نامعتبر است — مثلاً 09121234567 یا +989121234567');

  let client: AnyClient | null = null;
  try {
    client = await makeClient('', apiId, apiHash);
    await connectClient(client);
    const { Api } = await tg();
    const sent = (await withTimeout(
      client.invoke(
        new Api.auth.SendCode({
          phoneNumber: phone.replace(/^\+/, ''),
          apiId,
          apiHash,
          settings: new Api.CodeSettings({}),
        })
      ),
      30000,
      'دریافت کد از تلگرام طول کشید — دوباره تلاش کنید'
    )) as { phoneCodeHash?: string };
    const phoneCodeHash = String(sent?.phoneCodeHash ?? '');
    if (!phoneCodeHash) userErr('تلگرام کد را ارسال نکرد — چند لحظه بعد تلاش کنید');
    // سشنِ همین کلاینت (auth-key + DC) باید در مرحله تایید کد هم استفاده شود،
    // وگرنه تلگرام کد را «منقضی» گزارش می‌کند (PHONE_CODE_EXPIRED)
    const pendingSession = String(client.session.save() ?? '');
    await setPending({ phone, apiId, apiHash, phoneCodeHash, session: pendingSession, createdAt: Date.now() });
    return { phone };
  } catch (e) {
    if (e instanceof TelegramUserError) throw e;
    return userErr(faTelegramError(e));
  } finally {
    if (client) await killClient(client);
  }
}

/** مرحله ۲: تایید کد (+ رمز دومرحله‌ای در صورت نیاز) و ذخیره سشن */
export async function telegramVerifyCode(codeRaw: string, passwordRaw?: string): Promise<{ name: string; username: string; phone: string }> {
  const pending = await getPending();
  if (!pending) userErr('ابتدا شماره را وارد و کد دریافت کنید');
  const code = String(codeRaw).replace(/\D/g, '');
  if (code.length < 4) userErr('کد ورود را کامل وارد کنید');
  const password = String(passwordRaw ?? '');

  let client: AnyClient | null = null;
  try {
    // نکته حیاتی: باید با «همان سشنی» وصل شویم که کد را درخواست کرده —
    // phoneCodeHash به auth-key همان سشن گره خورده؛ سشن خالی جدید = PHONE_CODE_EXPIRED
    client = await makeClient(pending.session || '', pending.apiId, pending.apiHash);
    await connectClient(client);
    const { Api } = await tg();

    try {
      await withTimeout(
        client.invoke(
          new Api.auth.SignIn({
            phoneNumber: pending.phone.replace(/^\+/, ''),
            phoneCodeHash: pending.phoneCodeHash,
            phoneCode: code,
          })
        ),
        30000,
        'ورود به تلگرام طول کشید — دوباره تلاش کنید'
      );
    } catch (e) {
      const msg = faTelegramError(e);
      if (msg === 'NEED_PASSWORD') {
        if (!password) userErr('NEED_PASSWORD');
        const pwdInfo = await client.invoke(new Api.account.GetPassword());
        const { computeCheck } = await tg();
        const check = await computeCheck(pwdInfo as never, password);
        await withTimeout(
          client.invoke(new Api.auth.CheckPassword({ password: check as never })),
          30000,
          'بررسی رمز دومرحله‌ای طول کشید'
        ).catch(() => userErr('رمز دومرحله‌ای اشتباه است'));
      } else if (e instanceof TelegramUserError) {
        throw e;
      } else {
        userErr(msg);
      }
    }

    const me = (await client.getMe()) as { firstName?: string; lastName?: string; username?: string; phone?: string };
    const session = client.session.save();
    const name = [me.firstName, me.lastName].filter(Boolean).join(' ') || me.username || pending.phone;
    const username = String(me.username ?? '');

    // ذخیره دائمی در دیتابیس
    await setVal(K_API_ID, String(pending.apiId));
    await setVal(K_API_HASH, pending.apiHash);
    await setVal(K_PHONE, pending.phone);
    await setVal(K_SESSION, session);
    await setVal(K_TG_NAME, name);
    await setVal(K_TG_USERNAME, username);
    await clearPending();
    return { name, username, phone: pending.phone };
  } catch (e) {
    if (e instanceof TelegramUserError) throw e;
    return userErr(faTelegramError(e));
  } finally {
    if (client) await killClient(client);
  }
}

/** خروج اکانت تلگرام از سامانه (لاگ‌اوت واقعی از تلگرام + حذف سشن) */
export async function telegramLogout(): Promise<void> {
  const cfg = await getTelegramConfig();
  if (cfg.session && cfg.apiId && cfg.apiHash) {
    let client: AnyClient | null = null;
    try {
      client = await makeClient(cfg.session, cfg.apiId, cfg.apiHash);
      await connectClient(client);
      const { Api } = await tg();
      await client.invoke(new Api.auth.LogOut()).catch(() => null);
    } catch {
      /* حتی اگر اتصال نشد، سشن محلی حذف می‌شود */
    } finally {
      if (client) await killClient(client);
    }
  }
  await Promise.all([
    delVal(K_SESSION),
    delVal(K_PHONE),
    delVal(K_TG_NAME),
    delVal(K_TG_USERNAME),
  ]);
  await clearPending();
}

/** ذخیره آیدی ربات و دستورات جستجو (ادمین) */
export async function setBotConfig(
  botUsernameRaw: string,
  commandsRaw: { name: string; nationalId: string; mobile: string; card: string }
): Promise<{ username: string; commands: { name: string; nationalId: string; mobile: string; card: string } }> {
  const rawBot = String(botUsernameRaw ?? '').trim();
  const bot = normalizeBotUsername(rawBot);
  const commands = {
    name: normalizeBotCommand(commandsRaw.name),
    nationalId: normalizeBotCommand(commandsRaw.nationalId),
    mobile: normalizeBotCommand(commandsRaw.mobile),
    card: normalizeBotCommand(commandsRaw.card),
  };
  // ورودی خالی = حذف اتصال ربات (امکان پاک‌کردن تنظیمات برای مدیر)
  // ولی ورودی پرِ نامعتبر = خطا (نباید تنظیمات را بی‌صدا پاک کند)
  if (!rawBot) {
    await delVal(K_BOT);
    await setVal(K_CMD_NAME, commands.name);
    await setVal(K_CMD_NATIONAL, commands.nationalId);
    await setVal(K_CMD_MOBILE, commands.mobile);
    await setVal(K_CMD_CARD, commands.card);
    return { username: '', commands };
  }
  if (!bot) {
    userErr('آیدی ربات نامعتبر است — فقط آیدی را وارد کنید (مثلاً MySearchBot یا لینک t.me)');
  }
  await setVal(K_BOT, bot);
  await setVal(K_CMD_NAME, commands.name);
  await setVal(K_CMD_NATIONAL, commands.nationalId);
  await setVal(K_CMD_MOBILE, commands.mobile);
  await setVal(K_CMD_CARD, commands.card);
  return { username: bot, commands };
}

// ---------- موتور جستجو در ربات ----------

export interface BotReply {
  text: string;
  date: string; // ISO
  hasMedia: boolean;
  /** اگر ربات با فایل (مثلاً txt) پاسخ داده باشد — محتوای متنی فایل */
  fileName?: string;
  fileText?: string;
  fileBytes?: number;
}

export interface IdentitySearchResult {
  replies: BotReply[];
  botUsername: string;
  command: string;
  query: { type: IdentityType; label: string; value: string };
  durationMs: number;
}

// قفل ترتیبی — گفتگو با ربات نباید بین دو کاربر قاطی شود
const gl = globalThis as unknown as { __tgSearchLock?: Promise<void> };

// ---------- دانلود و خواندن فایل پاسخ ربات (مثلاً txt) ----------

const MAX_FILE_BYTES = 3 * 1024 * 1024; // حداکثر حجم دانلود فایل
const MAX_FILE_CHARS = 150_000; // حداکثر نویسه‌های نمایشی محتوا
const TEXT_EXTENSIONS = ['.txt', '.csv', '.tsv', '.json', '.log', '.md'];

/** استخراج نام و حجم فایل از مدیای پیام ( defensively — ساختار GramJS ممکن است فرق کند) */
function docInfo(media: unknown): { fileName: string; size: number } | null {
  try {
    const m = media as
      | {
          document?: {
            size?: unknown;
            attributes?: Array<{ className?: string; fileName?: string; size?: unknown }>;
          };
        }
      | null
      | undefined;
    const doc = m?.document;
    if (!doc || typeof doc !== 'object') return null; // عکس/ویدیو و… فایل متنی نیست
    const attrs = Array.isArray(doc.attributes) ? doc.attributes : [];
    const fn = attrs.find((a) => a && typeof a.fileName === 'string');
    let size = 0;
    if (typeof doc.size === 'number') size = doc.size;
    else if (doc.size && typeof (doc.size as { toNumber?: unknown }).toNumber === 'function') {
      size = (doc.size as { toNumber(): number }).toNumber();
    }
    if (!size) {
      const attrSize = attrs.find((a) => typeof a?.size === 'number');
      size = (attrSize?.size as number | undefined) ?? 0;
    }
    return { fileName: String(fn?.fileName ?? ''), size };
  } catch {
    return null;
  }
}

function withSearchLock<T>(fn: () => Promise<T>): Promise<T> {
  const prev = gl.__tgSearchLock ?? Promise.resolve();
  const run = prev.then(fn, fn);
  gl.__tgSearchLock = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

export const IDENTITY_TYPE_LABELS: Record<IdentityType, string> = {
  name: 'نام و نام خانوادگی',
  national_id: 'کد ملی',
  mobile: 'شماره موبایل',
  card: 'شماره کارت',
};

/**
 * اجرای کامل گفتگو با ربات: ارسال دستور → انتظار → ارسال مقدار →
 * جمع‌آوری پاسخ‌های ربات (پیام‌های ورودی بعد از شروع جستجو)
 */
export async function runIdentitySearch(type: IdentityType, value: string): Promise<IdentitySearchResult> {
  const started = Date.now();
  return withSearchLock(async () => {
    const cfg = await getTelegramConfig();
    if (!isTelegramConfigured(cfg)) userErr('دیتابیس جستجو هنوز فعال نشده — مدیر سامانه باید اتصال را در پنل مدیریت تنظیم کند');
    if (!cfg.botUsername) userErr('اتصال دیتابیس جستجو کامل نشده — مدیر باید منبع جستجو را در پنل مدیریت وارد کند');
    // کلید نوع داده → کلید دستور تنظیم‌شده در پنل ادمین
    const COMMAND_KEY: Record<IdentityType, 'name' | 'nationalId' | 'mobile' | 'card'> = {
      name: 'name',
      national_id: 'nationalId',
      mobile: 'mobile',
      card: 'card',
    };
    const command = cfg.commands[COMMAND_KEY[type]];
    if (!command) userErr(`دستور جستجوی «${IDENTITY_TYPE_LABELS[type]}» در پنل مدیریت تنظیم نشده است`);

    let client: AnyClient | null = null;
    try {
      const c = await makeClient(cfg.session, cfg.apiId!, cfg.apiHash);
      client = c;
      await connectClient(c);

      // رزولو ربات با آیدی
      let bot: unknown;
      try {
        bot = await withTimeout(c.getEntity(cfg.botUsername), 20000, 'یافتن ربات طول کشید');
      } catch {
        userErr('منبع جستجو موقتاً در دسترس نیست — تنظیمات را در پنل مدیریت بررسی کنید');
      }

      // لحظه شروع برای فیلتر پیام‌های جدید (۲ ثانیه تلورانس ساعت)
      const t0 = Date.now() - 3000;
      const seen = new Set<number>();
      const replies: BotReply[] = [];

      const send = async (msg: string) => {
        await withTimeout(c.sendMessage(bot, { message: msg }), 20000, 'ارسال پیام به ربات ناموفق بود');
      };

      // مرحله ۱: دستور
      await send(command);
      // مرحله ۲: مقدار کاربر (بعد از مکث کوتاه تا ربات آماده شود)
      await sleep(1800);
      await send(value);

      // مرحله ۳: جمع‌آوری پاسخ‌ها — تا ۴۵ ثانیه؛ بعد از اولین پاسخ ۴ ثانیه سکوت کافی است
      const deadline = Date.now() + 45000;
      const noReplyDeadline = Date.now() + 22000;
      let lastNewAt = Date.now();
      while (Date.now() < deadline) {
        let fresh = 0;
        try {
          const msgs = (await withTimeout(c.getMessages(bot, { limit: 20 }), 15000, 'دریافت پیام‌ها طول کشید')) as Array<{
            id?: number;
            out?: boolean;
            date?: number;
            text?: string;
            message?: string;
            media?: unknown;
          } | null>;
          for (const m of msgs) {
            if (!m || typeof m.id !== 'number') continue;
            if (m.out) continue; // پیام‌های خودمان نیست
            if (seen.has(m.id)) continue;
            const ms = (m.date ?? 0) * 1000;
            if (ms < t0) continue; // پیام قدیمی قبل از جستجو
            seen.add(m.id);
            fresh++;
            const text = String(m.text ?? m.message ?? '').trim();
            const reply: BotReply = {
              text,
              date: new Date(ms).toISOString(),
              hasMedia: !!m.media,
            };
            // اگر ربات با فایل پاسخ داده (معمولاً txt) — دانلود و خواندن محتوا
            if (m.media) {
              const info = docInfo(m.media);
              const ext = info?.fileName && info.fileName.includes('.') ? info.fileName.slice(info.fileName.lastIndexOf('.')).toLowerCase() : '';
              const isTextFile = !!info && (TEXT_EXTENSIONS.includes(ext) || !info.fileName);
              if (isTextFile) {
                if (info!.size > MAX_FILE_BYTES) {
                  reply.fileName = info!.fileName || 'result.txt';
                  reply.fileText = `— فایل بزرگ‌تر از حد پشتیبانی است (${(info!.size / 1048576).toFixed(1)} مگابایت؛ حداکثر ۳ مگابایت) —`;
                } else {
                  try {
                    const buf = (await withTimeout(
                      c.downloadMedia(m, {}),
                      45000,
                      'دانلود فایل پاسخ ربات طول کشید — دوباره تلاش کنید'
                    )) as Uint8Array | undefined;
                    if (buf && buf.length > 0) {
                      let content = Buffer.from(buf).toString('utf8');
                      if (content.length > MAX_FILE_CHARS) {
                        content = content.slice(0, MAX_FILE_CHARS) + '\n… (ادامه فایل برای نمایش حذف شد — حجم محتوا زیاد است)';
                      }
                      reply.fileName = info?.fileName || 'result.txt';
                      reply.fileText = content;
                      reply.fileBytes = buf.length;
                    }
                  } catch (e) {
                    reply.fileText = `— دانلود فایل پاسخ ناموفق بود: ${String((e as { message?: string })?.message ?? e)} —`;
                  }
                }
              }
            }
            if (!reply.text && !reply.fileText) reply.text = '— پیام چندرسانه‌ای بدون متن —';
            replies.push(reply);
          }
        } catch (e) {
          if (e instanceof TelegramUserError) throw e;
          // خطای موقت polling — ادامه بده
        }
        if (fresh > 0) lastNewAt = Date.now();
        if (replies.length > 0 && Date.now() - lastNewAt > 4000) break; // سکوت بعد از پاسخ = پایان
        if (replies.length === 0 && Date.now() > noReplyDeadline) break; // بدون پاسخ
        await sleep(900);
      }

      return {
        replies: replies.reverse(), // قدیمی به جدید
        botUsername: cfg.botUsername,
        command,
        query: { type, label: IDENTITY_TYPE_LABELS[type], value },
        durationMs: Date.now() - started,
      };
    } catch (e) {
      if (e instanceof TelegramUserError) throw e;
      userErr(faTelegramError(e));
    } finally {
      if (client) await killClient(client);
    }
  });
}
