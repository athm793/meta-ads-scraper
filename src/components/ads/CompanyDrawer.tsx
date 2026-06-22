'use client';

import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { AdCard } from './AdCard';
import type { BulkCompany, Ad } from '@/types/ads';
import { useEffect, useState } from 'react';

interface CompanyDrawerProps {
  company: BulkCompany | null;
  open: boolean;
  onClose: () => void;
  onAdClick: (ad: Ad) => void;
}

export function CompanyDrawer({ company, open, onClose, onAdClick }: CompanyDrawerProps) {
  const [ads, setAds] = useState<Ad[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!company || !open) return;
    setLoading(true);
    fetch(`/api/ads?advertiser=${encodeURIComponent(company.company_name)}&limit=50`)
      .then((r) => r.json())
      .then((data) => setAds(data.ads || []))
      .finally(() => setLoading(false));
  }, [company, open]);

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-[540px] p-0">
        <SheetHeader className="px-6 pt-6 pb-4 border-b">
          <SheetTitle>{company?.company_name}</SheetTitle>
          {company && (
            <div className="flex gap-2 flex-wrap">
              <Badge variant="secondary">{company.active_ads_count} active</Badge>
              <Badge variant="outline">{company.inactive_ads_count} inactive</Badge>
              {company.ad_types.map((t) => <Badge key={t} variant="outline" className="text-xs">{t}</Badge>)}
            </div>
          )}
        </SheetHeader>
        <ScrollArea className="h-[calc(100vh-140px)]">
          <div className="p-4">
            {loading ? (
              <p className="text-sm text-muted-foreground text-center py-8">Loading ads...</p>
            ) : ads.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No ads found for this company</p>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {ads.map((ad) => (
                  <AdCard key={ad.id} ad={ad} onClick={() => onAdClick(ad)} onSave={() => {}} />
                ))}
              </div>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
