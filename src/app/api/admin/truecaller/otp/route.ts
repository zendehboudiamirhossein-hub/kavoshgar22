import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserDb } from '@/lib/auth';
import { tcSendOtp, tcVerifyOtp, parseTcPhone } from '@/lib/osint/callerid';
import { setGlobalTcToken, maskKey } from '@/lib/settings';

export const runtime = 'nodejs';
export const maxDuration = 60;

// POST /api/admin/truecaller/otp — ورود به Truecaller با کد تأیید پیامکی (فقط ادمین)
// مرحله ۱ — بدنه: { action: 'send', phone: '+98912...' } → { requestId }
// مرحله ۲ — بدنه: { action: 'verify', phone, requestId, otp } → توکن دریافت و در تنظیمات سازمانی ذخیره می‌شود
export async function POST(req: NextRequest) {
  const session = await getSessionUserDb(req);
  if (!session) return NextResponse.json({ error: 'ابتدا وارد شوید' }, { status: 401 });
  if (session.role !== 'admin') return NextResponse.json({ error: 'دسترسی فقط برای مدیر' }, { status: 403 });

  try {
    const body = await req.json().catch(() => ({}));
    const action = body?.action === 'verify' ? 'verify' : body?.action === 'send' ? 'send' : null;
    if (!action) {
      return NextResponse.json({ error: 'action نامعتبر است (send یا verify)' }, { status: 400 });
    }

    const phoneRaw = String(body?.phone ?? '').trim();
    const parts = parseTcPhone(phoneRaw);
    if (!parts) {
      return NextResponse.json({ error: 'شماره موبایل نامعتبر است — شماره همه کشورها با پیشوند بین‌المللی پذیرفته می‌شود؛ مثل +989121234567 یا +14155552671 یا 00447911123456' }, { status: 400 });
    }

    if (action === 'send') {
      const r = await tcSendOtp(parts);
      if (!r.ok) {
        return NextResponse.json({ ok: false, suspended: r.suspended ?? false, message: r.message ?? 'ارسال کد ناموفق بود' }, { status: 502 });
      }
      return NextResponse.json({ ok: true, requestId: r.requestId, message: r.message });
    }

    // verify
    const requestId = String(body?.requestId ?? '').trim();
    const otp = String(body?.otp ?? '').trim();
    if (!requestId || !otp) {
      return NextResponse.json({ error: 'requestId و کد تأیید (otp) الزامی است' }, { status: 400 });
    }
    const v = await tcVerifyOtp(parts, requestId, otp);
    if (!v.ok || !v.token) {
      return NextResponse.json({ ok: false, message: v.message ?? 'تأیید کد ناموفق بود' }, { status: 401 });
    }

    // توکن معتبر به‌صورت خودکار در تنظیمات سازمانی ذخیره می‌شود
    await setGlobalTcToken(v.token);
    return NextResponse.json({ ok: true, masked: maskKey(v.token), message: `ورود موفق — توکن سازمانی Truecaller ذخیره شد (${maskKey(v.token)})` });
  } catch (e) {
    console.error('admin truecaller otp error:', e);
    return NextResponse.json({ error: 'خطا در فرایند ورود Truecaller' }, { status: 500 });
  }
}
