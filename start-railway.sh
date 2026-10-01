#!/usr/bin/env bash
# ============================================================
# کاوشگر — اسکریپت راه‌اندازی برای Railway
# ۱) پوشه داده را انتخاب می‌کند (ولیوم Railway اگر متصل باشد)
# ۲) در اولین اجرا دیتابیس seed را بازگردانی می‌کند
# ۳) سرور Next.js standalone را اجرا می‌کند
# ============================================================
set -e
cd /app

# ---------- پورت و هاست ----------
export PORT="${PORT:-3000}"
# Next standalone به HOSTNAME برای bind گوش می‌دهد؛ داکر مقدار HOSTNAME را
# به شناسه کانتینر ست می‌کند که باعث خطای bind می‌شود — همیشه 0.0.0.0
export HOSTNAME="0.0.0.0"

# ---------- انتخاب پوشه داده (ماندگاری) ----------
# اولویت: DATA_DIR صریح ← ولیوم Railway ← /app/data
DATA_DIR="${DATA_DIR:-}"
if [ -z "$DATA_DIR" ] && [ -n "$RAILWAY_VOLUME_MOUNT_PATH" ] && [ -d "$RAILWAY_VOLUME_MOUNT_PATH" ] && [ -w "$RAILWAY_VOLUME_MOUNT_PATH" ]; then
  DATA_DIR="$RAILWAY_VOLUME_MOUNT_PATH"
fi
if [ -z "$DATA_DIR" ]; then
  if [ -d "/data" ] && [ -w "/data" ]; then
    DATA_DIR="/data"
  else
    DATA_DIR="/app/data"
  fi
fi
mkdir -p "$DATA_DIR"
export DATA_DIR="$DATA_DIR"  # برای ماژول دیتابیس جستجو (فایل‌های TXT)
export DATABASE_URL="file:${DATA_DIR}/kavoshgar.db"
DB_PATH="$DATA_DIR/kavoshgar.db"

echo "[kavoshgar] DATA_DIR=$DATA_DIR"
echo "[kavoshgar] DATABASE_URL=$DATABASE_URL"

# ---------- اولین اجرا: بازگردانی دیتابیس seed ----------
if [ ! -s "$DB_PATH" ]; then
  if [ -s /app/seed/kavoshgar.db ]; then
    cp /app/seed/kavoshgar.db "$DB_PATH"
    echo "[kavoshgar] seed database restored to $DB_PATH"
  else
    echo "[kavoshgar] no seed found — creating schema with prisma db push"
    node node_modules/prisma/build/index.js db push --skip-generate || true
  fi
else
  echo "[kavoshgar] existing database found — kept as-is ($(du -h "$DB_PATH" | cut -f1))"
fi

# ---------- اجرای سرور ----------
echo "[kavoshgar] starting server on port $PORT ..."
exec node server.js
