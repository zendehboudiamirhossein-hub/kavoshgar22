import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSessionUserDb } from '@/lib/auth';

export const runtime = 'nodejs';

// GET /api/cases/[id] — جزئیات پرونده (فقط مالک یا ادمین)
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUserDb(req);
  if (!session) {
    return NextResponse.json({ error: 'نشست منقضی شده — دوباره وارد شو' }, { status: 401 });
  }
  try {
    const { id } = await ctx.params;
    const c = await db.case.findUnique({ where: { id } });
    if (!c) return NextResponse.json({ error: 'پرونده یافت نشد' }, { status: 404 });
    // جداسازی کاربران: هر کاربر فقط پرونده خودش را می‌بیند (ادمین همه را می‌بیند)
    if (session.role !== 'admin' && c.userId && c.userId !== session.uid) {
      return NextResponse.json({ error: 'پرونده یافت نشد' }, { status: 404 });
    }
    return NextResponse.json({
      id: c.id,
      target: c.target,
      targetType: c.targetType,
      riskScore: c.riskScore,
      summary: c.summary,
      tags: (() => {
        try {
          const arr = c.tags ? JSON.parse(c.tags) : [];
          return Array.isArray(arr) ? arr.filter((t: unknown): t is string => typeof t === 'string') : [];
        } catch {
          return [];
        }
      })(),
      createdAt: c.createdAt,
      results: c.results ? JSON.parse(c.results) : [],
      aiReport: c.aiReport ? JSON.parse(c.aiReport) : null,
    });
  } catch (e) {
    console.error('case detail error:', e);
    return NextResponse.json({ error: 'خطا در دریافت پرونده' }, { status: 500 });
  }
}

// PATCH /api/cases/[id] — بروزرسانی برچسب‌های پرونده (فقط مالک یا ادمین)
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUserDb(req);
  if (!session) {
    return NextResponse.json({ error: 'نشست منقضی شده — دوباره وارد شو' }, { status: 401 });
  }
  try {
    const { id } = await ctx.params;
    const c = await db.case.findUnique({ where: { id }, select: { id: true, userId: true } });
    if (!c) return NextResponse.json({ error: 'پرونده یافت نشد' }, { status: 404 });
    if (session.role !== 'admin' && c.userId && c.userId !== session.uid) {
      return NextResponse.json({ error: 'پرونده یافت نشد' }, { status: 404 });
    }

    const body = await req.json().catch(() => null);
    const tags = body?.tags;
    if (!Array.isArray(tags)) {
      return NextResponse.json({ error: 'فرمت برچسب‌ها نامعتبر است' }, { status: 400 });
    }

    // پاکسازی: رشته، بدون فضای زائد، حداکثر ۲۴ نویسه، حداکثر ۲۰ برچسب، بدون تکرار
    const clean = Array.from(
      new Set(
        tags
          .filter((t): t is string => typeof t === 'string')
          .map((t) => t.trim().replace(/\s+/g, ' '))
          .filter((t) => t.length > 0 && t.length <= 24)
      )
    ).slice(0, 20);

    const updated = await db.case.update({
      where: { id },
      data: { tags: clean.length > 0 ? JSON.stringify(clean) : null },
      select: { id: true, tags: true },
    });

    let out: string[] = [];
    try {
      const arr = updated.tags ? JSON.parse(updated.tags) : [];
      if (Array.isArray(arr)) out = arr.filter((t: unknown): t is string => typeof t === 'string');
    } catch {
      out = [];
    }
    return NextResponse.json({ ok: true, tags: out });
  } catch (e) {
    console.error('case tags update error:', e);
    return NextResponse.json({ error: 'خطا در ذخیره برچسب‌ها' }, { status: 500 });
  }
}

// DELETE /api/cases/[id] — حذف پرونده (فقط ادمین؛ گزارش جستجوها هرگز حذف نمی‌شود)
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUserDb(req);
  if (!session) {
    return NextResponse.json({ error: 'نشست منقضی شده — دوباره وارد شو' }, { status: 401 });
  }
  if (session.role !== 'admin') {
    return NextResponse.json({ error: 'حذف پرونده فقط توسط مدیر امکان‌پذیر است' }, { status: 403 });
  }
  try {
    const { id } = await ctx.params;
    await db.case.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('case delete error:', e);
    return NextResponse.json({ error: 'خطا در حذف پرونده' }, { status: 500 });
  }
}
