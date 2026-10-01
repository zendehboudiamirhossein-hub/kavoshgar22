import { NextRequest, NextResponse } from 'next/server';
import { generateDorks } from '@/lib/osint/dorks';
import { detectTargetType } from '@/lib/osint/detect';
import { getSessionUserDb } from '@/lib/auth';

export const runtime = 'nodejs';

// GET /api/osint/dorks?target=... — تولید Google Dork و پیوندهای خارجی (نیازمند ورود)
export async function GET(req: NextRequest) {
  if (!(await getSessionUserDb(req))) {
    return NextResponse.json({ error: 'نشست منقضی شده — دوباره وارد شو' }, { status: 401 });
  }
  const target = req.nextUrl.searchParams.get('target') ?? '';
  if (!target) return NextResponse.json({ error: 'هدف لازم است' }, { status: 400 });
  const type = detectTargetType(target);
  return NextResponse.json({ groups: generateDorks(target, type) });
}
