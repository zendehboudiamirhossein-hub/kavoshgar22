import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserDb } from '@/lib/auth';
import { getTelegramConfig, isTelegramConfigured } from '@/lib/telegram';

export const runtime = 'nodejs';

// GET /api/admin/telegram — وضعیت اکانت تلگرام و ربات جستجو (فقط ادمین)
// سشن/api_hash هرگز کامل برنمی‌گردند؛ فقط وضعیت و مشخصات عمومی
export async function GET(req: NextRequest) {
  const session = await getSessionUserDb(req);
  if (!session) return NextResponse.json({ error: 'ابتدا وارد شوید' }, { status: 401 });
  if (session.role !== 'admin') return NextResponse.json({ error: 'دسترسی فقط برای مدیر' }, { status: 403 });

  const cfg = await getTelegramConfig();
  const accountConfigured = isTelegramConfigured(cfg);
  return NextResponse.json({
    account: {
      configured: accountConfigured,
      phone: accountConfigured ? cfg.phone : '',
      name: accountConfigured ? cfg.accountName : '',
      username: accountConfigured ? cfg.accountUsername : '',
      // برای راحتی ادمین: مشخص می‌کند API ID/Hash روی سرور ذخیره است (خود هش برنمی‌گردد)
      credentialsSaved: !!(cfg.apiId && cfg.apiHash),
      savedApiId: cfg.apiId ? String(cfg.apiId) : '',
    },
    bot: {
      configured: !!cfg.botUsername,
      username: cfg.botUsername,
      commands: cfg.commands,
    },
  });
}
