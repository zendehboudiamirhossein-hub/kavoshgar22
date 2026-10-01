import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { PwaManager } from "@/components/pwa/pwa-manager";

export const metadata: Metadata = {
  title: "کاوشگر | سامانه هوشمند اوسینت و تحلیل داده",
  description:
    "پلتفرم جمع‌آوری اطلاعات از منابع باز (OSINT) با تحلیل هوش مصنوعی — اینستاگرام، توییتر، تلگرام، گیت‌هاب، ایمیل، دامنه و شماره تلفن",
  keywords: ["OSINT", "اوسینت", "تحلیل داده", "هوش مصنوعی", "اطلاعات منابع باز"],
  applicationName: "کاوشگر",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "کاوشگر",
  },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#f2f7f4",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fa" dir="rtl" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@300;400;500;600;700;800;900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased bg-background text-foreground min-h-screen flex flex-col font-sans">
        {children}
        <Toaster />
        <PwaManager />
      </body>
    </html>
  );
}
