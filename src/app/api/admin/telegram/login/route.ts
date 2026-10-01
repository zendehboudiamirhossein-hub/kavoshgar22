import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserDb } from '@/lib/auth';
import { telegramSendCode, telegramVerifyCode, telegramLogout } from '@/lib/telegram';

export const runtime = 'nodejs';
export const maxDuration = 120;

// POST /api/admin/telegram/login — ورود/خروج اکانت تلگرام (فقط ادمین)
// action='send-code' | 'verify' | 'logout'
export async function POST(req: NextRequest) {
  const session = await getSessionUserDb(req);
  if (!session) return NextResponse.json({ error: 'ابتدا وارد شوید' }, { status: 401 });
  if (session.role !== 'admin') return NextResponse.json({ error: 'دسترسی فقط برای مدیر' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const action = String(body?.action ?? '');

  try {
    if (action === 'send-code') {
      const r = await telegramSendCode(String(body?.apiId ?? ''), String(body?.apiHash ?? ''), String(body?.phone ?? ''));
      return NextResponse.json({
        step: 'code-sent',
        phone: r.phone,
        message: 'کد ورود به تلگرام شما (در پیام تلگرام یا SMS) ارسال شد',
      });
    }

    if (action === 'verify') {
      const rawPassword = String(body?.password ?? '');
      try {
        const r = await telegramVerifyCode(String(body?.code ?? ''), rawPassword);
        return NextResponse.json({
          step: 'connected',
          account: { name: r.name, username: r.username, phone: r.phone },
          message: 'اکانت تلگرام با موفقیت متصل شد',
        });
      } catch (e) {
        // نیاز به رمز دومرحله‌ای — کلاینت فرم رمز را باز می‌کند
        if (e instanceof Error && e.message === 'NEED_PASSWORD') {
          return NextResponse.json({ step: 'need-password', error: 'این اکانت رمز دومرحله‌ای دارد — رمز را وارد کنید' }, { status: 400 });
        }
        throw e;
      }
    }

    if (action === 'logout') {
      await telegramLogout();
      return NextResponse.json({ step: 'logged-out', message: 'اکانت تلگرام قطع شد' });
    }

    return NextResponse.json({ error: 'عملیات نامعتبر است' }, { status: 400 });
  } catch (e) {
    if (e instanceof Error && e.name === 'TelegramUserError') {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    console.error('admin telegram login error:', e);
    const detail = e instanceof Error && e.message ? e.message : String(e ?? '');
    return NextResponse.json(
      { error: `خطای اتصال تلگرام: ${detail || 'نامشخص'} — چند لحظه بعد دوباره تلاش کنید` },
      { status: 500 }
    );
  }
}
