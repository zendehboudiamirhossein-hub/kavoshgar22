import type { TargetType } from './types';

// ============================================================
// تشخیص خودکار نوع هدف
// ============================================================

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const IPV4_RE = /^(\d{1,3}\.){3}\d{1,3}$/;
const PHONE_RE = /^\+?[0-9\s\-()]{7,18}$/;
const COORD_RE = /^-?\d{1,3}(?:\.\d+)\s*[,،]\s*-?\d{1,3}(?:\.\d+)$/;
// بیت‌کوین: Base58 یا Bech32
const BTC_RE = /^(bc1[a-z0-9]{25,62}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$/;

const COMMON_TLDS = new Set([
  'com', 'net', 'org', 'io', 'dev', 'ir', 'co', 'me', 'info', 'xyz', 'app', 'ai', 'gov', 'edu',
  'uk', 'de', 'fr', 'ru', 'cn', 'jp', 'tv', 'cc', 'sh', 'is', 'it', 'es', 'nl', 'se', 'no', 'fi',
  'ca', 'au', 'in', 'br', 'za', 'us', 'eu', 'site', 'online', 'tech', 'store', 'blog', 'news',
  'cloud', 'link', 'page', 'live', 'pro', 'top', 'club', 'vip', 'wiki', 'zone', 'biz', 'name',
  'mobi', 'asia', 'tel', 'travel', 'work', 'tools', 'systems', 'solutions', 'company', 'digital',
  'software', 'network', 'media', 'agency', 'studio', 'design', 'art', 'photo', 'video', 'games',
  'shop', 'fun', 'plus', 'one', 'im', 'fm', 'am', 'to', 'do', 'so', 'la', 'ly', 'be', 'gs', 'ms', 'sc', 'ws',
]);

/** لیست مکان‌های شناخته‌شده برای تشخیص هدف جغرافیایی */
const PLACE_WORDS = new Set([
  'تهران', 'مشهد', 'اصفهان', 'شیراز', 'تبریز', 'کرج', 'اهواز', 'قم', 'کرمانشاه', 'رشت',
  'زاهدان', 'همدان', 'کرمان', 'یزد', 'اردبیل', 'بندرعباس', 'اراک', 'زنجان', 'سنندج', 'قزوین',
  'خرم‌آباد', 'گرگان', 'ساری', 'بوشهر', 'بیرجند', 'بجنورد', 'ایلام', 'یاسوج', 'شهرکرد', 'سمنان',
  'استانبول', 'آنکارا', 'دبی', 'لندن', 'پاریس', 'برلین', 'نیویورک', 'واشنگتن', 'مسکو', 'پکن',
  'توکیو', 'دهلی', 'سیدنی', 'تورنتو', 'ریودوژانیرو', 'قاهره', 'لاگوس', 'بانکوک', 'سئول', 'سنگاپور',
  'tehran', 'mashhad', 'isfahan', 'shiraz', 'tabriz', 'london', 'paris', 'berlin', 'newyork',
  'washington', 'moscow', 'beijing', 'tokyo', 'delhi', 'sydney', 'toronto', 'cairo', 'seoul',
  'istanbul', 'ankara', 'dubai', 'baghdad', 'بغداد', 'دمشق', 'damascus', 'بادکوبه', 'باکو', 'baku',
]);

function isKnownDomain(input: string): boolean {
  const parts = input.toLowerCase().split('.');
  if (parts.length < 2) return false;
  return COMMON_TLDS.has(parts[parts.length - 1]);
}

function isPlace(input: string): boolean {
  const clean = input.trim().toLowerCase();
  // مختصات «lat,lon»
  if (COORD_RE.test(clean)) return true;
  // یکسان‌سازی حروف عربی/فارسی (ي → ی، ك → ک)
  const normalized = clean
    .replace(/\u064A/g, '\u06CC')
    .replace(/\u0643/g, '\u06A9')
    .replace(/\s+/g, '');
  if (PLACE_WORDS.has(normalized)) return true;
  // شروع با مکان شناخته‌شده + یک واژه (مثلاً «میدان آزادی تهران»)
  for (const p of PLACE_WORDS) {
    if (normalized.includes(p) && normalized.length <= p.length + 15) return true;
  }
  return false;
}

export function detectTargetType(rawInput: string): TargetType {
  const input = rawInput.trim().replace(/^@/, '');
  if (!input) return 'username';

  if (EMAIL_RE.test(input)) return 'email';

  if (IPV4_RE.test(input) && input.split('.').every((p) => Number(p) >= 0 && Number(p) <= 255)) {
    return 'ip';
  }

  if (/^https?:\/\//i.test(input) || /^www\./i.test(input)) return 'url';

  // آدرس بیت‌کوین (قبل از یوزرنیم چون الگوی base58 حروف/عدد است)
  if (BTC_RE.test(input)) return 'crypto';

  // مختصات جغرافیایی یا نام مکان
  if (COORD_RE.test(input)) return 'place';
  if (/[؀-ۿ]/.test(input) || isPlace(input)) {
    // متن فارسی یا مکان شناخته‌شده → مکان
    if (isPlace(input)) return 'place';
    // متن فارسی بدون تطابق مکان → یوزرنیم (احتمالاً نام فارسی برای جستجوی خبری)
    return 'username';
  }

  if (PHONE_RE.test(input) && /[0-9]/.test(input) && input.replace(/\D/g, '').length >= 7) {
    return 'phone';
  }

  if (isKnownDomain(input) && /^[a-zA-Z0-9.-]+$/.test(input)) return 'domain';

  return 'username';
}

export function extractUsername(raw: string): string {
  return raw
    .trim()
    .replace(/^@/, '')
    .replace(/^https?:\/\/(www\.)?[^/]+\//i, '')
    .replace(/[/?#].*$/, '')
    .trim();
}

export function extractDomain(raw: string): string {
  let d = raw.trim().replace(/^https?:\/\//i, '').replace(/^www\./i, '');
  d = d.split(/[/?#]/)[0].split(':')[0];
  return d.toLowerCase();
}

// برچسب انواع هدف + انواع اضافی ماژول شناسایی هویت (تلگرام)
export const TARGET_TYPE_LABELS: Record<TargetType, string> & Record<string, string> = {
  username: 'نام کاربری',
  email: 'ایمیل',
  phone: 'شماره تلفن',
  domain: 'دامنه',
  ip: 'آدرس IP',
  url: 'وب‌سایت',
  crypto: 'کیف پول بیت‌کوین',
  place: 'مکان جغرافیایی',
  identity_name: 'نام و نام خانوادگی',
  identity_national_id: 'کد ملی',
  identity_phone: 'شماره موبایل (هویت)',
};
