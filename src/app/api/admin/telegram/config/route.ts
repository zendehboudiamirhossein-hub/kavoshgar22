import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserDb } from '@/lib/auth';
import { setBotConfig } from '@/lib/telegram';

export const runtime = 'nodejs';

// POST /api/admin/telegram/config — ذخیره آیدی ربات و دستورات جستجو (فقط ادمین)
export async function POST(req: NextRequest) {
  const session = await getSessionUserDb(req);
  if (!session) return NextResponse.json({ error: 'ابتدا وارد شوید' }, { status: 401 });
  if (session.role !== 'admin') return NextResponse.json({ error: 'دسترسی فقط برای مدیر' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const botUsername = String(body?.botUsername ?? '');
  const commands = {
    name: String(body?.cmdName ?? ''),
    nationalId: String(body?.cmdNationalId ?? ''),
    mobile: String(body?.cmdMobile ?? ''),
    card: String(body?.cmdCard ?? ''),
  };

  try {
    const saved = await setBotConfig(botUsername, commands);
    return NextResponse.json({ message: 'تنظیمات ربات ذخیره شد', bot: saved });
  } catch (e) {
    if (e instanceof Error && e.name === 'TelegramUserError') {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    console.error('admin telegram config error:', e);
    return NextResponse.json({ error: 'خطا در ذخیره تنظیمات ربات' }, { status: 500 });
  }
}
