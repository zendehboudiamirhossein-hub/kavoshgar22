import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // ریشه Turbopack همیشه همین پوشه باشد — تا اگر پروژه داخل پوشه‌ای با lockfile والد
  // extract شد (مثلاً داخل ریپوی دیگر)، خروجی standalone در مسیر درست ساخته شود
  turbopack: {
    root: __dirname,
  },
  // GramJS (پکیج telegram) سنگین و CJS است — خارج از باندل سرور اجرا شود
  serverExternalPackages: ["telegram"],
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
