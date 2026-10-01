import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserDb } from '@/lib/auth';
import { getGlobalHikerKey, getGlobalTcToken } from '@/lib/settings';

export const runtime = 'nodejs';

// GET /api/osint/key-status — آیا کلیدهای سازمانی توسط مدیر فعال شده‌اند؟
// برای کاربران واردشده؛ فقط بولین برمی‌گردد و هیچ اطلاعاتی از خود کلیدها افشا نمی‌شود
export async function GET(req: NextRequest) {
  const session = await getSessionUserDb(req);
  if (!session) return NextResponse.json({ error: 'نشست منقضی شده' }, { status: 401 });

  const [hiker, truecaller] = await Promise.all([getGlobalHikerKey(), getGlobalTcToken()]);
  return NextResponse.json({ hiker: !!hiker, truecaller: !!truecaller, global: !!hiker });
}
