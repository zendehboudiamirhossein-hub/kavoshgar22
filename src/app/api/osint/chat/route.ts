import { NextRequest, NextResponse } from 'next/server';
import { aiChat } from '@/lib/osint/ai';
import { db } from '@/lib/db';
import { getSessionUserDb } from '@/lib/auth';

export const runtime = 'nodejs';
export const maxDuration = 120;

// POST /api/osint/chat — چت با تحلیلگر هوش مصنوعی (نیازمند ورود)
export async function POST(req: NextRequest) {
  const session = await getSessionUserDb(req);
  if (!session) {
    return NextResponse.json({ error: 'نشست منقضی شده — دوباره وارد شو' }, { status: 401 });
  }
  try {
    const body = await req.json().catch(() => ({}));
    const messages: { role: 'user' | 'assistant'; content: string }[] = Array.isArray(body?.messages)
      ? body.messages.filter((m: any) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      : [];
    const caseId = body?.caseId ? String(body.caseId) : null;

    if (!messages.length || messages[messages.length - 1].role !== 'user') {
      return NextResponse.json({ error: 'پیام نامعتبر' }, { status: 400 });
    }

    // زمینه پرونده اگر متصل باشد
    let caseContext: string | undefined;
    if (caseId) {
      try {
        const c = await db.case.findUnique({ where: { id: caseId } });
        if (c?.results) {
          const parsed = JSON.parse(c.results);
          caseContext = `هدف: «${c.target}» (نوع: ${c.targetType})\n` +
            parsed
              .map((r: any) => `- ${r.title}: ${r.summary}`)
              .join('\n');
        }
      } catch {
        /* ignore */
      }
    }

    const reply = await aiChat(messages, caseContext);

    // ذخیره پیام‌های چت
    try {
      await db.chatMessage.createMany({
        data: [
          { role: 'user', content: messages[messages.length - 1].content, caseId },
          { role: 'assistant', content: reply, caseId },
        ].map((m) => ({ role: m.role, content: m.content, caseId: caseId ?? null })),
      });
    } catch (e) {
      console.error('chat save failed:', e);
    }

    return NextResponse.json({ reply });
  } catch (e) {
    console.error('chat error:', e);
    const msg = e instanceof Error && e.message ? e.message : 'خطا در چت با تحلیلگر';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
