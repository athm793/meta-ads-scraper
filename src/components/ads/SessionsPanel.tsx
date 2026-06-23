'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { WebhookTester } from './WebhookTester';
import type { SearchSession, SessionFireOn } from '@/types/ads';
import { Plus, Trash2, Play, Pause, Pencil, Check, X, Webhook, BarChart3 } from 'lucide-react';

interface SessionsPanelProps {
  open: boolean;
  onClose: () => void;
  sessions: SearchSession[];
  activeSessionId: string | null;
  onSelectActive: (id: string | null) => void;
  onChanged: () => void; // refetch sessions list after a mutation
  onAnalyze: (id: string, name: string) => void; // open Hook Lab on this session's ads
}

const FIRE_OPTS: { value: SessionFireOn; label: string }[] = [
  { value: 'save', label: 'On save' },
  { value: 'scrape', label: 'On scrape' },
  { value: 'both', label: 'Both' },
];

function FireOnPicker({ value, onChange }: { value: SessionFireOn; onChange: (v: SessionFireOn) => void }) {
  return (
    <div className="flex gap-1.5">
      {FIRE_OPTS.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn('px-2.5 py-1 rounded-md text-xs border transition-colors',
            value === o.value ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

async function api(method: string, body: object) {
  await fetch('/api/sessions', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

function SessionRow({ session, live, onSelectActive, onChanged, onAnalyze }: {
  session: SearchSession;
  live: boolean;
  onSelectActive: (id: string | null) => void;
  onChanged: () => void;
  onAnalyze: (id: string, name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(session.name);
  const [url, setUrl] = useState(session.webhook_url ?? '');
  const [secret, setSecret] = useState(session.webhook_secret ?? '');

  const hasUrl = !!session.webhook_url;
  const fireLabel = FIRE_OPTS.find((f) => f.value === session.fire_on)?.label.toLowerCase();
  const host = (() => { try { return session.webhook_url ? new URL(session.webhook_url).host : ''; } catch { return session.webhook_url ?? ''; } })();

  async function patch(patchBody: object) {
    await api('PATCH', { id: session.id, ...patchBody });
    onChanged();
  }
  async function saveEdits() {
    await patch({ name: name.trim() || session.name, webhook_url: url.trim(), webhook_secret: secret.trim() });
    setEditing(false);
  }
  async function remove() {
    if (!window.confirm(`Delete session "${session.name}"? Scraped ads are kept, just detached.`)) return;
    await api('DELETE', { id: session.id });
    if (live) onSelectActive(null);
    onChanged();
  }

  return (
    <div className={cn('rounded-lg border transition-colors', live ? 'border-emerald-500/50 bg-emerald-500/[0.05]' : 'border-border/60')}>
      <div className="flex items-center gap-2 px-3 py-2">
        {/* Play / Pause — Play makes this the one live session; Pause stops it */}
        <button
          onClick={() => onSelectActive(live ? null : session.id)}
          title={live ? 'Pause — stop this live session' : 'Play — make this the live session'}
          className={cn(
            'shrink-0 flex items-center justify-center w-7 h-7 rounded-md border transition-colors',
            live ? 'border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/10'
                 : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted'
          )}
        >
          {live ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-medium truncate">{session.name}</span>
            {live && (
              <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 shrink-0">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-70" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400" />
                </span>
                Live
              </span>
            )}
            {session.ad_count != null && session.ad_count > 0 && <span className="text-xs text-muted-foreground shrink-0">{session.ad_count} ads</span>}
          </div>
          <p className="text-[11px] text-muted-foreground truncate">
            {hasUrl
              ? <span>fires {fireLabel} · {host}</span>
              : <span>no webhook URL — grouping only</span>}
          </p>
        </div>
        {session.ad_count != null && session.ad_count > 0 && (
          <button onClick={() => onAnalyze(session.id, session.name)} className="text-muted-foreground hover:text-primary p-1 transition-colors" title="Analyze hooks in this session">
            <BarChart3 className="w-3.5 h-3.5" />
          </button>
        )}
        <button onClick={() => setEditing((v) => !v)} className="text-muted-foreground hover:text-foreground p-1 transition-colors" title="Edit">
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button onClick={remove} className="text-muted-foreground hover:text-red-400 p-1 transition-colors" title="Delete session">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Fire-on config (when the webhook fires while this session is live) */}
      <div className="flex items-center justify-between gap-2 px-3 pb-2.5">
        <span className="text-[11px] text-muted-foreground">Fire on</span>
        <FireOnPicker value={session.fire_on} onChange={(v) => patch({ fire_on: v })} />
      </div>

      {editing && (
        <div className="border-t border-border/40 px-3 py-2.5 space-y-2">
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8 text-xs" />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">Webhook URL</Label>
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/hooks/meta-ads" className="h-8 text-xs" />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">Signing secret (optional)</Label>
            <Input value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="X-Webhook-Signature" className="h-8 text-xs" />
          </div>
          <WebhookTester url={url} secret={secret} source="search" />
          <div className="flex items-center gap-2 pt-0.5">
            <Button size="sm" className="h-7 text-xs" onClick={saveEdits}><Check className="w-3.5 h-3.5 mr-1" />Save</Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditing(false)}><X className="w-3.5 h-3.5 mr-1" />Cancel</Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function SessionsPanel({ open, onClose, sessions, activeSessionId, onSelectActive, onChanged, onAnalyze }: SessionsPanelProps) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [secret, setSecret] = useState('');
  const [fireOn, setFireOn] = useState<SessionFireOn>('save');
  const [creating, setCreating] = useState(false);

  async function handleCreate() {
    if (!name.trim()) return;
    setCreating(true);
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          webhook_url: url.trim() || undefined,
          webhook_secret: secret.trim() || undefined,
          fire_on: fireOn,
        }),
      });
      const created: SearchSession = await res.json();
      setName(''); setUrl(''); setSecret(''); setFireOn('save');
      onChanged();
      if (created?.id) onSelectActive(created.id); // newly created session starts playing
    } finally {
      setCreating(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-[460px] data-[side=right]:sm:max-w-md flex flex-col">
        <SheetHeader className="px-5 pt-5 pb-2">
          <SheetTitle className="flex items-center gap-2"><Webhook className="w-4 h-4" /> Search Sessions</SheetTitle>
        </SheetHeader>

        <ScrollArea className="flex-1 min-h-0">
          <div className="px-5 pb-6 space-y-6">
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              A session is a named run with its own webhook. Press <span className="text-foreground">Play</span> to make
              it live — ads scraped or saved while it&apos;s playing are pushed to its URL in real time. Press{' '}
              <span className="text-foreground">Pause</span> to stop. One session plays at a time; delivery is
              non-blocking, so a failing webhook never slows a search.
            </p>

            {/* Create */}
            <section className="space-y-2.5 rounded-lg border border-border/60 p-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">New session</h3>
              <Input placeholder="Session name (e.g. Competitor sweep)" value={name} onChange={(e) => setName(e.target.value)} className="h-8 text-sm" />
              <Input placeholder="Webhook URL (optional)" value={url} onChange={(e) => setUrl(e.target.value)} className="h-8 text-xs" />
              <Input placeholder="Signing secret (optional)" value={secret} onChange={(e) => setSecret(e.target.value)} className="h-8 text-xs" />
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-muted-foreground">Fire on</span>
                <FireOnPicker value={fireOn} onChange={setFireOn} />
              </div>
              <WebhookTester url={url} secret={secret} source="search" />
              <Button onClick={handleCreate} className="w-full" size="sm" disabled={!name.trim() || creating}>
                <Plus className="w-4 h-4 mr-1" /> Create &amp; play
              </Button>
            </section>

            {/* List */}
            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sessions</h3>
              {sessions.map((s) => (
                <SessionRow
                  key={s.id}
                  session={s}
                  live={s.id === activeSessionId}
                  onSelectActive={onSelectActive}
                  onChanged={onChanged}
                  onAnalyze={onAnalyze}
                />
              ))}
              {sessions.length === 0 && <p className="text-sm text-muted-foreground text-center py-3">No sessions yet</p>}
            </section>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
