import type { TargetType } from './types';

// ============================================================
// ماژول تولید Google Dork و پیوندهای اوسینت خارجی
// ============================================================

export interface DorkGroup {
  title: string;
  dorks: { name: string; query: string; url: string }[];
}

export interface ExternalTool {
  name: string;
  url: string;
  desc: string;
  category: string;
}

function google(q: string): string {
  return 'https://www.google.com/search?q=' + encodeURIComponent(q);
}

export function generateDorks(target: string, type: TargetType): DorkGroup[] {
  const t = target;
  const groups: DorkGroup[] = [
    {
      title: 'جستجوی عمومی هویت',
      dorks: [
        { name: 'جستجوی دقیق عبارت', query: `"${t}"`, url: google(`"${t}"`) },
        { name: 'با تمام کلمات', query: `${t} (intext:"${t}")`, url: google(`${t}`) },
        { name: 'پروفایل لینکدین', query: `site:linkedin.com/in "${t}"`, url: google(`site:linkedin.com/in "${t}"`) },
        { name: 'پروفایل شبکه‌های اجتماعی', query: `site:instagram.com OR site:twitter.com OR site:t.me "${t}"`, url: google(`site:instagram.com OR site:twitter.com OR site:t.me "${t}"`) },
        { name: 'اسناد PDF/DOCX', query: `"${t}" (filetype:pdf OR filetype:docx OR filetype:xlsx)`, url: google(`"${t}" (filetype:pdf OR filetype:docx OR filetype:xlsx)`) },
        { name: 'فروم و انجمن‌ها', query: `"${t}" (site:reddit.com OR site:forum.* OR inurl:forum)`, url: google(`"${t}" (site:reddit.com OR inurl:forum)`) },
      ],
    },
    {
      title: 'دسته‌بندی تخصصی',
      dorks: [],
    },
    {
      title: 'آرشیو و ذخیره‌سازی',
      dorks: [
        { name: 'بایگانی Wayback', query: '—', url: `https://web.archive.org/web/*/${t}` },
        { name: 'کش گوگل', query: '—', url: google(`cache:${t}`) },
      ],
    },
  ];

  if (type === 'email') {
    groups[1].dorks.push(
      { name: 'افشای ایمیل در pasteها', query: `"${t}" (site:pastebin.com OR site:ghostbin.com OR site:justpaste.it)`, url: google(`"${t}" (site:pastebin.com OR site:justpaste.it)`) },
      { name: 'افشای ایمیل در دیتابیس‌ها', query: `"${t}" (ext:sql OR ext:csv OR ext:json OR ext:log)`, url: google(`"${t}" (ext:sql OR ext:csv OR ext:json OR ext:log)`) },
      { name: 'عضویت در خبرنامه‌ها', query: `"${t}" (site:groups.google.com OR site:lists.*)`, url: google(`"${t}" site:groups.google.com`) }
    );
  }

  if (type === 'domain' || type === 'url') {
    const clean = t.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    groups[1].dorks.push(
      { name: 'زیردامنه‌های شناخته‌شده', query: `site:*.${clean} -www`, url: google(`site:*.${clean} -www`) },
      { name: 'فایل‌های حساس', query: `site:${clean} (ext:sql OR ext:bak OR ext:log OR ext:env OR "index of")`, url: google(`site:${clean} (ext:sql OR ext:bak OR ext:log OR "index of")`) },
      { name: 'پنل‌های ورود', query: `site:${clean} (inurl:login OR inurl:admin OR inurl:panel)`, url: google(`site:${clean} (inurl:login OR inurl:admin OR inurl:panel)`) },
      { name: 'اطلاعات فنی سرور', query: '—', url: `https://shodan.io/search?query=hostname:${clean}` },
      { name: 'اسکن سطح حمله Censys', query: '—', url: `https://search.censys.io/search?resource=hosts&q=${encodeURIComponent(clean)}` },
      { name: 'گواهی‌های SSL (crt.sh)', query: '—', url: `https://crt.sh/?q=%.${clean}` },
      { name: 'اطلاعات DNS SecurityTrails', query: '—', url: `https://securitytrails.com/domain/${clean}/dns` }
    );
  }

  if (type === 'ip') {
    groups[1].dorks.push(
      { name: 'سرویس‌های باز روی IP', query: '—', url: `https://shodan.io/host/${t}` },
      { name: 'گواهی‌های SSL مرتبط', query: '—', url: `https://crt.sh/?q=${t}` },
      { name: 'اطلاعات AbuseIPDB', query: '—', url: `https://www.abuseipdb.com/check/${t}` },
      { name: 'جستجوی دامنه‌های هم‌میزبان', query: '—', url: `https://hackertarget.com/reverse-ip-lookup/` }
    );
  }

  if (type === 'phone') {
    groups[1].dorks.push(
      { name: 'افشای شماره در وب', query: `"${t}" OR "${t.replace(/\+/, '')}" (filetype:pdf OR filetype:xlsx OR ext:csv)`, url: google(`"${t}" (filetype:pdf OR filetype:xlsx OR ext:csv)`) },
      { name: 'شناسه Truecaller', query: '—', url: `https://www.truecaller.com/search/intl/${t.replace(/\+/g, '')}` },
      { name: 'وجود در واتساپ/تلگرام', query: '—', url: `https://wa.me/${t.replace(/\+/g, '')}` }
    );
  }

  if (type === 'username') {
    groups[1].dorks.push(
      { name: 'حساب‌های دیگر با همین نام', query: `"${t}" (site:x.com OR site:reddit.com OR site:tiktok.com OR site:youtube.com)`, url: google(`"${t}" (site:x.com OR site:reddit.com OR site:tiktok.com OR site:youtube.com)`) },
      { name: 'ایمیل احتمالی مرتبط', query: `"${t}" (ext:csv OR ext:sql OR "@gmail.com" OR "@yahoo.com")`, url: google(`"${t}" ("@gmail.com" OR "@yahoo.com")`) },
      { name: 'گیت‌هاب و سورس‌کد', query: `"${t}" (site:github.com OR site:gitlab.com OR site:pastebin.com)`, url: google(`"${t}" (site:github.com OR site:pastebin.com)`) }
    );
  }

  if (type === 'crypto') {
    groups[1].dorks.push(
      { name: 'کاوشگر تراکنش‌ها', query: '—', url: `https://blockstream.info/address/${t}` },
      { name: 'Mempool.Space', query: '—', url: `https://mempool.space/address/${t}` },
      { name: 'یاندکس/گاگل افشای آدرس', query: `"${t}"`, url: google(`"${t}"`) },
      { name: 'برچسب آدرس در WalletExplorer', query: '—', url: `https://www.walletexplorer.com/address/${t}` }
    );
  }

  if (type === 'place') {
    groups[1].dorks.push(
      { name: 'تصاویر ماهواره‌ای گوگل ارث', query: '—', url: `https://earth.google.com/web/search/${t}` },
      { name: 'اخبار محلی مکان', query: `"${t}" (site:news.google.com OR intitle:خبر)`, url: google(`"${t}" خبر`) },
      { name: 'افشای مکان در شبکه‌ها', query: `"${t}" (site:instagram.com OR site:x.com OR site:youtube.com)`, url: google(`"${t}" (site:instagram.com OR site:x.com)`) },
      { name: 'کاوش GeoHints', query: '—', url: `https://geohints.com/` }
    );
  }

  return groups;
}

export const EXTERNAL_TOOLS: ExternalTool[] = [
  { name: 'OSINT Framework', url: 'https://osintframework.com/', desc: 'درخت جامع ابزارهای اوسینت بر اساس هدف', category: 'مرجع' },
  { name: 'IntelTechniques', url: 'https://inteltechniques.com/tools/', desc: 'ابزارهای جستجوی پیشرفته مایکل بازل', category: 'مرجع' },
  { name: 'Shodan', url: 'https://www.shodan.io/', desc: 'موتور جستجوی دستگاه‌های متصل به اینترنت', category: 'زیرساخت' },
  { name: 'Censys', url: 'https://search.censys.io/', desc: 'جستجوی هاست‌ها و گواهی‌های SSL', category: 'زیرساخت' },
  { name: 'Have I Been Pwned', url: 'https://haveibeenpwned.com/', desc: 'بررسی واقعی نشت داده ایمیل‌ها', category: 'ایمیل' },
  { name: 'DeHashed', url: 'https://www.dehashed.com/', desc: 'جستجو در دیتابیس‌های نشت‌شده', category: 'ایمیل' },
  { name: 'Hudson Rock', url: 'https://cavalier.hudsonrock.com/', desc: 'بررسی آلودگی اطلاعاتی به استیلر', category: 'ایمیل' },
  { name: 'Sherlock', url: 'https://github.com/sherlock-project/sherlock', desc: 'ردیابی نام کاربری در ۴۰۰+ سایت', category: 'نام کاربری' },
  { name: 'Maigret', url: 'https://github.com/soxoj/maigret', desc: 'ردیابی پیشرفته پروفایل با گزارش HTML', category: 'نام کاربری' },
  { name: 'Maltego', url: 'https://www.maltego.com/', desc: 'تحلیل ارتباطات گرافیکی (Link Analysis)', category: 'تحلیل' },
  { name: 'SpiderFoot', url: 'https://github.com/smicallef/spiderfoot', desc: 'اتوماسیون کامل اوسینت با ۲۰۰+ ماژول', category: 'تحلیل' },
  { name: 'theHarvester', url: 'https://github.com/laramies/theHarvester', desc: 'جمع‌آوری ایمیل و زیردامنه از منابع عمومی', category: 'ایمیل' },
  { name: 'ExifTool', url: 'https://exiftool.org/', desc: 'استخراج متادیتای تصاویر و فایل‌ها', category: 'متادیتا' },
  { name: 'Google Earth Pro', url: 'https://earth.google.com/', desc: 'تحلیل جغرافیایی و GEOINT', category: 'جغرافیا' },
  { name: 'SunCalc', url: 'https://www.suncalc.org/', desc: 'تحلیل موقعیت خورشید از سایه تصاویر (GMID)', category: 'جغرافیا' },
  { name: 'PimEyes', url: 'https://pimeyes.com/', desc: 'جستجوی معکوس چهره', category: 'تصویر' },
  { name: 'Wayback Machine', url: 'https://web.archive.org/', desc: 'آرشیو تاریخی صفحات وب', category: 'آرشیو' },
  { name: ' crt.sh', url: 'https://crt.sh/', desc: 'جستجوی گواهی‌های SSL و زیردامنه‌ها', category: 'زیرساخت' },
];
