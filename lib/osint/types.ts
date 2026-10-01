// ============================================================
// تایپ‌های مشترک موتور اوسینت
// ============================================================

export type TargetType = 'username' | 'email' | 'phone' | 'domain' | 'ip' | 'url' | 'crypto' | 'place';

export type ModuleStatus = 'success' | 'partial' | 'failed' | 'skipped';

/** منبع داده: live = واقعی از منبع اصلی، tracker = واقعی از ردیاب‌های ثالث،
 * unavailable = واقعاً در دسترس نبود (بدون هیچ عدد ساختگی)، simulated = شبیه‌سازی شده، hybrid = ترکیبی */
export type DataSource = 'live' | 'tracker' | 'unavailable' | 'simulated' | 'hybrid';

export interface OsintFinding {
  label: string;
  value: string;
  severity?: 'info' | 'low' | 'medium' | 'high';
  link?: string;
}

export interface OsintMetric {
  label: string;
  value: number;
}

export interface TimelinePoint {
  date: string;
  label: string;
  value: number;
}

export interface OsintModuleResult {
  module: string;
  title: string;
  icon: string;
  status: ModuleStatus;
  source: DataSource;
  summary: string;
  findings: OsintFinding[];
  metrics?: OsintMetric[];
  timeline?: TimelinePoint[];
  raw?: unknown;
  durationMs: number;
  error?: string;
}

export interface ScanRequest {
  target: string;
  modules?: string[];
}

export interface ScanResponse {
  target: string;
  targetType: TargetType;
  results: OsintModuleResult[];
}

export const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

export function toFaDigits(input: string | number): string {
  return String(input).replace(/[0-9]/g, (d) => FA_DIGITS[Number(d)]);
}

export function formatNumberFa(n: number): string {
  return toFaDigits(new Intl.NumberFormat('en-US').format(n));
}
