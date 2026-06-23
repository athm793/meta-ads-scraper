'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, ChevronsUpDown } from 'lucide-react';
import { COUNTRIES } from '@/lib/countries';
import { cn } from '@/lib/utils';

interface CountryComboboxProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}

export function CountryCombobox({ value, onChange, placeholder = 'All Countries', className }: CountryComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const selected = COUNTRIES.find((c) => c.code === value);

  const filtered = query
    ? COUNTRIES.filter((c) => c.name.toLowerCase().includes(query.toLowerCase()))
    : COUNTRIES;

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => { setOpen((o) => !o); setQuery(''); }}
        className="flex items-center justify-between w-full h-8 px-2.5 text-xs rounded-lg border border-input bg-transparent hover:bg-accent/50 transition-colors"
      >
        <span className="truncate">{selected?.name || placeholder}</span>
        <ChevronsUpDown className="w-3 h-3 text-muted-foreground flex-shrink-0 ml-1" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
            className="absolute z-50 top-full mt-1 left-0 right-0 rounded-lg border border-border bg-popover shadow-lg overflow-hidden"
          >
            <div className="p-1.5 border-b border-border/50">
              <input
                ref={inputRef}
                type="text"
                placeholder="Search country..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full text-xs bg-transparent outline-none placeholder:text-muted-foreground/60 px-1 py-0.5"
              />
            </div>
            <div className="max-h-48 overflow-y-auto">
              {filtered.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-3">No country found.</p>
              ) : (
                filtered.map((c) => (
                  <button
                    key={c.code}
                    type="button"
                    onClick={() => { onChange(c.code); setOpen(false); setQuery(''); }}
                    className={cn(
                      'flex items-center gap-2 w-full px-2.5 py-1.5 text-xs hover:bg-accent transition-colors text-left',
                      value === c.code && 'text-primary font-medium'
                    )}
                  >
                    <Check className={cn('w-3 h-3 flex-shrink-0', value === c.code ? 'opacity-100' : 'opacity-0')} />
                    {c.name}
                  </button>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
