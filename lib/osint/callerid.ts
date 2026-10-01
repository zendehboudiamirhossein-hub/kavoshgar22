import { safeFetch, type FetchOutcome } from './net';
import { parsePhoneNumber } from 'libphonenumber-js/max';

// ============================================================
// لایه «نام ثبت‌شده شماره» — Truecaller و NumberBox
// Truecaller: اندپوینت رسمی سرویس جستجو (search5-noneu.truecaller.com/v2/search)
//   با توکن حساب (installationId از فرایند ورود با کد تأیید پیامکی)
//   ورود: sendOnboardingOtp → کد پیامکی → verifyOnboardingOtp → installationId
// NumberBox: سرویس ایرانی نام شماره — در صورت مسدود بودن آی‌پی سرور، شفاف گزارش می‌شود
// اصل ثابت کاوشگر: هیچ نامی جعل نمی‌شود؛ عدم دسترسی با علت دقیق گزارش می‌شود.
// ============================================================

const TC_SEARCH_BASE = 'https://search5-noneu.truecaller.com';
const TC_ACCOUNT_BASE = 'https://account-asia-south1.truecaller.com';
const TC_UA = 'Truecaller/11.75.5 (Android;10)';
const TC_CLIENT_SECRET = 'lvc22mp3l1sfv6ujg83rd17btt'; // کلید عمومی سرویس موبایل تروکالر

// دستگاه‌های واقعی رایج برای شبیه‌سازی کلاینت اندروید
const TC_DEVICES = [
  { manufacturer: 'Xiaomi', model: 'M2010J19SG' },
  { manufacturer: 'Xiaomi', model: 'Redmi 9A' },
  { manufacturer: 'Samsung', model: 'SM-G991B' },
];

/** شماره در فرمت‌های مختلف — خروجی libphonenumber در phone.ts به این لایه داده می‌شود */
export interface CallerIdPhoneParts {
  /** E.164 بدون علامت + مثل 989121234567 (significant number) */
  significant: string;
  /** کد ISO کشور مثل IR */
  countryCode: string;
  /** کد شماره‌گیری مثل 98 */
  dialingCode: string;
}

// ────────────────────────────────────────────────────────────
// Truecaller — ورود با کد تأیید پیامکی (دو مرحله‌ای)
// ────────────────────────────────────────────────────────────

function randomId(len: number): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  const buf = new Uint8Array(len);
  crypto.getRandomValues(buf);
  for (let i = 0; i < len; i++) s += chars[buf[i] % chars.length];
  return s;
}

export interface TcOtpSendResult {
  ok: boolean;
  requestId?: string;
  /** اگر تروکالر درخواست را تعلیق کند (true) — معمولاً به‌خاطر محدودیت سرورهای خارجی */
  suspended?: boolean;
  message?: string;
}

// الگوی پاسخ «فرمت بدنه نامعتبر» — نشانه نیاز به تلاش با فرمت جایگزین dialingCode
const TC_BODY_FORMAT_REJECT = /invalid\s*body|body\s*format|malformed\s*body/i;

/**
 * مقادیر ممکن dialingCode به ترتیب تلاش:
 * اسکیمای فعلی سرور تروکالر dialingCode را به‌صورت «عدد JSON» انتظار دارد (98 نه "98" و نه "+98")؛
 * فرمت‌های رشته‌ای به‌عنوان پشتیبان در صورت پاسخ 40001 (Invalid body format) امتحان می‌شوند.
 */
function tcDialingVariants(parts: CallerIdPhoneParts): Array<number | string> {
  const digits = parts.dialingCode.replace(/\D/g, '');
  const variants: Array<number | string> = [];
  const push = (v: number | string) => {
    if (v !== '' && !variants.includes(v)) variants.push(v);
  };
  const asNumber = Number(digits);
  if (digits && Number.isFinite(asNumber)) push(asNumber); // فرمت صحیح — عدد JSON
  push(digits);          // پشتیبان: رشته عددی
  push('+' + digits);    // پشتیبان: با +
  return variants;
}

function tcInstallationDetails() {
  const device = TC_DEVICES[Math.floor(Math.random() * TC_DEVICES.length)];
  return {
    app: { buildVersion: 5, majorVersion: 11, minorVersion: 7, store: 'GOOGLE_PLAY' },
    device: {
      deviceId: randomId(16),
      language: 'en',
      manufacturer: device.manufacturer,
      model: device.model,
      osName: 'Android',
      osVersion: '10',
      mobileServices: ['GMS'],
    },
    language: 'en',
  };
}

async function tcAccountPost(path: string, body: Record<string, unknown>): Promise<{ res: FetchOutcome; json: any }> {
  const res = await safeFetch(`${TC_ACCOUNT_BASE}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json; charset=UTF-8',
      'accept-encoding': 'gzip',
      'user-agent': TC_UA,
      clientsecret: TC_CLIENT_SECRET,
    },
    body: JSON.stringify(body),
    timeoutMs: 15000,
  });
  let json: any;
  try {
    json = JSON.parse(res.body.trim());
  } catch {
    json = undefined;
  }
  return { res, json };
}

/** ترجمه خطاهای شناخته‌شده ارسال کد به پیام روان (شفاف، بدون جعل) */
function translateTcSendError(status: number | undefined, srvMsg: string | undefined): string | undefined {
  const msg = srvMsg ?? '';
  if (status === 40003 || /invalid phone/i.test(msg)) {
    return 'Truecaller این شماره را معتبر تشخیص نداد (Invalid phone number) — شماره را بررسی کنید یا شماره دیگری امتحان کنید';
  }
  if (status === 20003 || /verification failed/i.test(msg)) {
    return 'Truecaller نتوانست پیامک کد را به این شماره ارسال کند (Verification failed) — از فعال بودن شماره مطمئن شوید یا شماره دیگری امتحان کنید';
  }
  return srvMsg;
}

/** مرحله ۱ ورود: ارسال کد تأیید پیامکی Truecaller به شماره (پشتیبانی از همه کشورها) */
export async function tcSendOtp(phone: CallerIdPhoneParts): Promise<TcOtpSendResult> {
  const variants = tcDialingVariants(phone);
  let lastMessage = 'ارسال کد تأیید ناموفق بود';

  for (const dialingCode of variants) {
    try {
      const { res, json } = await tcAccountPost('/v2/sendOnboardingOtp', {
        countryCode: (phone.countryCode || 'IR').toUpperCase(),
        dialingCode,
        installationDetails: tcInstallationDetails(),
        phoneNumber: phone.significant,
        region: 'region-2',
        sequenceNo: 2,
      });

      if (res.error || res.status === 0) {
        return { ok: false, message: 'اتصال به سرور Truecaller برقرار نشد' };
      }
      if (json?.suspended === true) {
        return {
          ok: false,
          suspended: true,
          message: 'Truecaller این درخواست را معلق کرد — چند دقیقه بعد یا با شماره دیگر تلاش کنید (محدودیت خود سرویس)',
        };
      }

      const srvMsg = typeof json?.message === 'string' && json.message ? json.message : undefined;
      const status = typeof json?.status === 'number' ? json.status : undefined;

      // ارسال موفق طبق رفتار مرجع: status 1 یا 9 یا پیام "Sent" همراه requestId
      if (json?.requestId && (status === undefined || status === 1 || status === 9 || srvMsg === 'Sent')) {
        return { ok: true, requestId: String(json.requestId), message: 'کد تأیید پیامکی ارسال شد' };
      }

      // حد تلاش‌ها پر شده — بدون تلاش مجدد
      if (status === 5 || status === 6) {
        return { ok: false, message: 'حد تلاش‌های ارسال کد پر شده — چند دقیقه بعد دوباره تلاش کنید' };
      }

      lastMessage = translateTcSendError(status, srvMsg) ?? `ارسال کد تأیید ناموفق بود (کد ${res.status})`;
      // بدنه رد شد (Invalid body format / 40001) → تلاش با فرمت جایگزین dialingCode
      if (status === 40001 || (srvMsg && TC_BODY_FORMAT_REJECT.test(srvMsg))) continue;
      return { ok: false, message: lastMessage };
    } catch {
      return { ok: false, message: 'اتصال به سرور Truecaller برقرار نشد' };
    }
  }
  return { ok: false, message: lastMessage };
}

export interface TcOtpVerifyResult {
  ok: boolean;
  /** توکن جستجو (installationId) — در صورت موفقیت در تنظیمات سازمانی ذخیره می‌شود */
  token?: string;
  message?: string;
}

/** مرحله ۲ ورود: تأیید کد پیامکی و دریافت توکن جستجو (installationId) — پشتیبانی از همه کشورها */
export async function tcVerifyOtp(phone: CallerIdPhoneParts, requestId: string, otp: string): Promise<TcOtpVerifyResult> {
  const variants = tcDialingVariants(phone);
  let lastMessage = 'تأیید کد ناموفق بود';

  for (const dialingCode of variants) {
    try {
      const { res, json } = await tcAccountPost('/v1/verifyOnboardingOtp', {
        countryCode: (phone.countryCode || 'IR').toUpperCase(),
        dialingCode,
        phoneNumber: phone.significant,
        requestId,
        token: otp,
      });

      if (res.error || res.status === 0) {
        return { ok: false, message: 'اتصال به سرور Truecaller برقرار نشد' };
      }

      const srvMsg = [json?.message, json?.errorMessage].find((m) => typeof m === 'string' && m) as string | undefined;
      const status = typeof json?.status === 'number' ? json.status : undefined;

      // بدنه رد شد (Invalid body format / 40001) → تلاش با فرمت جایگزین dialingCode
      if (status === 40001 || (srvMsg && TC_BODY_FORMAT_REJECT.test(srvMsg))) {
        lastMessage = srvMsg ?? 'Invalid body format';
        continue;
      }

      if (json?.suspended === true) {
        return { ok: false, message: 'حساب Truecaller در این فرایند معلق شده — بعداً تلاش کنید' };
      }
      // موفقیت طبق رفتار مرجع: status 2 همراه installationId
      if (json?.installationId && (status === undefined || status === 2)) {
        return { ok: true, token: String(json.installationId), message: 'ورود موفق — توکن جستجو دریافت شد' };
      }
      if (status === 11 || json?.invalid === true) {
        return { ok: false, message: 'کد تأیید نامعتبر است — کد ۶ رقمی دریافتی را دقیق وارد کنید' };
      }
      if (status === 7) {
        return { ok: false, message: 'حد تلاش‌های نامعتبر پر شده — درخواست کد جدید بدهید' };
      }
      if (srvMsg) return { ok: false, message: srvMsg };
      lastMessage = `تأیید کد ناموفق بود (کد ${res.status})`;
    } catch {
      return { ok: false, message: 'اتصال به سرور Truecaller برقرار نشد' };
    }
  }
  return { ok: false, message: lastMessage };
}

// ────────────────────────────────────────────────────────────
// Truecaller — جستجوی نام شماره با توکن (با کش ۱۰ دقیقه‌ای)
// ────────────────────────────────────────────────────────────

export interface CallerIdResult {
  ok: boolean;
  found: boolean;
  name?: string;
  altName?: string;
  country?: string;
  error?: 'no-token' | 'invalid-token' | 'blocked' | 'network' | 'parse';
  message?: string;
}

const tcCache = new Map<string, { at: number; value: CallerIdResult }>();
const TC_CACHE_TTL_MS = 10 * 60 * 1000;

/** جستجوی نام شماره در Truecaller — توکن معتبر لازم است */
export async function tcSearchName(phone: CallerIdPhoneParts, token: string): Promise<CallerIdResult> {
  const t = token.trim();
  if (!t) {
    return { ok: false, found: false, error: 'no-token', message: 'توکن Truecaller تنظیم نشده است' };
  }

  const cacheKey = `${phone.significant}:${t.slice(-8)}`;
  const cached = tcCache.get(cacheKey);
  if (cached && Date.now() - cached.at < TC_CACHE_TTL_MS) return cached.value;

  let value: CallerIdResult;
  try {
    const params = new URLSearchParams({
      q: phone.significant,
      countryCode: phone.countryCode || 'IR',
      type: '4',
      locAddr: '',
      placement: 'SEARCHRESULTS,HISTORY,DETAILS',
      encoding: 'json',
    });
    const res = await safeFetch(`${TC_SEARCH_BASE}/v2/search?${params}`, {
      headers: {
        'content-type': 'application/json; charset=UTF-8',
        'accept-encoding': 'gzip',
        'user-agent': TC_UA,
        Authorization: `Bearer ${t}`,
      },
      timeoutMs: 15000,
    });

    let json: any;
    const trimmed = res.body.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        json = JSON.parse(trimmed);
      } catch {
        json = undefined;
      }
    }

    if (res.error || res.status === 0) {
      value = { ok: false, found: false, error: 'network', message: 'اتصال به سرور Truecaller برقرار نشد' };
    } else if (res.status === 401 || json?.status === 40101) {
      value = { ok: false, found: false, error: 'invalid-token', message: 'توکن Truecaller نامعتبر یا منقضی شده است' };
    } else if (res.status === 429) {
      value = { ok: false, found: false, error: 'blocked', message: 'محدودیت نرخ درخواست Truecaller — کمی بعد دوباره تلاش کنید' };
    } else if (!res.ok) {
      value = { ok: false, found: false, error: 'network', message: `خطای سرویس Truecaller (کد ${res.status})` };
    } else {
      const first = Array.isArray(json?.data) ? json.data[0] : null;
      if (first?.name) {
        const addr = Array.isArray(first.addresses) ? first.addresses[0] : null;
        value = {
          ok: true,
          found: true,
          name: String(first.name).trim(),
          altName: first.altName ? String(first.altName).trim() : undefined,
          country: addr?.countryCode ?? undefined,
        };
      } else {
        // پاسخ ۲۰۰ بدون نتیجه = پاسخ قطعی سرویس: این شماره در Truecaller ثبت نشده
        value = { ok: true, found: false, message: 'این شماره در Truecaller ثبت نشده است (پاسخ قطعی سرویس)' };
      }
    }
  } catch {
    value = { ok: false, found: false, error: 'network', message: 'اتصال به سرور Truecaller برقرار نشد' };
  }

  tcCache.set(cacheKey, { at: Date.now(), value });
  return value;
}

// ────────────────────────────────────────────────────────────
// NumberBox — نام شماره (سرویس ایرانی)
// سرور NumberBox دسترسی از آی‌پی‌های خارج از ایران را مسدود می‌کند؛
// در آن حالت شفاف گزارش می‌شود (روی سرور داخل ایران به‌درستی کار می‌کند).
// ────────────────────────────────────────────────────────────

const nbCache = new Map<string, { at: number; value: CallerIdResult }>();
const NB_CACHE_TTL_MS = 10 * 60 * 1000;

function nbCandidates(significant: string): string[] {
  return [
    `https://numberbox.ir/api/v1/search?number=${significant}`,
    `https://numberbox.ir/api/search?q=${significant}`,
    `https://numberbox.ir/api/v1/numbers/${significant}`,
  ];
}

function extractNbName(json: any): string | null {
  if (!json || typeof json !== 'object') return null;
  const direct = json.name ?? json.fullName ?? json.displayName ?? json.data?.name ?? json.data?.fullName ?? json.result?.name;
  return typeof direct === 'string' && direct.trim() ? direct.trim() : null;
}

export async function numberBoxSearchName(phone: CallerIdPhoneParts): Promise<CallerIdResult> {
  const sig = phone.significant;
  if (!sig) {
    return { ok: false, found: false, error: 'parse', message: 'شماره برای جستجو در NumberBox معتبر نیست' };
  }

  const cacheKey = `nb:${sig}`;
  const cached = nbCache.get(cacheKey);
  if (cached && Date.now() - cached.at < NB_CACHE_TTL_MS) return cached.value;

  let value: CallerIdResult | null = null;

  for (const url of nbCandidates(sig)) {
    try {
      const res = await safeFetch(url, {
        headers: {
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
          accept: 'application/json, text/plain, */*',
        },
        timeoutMs: 10000,
      });

      if (res.error || res.status === 0) {
        value = { ok: false, found: false, error: 'network', message: 'اتصال به NumberBox برقرار نشد' };
        continue;
      }
      if (res.status === 403) {
        value = {
          ok: false,
          found: false,
          error: 'blocked',
          message: 'NumberBox دسترسی از آی‌پی‌های خارج از ایران را مسدود کرده است (این بررسی روی سرور داخل ایران فعال می‌شود)',
        };
        break;
      }
      if (res.status === 404) {
        // اندپوینت وجود ندارد — کاندیدای بعدی
        continue;
      }
      if (!res.ok) {
        value = { ok: false, found: false, error: 'network', message: `خطای سرویس NumberBox (کد ${res.status})` };
        continue;
      }

      // پاسخ موفق — تلاش برای استخراج نام
      const trimmed = res.body.trim();
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try {
          const json = JSON.parse(trimmed);
          const name = extractNbName(json);
          if (name) {
            value = { ok: true, found: true, name };
            break;
          }
          // پاسخ معتبر ولی بدون نام = این شماره در NumberBox ثبت نشده
          if (Array.isArray(json?.data) ? json.data.length === 0 : true) {
            value = { ok: true, found: false, message: 'این شماره در NumberBox ثبت نشده است' };
            break;
          }
        } catch {
          continue;
        }
      }
    } catch {
      value = { ok: false, found: false, error: 'network', message: 'اتصال به NumberBox برقرار نشد' };
    }
  }

  const final = value ?? { ok: false, found: false, error: 'network', message: 'سرویس NumberBox پاسخ معقول نداد' };
  nbCache.set(cacheKey, { at: Date.now(), value: final });
  return final;
}

/** پیوند عمومی جستجوی شماره در Truecaller (برای پیگیری دستی پژوهشگر) */
export function truecallerWebLink(significant: string, countryCode: string): string {
  const national = significant.replace(new RegExp(`^${countryCode === 'IR' ? '98' : '\\d{1,3}'}`), '');
  return `https://www.truecaller.com/search/${(countryCode || 'ir').toLowerCase()}/${national || significant}`;
}

/**
 * تجزیه شماره خام به اجزای لازم لایه Caller-ID (شماره ملی بدون کد کشور، کد ISO، کد شماره‌گیری)
 * شماره همه کشورها پذیرفته می‌شود: +XX… ، ۰۰XX… ، و شماره بدون پیشوند با تشخیص خودکار کشور
 */
export function parseTcPhone(raw: string): CallerIdPhoneParts | null {
  const input = raw.trim().replace(/[\s\-().]/g, '');
  if (!input || !/\d{7,}/.test(input)) return null;

  const digits = input.replace(/\D/g, '');
  const candidates = new Set<string>();
  const add = (c: string) => {
    if (c) candidates.add(c);
  };

  // ۱) فرمت بین‌المللی کامل با +
  if (input.startsWith('+')) add(input);
  // ۲) پیشوند ۰۰ بین‌المللی (۰۰۹۸… ، ۰۰۴۴… ، ۰۰۱…)
  if (digits.startsWith('00')) add('+' + digits.replace(/^0+/, ''));
  // ۳) میان‌برهای ایران برای ورودی بدون پیشوند: ۰۹… ، ۹۸… ، ۹xxxxxxxxx
  if (digits.startsWith('09')) add('+98' + digits.slice(1)); // 0912… → +98912…
  if (digits.startsWith('98') && digits.length >= 11) add('+' + digits); // 98912… → +98912…
  if (digits.startsWith('9') && digits.length === 10) add('+98' + digits); // 912… → +98912…
  // ۴) سایر شماره‌های بین‌المللی بدون + (کد کشور + شماره ملی): 1415… ، 4479… ، 9715…
  if (!digits.startsWith('0') && digits.length >= 9) add('+' + digits);
  // ۵) ورودی خام (اگر از قبل + یا ۰۰ داشته باشد)
  add(input);

  for (const c of candidates) {
    try {
      const p = parsePhoneNumber(c);
      if (p?.isValid() && p.nationalNumber) {
        return { significant: String(p.nationalNumber), countryCode: p.country ?? 'IR', dialingCode: '+' + p.countryCallingCode };
      }
    } catch {
      /* کاندیدای بعدی */
    }
  }

  // آخرین تلاش: تفسیر ملی با ناحیه ایران
  try {
    const p2 = parsePhoneNumber(input, 'IR');
    if (p2?.isValid() && p2.nationalNumber) {
      return { significant: String(p2.nationalNumber), countryCode: 'IR', dialingCode: '+' + p2.countryCallingCode };
    }
  } catch {
    /* ignore */
  }
  return null;
}
