import dns from 'dns';
import { promisify } from 'util';
import type { OsintModuleResult } from './types';
import { safeFetch, fmtNum, fmtDate } from './net';

// ============================================================
// ماژول اوسینت دامنه / IP / وب‌سایت
// واقعی: DNS (A/AAAA/MX/NS/TXT)، WHOIS از RDAP، مکان‌یابی IP از ip-api، هدرهای HTTP
// ============================================================

const resolve4 = promisify(dns.resolve4).bind(dns);
const resolve6 = promisify(dns.resolve6).bind(dns);
const resolveMx = promisify(dns.resolveMx).bind(dns);
const resolveNs = promisify(dns.resolveNs).bind(dns);
const resolveTxt = promisify(dns.resolveTxt).bind(dns);
const reverse = promisify(dns.reverse).bind(dns);

interface IpGeo {
  country?: string;
  city?: string;
  isp?: string;
  org?: string;
  as?: string;
  lat?: number;
  lon?: number;
  timezone?: string;
  mobile?: boolean;
  proxy?: boolean;
  hosting?: boolean;
}

async function ipGeo(ip: string): Promise<IpGeo | null> {
  try {
    const res = await safeFetch(
      `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,country,city,isp,org,as,lat,lon,timezone,mobile,proxy,hosting`,
      { timeoutMs: 7000 }
    );
    if (res.ok) {
      const j = JSON.parse(res.body);
      if (j.status === 'success') return j as IpGeo;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function geoFindings(geo: IpGeo | null): OsintModuleResult['findings'] {
  if (!geo) return [{ label: 'مکان‌یابی IP', value: 'سرویس مکان‌یابی در دسترس نبود', severity: 'info' }];
  const f: OsintModuleResult['findings'] = [
    { label: 'کشور', value: geo.country ?? '—' },
    { label: 'شهر', value: geo.city ?? '—' },
    { label: 'ISP', value: geo.isp ?? '—', severity: 'medium' },
    { label: 'سازمان', value: geo.org ?? '—' },
    { label: 'AS', value: geo.as ?? '—' },
    { label: 'مختصات', value: geo.lat && geo.lon ? `${geo.lat}, ${geo.lon}` : '—' },
    { label: 'منطقه زمانی', value: geo.timezone ?? '—' },
  ];
  if (geo.proxy) f.push({ label: 'پرچم پروکسی/VPN', value: 'شناسایی شد ⚠', severity: 'high' });
  if (geo.hosting) f.push({ label: 'سرور میزبانی', value: 'دیتاسنتر/کلود (نه کاربر خانگی)', severity: 'medium' });
  if (geo.mobile) f.push({ label: 'شبکه موبایل', value: 'بله', severity: 'info' });
  return f;
}

export async function domainModule(target: string): Promise<OsintModuleResult> {
  const started = Date.now();
  const findings: OsintModuleResult['findings'] = [];
  const isIp = /^(\d{1,3}\.){3}\d{1,3}$/.test(target);
  let resolvedIp: string | undefined;

  if (isIp) {
    // ---------- حالت IP ----------
    findings.push({ label: 'نوع هدف', value: 'آدرس IPv4' });
    try {
      const ptr = await reverse(target);
      findings.push({ label: 'رکورد PTR (نام میزبان)', value: ptr[0] ?? '—', severity: 'medium' });
    } catch {
      findings.push({ label: 'رکورد PTR', value: 'ثبت نشده', severity: 'info' });
    }
    const geo = await ipGeo(target);
    findings.push(...geoFindings(geo));

    // بررسی پورت‌های رایج از طریق درخواست HTTP
    const http = await safeFetch(`http://${target}`, { timeoutMs: 6000 });
    const https = await safeFetch(`https://${target}`, { timeoutMs: 6000 });
    findings.push({
      label: 'سرویس HTTP',
      value: http.ok ? `فعال (پورت ۸۰) — سرور: ${http.headers['server'] ?? 'نامشخص'}` : 'غیرفعال/مسدود',
      severity: http.ok ? 'info' : 'low',
    });
    findings.push({
      label: 'سرویس HTTPS',
      value: https.ok ? `فعال (پورت ۴۴۳)` : 'غیرفعال/بدون گواهی',
      severity: https.ok ? 'info' : 'medium',
    });

    return {
      module: 'domain',
      title: 'تحلیل IP و زیرساخت',
      icon: 'Globe',
      status: geo ? 'success' : 'partial',
      source: 'live',
      summary: `IP «${target}» تحلیل شد — مکان: ${geo?.country ?? 'نامشخص'}، ISP: ${geo?.isp ?? 'نامشخص'}${
        geo?.hosting ? ' — سرور دیتاسنتر' : ''
      }${geo?.proxy ? ' — پرچم پروکسی/VPN فعال' : ''}.`,
      findings,
      raw: { target, geo },
      durationMs: Date.now() - started,
    };
  }

  // ---------- حالت دامنه / URL ----------
  findings.push({ label: 'نوع هدف', value: 'دامنه وب' });

  // DNS A
  try {
    const a = await resolve4(target);
    resolvedIp = a[0];
    findings.push({ label: 'رکورد A (IPv4)', value: a.join('، '), severity: 'info' });
  } catch {
    findings.push({ label: 'رکورد A', value: 'یافت نشد — دامنه ممکن است منقضی یا پارک شده باشد', severity: 'high' });
  }

  // DNS AAAA
  try {
    const aaaa = await resolve6(target);
    if (aaaa?.length) findings.push({ label: 'رکورد AAAA (IPv6)', value: aaaa.join('، ') });
  } catch {
    /* ignore */
  }

  // MX
  try {
    const mx = await resolveMx(target);
    if (mx.length) {
      findings.push({
        label: 'رکورد MX (ایمیل)',
        value: mx
          .sort((x, y) => x.priority - y.priority)
          .slice(0, 3)
          .map((m) => m.exchange)
          .join('، '),
        severity: 'medium',
      });
    }
  } catch {
    /* ignore */
  }

  // NS
  try {
    const ns = await resolveNs(target);
    if (ns?.length) {
      findings.push({ label: 'نیم‌سرورها (NS)', value: ns.slice(0, 4).join('، '), severity: 'medium' });
      const nsStr = ns.join(' ').toLowerCase();
      const nsGuess = nsStr.includes('cloudflare')
        ? 'Cloudflare'
        : nsStr.includes('awsdns')
          ? 'AWS Route 53'
          : nsStr.includes('googledomains') || nsStr.includes('dnsmadeeasy')
            ? 'Google'
            : nsStr.includes('namecheap')
              ? 'Namecheap'
              : nsStr.includes('iran') || nsStr.includes('ir')
                ? 'احتمال ثبت‌کننده ایرانی'
                : 'سایر';
      findings.push({ label: 'سرنخ ثبت‌کننده/CDN', value: nsGuess, severity: 'info' });
    }
  } catch {
    /* ignore */
  }

  // TXT (SPF و سرنخ‌ها)
  try {
    const txt = await resolveTxt(target);
    const flat = txt.map((t) => t.join(''));
    const spf = flat.find((t) => t.startsWith('v=spf1'));
    const dkim = flat.some((t) => t.includes('dkim'));
    if (spf) findings.push({ label: 'رکورد SPF', value: spf.slice(0, 120), severity: 'info' });
    const googleSite = flat.find((t) => t.includes('google-site-verification'));
    if (googleSite) findings.push({ label: 'ابزار تأیید مالکیت', value: 'Google Search Console فعال', severity: 'low' });
  } catch {
    /* ignore */
  }

  // WHOIS واقعی از RDAP
  const rdap = await safeFetch(`https://rdap.org/domain/${encodeURIComponent(target)}`, { timeoutMs: 9000 });
  if (rdap.ok && rdap.body.trim().startsWith('{')) {
    try {
      const j = JSON.parse(rdap.body);
      const events: { eventAction?: string; eventDate?: string }[] = j.events ?? [];
      const registered = events.find((e) => e.eventAction === 'registration')?.eventDate;
      const changed = events.find((e) => e.eventAction === 'last changed')?.eventDate;
      const expires = events.find((e) => e.eventAction === 'expiration')?.eventDate;
      if (registered) {
        findings.push({ label: 'تاریخ ثبت دامنه (WHOIS واقعی)', value: fmtDate(registered), severity: 'medium' });
        const ageDays = Math.floor((Date.now() - new Date(registered).getTime()) / 86400000);
        findings.push({
          label: 'قدمت دامنه',
          value: `${fmtNum(Math.floor(ageDays / 365))} سال و ${fmtNum(Math.floor((ageDays % 365) / 30))} ماه`,
          severity: ageDays < 90 ? 'high' : 'info',
        });
        if (ageDays < 90) {
          findings.push({
            label: 'هشدار دامنه تازه',
            value: 'دامنه کمتر از ۳ ماه قدمت دارد — الگوی رایج در فیشینگ/کلاهبرداری ⚠',
            severity: 'high',
          });
        }
      }
      if (changed) findings.push({ label: 'آخرین تغییر', value: fmtDate(changed) });
      if (expires) findings.push({ label: 'تاریخ انقضا', value: fmtDate(expires) });
      const registrar = (j.entities ?? []).find((e: any) => e.roles?.includes('registrar'))?.vcardArray?.[1]?.find(
        (x: string[]) => x[0] === 'fn'
      )?.[3];
      if (registrar) findings.push({ label: 'ثبت‌کننده (Registrar)', value: String(registrar), severity: 'medium' });
      const status: string[] = j.status ?? [];
      if (status.length) findings.push({ label: 'وضعیت دامنه', value: status.slice(0, 3).join('، ') });
    } catch {
      /* ignore */
    }
  } else {
    findings.push({ label: 'WHOIS (RDAP)', value: 'در دسترس نبود برای این TLD', severity: 'info' });
  }

  // مکان‌یابی IP
  if (resolvedIp) {
    const geo = await ipGeo(resolvedIp);
    findings.push({ label: 'سرور میزبان', value: resolvedIp });
    findings.push(...geoFindings(geo));
  }

  // تحلیل هدرهای HTTP
  const https = await safeFetch(`https://${target}`, { timeoutMs: 8000 });
  const site = https.ok ? https : await safeFetch(`http://${target}`, { timeoutMs: 6000 });
  if (site.ok) {
    const h = site.headers;
    findings.push({ label: 'وب‌سرور', value: h['server'] ?? 'نامشخص', severity: 'medium' });
    if (h['x-powered-by']) findings.push({ label: 'تکنولوژی بک‌اند', value: h['x-powered-by'], severity: 'medium' });
    if (h['content-security-policy']) findings.push({ label: 'امنیت: CSP', value: 'فعال ✓' });
    else findings.push({ label: 'امنیت: CSP', value: 'غیرفعال ✗', severity: 'medium' });
    if (h['strict-transport-security']) findings.push({ label: 'امنیت: HSTS', value: 'فعال ✓' });
    else findings.push({ label: 'امنیت: HSTS', value: 'غیرفعال ✗', severity: 'medium' });
    if (h['x-frame-options']) findings.push({ label: 'امنیت: ضد Clickjacking', value: 'فعال ✓' });
    else findings.push({ label: 'امنیت: ضد Clickjacking', value: 'غیرفعال ✗', severity: 'medium' });
    const titleMatch = site.body.match(/<title[^>]*>([^<]*)<\/title>/i);
    if (titleMatch) findings.push({ label: 'عنوان صفحه', value: titleMatch[1].trim().slice(0, 120) });
    const genMatch = site.body.match(/<meta name="generator" content="([^"]*)"/i);
    if (genMatch) findings.push({ label: 'سیستم مدیریت محتوا', value: genMatch[1], severity: 'medium' });
  }

  const hasA = findings.some((f) => f.label.startsWith('رکورد A ('));
  return {
    module: 'domain',
    title: 'تحلیل دامنه و زیرساخت',
    icon: 'Globe',
    status: hasA ? 'success' : 'partial',
    source: 'live',
    summary: `دامنه «${target}» به‌صورت کامل تحلیل شد — ${
      resolvedIp ? `میزبانی روی ${resolvedIp}` : 'بدون رکورد A فعال'
    }، WHOIS و DNS و هدرهای امنیتی بررسی شدند${site.ok ? ' و وب‌سایت پاسخگو است' : ''}.`,
    findings,
    raw: { target, resolvedIp },
    durationMs: Date.now() - started,
  };
}
