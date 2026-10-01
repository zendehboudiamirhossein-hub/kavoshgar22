import type { OsintModuleResult, TargetType } from './types';
import { detectTargetType, extractDomain, extractUsername } from './detect';
import { instagramModule } from './instagram';
import { twitterModule } from './twitter';
import { telegramModule } from './telegram';
import { githubModule } from './github';
import { usernameModule } from './username';
import { emailModule } from './email';
import { domainModule } from './domain';
import { phoneModule } from './phone';
import { newsModule } from './news';
import { archiveModule } from './archive';
import { geoModule } from './geo';
import { cryptoModule } from './crypto';
import { darkwebModule } from './darkweb';

// ============================================================
// ارکستراتور اسکن: انتخاب ماژول مناسب بر اساس نوع هدف و اجرای موازی
// ============================================================

export const ALL_MODULES = [
  'instagram', 'twitter', 'telegram', 'github', 'username', 'email', 'domain', 'phone',
  'news', 'archive', 'geo', 'crypto', 'darkweb',
] as const;

export function modulesForType(type: TargetType): string[] {
  switch (type) {
    case 'username':
      return ['instagram', 'twitter', 'telegram', 'github', 'username', 'news', 'darkweb'];
    case 'email':
      return ['email', 'username', 'darkweb'];
    case 'phone':
      return ['phone', 'darkweb'];
    case 'domain':
    case 'url':
      return ['domain', 'username', 'archive', 'news', 'darkweb'];
    case 'ip':
      return ['domain', 'news'];
    case 'crypto':
      return ['crypto', 'darkweb'];
    case 'place':
      return ['geo', 'news'];
  }
}

export interface ScanOptions {
  /** کلید API اینستاگرام (مثل HikerAPI) — داده مستقیم و قطعی اینستاگرام */
  hikerKey?: string;
  /** توکن Truecaller — نمایش نام ثبت‌شده شماره‌ها در نتایج */
  truecallerToken?: string;
}

export async function runScan(
  rawTarget: string,
  selectedModules?: string[],
  opts?: ScanOptions
): Promise<{ target: string; targetType: TargetType; results: OsintModuleResult[] }> {
  const target = rawTarget.trim();
  const targetType = detectTargetType(target);
  let mods = selectedModules?.length ? selectedModules : modulesForType(targetType);

  // ماژول‌های نامعتبر را فیلتر کن
  mods = mods.filter((m) => (ALL_MODULES as readonly string[]).includes(m));

  const tasks: Promise<OsintModuleResult>[] = [];

  for (const m of mods) {
    switch (m) {
      case 'instagram':
        tasks.push(instagramModule(extractUsername(target), { hikerKey: opts?.hikerKey }));
        break;
      case 'twitter':
        tasks.push(twitterModule(extractUsername(target)));
        break;
      case 'telegram':
        tasks.push(telegramModule(extractUsername(target)));
        break;
      case 'github':
        tasks.push(githubModule(extractUsername(target)));
        break;
      case 'username':
        tasks.push(usernameModule(extractUsername(target), { hikerKey: opts?.hikerKey }));
        break;
      case 'email':
        tasks.push(emailModule(target));
        break;
      case 'domain':
        tasks.push(
          targetType === 'url' || targetType === 'domain'
            ? domainModule(extractDomain(target))
            : domainModule(target)
        );
        break;
      case 'phone':
        tasks.push(phoneModule(target, { truecallerToken: opts?.truecallerToken }));
        break;
      case 'news':
        tasks.push(newsModule(target, targetType));
        break;
      case 'archive':
        tasks.push(archiveModule(extractDomain(target)));
        break;
      case 'geo':
        tasks.push(geoModule(target));
        break;
      case 'crypto':
        tasks.push(cryptoModule(target));
        break;
      case 'darkweb':
        tasks.push(darkwebModule(target));
        break;
    }
  }

  const results = await Promise.allSettled(tasks);
  const ok = results.map((r) =>
    r.status === 'fulfilled'
      ? r.value
      : ({
          module: 'unknown',
          title: 'ماژول نامشخص',
          icon: 'AlertTriangle',
          status: 'failed',
          source: 'live',
          summary: 'خطای غیرمنتظره در اجرای ماژول',
          findings: [],
          durationMs: 0,
          error: String((r as PromiseRejectedResult).reason),
        } as OsintModuleResult)
  );

  // مرتب‌سازی بر اساس اولویت تعریف‌شده
  const order = [
    'instagram', 'twitter', 'telegram', 'github', 'username', 'email', 'domain',
    'archive', 'crypto', 'geo', 'news', 'darkweb', 'phone',
  ];
  ok.sort((a, b) => order.indexOf(a.module) - order.indexOf(b.module));

  return { target, targetType, results: ok };
}
