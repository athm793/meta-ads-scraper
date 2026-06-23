'use client';

import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { AdCard } from './AdCard';
import type { BulkCompany, Ad } from '@/types/ads';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Skeleton } from '@/components/ui/skeleton';
import { ExternalLink } from 'lucide-react';
import { companyResultsUrl } from '@/lib/adLibraryUrl';

interface CompanyDrawerProps {
  company: BulkCompany | null;
  open: boolean;
  onClose: () => void;
  onAdClick: (ad: Ad) => void;
}

function AdSkeleton() {
  return (
    <div className="rounded-xl border border-border/50 bg-card overflow-hidden">
      <Skeleton className="w-full aspect-video" />
      <div className="p-3 space-y-2">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-3/4" />
      </div>
    </div>
  );
}

export function CompanyDrawer({ company, open, onClose, onAdClick }: CompanyDrawerProps) {
  const { data: ads = [], isLoading } = useQuery<Ad[]>({
    queryKey: ['bulk-company-ads', company?.id],
    queryFn: () => fetch(`/api/ads?job_id=${company!.id}&limit=50`).then((r) => r.json()).then((d) => d.ads || []),
    enabled: !!company && open,
  });
  const loading = isLoading && !!company && open;

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-[560px] max-w-full p-0 flex flex-col">
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-border/50 shrink-0">
          <SheetTitle className="text-base">{company?.company_name}</SheetTitle>
          {company && (
            <a
              href={companyResultsUrl({ matched_page_id: company.matched_page_id, company_name: company.company_name })}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-primary/80 hover:text-primary transition-colors mt-0.5 w-fit"
            >
              <ExternalLink className="w-3 h-3 shrink-0" />
              {company.matched_page_id
                ? `Open ${company.matched_name || 'matched page'} on Meta`
                : 'Open keyword search on Meta'}
            </a>
          )}
          {company && (
            <div className="flex gap-2 flex-wrap mt-1">
              <Badge variant="secondary" className="text-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block mr-1.5" />
                {company.active_ads_count} active
              </Badge>
              <Badge variant="outline" className="text-xs">{company.inactive_ads_count} inactive</Badge>
              {company.spend_range && (
                <Badge variant="outline" className="text-xs">{company.spend_range}</Badge>
              )}
              {company.ad_types.slice(0, 2).map((t) => (
                <Badge key={t} variant="outline" className="text-xs">{t}</Badge>
              ))}
            </div>
          )}
        </SheetHeader>

        <ScrollArea className="flex-1 min-h-0">
          <div className="p-4">
            {loading ? (
              <div className="grid grid-cols-1 gap-4">
                {Array.from({ length: 4 }).map((_, i) => <AdSkeleton key={i} />)}
              </div>
            ) : ads.length === 0 ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="py-16 text-center text-sm text-muted-foreground"
              >
                No ads found for this company
              </motion.div>
            ) : (
              <AnimatePresence>
                <motion.div
                  className="grid grid-cols-1 gap-4"
                  initial="hidden"
                  animate="visible"
                  variants={{ visible: { transition: { staggerChildren: 0.04 } } }}
                >
                  {ads.map((ad, i) => (
                    <motion.div
                      key={ad.id}
                      variants={{
                        hidden: { opacity: 0, y: 12 },
                        visible: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 400, damping: 30 } },
                      }}
                    >
                      <AdCard ad={ad} index={i} onClick={() => onAdClick(ad)} onSave={() => {}} />
                    </motion.div>
                  ))}
                </motion.div>
              </AnimatePresence>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
