import { parsePhoneNumber, AsYouType, isValidPhoneNumber } from 'libphonenumber-js/max';
import type { OsintModuleResult } from './types';
import { fmtNum } from './net';
import {
  tcSearchName,
  numberBoxSearchName,
  truecallerWebLink,
  type CallerIdResult,
  type CallerIdPhoneParts,
} from './callerid';

// ============================================================
// ماژول اوسینت شماره تلفن
// واقعی: تجزیه و اعتبارسنجی کامل با libphonenumber-js (نسخه max)
// تشخیص کشور، نوع خط، اپراتور (مریت دیتا)، فرمت‌های استاندارد
// + نام ثبت‌شده شماره در پلتفرم‌های Truecaller (با توکن) و NumberBox
// اصل ثابت: هیچ نامی جعل نمی‌شود — عدم دسترسی با علت دقیق گزارش می‌شود
// ============================================================

const TYPE_FA: Record<string, string> = {
  MOBILE: 'موبایل',
  FIXED_LINE: 'ثابت',
  FIXED_LINE_OR_MOBILE: 'ثابت/موبایل',
  TOLL_FREE: 'شماره رایگان (تول‌فری)',
  PREMIUM_RATE: 'تعرفه ویژه (پرمیوم)',
  SHARED_COST: 'هزینه مشترک',
  VOIP: 'VoIP (تلفن اینترنتی)',
  PERSONAL_NUMBER: 'شماره شخصی',
  PAGER: 'پیجر',
  UAN: 'شماره دسترسی سازمانی',
  VOICEMAIL: 'پست صوتی',
};

function callerIdFinding(r: CallerIdResult, platformLabel: string, webLink?: string): OsintModuleResult['findings'][number] {
  if (r.found && r.name) {
    const value = r.altName ? `${r.name} (نام جایگزین: ${r.altName})` : r.name;
    return { label: `نام ثبت‌شده (${platformLabel})`, value, severity: 'high', ...(webLink ? { link: webLink } : {}) };
  }
  if (r.ok && !r.found) {
    return { label: `نام ثبت‌شده (${platformLabel})`, value: 'یافت نشد — این شماره ثبت نشده است (پاسخ قطعی سرویس)', severity: 'info' };
  }
  return { label: `نام ثبت‌شده (${platformLabel})`, value: `در دسترس نیست — ${r.message ?? 'دلیل نامشخص'}`, severity: 'info' };
}

export async function phoneModule(
  raw: string,
  opts?: { truecallerToken?: string }
): Promise<OsintModuleResult> {
  const started = Date.now();
  const input = raw.trim();
  const findings: OsintModuleResult['findings'] = [];

  let phone;
  try {
    // اگر با + شروع نشود، پیش‌فرض ایران را امتحان می‌کنیم و در صورت شکست US
    phone = parsePhoneNumber(input.startsWith('+') ? input : (input.length >= 10 ? `+${input}` : `+98${input.replace(/^0/, '')}`));
  } catch {
    try {
      phone = parsePhoneNumber(input, 'IR');
    } catch {
      return {
        module: 'phone',
        title: 'تحلیل شماره تلفن',
        icon: 'Phone',
        status: 'failed',
        source: 'live',
        summary: `شماره «${input}» قابل تجزیه نیست — فرمت استاندارد E.164 رعایت نشده است.`,
        findings: [{ label: 'اعتبارسنجی', value: 'فرمت نامعتبر ✗', severity: 'high' }],
        durationMs: Date.now() - started,
        error: 'PARSE_ERROR',
      };
    }
  }

  const valid = phone?.isValid() ?? false;
  const country = phone?.country ?? '—';
  const countryCallingCode = phone?.countryCallingCode ? '+' + phone.countryCallingCode : '—';
  const national = phone?.formatNational() ?? '—';
  const international = phone?.formatInternational() ?? '—';
  const e164 = phone?.number ?? '—';
  const typeRaw = phone?.getType();
  const type = typeRaw ? (TYPE_FA[typeRaw] ?? typeRaw) : 'نامشخص';
  const carrier = (phone as unknown as { carrier?: () => string })?.carrier?.() ?? null;

  findings.push({
    label: 'اعتبارسنجی (استاندارد E.164)',
    value: valid ? 'شماره معتبر ✓' : 'شماره نامعتبر ✗',
    severity: valid ? 'info' : 'high',
  });
  findings.push({ label: 'کشور', value: country, severity: 'medium' });
  findings.push({ label: 'کد کشور', value: countryCallingCode });
  findings.push({ label: 'فرمت ملی', value: national });
  findings.push({ label: 'فرمت بین‌المللی', value: international });
  findings.push({ label: 'نوع خط', value: type, severity: type === 'VoIP (تلفن اینترنتی)' ? 'high' : 'medium' });
  if (carrier) {
    findings.push({ label: 'اپراتور (مریت دیتا)', value: carrier, severity: 'medium' });
  }

  // سرنخ‌های تحلیلی
  const digits = input.replace(/\D/g, '');
  findings.push({ label: 'طول شماره', value: `${fmtNum(digits.length)} رقم` });
  if (country === 'IR') {
    const nationalDigits = digits.replace(/^(98|0)/, '');
    if (nationalDigits.startsWith('9')) {
      const prefix = nationalDigits.slice(0, 3);
      const iranOperators: Record<string, string> = {
        '910': 'همراه اول', '911': 'همراه اول', '912': 'همراه اول', '913': 'همراه اول', '914': 'همراه اول',
        '915': 'همراه اول', '916': 'همراه اول', '917': 'همراه اول', '918': 'همراه اول', '919': 'همراه اول',
        '990': 'همراه اول', '991': 'همراه اول', '992': 'همراه اول', '993': 'همراه اول', '994': 'همراه اول',
        '920': 'ایرانسل', '921': 'ایرانسل', '922': 'ایرانسل', '923': 'ایرانسل',
        '930': 'ایرانسل', '933': 'ایرانسل', '935': 'ایرانسل', '936': 'ایرانسل', '937': 'ایرانسل',
        '938': 'ایرانسل', '939': 'ایرانسل',
        '931': 'آپتل (Taliya سابق)',
        '932': 'ادخل (سامانتل)',
        '989': 'رایتل / شوکا',
        '999': 'رایتل',
        '998': 'آپتل',
      };
      const op = iranOperators[prefix] ?? iranOperators['98' + prefix] ?? 'نامشخص';
      if (op !== 'نامشخص') {
        findings.push({ label: 'اپراتور (تحلیل پیشوند ایران)', value: `${op} — پیشوند ${prefix}`, severity: 'medium' });
      }
    }
  }

  // ─── نام ثبت‌شده شماره در پلتفرم‌ها (Truecaller + NumberBox) ───
  const parts: CallerIdPhoneParts | null = phone
    ? {
        significant: phone.nationalNumber,
        countryCode: country === '—' ? 'IR' : country,
        dialingCode: countryCallingCode === '—' ? '98' : countryCallingCode.replace('+', ''),
      }
    : null;

  let tcResult: CallerIdResult | null = null;
  let nbResult: CallerIdResult | null = null;
  if (parts) {
    const tcToken = (opts?.truecallerToken ?? process.env.TRUECALLER_TOKEN ?? '').trim();
    const [tc, nb] = await Promise.allSettled([
      tcToken ? tcSearchName(parts, tcToken) : Promise.resolve<CallerIdResult>({ ok: false, found: false, error: 'no-token', message: 'توکن Truecaller تنظیم نشده است' }),
      numberBoxSearchName(parts),
    ]);
    if (tc.status === 'fulfilled') tcResult = tc.value;
    if (nb.status === 'fulfilled') nbResult = nb.value;
  }

  if (tcResult) {
    findings.push(callerIdFinding(tcResult, 'Truecaller', parts ? truecallerWebLink(parts.significant, parts.countryCode) : undefined));
  }
  if (nbResult) {
    findings.push(callerIdFinding(nbResult, 'NumberBox', 'https://numberbox.ir'));
  }

  // پیوندهای اوسینت برای شماره
  findings.push({
    label: 'پیوندهای پیگیری',
    value: `Truecaller (وب)، NumberBox، Google (فرمت‌های مختلف)، WhatsApp، Telegram${parts ? ` — جستجوی مستقیم: ${truecallerWebLink(parts.significant, parts.countryCode)}` : ''}`,
    severity: 'info',
  });

  const risk = !valid ? 'بالا' : typeRaw === 'VOIP' ? 'متوسط' : 'پایین';

  // خلاصه: نام‌های یافت‌شده در پلتفرم‌ها برجسته می‌شوند
  const foundNames: string[] = [];
  if (tcResult?.found && tcResult.name) foundNames.push(`Truecaller: «${tcResult.name}»`);
  if (nbResult?.found && nbResult.name) foundNames.push(`NumberBox: «${nbResult.name}»`);
  const callerIdSummary = foundNames.length
    ? ` نام ثبت‌شده در پلتفرم‌ها — ${foundNames.join('؛ ')}.`
    : '';

  return {
    module: 'phone',
    title: 'تحلیل شماره تلفن',
    icon: 'Phone',
    status: valid ? 'success' : 'failed',
    source: 'live',
    summary: `شماره «${international}» تحلیل شد — کشور: ${country}، نوع خط: ${type}${
      carrier ? '، اپراتور: ' + carrier : ''
    }، اعتبار: ${valid ? 'معتبر' : 'نامعتبر'}، سطح ریسک: ${risk}.${callerIdSummary}`,
    findings,
    metrics: [
      { label: 'معتبر', value: valid ? 1 : 0 },
      { label: 'موبایل', value: typeRaw === 'MOBILE' ? 1 : 0 },
      { label: 'VoIP', value: typeRaw === 'VOIP' ? 1 : 0 },
      { label: 'طول شماره', value: digits.length },
    ],
    raw: {
      e164,
      international,
      national,
      country,
      type: typeRaw,
      carrier,
      valid,
      callerId: {
        truecaller: tcResult
          ? { found: tcResult.found, name: tcResult.name ?? null, altName: tcResult.altName ?? null, ok: tcResult.ok, message: tcResult.message ?? null }
          : null,
        numberbox: nbResult
          ? { found: nbResult.found, name: nbResult.name ?? null, ok: nbResult.ok, message: nbResult.message ?? null }
          : null,
      },
    },
    durationMs: Date.now() - started,
  };
}

export { AsYouType, isValidPhoneNumber };
