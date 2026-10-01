import { NextRequest, NextResponse } from 'next/server';
import { imageModule } from '@/lib/osint/image';
import { getSessionUserDb } from '@/lib/auth';

export const runtime = 'nodejs';
export const maxDuration = 60;

// POST /api/osint/image — تحلیل متادیتای تصویر آپلودی (نیازمند ورود)
export async function POST(req: NextRequest) {
  if (!(await getSessionUserDb(req))) {
    return NextResponse.json({ error: 'نشست منقضی شده — دوباره وارد شو' }, { status: 401 });
  }
  try {
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'فایلی ارسال نشده است' }, { status: 400 });
    }
    if (file.size > 15 * 1024 * 1024) {
      return NextResponse.json({ error: 'حجم فایل بیش از حد مجاز (۱۵ مگابایت)' }, { status: 400 });
    }
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/tiff', 'image/heic', 'image/heif'];
    if (!allowed.includes(file.type) && !/\.(jpe?g|png|webp|tiff?|heic|heif)$/i.test(file.name)) {
      return NextResponse.json({ error: 'فرمت تصویر پشتیبانی نمی‌شود' }, { status: 400 });
    }

    const buffer = await file.arrayBuffer();
    const result = await imageModule(file.name || 'image', buffer);

    return NextResponse.json({ result });
  } catch (e) {
    console.error('image analysis error:', e);
    return NextResponse.json({ error: 'خطا در تحلیل تصویر' }, { status: 500 });
  }
}
