import exifr from 'exifr';
import type { OsintModuleResult } from './types';

// ============================================================
// ماژول تحلیل متادیتای تصویر EXIF (واقعی)
// ورودی: فایل آپلودی کاربر - استخراج کامل GPS، دستگاه، زمان
// ============================================================

function latLonToDMS(lat: number, lon: number): string {
  const fmt = (v: number, pos: string, neg: string) => {
    const dir = v >= 0 ? pos : neg;
    const abs = Math.abs(v);
    const d = Math.floor(abs);
    const m = Math.floor((abs - d) * 60);
    const s = ((abs - d - m / 60) * 3600).toFixed(1);
    return `${d}° ${m}′ ${s}″ ${dir}`;
  };
  return `${fmt(lat, 'N', 'S')} ${fmt(lon, 'E', 'W')}`;
}

export async function imageModule(fileName: string, buffer: ArrayBuffer): Promise<OsintModuleResult> {
  const started = Date.now();
  const findings: OsintModuleResult['findings'] = [];
  let gps: { latitude: number; longitude: number } | null = null;

  let meta: Record<string, unknown> = {};
  try {
    meta =
      (await exifr.parse(buffer, {
        gps: true,
        tiff: true,
        exif: true,
        ifd0: true,
        xmp: true,
        translateValues: true,
      } as any)) ?? {};
  } catch {
    meta = {};
  }

  const sizeKb = Math.round(buffer.byteLength / 1024);
  findings.push({ label: 'نام فایل', value: fileName, severity: 'info' });
  findings.push({ label: 'حجم فایل', value: `${sizeKb} کیلوبایت`, severity: 'info' });

  const pick = (...keys: string[]): string => {
    for (const k of keys) {
      const v = meta[k];
      if (v !== undefined && v !== null && String(v).trim() !== '') return String(v);
    }
    return '';
  };

  const make = pick('Make', 'make');
  const model = pick('Model', 'model');
  const software = pick('Software', 'software');
  const dateTime = pick('DateTimeOriginal', 'DateTime', 'CreateDate', 'dateTimeOriginal');
  const lens = pick('LensModel', 'lensModel', 'LensMake');
  const orientation = pick('Orientation');
  const resolution = pick('XResolution', 'YResolution');
  const copyright = pick('Copyright', 'copyright');
  const artist = pick('Artist', 'artist', 'AuthorByLine');
  const lat = Number(meta.latitude ?? NaN);
  const lon = Number(meta.longitude ?? NaN);

  if (make || model) {
    findings.push({ label: 'دستگاه عکاسی', value: [make, model].filter(Boolean).join(' '), severity: 'high' });
  }
  if (lens) findings.push({ label: 'لنز', value: lens, severity: 'info' });
  if (software) {
    findings.push({
      label: 'نرم‌افزار پردازش',
      value: software,
      severity: 'medium',
    });
  }
  if (dateTime) {
    findings.push({ label: 'زمان ثبت تصویر', value: dateTime, severity: 'high' });
  }
  if (artist) findings.push({ label: 'عکاس/سازنده', value: artist, severity: 'high' });
  if (copyright) findings.push({ label: 'کپی‌رایت', value: copyright, severity: 'medium' });
  if (orientation) findings.push({ label: 'جهت‌گیری', value: orientation, severity: 'info' });
  if (resolution) findings.push({ label: 'رزولوشن ثبت‌شده', value: resolution, severity: 'info' });

  const hasGps = Number.isFinite(lat) && Number.isFinite(lon) && !(lat === 0 && lon === 0);
  if (hasGps) {
    gps = { latitude: lat, longitude: lon };
    findings.push({ label: 'مختصات GPS', value: `${lat.toFixed(6)}, ${lon.toFixed(6)}`, severity: 'high' });
    findings.push({ label: 'موقعیت دقیق (DMS)', value: latLonToDMS(lat, lon), severity: 'high' });
    findings.push({ label: 'Google Maps', value: 'مشاهده محل عکس روی نقشه', severity: 'high', link: `https://www.google.com/maps?q=${lat},${lon}` });
    findings.push({ label: 'Google Earth', value: 'تصویر ماهواره‌ای محل', severity: 'info', link: `https://earth.google.com/web/search/${lat},${lon}` });
    findings.push({ label: 'Street View', value: 'بررسی محیط فیزیکی محل عکس', severity: 'medium', link: `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lon}` });
  }

  // جستجوی معکوس تصویر با نام فایل (راهنما)
  findings.push({ label: 'جستجوی معکوس گوگل', value: 'لنز گوگل — آپلود دستی تصویر', severity: 'info', link: 'https://lens.google.com/' });
  findings.push({ label: 'جستجوی معکوس Yandex', value: 'قوی‌ترین موتور جستجوی چهره/تصویر', severity: 'info', link: 'https://yandex.com/images/' });
  findings.push({ label: 'TinEye', value: 'ردیابی اولین انتشار تصویر', severity: 'info', link: 'https://tineye.com/' });

  const hasMeta = make || model || dateTime || software;

  return {
    module: 'image',
    title: 'تحلیل متادیتای تصویر (EXIF)',
    icon: 'Camera',
    status: hasMeta || hasGps ? 'success' : 'partial',
    source: 'live',
    summary: hasGps
      ? `موقعیت GPS دقیق از داخل فایل استخراج شد: ${lat.toFixed(6)}، ${lon.toFixed(6)} — این تصویر مکان فیزیکی ثبت‌کننده را افشا می‌کند!`
      : hasMeta
        ? `متادیتای فنی از فایل استخراج شد — دستگاه، زمان و نرم‌افزار پردازش شناسایی شد. GPS حذف شده یا موجود نیست.`
        : `هیچ متادیتای معناداری در فایل یافت نشد — به احتمال زیاد تصویر از شبکه‌های اجتماعی دانلود شده (پلتفرم‌ها معمولاً EXIF را حذف می‌کنند).`,
    findings,
    metrics: [
      { label: 'فیلد EXIF', value: Object.keys(meta).length },
      { label: 'GPS', value: hasGps ? 1 : 0 },
      { label: 'دستگاه', value: make || model ? 1 : 0 },
      { label: 'زمان ثبت', value: dateTime ? 1 : 0 },
    ],
    raw: { meta: Object.fromEntries(Object.entries(meta).map(([k, v]) => [k, String(v)])), gps, fileName },
    durationMs: Date.now() - started,
  };
}
