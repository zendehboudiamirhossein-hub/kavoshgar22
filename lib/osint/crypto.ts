import type { OsintModuleResult } from './types';
import { safeFetch, fmtNum } from './net';

// ============================================================
// ماژول تحلیل کیف پول بیت‌کوین (واقعی)
// منبع: blockstream.info API + mempool.space (پشتیبان) بدون کلید
// ============================================================

const SATS_PER_BTC = 100_000_000;

function toBtc(sats: number): string {
  return (sats / SATS_PER_BTC).toFixed(8).replace(/\.?0+$/, '') || '0';
}

export function isBtcAddress(addr: string): boolean {
  // Base58 (1..., 3...) یا Bech32 (bc1...)
  return /^(bc1[a-z0-9]{25,62}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$/.test(addr.trim());
}

export async function cryptoModule(address: string): Promise<OsintModuleResult> {
  const started = Date.now();
  const addr = address.trim();
  const findings: OsintModuleResult['findings'] = [];

  // تلاش منبع اصلی و سپس پشتیبان
  let data: { txCount: number; funded: number; spent: number } | null = null;
  let provider = '';
  let error: string | undefined;

  for (const src of [
    { name: 'blockstream.info', url: `https://blockstream.info/api/address/${addr}` },
    { name: 'mempool.space', url: `https://mempool.space/api/address/${addr}` },
  ]) {
    try {
      const r = await safeFetch(src.url, { timeoutMs: 9000 });
      if (r.ok && r.body.trim().startsWith('{')) {
        const j = JSON.parse(r.body);
        const chain = j.chain_stats;
        if (chain && typeof chain.tx_count === 'number') {
          data = { txCount: chain.tx_count, funded: chain.funded_txo_sum, spent: chain.spent_txo_sum };
          provider = src.name;
          break;
        }
      }
    } catch {
      /* تلاش منبع بعدی */
    }
  }

  if (!data) {
    return {
      module: 'crypto',
      title: 'تحلیل کیف پول بیت‌کوین',
      icon: 'Bitcoin',
      status: 'failed',
      source: 'live',
      summary: `اتصال به نودهای اکسپلورر بیت‌کوین برقرار نشد یا آدرس نامعتبر است.`,
      findings: [{ label: 'نتیجه', value: error ?? 'داده‌ای از زنجیره دریافت نشد — بعداً تلاش کنید', severity: 'info' }],
      durationMs: Date.now() - started,
      error: error ?? 'blockstream + mempool.space در دسترس نبودند',
    };
  }

  const balance = Math.max(data.funded - data.spent, 0);

  findings.push({
    label: 'موجودی فعلی',
    value: `${toBtc(balance)} BTC`,
    severity: balance > 0 ? 'high' : 'info',
  });
  findings.push({ label: 'مجموع دریافتی', value: `${toBtc(data.funded)} BTC`, severity: 'medium' });
  findings.push({ label: 'مجموع پرداختی', value: `${toBtc(data.spent)} BTC`, severity: 'medium' });
  findings.push({ label: 'تعداد تراکنش‌ها', value: fmtNum(data.txCount), severity: 'medium' });
  findings.push({
    label: 'الگوی فعالیت',
    value:
      data.txCount === 0
        ? 'آدرس هرگز در زنجیره استفاده نشده'
        : data.txCount < 10
          ? 'فعالیت کم — احتمالاً کیف پول شخصی'
          : data.txCount < 100
            ? 'فعالیت متوسط'
            : 'فعالیت بالا — احتمال کیف پول سرویس/صرافی یا میکس',
    severity: data.txCount > 100 ? 'high' : 'info',
  });
  findings.push({ label: 'کاوشگر تراکنش', value: 'مشاهده کامل تاریخچه در اکسپلورر', severity: 'info', link: `https://blockstream.info/address/${addr}` });
  findings.push({ label: 'Mempool.Space', value: 'بررسی تراکنش‌های در انتظار', severity: 'info', link: `https://mempool.space/address/${addr}` });

  return {
    module: 'crypto',
    title: 'تحلیل کیف پول بیت‌کوین',
    icon: 'Bitcoin',
    status: 'success',
    source: 'live',
    summary: `آدرس «${addr.slice(0, 10)}…» روی بلاکچین بیت‌کوین تحلیل شد — موجودی ${toBtc(balance)} BTC با ${fmtNum(data.txCount)} تراکنش (منبع: ${provider}). تراکنش‌های متوالی برای پیوند هویتی قابل ردیابی هستند.`,
    findings,
    metrics: [
      { label: 'تراکنش‌ها', value: data.txCount },
      { label: 'موجودی (Sats)', value: balance },
      { label: 'دریافتی (Sats)', value: data.funded },
      { label: 'پرداختی (Sats)', value: data.spent },
    ],
    raw: { address: addr, ...data, provider },
    durationMs: Date.now() - started,
  };
}
