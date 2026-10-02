import ZAI from 'z-ai-web-dev-sdk';

// ============================================================
// موتور تحلیل هوش مصنوعی (سمت سرور فقط)
//
// دو حالت پشتیبانی می‌شود:
//  ۱) حالت سندباکس: از z-ai-web-dev-sdk استفاده می‌شود (بدون تنظیمات)
//  ۲) حالت دپلوی شخصی (مثل Railway): هر سرویس سازگار با OpenAI
//     متغیرهای محیطی:
//       AI_API_KEY   کلید API (یا ZAI_API_KEY / OPENAI_API_KEY)
//       AI_BASE_URL  پیش‌فرض: https://api.z.ai/api/paas/v4
//                    (برای OpenAI: https://api.openai.com/v1)
//       AI_MODEL     پیش‌فرض: glm-4.6
// ============================================================

const ENV_KEY =
  process.env.AI_API_KEY || process.env.ZAI_API_KEY || process.env.OPENAI_API_KEY || '';

function defaultBaseUrl(): string {
  // اگر کلید OpenAI تنظیم شده و آدرس پایه نداده‌اند، همان OpenAI فرض می‌شود
  if (!process.env.AI_API_KEY && !process.env.ZAI_API_KEY && process.env.OPENAI_API_KEY) {
    return 'https://api.openai.com/v1';
  }
  return 'https://api.z.ai/api/paas/v4';
}

const ENV_BASE = (process.env.AI_BASE_URL || defaultBaseUrl()).replace(/\/+$/, '');
const ENV_MODEL = process.env.AI_MODEL || 'glm-4.6';

type ChatMsg = { role: 'system' | 'user' | 'assistant'; content: string };

/** آیا موتور سندباکس (ابزارهای داخلی z-ai) در دسترس است؟ */
export function sandboxAiAvailable(): boolean {
  return !ENV_KEY; // اگر کلید شخصی تنظیم شده باشد یعنی محیط خودمیزبان است
}

/** یک درخواست تکمیل چت — اولویت با سرویس شخصی (env) و در غیر این صورت سندباکس */
async function chatComplete(messages: ChatMsg[]): Promise<string> {
  if (ENV_KEY) {
    // حالت دپلوی شخصی — API سازگار با OpenAI
    const isZai = /z\.ai|bigmodel/i.test(ENV_BASE);
    const res = await fetch(`${ENV_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ENV_KEY}`,
      },
      body: JSON.stringify({
        model: ENV_MODEL,
        messages,
        stream: false,
        // پارامتر thinking فقط برای مدل‌های GLM معتبر است
        ...(isZai ? { thinking: { type: 'disabled' } } : {}),
      }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new Error(`AI_PROVIDER_HTTP_${res.status}: ${t.slice(0, 300)}`);
    }
    const j: any = await res.json().catch(() => null);
    const content = j?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content) throw new Error('AI_PROVIDER_EMPTY_RESPONSE');
    return content;
  }

  // حالت سندباکس — SDK داخلی
  const zai = await ZAI.create();
  const completion = await zai.chat.completions.create({
    messages: messages.map((m) => ({
      role: m.role === 'system' ? ('assistant' as const) : m.role,
      content: m.content,
    })),
    thinking: { type: 'disabled' },
  });
  return completion.choices[0]?.message?.content ?? '';
}

/** تبدیل خطای موتور AI به پیام فارسی قابل‌فهم */
function wrapProviderError(e: unknown): Error {
  const raw = e instanceof Error ? e.message : String(e);
  if (/AI_PROVIDER_HTTP_401|AI_PROVIDER_HTTP_403/.test(raw)) {
    return new Error('کلید هوش مصنوعی نامعتبر یا بدون دسترسی است (AI_API_KEY را بررسی کنید)');
  }
  if (/AI_PROVIDER_HTTP_429/.test(raw)) {
    return new Error('محدودیت نرخ سرویس هوش مصنوعی — چند لحظه بعد دوباره تلاش کنید');
  }
  if (/AI_PROVIDER/.test(raw)) {
    return new Error(`ارتباط با سرویس هوش مصنوعی برقرار نشد: ${raw.slice(0, 220)}`);
  }
  if (!ENV_KEY) {
    return new Error(
      'موتور هوش مصنوعی در دسترس نیست. برای دپلوی شخصی (مثل Railway) متغیرهای AI_API_KEY و AI_BASE_URL و AI_MODEL را در تنظیمات محیطی تعریف کنید.'
    );
  }
  return new Error(`خطای تحلیلگر هوش مصنوعی: ${raw.slice(0, 220)}`);
}

export interface AiReport {
  riskScore: number;
  riskLevel: string;
  executiveSummary: string;
  keyFindings: string[];
  profileAssessment: string;
  recommendations: string[];
  connectionMap: string[];
  confidence: string;
}

/** فشرده‌سازی نتایج ماژول‌ها برای ارسال به مدل */
export function compactResultsForAi(results: unknown[]): string {
  try {
    const slim = (results as any[]).map((r) => ({
      module: r?.module,
      title: r?.title,
      status: r?.status,
      source: r?.source,
      summary: r?.summary,
      findings: (r?.findings ?? []).slice(0, 14).map((f: any) => `${f.label}: ${f.value}`),
      metrics: r?.metrics,
    }));
    return JSON.stringify(slim, null, 1);
  } catch {
    return '[]';
  }
}

const SYSTEM_PROMPT = `تو «کاوشگر» هستی؛ یک تحلیلگر ارشد اوسینت (Open Source Intelligence) و تحلیلگر تهدید ایرانی با ۱۵ سال تجربه در پروفایلینگ هویت دیجیتال، امنیت زیرساخت و تحلیل شبکه‌های اجتماعی.

وظیفه تو: تحلیل داده‌های جمع‌آوری‌شده از ماژول‌های اوسینت و تولید یک گزارش اطلاعاتی حرفه‌ای به زبان فارسی.

اصول:
1. فقط بر اساس داده‌های ارائه‌شده استنتاج کن و حدس‌ها را با عبارت «احتمالاً» مشخص کن.
2. داده‌های برچسب‌خورده «شبیه‌سازی» را در گزارش به‌عنوان داده غیرقطعی (نیازمند راستی‌آزمایی) ذکر کن.
3. همیشه به سرنخ‌های اتصال بین ماژول‌ها توجه کن: هم‌نامی یوزرنیم در پلتفرم‌ها، ایمیل عمومی در گیت‌هاب، سال تولد در ایمیل، موقعیت مکانی خوداظهاری و غیره.
4. از اصطلاحات حرفه‌ای اوسینت استفاده کن اما توضیح کوتاه بده.
5. خروجی را فقط به صورت JSON معتبر و بدون هیچ متن اضافه برگردان.

قالب JSON خروجی:
{
  "riskScore": <عدد 0 تا 100>,
  "riskLevel": "<پایین|متوسط|بالا|بحرانی>",
  "executiveSummary": "<خلاصه اجرایی ۳ تا ۵ جمله‌ای>",
  "keyFindings": ["<یافته کلیدی ۱>", "..."],
  "profileAssessment": "<ارزیابی پروفایل هدف: هویت، فعالیت، رفتار>",
  "recommendations": ["<توصیه عملی بعدی ۱>", "..."],
  "connectionMap": ["<سرنخ اتصال یافته بین منابع، مثلا: یوزرنیم یکسان در X و Y>"],
  "confidence": "<کم|متوسط|بالا>"
}`;

export async function generateAiReport(target: string, targetType: string, results: unknown[]): Promise<AiReport> {
  const userPrompt = `هدف بررسی: «${target}»
نوع هدف: ${targetType}

داده‌های جمع‌آوری‌شده از ماژول‌های اوسینت:
${compactResultsForAi(results)}

بر اساس این داده‌ها، گزارش اطلاعاتی کامل فارسی تولید کن. فقط JSON معتبر برگردان.`;

  let content: string;
  try {
    content = await chatComplete([
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ]);
  } catch (e) {
    throw wrapProviderError(e);
  }
  return parseAiReport(content);
}

export function parseAiReport(content: string): AiReport {
  // تلاش برای استخراج JSON از پاسخ
  let jsonStr = content.trim();
  const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) jsonStr = fenceMatch[1].trim();
  const braceStart = jsonStr.indexOf('{');
  const braceEnd = jsonStr.lastIndexOf('}');
  if (braceStart >= 0 && braceEnd > braceStart) {
    jsonStr = jsonStr.slice(braceStart, braceEnd + 1);
  }
  try {
    const j = JSON.parse(jsonStr);
    return {
      riskScore: Number(j.riskScore) || 0,
      riskLevel: String(j.riskLevel ?? 'نامشخص'),
      executiveSummary: String(j.executiveSummary ?? ''),
      keyFindings: Array.isArray(j.keyFindings) ? j.keyFindings.map(String) : [],
      profileAssessment: String(j.profileAssessment ?? ''),
      recommendations: Array.isArray(j.recommendations) ? j.recommendations.map(String) : [],
      connectionMap: Array.isArray(j.connectionMap) ? j.connectionMap.map(String) : [],
      confidence: String(j.confidence ?? 'متوسط'),
    };
  } catch {
    return {
      riskScore: 50,
      riskLevel: 'نامشخص',
      executiveSummary: content.slice(0, 800) || 'تحلیل هوش مصنوعی در دسترس نبود.',
      keyFindings: [],
      profileAssessment: '',
      recommendations: [],
      connectionMap: [],
      confidence: 'کم',
    };
  }
}

/** چت با تحلیلگر - با زمینه پرونده اختیاری */
export async function aiChat(
  messages: { role: 'user' | 'assistant'; content: string }[],
  caseContext?: string
): Promise<string> {
  const system = `تو «کاوشگر» هستی؛ تحلیلگر ارشد اوسینت و دستیار هوشمند تحلیل اطلاعاتی. به سوالات کاربر به زبان فارسی، دقیق و حرفه‌ای پاسخ بده.

${
  caseContext
    ? `زمینه فعلی: کاربر یک پرونده اوسینت باز کرده و این داده‌ها جمع‌آوری شده است:\n${caseContext}\n\nپاسخ‌هایت را بر اساس همین داده‌ها بده و در صورت نیاز ماژول‌های دیگر پیشنهاد بده.`
    : 'کاربر پرونده فعالی ندارد؛ در زمینه روش‌ها و ابزارهای اوسینت راهنمایی کن.'
}

دستگاه تو برای کمک به تحقیقات مشروع، امنیت سایبری تدافعی و پژوهش است. از ارائه راهنمایی برای فعالیت‌های مخرب، مزاحمت یا نقض حریم خصوصی افراد خودداری کن و در صورت نیاز یادآوری کن که اطلاعات را مسئولانه استفاده کنند.`;

  const completion = await (async () => {
    try {
      return await chatComplete([
        { role: 'system', content: system },
        ...messages.slice(-12).map((m) => ({ role: m.role, content: m.content }) as ChatMsg),
      ]);
    } catch (e) {
      throw wrapProviderError(e);
    }
  })();

  return completion || 'پاسخی دریافت نشد.';
}
