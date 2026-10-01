import { NextRequest, NextResponse } from 'next/server';
import { generateAiReport } from '@/lib/osint/ai';
import { db } from '@/lib/db';
import { getSessionUserDb } from '@/lib/auth';

export const runtime = 'nodejs';
export const maxDuration = 120;

// POST /api/osint/ai-report — تولید گزارش تحلیلی هوش مصنوعی (نیازمند ورود)
export async function POST(req: NextRequest) {
  const session = await getSessionUserDb(req);
  if (!session) {
    return NextResponse.json({ error: 'نشست منقضی شده — دوباره وارد شو' }, { status: 401 });
  }
  try {
    const body = await req.json().catch(() => ({}));
    const target = String(body?.target ?? '');
    const targetType = String(body?.targetType ?? 'username');
    const results = Array.isArray(body?.results) ? body.results : [];
    const caseId = body?.caseId ? String(body.caseId) : null;

    if (!target || !results.length) {
      return NextResponse.json({ error: 'داده کافی برای تحلیل موجود نیست' }, { status: 400 });
    }

    const report = await generateAiReport(target, targetType, results);

    // به‌روزرسانی پرونده با گزارش AI
    if (caseId) {
      try {
        await db.case.update({
          where: { id: caseId },
          data: {
            aiReport: JSON.stringify(report),
            riskScore: report.riskScore,
            summary: report.executiveSummary,
          },
        });
      } catch (e) {
        console.error('DB update failed:', e);
      }
    }

    return NextResponse.json({ report });
  } catch (e) {
    console.error('ai-report error:', e);
    const msg = e instanceof Error && e.message ? e.message : 'خطا در تولید گزارش هوش مصنوعی';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
