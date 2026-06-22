'use client';

import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Upload, Play, FileText, X } from 'lucide-react';
import Papa from 'papaparse';

interface BulkUploadProps {
  onStart: (jobId: string) => void;
}

export function BulkUpload({ onStart }: BulkUploadProps) {
  const [jobName, setJobName] = useState('');
  const [textInput, setTextInput] = useState('');
  const [companies, setCompanies] = useState<Array<{ company_name: string; website?: string }>>([]);
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function parseText(text: string) {
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    setCompanies(lines.map((l) => ({ company_name: l })));
  }

  function handleTextChange(val: string) {
    setTextInput(val);
    parseText(val);
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const rows = results.data;
        const parsed = rows
          .map((row) => ({
            company_name: row.company_name || row['Company Name'] || row.name || row.Name || Object.values(row)[0] || '',
            website: row.website || row.Website || row.domain || undefined,
          }))
          .filter((r) => r.company_name);
        setCompanies(parsed);
        setTextInput(parsed.map((p) => p.company_name).join('\n'));
      },
    });
  }

  async function handleStart() {
    if (companies.length === 0) return;
    setLoading(true);
    try {
      const res = await fetch('/api/bulk/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: jobName || `Bulk job ${new Date().toLocaleDateString()}`, companies }),
      });
      const job = await res.json();
      onStart(job.id);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-xl font-semibold">Bulk Company Intelligence</h2>
        <p className="text-sm text-muted-foreground">Upload a list of companies to check their Meta ad activity</p>
      </div>

      <div className="space-y-1.5">
        <Label>Job Name (optional)</Label>
        <Input placeholder="e.g. Prospect list June 2026" value={jobName} onChange={(e) => setJobName(e.target.value)} />
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <Label>Company List</Label>
          <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
            <Upload className="w-3.5 h-3.5 mr-1" /> Upload CSV
          </Button>
          <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFile} />
        </div>
        <Textarea
          placeholder="One company name per line&#10;Nike&#10;Apple&#10;Shopify&#10;HubSpot"
          rows={10}
          value={textInput}
          onChange={(e) => handleTextChange(e.target.value)}
          className="font-mono text-sm resize-none"
        />
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {companies.length > 0 ? (
              <Badge variant="secondary">{companies.length} companies parsed</Badge>
            ) : 'Paste company names or upload a CSV with a "company_name" column'}
          </span>
          {companies.length > 0 && (
            <button onClick={() => { setTextInput(''); setCompanies([]); }} className="hover:text-foreground">
              <X className="w-3 h-3 inline mr-0.5" /> Clear
            </button>
          )}
        </div>
      </div>

      {companies.length > 0 && (
        <div className="rounded-lg border p-3 bg-muted/50 text-xs space-y-1">
          <div className="flex items-center gap-1 text-muted-foreground mb-2">
            <FileText className="w-3.5 h-3.5" /> Preview
          </div>
          {companies.slice(0, 5).map((c, i) => (
            <div key={i} className="font-medium">{c.company_name}</div>
          ))}
          {companies.length > 5 && <div className="text-muted-foreground">+{companies.length - 5} more</div>}
        </div>
      )}

      <Button onClick={handleStart} disabled={companies.length === 0 || loading} className="w-full" size="lg">
        <Play className="w-4 h-4 mr-2" />
        {loading ? 'Starting...' : `Start Bulk Scrape (${companies.length} companies)`}
      </Button>

      <p className="text-xs text-center text-muted-foreground">
        Companies are scraped one at a time with random delays to avoid rate limiting.
        Each scrape takes ~10–30 seconds.
      </p>
    </div>
  );
}
