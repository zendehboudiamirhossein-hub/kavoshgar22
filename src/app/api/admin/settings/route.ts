import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserDb } from '@/lib/auth';
import {
  getGlobalKeyStatus,
  getTcTokenStatus,
  setGlobalHikerKey,
  setGlobalTcToken,
  clearGlobalHikerKey,
  clearGlobalTcToken,
  maskKey,
} from '@/lib/settings';

export const runtime = 'nodejs';

// GET /api/admin/settings — وضعیت کلیدهای سازمانی (فقط ادمین؛ مقدار کامل هرگز برنمی‌گردد)
export async function GET(req: NextRequest) {
  const session = await getSessionUserDb(req);
  if (!session) return NextResponse.json({ error: 'ابتدا وارد شوید' }, { status: 401 });
  if (session.role !== 'admin') return NextResponse.json({ error: 'دسترسی فقط برای مدیر' }, { status: 403 });

  const [hiker, truecaller] = await Promise.all([getGlobalKeyStatus(), getTcTokenStatus()]);
  return NextResponse.json({ hiker, truecaller });
}

// POST /api/admin/settings — ذخیره یا حذف کلیدهای سازمانی (فقط ادمین)
// بدنه: { setting: 'hiker' | 'truecaller', value?: string, clear?: boolean }
export async function POST(req: NextRequest) {
  const session = await getSessionUserDb(req);
  if (!session) return NextResponse.json({ error: 'ابتدا وارد شوید' }, { status: 401 });
  if (session.role !== 'admin') return NextResponse.json({ error: 'دسترسی فقط برای مدیر' }, { status: 403 });

  try {
    const body = await req.json().catch(() => ({}));
    const setting = body?.setting === 'truecaller' ? 'truecaller' : body?.setting === 'hiker' ? 'hiker' : null;
    if (!setting) {
      return NextResponse.json({ error: 'نام تنظیم نامعتبر است (hiker یا truecaller)' }, { status: 400 });
    }

    if (body?.clear === true) {
      if (setting === 'hiker') await clearGlobalHikerKey();
      else await clearGlobalTcToken();
      const status = setting === 'hiker' ? await getGlobalKeyStatus() : await getTcTokenStatus();
      return NextResponse.json({
        setting,
        ...status,
        message: setting === 'hiker' ? 'کلید سازمانی HikerAPI حذف شد' : 'توکن سازمانی Truecaller حذف شد',
      });
    }

    const value = String(body?.value ?? '').trim();
    if (!value) {
      return NextResponse.json({ error: 'مقدار کلید خالی است' }, { status: 400 });
    }
    if (value.length < 8 || value.length > 512) {
      return NextResponse.json({ error: 'طول مقدار نامعتبر است (حداقل ۸ کاراکتر)' }, { status: 400 });
    }

    if (setting === 'hiker') await setGlobalHikerKey(value);
    else await setGlobalTcToken(value);

    const status = setting === 'hiker' ? await getGlobalKeyStatus() : await getTcTokenStatus();
    const label = setting === 'hiker' ? 'کلید سازمانی HikerAPI' : 'توکن سازمانی Truecaller';
    return NextResponse.json({ setting, ...status, message: `${label} ذخیره شد (${maskKey(value)})` });
  } catch (e) {
    console.error('admin settings error:', e);
    return NextResponse.json({ error: 'خطا در ذخیره تنظیمات' }, { status: 500 });
  }
}
