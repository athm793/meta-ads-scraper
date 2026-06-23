'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Send, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import type { WebhookTestResult } from '@/lib/webhook';

interface WebhookTesterProps {
  url: string;
  secret?: string;
  source: 'bulk' | 'search';
  className?: string;
}

// "Send test" button + inline result. Fires a synchronous test webhook so the
// user can confirm the URL is reachable before committing a job/session.
export function WebhookTester({ url, secret, source, className }: WebhookTesterProps) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<WebhookTestResult | null>(null);

  const disabled = !url.trim() || loading;

  async function sendTest() {
    if (!url.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch('/api/webhook/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim(), secret: secret?.trim() || undefined, source }),
      });
      setResult(await res.json());
    } catch (e) {
      setResult({ ok: false, signed: !!secret?.trim(), error: e instanceof Error ? e.message : 'Request failed' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={cn('flex items-center gap-2 flex-wrap', className)}>
      <button
        type="button"
        onClick={sendTest}
        disabled={disabled}
        className={cn(
          'inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border text-xs font-medium transition-colors',
          disabled ? 'border-border/50 text-muted-foreground/50 cursor-not-allowed' : 'border-border hover:bg-muted text-foreground'
        )}
      >
        {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
        Send test
      </button>

      {result && (
        <span className={cn('inline-flex items-center gap-1 text-xs', result.ok ? 'text-emerald-400' : 'text-red-400')}>
          {result.ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
          {result.ok
            ? `Delivered (${result.status})${result.signed ? ' · signed' : ''}`
            : `Failed — ${result.error ?? 'unreachable'}`}
        </span>
      )}
    </div>
  );
}
