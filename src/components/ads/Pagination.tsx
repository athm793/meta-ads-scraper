'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  page: number;
  totalPages: number;
  total: number;
  perPage: number;
  onPage: (p: number) => void;
}

export function Pagination({ page, totalPages, total, perPage, onPage }: PaginationProps) {
  if (totalPages <= 1) return null;
  const start = (page - 1) * perPage + 1;
  const end = Math.min(page * perPage, total);

  return (
    <div className="flex flex-col items-center gap-2 py-2">
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => onPage(page - 1)}
          disabled={page === 1}
          className="flex items-center justify-center h-8 w-8 rounded-md border border-border text-foreground hover:bg-accent transition-colors disabled:opacity-40 disabled:pointer-events-none"
          aria-label="Previous page"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="px-3 text-sm tabular-nums text-foreground">
          Page <span className="font-semibold">{page}</span> / {totalPages}
        </span>
        <button
          onClick={() => onPage(page + 1)}
          disabled={page === totalPages}
          className="flex items-center justify-center h-8 w-8 rounded-md border border-border text-foreground hover:bg-accent transition-colors disabled:opacity-40 disabled:pointer-events-none"
          aria-label="Next page"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
      <span className="text-xs text-muted-foreground tabular-nums">
        Showing {start.toLocaleString()}–{end.toLocaleString()} of {total.toLocaleString()}
      </span>
    </div>
  );
}
