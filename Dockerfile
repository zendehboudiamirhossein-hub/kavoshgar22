# ============================================================
# کاوشگر — دپلوی روی Railway (و هر داکری دیگر)
# ساخت دو مرحله‌ای: ۱) بیلد Next.js  ۲) ایمیج اجرای سبک
# ============================================================

# ---------- مرحله ۱: ساخت ----------
FROM node:22-bookworm-slim AS builder

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# Prisma به openssl نیاز دارد
RUN apt-get update -y \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# ابتدا وابستگی‌ها (برای استفاده از کش لایه‌های داکر)
COPY package.json ./
# اگر package-lock.json همراه پروژه باشد npm از آن استفاده می‌کند
RUN npm install --no-audit --no-fund

# سورس پروژه
COPY prisma ./prisma
COPY next.config.ts tsconfig.json postcss.config.mjs components.json ./
COPY public ./public
COPY src ./src

# کلاینت Prisma + متغیر ساخت (فقط برای زمان بیلد؛ دیتابیس واقعی در اجرا ست می‌شود)
ENV DATABASE_URL="file:/app/data/kavoshgar.db"
ENV NODE_ENV=production
RUN npx prisma generate
RUN npm run build

# ---------- مرحله ۲: اجرا ----------
FROM node:22-bookworm-slim AS runner

WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000

RUN apt-get update -y \
    && apt-get install -y --no-install-recommends openssl ca-certificates bash \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /app/data /app/seed

# خروجی standalone (شامل node_modules های ردیابی‌شده و فایل‌های static/public)
COPY --from=builder /app/.next/standalone ./

# موتور و کلاینت Prisma — در صورت جا ماندن از trace کپی مستقیم می‌شود
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
# CLI پرایسما برای ساخت دیتابیس در اولین اجرا
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY prisma ./prisma
# GramJS (پکیج telegram) به‌صورت external اجرا می‌شود — کپی مطمئن
COPY --from=builder /app/node_modules/telegram ./node_modules/telegram

# دیتابیس seed (تنظیمات تلگرام + کاربر ادمین) — فقط در اولین اجرا بازگردانی می‌شود
COPY data/seed/kavoshgar.db /app/seed/kavoshgar.db

# اسکریپت راه‌اندازی (انتخاب پوشه داده، بازگردانی seed، اجرای سرور)
COPY start-railway.sh /app/start-railway.sh
RUN chmod +x /app/start-railway.sh

EXPOSE 3000
CMD ["bash", "/app/start-railway.sh"]
