'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Download, Share2, PlusSquare, Smartphone } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = window.navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (ua.includes('Macintosh') && 'ontouchend' in document);
}

// نصب‌شده روی همین دستگاه‌ها در localStorage — دکمه دوباره نشان داده نشود
const DISMISS_KEY = 'kavoshgar_pwa_dismissed';

export function PwaManager() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHint, setShowIosHint] = useState(false);
  const [iosDialog, setIosDialog] = useState(false);
  const [hidden, setHidden] = useState(true);

  // ثبت سرویس‌ورکر — فقط در بیلد تولیدی تا کش، توسعه داغ را خراب نکند
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;
    const onLoad = () => {
      navigator.serviceWorker.register('/sw.js').catch(() => null);
    };
    if (document.readyState === 'complete') onLoad();
    else window.addEventListener('load', onLoad);
    return () => window.removeEventListener('load', onLoad);
  }, []);

  useEffect(() => {
    if (isStandalone()) return; // همین حالا به‌عنوان اپ اجرا می‌شود
    if (localStorage.getItem(DISMISS_KEY) === '1') return;

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
      setHidden(false);
    };
    const onInstalled = () => {
      setInstallEvent(null);
      setHidden(true);
      localStorage.setItem(DISMISS_KEY, '1');
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);

    // iOS Safari رویداد beforeinstallprompt ندارد — راهنمای دستی
    if (!installEvent && isIos()) {
      const t = setTimeout(() => {
        setShowIosHint(true);
        setHidden(false);
      }, 2500);
      return () => {
        clearTimeout(t);
        window.removeEventListener('beforeinstallprompt', onBeforeInstall);
        window.removeEventListener('appinstalled', onInstalled);
      };
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, [installEvent]);

  const doInstall = useCallback(async () => {
    if (!installEvent) return;
    try {
      await installEvent.prompt();
      const choice = await installEvent.userChoice;
      if (choice.outcome === 'accepted') {
        localStorage.setItem(DISMISS_KEY, '1');
        setHidden(true);
      }
    } catch {
      /* کاربر رد کرد */
    }
    setInstallEvent(null);
  }, [installEvent]);

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, '1');
    setHidden(true);
  };

  if (hidden) return null;

  // اندروید/دسکتاپ کروم — نصب مستقیم
  if (installEvent) {
    return (
      <div className="fixed bottom-4 end-4 z-50 flex items-center gap-1.5 rounded-2xl border border-emerald-500/30 bg-white/95 soft-shadow p-1.5 backdrop-blur">
        <Button
          onClick={doInstall}
          className="h-10 px-3.5 bg-gradient-to-l from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white rounded-xl text-xs font-bold gap-1.5"
        >
          <Download className="w-4 h-4" />
          نصب اپلیکیشن
        </Button>
        <button
          onClick={dismiss}
          className="rounded-xl px-2 h-10 text-muted-foreground hover:text-rose-600 hover:bg-rose-500/10 transition-colors"
          aria-label="بستن پیشنهاد نصب"
        >
          ✕
        </button>
      </div>
    );
  }

  // iOS — راهنمای افزودن به صفحه اصلی
  if (showIosHint) {
    return (
      <>
        <div className="fixed bottom-4 end-4 z-50 flex items-center gap-1.5 rounded-2xl border border-emerald-500/30 bg-white/95 soft-shadow p-1.5 backdrop-blur">
          <Button
            onClick={() => setIosDialog(true)}
            className="h-10 px-3.5 bg-gradient-to-l from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white rounded-xl text-xs font-bold gap-1.5"
          >
            <Smartphone className="w-4 h-4" />
            نصب روی آیفون
          </Button>
          <button
            onClick={dismiss}
            className="rounded-xl px-2 h-10 text-muted-foreground hover:text-rose-600 hover:bg-rose-500/10 transition-colors"
            aria-label="بستن پیشنهاد نصب"
          >
            ✕
          </button>
        </div>

        <Dialog open={iosDialog} onOpenChange={setIosDialog}>
          <DialogContent className="max-w-[calc(100vw-1.5rem)] sm:max-w-md bg-background">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base">
                <Smartphone className="w-5 h-5 text-emerald-600" />
                نصب کاوشگر روی iPhone / iPad
              </DialogTitle>
              <DialogDescription>سافاری نصب خودکار ندارد — سه قدم ساده:</DialogDescription>
            </DialogHeader>
            <ol className="space-y-3 text-sm">
              <li className="flex items-start gap-2.5">
                <span className="shrink-0 w-6 h-6 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-700 text-xs font-black flex items-center justify-center">۱</span>
                <span className="flex items-center gap-1.5 flex-wrap">
                  در سافاری دکمه
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-secondary border border-border text-xs font-bold">
                    <Share2 className="w-3.5 h-3.5 text-emerald-600" /> اشتراک‌گذاری
                  </span>
                  را بزن
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="shrink-0 w-6 h-6 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-700 text-xs font-black flex items-center justify-center">۲</span>
                <span className="flex items-center gap-1.5 flex-wrap">
                  گزینه
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-secondary border border-border text-xs font-bold">
                    <PlusSquare className="w-3.5 h-3.5 text-emerald-600" /> Add to Home Screen
                  </span>
                  را انتخاب کن
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="shrink-0 w-6 h-6 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-700 text-xs font-black flex items-center justify-center">۳</span>
                <span>
                  روی <b>Add</b> بزن — آیکون کاوشگر مثل یک اپ مستقل تمام‌صفحه روی گوشی اجرا می‌شود.
                </span>
              </li>
            </ol>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return null;
}
