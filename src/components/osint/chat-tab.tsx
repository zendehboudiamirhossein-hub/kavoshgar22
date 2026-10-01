'use client';

import { useEffect, useRef, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { SendHorizonal, Bot, User, Loader2, Trash2, Sparkles } from 'lucide-react';

interface Msg {
  role: 'user' | 'assistant';
  content: string;
}

const SUGGESTIONS = [
  'چطور یک پیج اینستاگرام را اصولی تحلیل کنم؟',
  'بهترین ابزارهای رایگان اوسینت برای شروع کدام‌اند؟',
  'Google Dork چیست و چطور می‌نویسم؟',
  'چگونه تشخیص دهم یک پروفایل فیک است؟',
];

export function ChatTab({ caseId, caseTarget }: { caseId: string | null; caseTarget: string | null }) {
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: 'assistant',
      content:
        'سلام! من «کاوشگر» هستم؛ تحلیلگر هوشمند اوسینت. 🛰\n\nمی‌توانم در تحلیل داده‌های پرونده فعال کمک کنم، سرنخ‌ها را تفسیر کنم، درباره روش‌ها و ابزارهای جمع‌آوری اطلاعات توضیح بدهم یا استراتژی تحقیق پیشنهاد بدهم.\n\nچه چیزی در ذهن داری؟',
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  const send = async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || loading) return;
    setInput('');
    const next: Msg[] = [...messages, { role: 'user', content }];
    setMessages(next);
    setLoading(true);
    try {
      const res = await fetch('/api/osint/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          messages: next.slice(1).map((m) => ({ role: m.role, content: m.content })),
          caseId,
        }),
      });
      const j = await res.json();
      setMessages((prev) => [...prev, { role: 'assistant', content: j.reply ?? 'خطا در دریافت پاسخ.' }]);
    } catch {
      setMessages((prev) => [...prev, { role: 'assistant', content: 'ارتباط با سرور برقرار نشد. دوباره تلاش کن.' }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-border/80 bg-white/90 backdrop-blur soft-shadow flex flex-col h-[calc(100vh-240px)] min-h-[420px] supports-[height:100dvh]:h-[calc(100dvh-240px)]">
      <CardContent className="p-0 flex-1 flex flex-col min-h-0">
        {/* هدر چت */}
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border/70">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 border border-emerald-500/30 flex items-center justify-center shadow-[0_4px_12px_-4px_rgba(16,185,129,0.5)]">
            <Bot className="w-4.5 h-4.5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-sm">تحلیلگر هوشمند کاوشگر</div>
            <div className="text-[10px] text-muted-foreground truncate">
              {caseTarget ? `متصل به پرونده: «${caseTarget}»` : 'حالت عمومی — بدون پرونده فعال'}
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-rose-600 hover:bg-rose-500/10 h-8"
            onClick={() =>
              setMessages([
                {
                  role: 'assistant',
                  content: 'گفتگوی تازه شروع شد. چه تحقیقی در ذهن داری؟',
                },
              ])
            }
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>

        {/* پیام‌ها */}
        <ScrollArea className="flex-1 px-4" ref={undefined}>
          <div ref={scrollRef} className="py-4 space-y-4 overflow-y-auto max-h-full">
            {messages.map((m, i) => (
              <div key={i} className={`flex gap-2.5 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
                <div
                  className={`w-8 h-8 rounded-lg shrink-0 flex items-center justify-center border ${
                    m.role === 'user'
                      ? 'bg-secondary border-border'
                      : 'bg-emerald-500/15 border-emerald-500/30'
                  }`}
                >
                  {m.role === 'user' ? <User className="w-4 h-4 text-zinc-600" /> : <Bot className="w-4 h-4 text-emerald-600" />}
                </div>
                <div
                  className={`max-w-[85%] sm:max-w-[82%] rounded-xl px-3.5 py-2.5 text-sm leading-7 whitespace-pre-wrap border ${
                    m.role === 'user'
                      ? 'bg-emerald-500/10 border-emerald-500/25 rounded-tr-sm'
                      : 'bg-white border-border/80 rounded-tl-sm shadow-[0_1px_2px_rgba(13,31,23,0.04)]'
                  }`}
                  dir="auto"
                >
                  {m.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
                  <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
                </div>
                <div className="bg-white border border-border/80 rounded-xl rounded-tl-sm px-3.5 py-3 shadow-[0_1px_2px_rgba(13,31,23,0.04)]">
                  <div className="flex gap-1">
                    {[0, 1, 2].map((i) => (
                      <span
                        key={i}
                        className="w-1.5 h-1.5 rounded-full bg-emerald-500/80 animate-bounce"
                        style={{ animationDelay: `${i * 0.15}s` }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* پیشنهادها */}
        {messages.length <= 1 && (
          <div className="px-4 pb-2 flex flex-wrap gap-1.5">
            {SUGGESTIONS.map((s) => (
              <Badge
                key={s}
                variant="outline"
                className="cursor-pointer bg-white/80 hover:border-emerald-500/55 hover:text-emerald-700 transition-colors py-1.5 font-normal"
                onClick={() => send(s)}
              >
                <Sparkles className="w-3 h-3 ml-1 text-emerald-600" />
                {s}
              </Badge>
            ))}
          </div>
        )}

        {/* ورودی */}
        <div className="p-3 border-t border-border/70">
          <div className="flex gap-2 items-end">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder="پیام خود را بنویسید… (Enter برای ارسال)"
              className="min-h-11 max-h-32 resize-none text-base sm:text-sm bg-white"
              rows={1}
            />
            <Button
              onClick={() => send()}
              disabled={loading || !input.trim()}
              size="icon"
              className="h-11 w-11 shrink-0 bg-gradient-to-br from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white"
              aria-label="ارسال"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <SendHorizonal className="w-4.5 h-4.5" />}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
