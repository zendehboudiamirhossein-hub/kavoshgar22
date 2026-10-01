import { db } from '@/lib/db';

// ============================================================
// تنظیمات سراسری سامانه (جدول Setting) — مثل کلید API سازمانی
// کلید سازمانی HikerAPI: مدیر در پنل ادمین قرار می‌دهد و برای
// همه کاربرانی که کلید شخصی ندارند به‌صورت خودکار استفاده می‌شود.
// کلید هرگز کامل به کلاینت برگردانده نمی‌شود — فقط نسخه ماسک‌شده.
// ============================================================

export const GLOBAL_HIKER_KEY = 'hiker_api_key';
export const GLOBAL_TC_TOKEN = 'truecaller_token';

/** خواندن مقدار یک تنظیم سازمانی از دیتابیس ('' یعنی تنظیم نشده) */
async function getOrgValue(key: string): Promise<string> {
  try {
    const row = await db.setting.findUnique({ where: { key } });
    return (row?.value ?? '').trim();
  } catch (e) {
    console.error(`getOrgValue(${key}) failed:`, e);
    return '';
  }
}

/** خواندن کلید سازمانی HikerAPI از دیتابیس ('' یعنی تنظیم نشده) */
export async function getGlobalHikerKey(): Promise<string> {
  return getOrgValue(GLOBAL_HIKER_KEY);
}

/** خواندن توکن سازمانی Truecaller از دیتابیس ('' یعنی تنظیم نشده) */
export async function getGlobalTcToken(): Promise<string> {
  return getOrgValue(GLOBAL_TC_TOKEN);
}

/** ماسک کردن کلید برای نمایش امن: ۴ کاراکتر اول + … + ۴ کاراکتر آخر */
export function maskKey(key: string): string {
  const k = key.trim();
  if (k.length <= 8) return '••••••••';
  return `${k.slice(0, 4)}••••••••${k.slice(-4)}`;
}

export interface OrgKeyStatus {
  configured: boolean;
  masked: string | null;
  updatedAt: string | null;
  /** آیا متغیر محیطی مرتبط هم تنظیم شده (fallback سراسری) */
  envConfigured: boolean;
}

/** وضعیت یک تنظیم سازمانی برای نمایش در پنل ادمین — بدون افشای مقدار کامل */
async function getOrgStatus(key: string, envValue: string | undefined): Promise<OrgKeyStatus> {
  try {
    const row = await db.setting.findUnique({ where: { key } });
    const value = (row?.value ?? '').trim();
    return {
      configured: !!value,
      masked: value ? maskKey(value) : null,
      updatedAt: row?.updatedAt ? new Date(row.updatedAt).toISOString() : null,
      envConfigured: !!(envValue ?? '').trim(),
    };
  } catch (e) {
    console.error(`getOrgStatus(${key}) failed:`, e);
    return { configured: false, masked: null, updatedAt: null, envConfigured: !!(envValue ?? '').trim() };
  }
}

/** وضعیت کلید سازمانی HikerAPI */
export async function getGlobalKeyStatus(): Promise<OrgKeyStatus> {
  return getOrgStatus(GLOBAL_HIKER_KEY, process.env.HIKER_API_KEY);
}

/** وضعیت توکن سازمانی Truecaller */
export async function getTcTokenStatus(): Promise<OrgKeyStatus> {
  return getOrgStatus(GLOBAL_TC_TOKEN, process.env.TRUECALLER_TOKEN);
}

/** ذخیره/به‌روزرسانی یک تنظیم سازمانی */
async function setOrgValue(key: string, value: string): Promise<void> {
  await db.setting.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
}

/** ذخیره/به‌روزرسانی کلید سازمانی HikerAPI */
export async function setGlobalHikerKey(key: string): Promise<void> {
  await setOrgValue(GLOBAL_HIKER_KEY, key.trim());
}

/** ذخیره/به‌روزرسانی توکن سازمانی Truecaller */
export async function setGlobalTcToken(token: string): Promise<void> {
  await setOrgValue(GLOBAL_TC_TOKEN, token.trim());
}

/** حذف یک تنظیم سازمانی */
async function clearOrgValue(key: string): Promise<void> {
  await db.setting.deleteMany({ where: { key } });
}

/** حذف کلید سازمانی HikerAPI */
export async function clearGlobalHikerKey(): Promise<void> {
  await clearOrgValue(GLOBAL_HIKER_KEY);
}

/** حذف توکن سازمانی Truecaller */
export async function clearGlobalTcToken(): Promise<void> {
  await clearOrgValue(GLOBAL_TC_TOKEN);
}
