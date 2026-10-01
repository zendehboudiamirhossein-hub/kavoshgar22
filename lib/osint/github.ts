import type { OsintModuleResult } from './types';
import { safeFetch, fmtNum, fmtDate } from './net';

// ============================================================
// ماژول اوسینت گیت‌هاب
// منبع واقعی: API رسمی عمومی گیت‌هاب (بدون کلید)
// ============================================================

interface RepoLite {
  name: string;
  stars: number;
  forks: number;
  language: string | null;
  updated: string;
  fork: boolean;
}

export async function githubModule(username: string): Promise<OsintModuleResult> {
  const started = Date.now();
  const u = username.replace(/^@/, '');
  const headers = {
    accept: 'application/vnd.github+json',
    // اگر توکن محیط موجود باشد استفاده می‌شود تا محدودیت نرخ کمتر شود
    ...(process.env.GITHUB_TOKEN ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
  };

  const res = await safeFetch(`https://api.github.com/users/${encodeURIComponent(u)}`, {
    headers,
    timeoutMs: 8000,
  });

  if (res.status === 404) {
    return {
      module: 'github',
      title: 'تحلیل گیت‌هاب',
      icon: 'Github',
      status: 'failed',
      source: 'live',
      summary: `کاربر ${u} در گیت‌هاب یافت نشد — این یافته نیز یک سرنخ منفی (Negative Intel) ارزشمند است.`,
      findings: [{ label: 'نتیجه', value: 'حساب گیت‌هاب با این نام وجود ندارد', severity: 'info' }],
      durationMs: Date.now() - started,
      error: 'NOT_FOUND',
    };
  }

  if (!res.ok) {
    // منبع جایگزین: ungh.cc (پروکسی رایگان گیت‌هاب بدون محدودیت نرخ)
    try {
      const alt = await safeFetch(`https://ungh.cc/users/find/${encodeURIComponent(u)}`, { timeoutMs: 8000 });
      if (alt.ok) {
        const aj = JSON.parse(alt.body);
        const au = aj?.user;
        if (au) {
          const findings: OsintModuleResult['findings'] = [
            { label: 'نام کاربری', value: au.username ?? u },
            { label: 'نام کامل', value: au.name ?? '—' },
            { label: 'شناسه حساب', value: String(au.id ?? '—') },
            { label: 'منبع داده', value: 'پروکسی ungh.cc (به دلیل محدودیت نرخ API رسمی)', severity: 'info' },
          ];
          if (au.email) findings.push({ label: 'ایمیل عمومی', value: au.email, severity: 'high' });
          return {
            module: 'github',
            title: 'تحلیل گیت‌هاب',
            icon: 'Github',
            status: 'success',
            source: 'hybrid',
            summary: `حساب گیت‌هاب «${au.username ?? u}» از طریق منبع جایگزین تأیید شد${au.name ? ' — نام: ' + au.name : ''}. آمار کامل مخازن موقتاً در دسترس نیست.`,
            findings,
            raw: au,
            durationMs: Date.now() - started,
          };
        }
      }
    } catch {
      /* ignore */
    }
    return {
      module: 'github',
      title: 'تحلیل گیت‌هاب',
      icon: 'Github',
      status: 'failed',
      source: 'live',
      summary: `دسترسی به API گیت‌هاب ناموفق (کد ${res.status || 'شبکه'}${res.status === 403 ? ' — محدودیت نرخ' : ''})`,
      findings: [],
      durationMs: Date.now() - started,
      error: `HTTP ${res.status}`,
    };
  }

  const user = JSON.parse(res.body);

  // دریافت مخازن برای تحلیل زبان‌ها و فعالیت
  let repos: RepoLite[] = [];
  const reposRes = await safeFetch(
    `https://api.github.com/users/${encodeURIComponent(u)}/repos?per_page=40&sort=updated`,
    { headers, timeoutMs: 8000 }
  );
  if (reposRes.ok) {
    try {
      const list = JSON.parse(reposRes.body) as any[];
      repos = list.map((r) => ({
        name: r.name,
        stars: r.stargazers_count ?? 0,
        forks: r.forks_count ?? 0,
        language: r.language,
        updated: r.updated_at,
        fork: !!r.fork,
      }));
    } catch {
      /* ignore */
    }
  }

  const langCount: Record<string, number> = {};
  repos.forEach((r) => {
    if (r.language) langCount[r.language] = (langCount[r.language] ?? 0) + 1;
  });
  const topLangs = Object.entries(langCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const totalStars = repos.reduce((a, r) => a + r.stars, 0);
  const ownRepos = repos.filter((r) => !r.fork).length;

  const findings: OsintModuleResult['findings'] = [
    { label: 'نام کاربری', value: user.login },
    { label: 'نام کامل', value: user.name ?? '—' },
    { label: 'شرکت', value: user.company ?? '—', severity: 'medium' },
    { label: 'موقعیت مکانی (خوداظهاری)', value: user.location ?? '—', severity: 'medium' },
    { label: 'ایمیل عمومی', value: user.email ?? '—', severity: user.email ? 'high' : 'info' },
    { label: 'وب‌سایت', value: user.blog || '—', link: user.blog || undefined },
    { label: 'توییتر مرتبط', value: user.twitter_username ? '@' + user.twitter_username : '—', severity: 'medium' },
    { label: 'مخازن عمومی', value: fmtNum(user.public_repos ?? 0) },
    { label: 'مخازن خصوصی (شمارش‌شده)', value: fmtNum(user.total_private_repos ?? 0) },
    { label: 'دنبال‌کننده', value: fmtNum(user.followers ?? 0) },
    { label: 'دنبال‌شده', value: fmtNum(user.following ?? 0) },
    { label: 'تاریخ ساخت حساب', value: fmtDate(user.created_at), severity: 'info' },
    { label: 'آخرین فعالیت', value: fmtDate(user.updated_at) },
  ];
  if (topLangs.length) {
    findings.push({ label: 'زبان‌های برنامه‌نویسی', value: topLangs.map(([l]) => l).join('، ') });
  }
  if (user.hireable) findings.push({ label: 'آماده استخدام', value: 'بله', severity: 'info' });

  return {
    module: 'github',
    title: 'تحلیل گیت‌هاب',
    icon: 'Github',
    status: 'success',
    source: 'live',
    summary: `پروفایل واقعی گیت‌هاب دریافت شد — ${fmtNum(user.public_repos ?? 0)} مخزن عمومی، ${fmtNum(totalStars)} ستاره جمعی${
      topLangs.length ? '، تخصص اصلی: ' + topLangs.slice(0, 3).map(([l]) => l).join('، ') : ''
    }.`,
    findings,
    metrics: [
      { label: 'مخازن عمومی', value: ownRepos },
      { label: 'دنبال‌کننده', value: user.followers ?? 0 },
      { label: 'ستاره‌ها', value: totalStars },
      { label: 'فالوینگ', value: user.following ?? 0 },
    ],
    timeline: repos
      .slice(0, 12)
      .reverse()
      .map((r) => ({ date: r.updated, label: r.name, value: r.stars })),
    raw: { ...user, repos, topLangs, totalStars },
    durationMs: Date.now() - started,
  };
}
