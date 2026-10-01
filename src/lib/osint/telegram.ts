import type { OsintModuleResult } from './types';
import { safeFetch, fmtNum } from './net';

// ============================================================
// ماژول اوسینت تلگرام
// منبع واقعی: صفحه عمومی t.me (برچسب og و تعداد اعضا)
// ============================================================

export async function telegramModule(username: string): Promise<OsintModuleResult> {
  const started = Date.now();
  const u = username.replace(/^@/, '');
  const res = await safeFetch(`https://t.me/${encodeURIComponent(u)}`, { timeoutMs: 8000 });

  if (!res.ok || !res.body) {
    return {
      module: 'telegram',
      title: 'تحلیل تلگرام',
      icon: 'Send',
      status: 'failed',
      source: 'live',
      summary: `دریافت صفحه t.me/${u} ناموفق بود (کد ${res.status || 'شبکه'})`,
      findings: [],
      durationMs: Date.now() - started,
      error: res.error ?? `HTTP ${res.status}`,
    };
  }

  const html = res.body;
  const titleMatch = html.match(/<meta property="og:title" content="([^"]*)"/);
  const descMatch = html.match(/<meta property="og:description" content="([^"]*)"/);
  const imgMatch = html.match(/<meta property="og:image" content="([^"]*)"/);
  const title = titleMatch?.[1]?.trim() ?? '';
  const desc = descMatch?.[1]?.trim() ?? '';
  const img = imgMatch?.[1] ?? '';

  // صفحه موجود است یا نه
  const exists = !!titleMatch && !html.includes('tgme_page_status') && !title.includes('Telegram: Contact');

  // استخراج تعداد اعضا: «12 345 members» یا «1 234 subscribers»
  const membersMatch = html.match(
    /([\d\s\u00a0\u2009]+)\s*(members|subscribers|member|subscriber|عضو)/i
  );
  let members = 0;
  if (membersMatch) {
    members = Number(membersMatch[1].replace(/[\s\u00a0\u2009]/g, '')) || 0;
  }

  const isChannel = /subscribers/i.test(html);
  const isGroup = /members/i.test(html) && !isChannel;

  if (!exists) {
    return {
      module: 'telegram',
      title: 'تحلیل تلگرام',
      icon: 'Send',
      status: 'failed',
      source: 'live',
      summary: `کانال/حساب عمومی @${u} در تلگرام یافت نشد.`,
      findings: [{ label: 'نتیجه', value: 'یوزرنیم آزاد است یا حساب خصوصی/ثبت نشده است', severity: 'info' }],
      durationMs: Date.now() - started,
      error: 'NOT_FOUND',
    };
  }

  const findings: OsintModuleResult['findings'] = [
    { label: 'نوع', value: isChannel ? 'کانال' : isGroup ? 'گروه' : 'حساب کاربری', severity: 'info' },
    { label: 'عنوان', value: title || '—' },
    { label: 'توضیحات', value: desc || '—' },
  ];
  if (members > 0) {
    findings.push({ label: 'تعداد اعضا', value: fmtNum(members), severity: members > 10000 ? 'info' : 'low' });
  }
  findings.push({ label: 'لینک عمومی', value: `t.me/${u}`, link: `https://t.me/${u}` });
  if (img) findings.push({ label: 'تصویر پروفایل', value: 'موجود', link: img });

  return {
    module: 'telegram',
    title: 'تحلیل تلگرام',
    icon: 'Send',
    status: 'success',
    source: 'live',
    summary: `${isChannel ? 'کانال' : isGroup ? 'گروه' : 'حساب'} «${title}» با ${members ? fmtNum(members) + ' عضو' : 'اطلاعات محدود'} به‌صورت واقعی از t.me استخراج شد.`,
    findings,
    metrics: members ? [{ label: 'اعضا', value: members }] : undefined,
    raw: { title, desc, members, isChannel, isGroup, img },
    durationMs: Date.now() - started,
  };
}
