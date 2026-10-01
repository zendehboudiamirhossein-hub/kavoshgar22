import type { OsintModuleResult } from './types';
import { safeFetch, fmtNum } from './net';

// ============================================================
// ماژول مکان‌یابی و اطلاعات جغرافیایی GEOINT (واقعی)
// منبع: Nominatim (OpenStreetMap) + Sunrise-Sunset بدون کلید
// ورودی: مختصات «lat,lon» یا نام مکان/شهر
// ============================================================

interface GeoPlace {
  display_name: string;
  lat: string;
  lon: string;
  type?: string;
  class?: string;
  importance?: number;
  address?: Record<string, string>;
  osm_type?: string;
  osm_id?: number;
  boundingbox?: string[];
}

const COORD_RE = /^(-?\d{1,3}(?:\.\d+)?)\s*[,،]\s*(-?\d{1,3}(?:\.\d+)?)$/;

export function parseCoords(input: string): { lat: number; lon: number } | null {
  const m = input.trim().match(COORD_RE);
  if (!m) return null;
  const lat = Number(m[1]);
  const lon = Number(m[2]);
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}

export async function geoModule(input: string): Promise<OsintModuleResult> {
  const started = Date.now();
  const findings: OsintModuleResult['findings'] = [];
  const coords = parseCoords(input);
  let place: GeoPlace | null = null;
  let error: string | undefined;

  try {
    if (coords) {
      // مختصات → آدرس معکوس
      const r = await safeFetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${coords.lat}&lon=${coords.lon}&accept-language=fa,en`,
        { timeoutMs: 8000 }
      );
      if (r.ok && r.body.trim().startsWith('{')) {
        const j = JSON.parse(r.body) as GeoPlace & { error?: string };
        if (!j.error) place = j;
      }
    } else {
      // نام مکان → جستجو
      const r = await safeFetch(
        `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(input)}&limit=1&accept-language=fa,en`,
        { timeoutMs: 8000 }
      );
      if (r.ok && r.body.trim().startsWith('[')) {
        const arr = JSON.parse(r.body) as GeoPlace[];
        if (arr.length) place = arr[0];
      }
    }
  } catch {
    error = 'اتصال به سرویس نقشه برقرار نشد';
  }

  if (!place) {
    return {
      module: 'geo',
      title: 'مکان‌یابی جغرافیایی (GEOINT)',
      icon: 'MapPin',
      status: 'failed',
      source: 'live',
      summary: `مکان «${input}» در پایگاه OpenStreetMap یافت نشد یا سرویس در دسترس نیست.`,
      findings: [{ label: 'نتیجه', value: error ?? 'مکان یافت نشد', severity: 'info' }],
      durationMs: Date.now() - started,
      error,
    };
  }

  const lat = Number(place.lat);
  const lon = Number(place.lon);
  const name = place.display_name;

  findings.push({ label: 'آدرس کامل', value: name, severity: 'medium' });
  findings.push({ label: 'مختصات', value: `${lat}, ${lon}`, severity: 'medium' });
  if (place.type) findings.push({ label: 'نوع مکان', value: `${place.class ?? ''} / ${place.type}`, severity: 'info' });
  const addr = place.address ?? {};
  const addrKeys = ['country', 'state', 'city', 'town', 'village', 'suburb', 'postcode'] as const;
  for (const k of addrKeys) {
    if (addr[k]) findings.push({ label: 'تقسیمات', value: addr[k], severity: 'info' });
  }
  findings.push({ label: 'نقشه گوگل', value: 'مشاهده روی نقشه تعاملی', severity: 'info', link: `https://www.google.com/maps?q=${lat},${lon}` });
  findings.push({ label: 'Google Earth', value: 'مشاهده تصویر ماهواره‌ای', severity: 'info', link: `https://earth.google.com/web/search/${lat},${lon}` });
  findings.push({ label: 'OpenStreetMap', value: 'مشاهده روی OSM', severity: 'info', link: `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=15/${lat}/${lon}` });
  findings.push({ label: 'Yandex Maps', value: 'تصاویر پانوراما و ماهواره', severity: 'info', link: `https://yandex.com/maps/?ll=${lon}%2C${lat}&z=15` });

  // طلوع و غروب (واقعی - بدون کلید)
  try {
    const sr = await safeFetch(
      `https://api.sunrise-sunset.org/json?lat=${lat}&lng=${lon}&formatted=0`,
      { timeoutMs: 6000 }
    );
    if (sr.ok && sr.body.includes('"status":"OK"')) {
      const j = JSON.parse(sr.body);
      const sunrise = new Date(j.results.sunrise);
      const sunset = new Date(j.results.sunset);
      findings.push({
        label: 'طلوع / غروب خورشید (امروز)',
        value: `${sunrise.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })} / ${sunset.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })} (UTC)`,
        severity: 'info',
      });
    }
  } catch {
    /* اختیاری */
  }

  return {
    module: 'geo',
    title: 'مکان‌یابی جغرافیایی (GEOINT)',
    icon: 'MapPin',
    status: 'success',
    source: 'live',
    summary: `مکان «${name.split(',').slice(0, 2).join('،')}» در مختصات ${fmtNum(Number(lat.toFixed(4)))}، ${fmtNum(Number(lon.toFixed(4)))} شناسایی شد. برای تحلیل عمیق‌تر، تصاویر ماهواره‌ای و پانوراما را در سرویس‌های نقشه بررسی کنید.`,
    findings,
    metrics: [
      { label: 'عرض جغرافیایی', value: Number(lat.toFixed(4)) },
      { label: 'طول جغرافیایی', value: Number(lon.toFixed(4)) },
      { label: 'اهمیت نسبتاً', value: Number(((place.importance ?? 0) * 100).toFixed(1)) },
    ],
    raw: { place, coords: { lat, lon } },
    durationMs: Date.now() - started,
  };
}
