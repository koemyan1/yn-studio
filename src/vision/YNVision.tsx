import React, { lazy, Suspense, useState } from 'react';
import { Camera } from 'lucide-react';
import { tr } from '../lang';
import type { VisionProduct } from './visionEngine';
import './vision.css';

/* The camera button that sits inside the search bar. The sheet (and the AI behind it) is only downloaded when it is tapped. */
const VisionSheet = lazy(() => import('./VisionSheet'));

export type VisionCatalogItem = VisionProduct & {
  name: string; price: number; display_price?: number; original_price?: number; main_image_url?: string;
};

export default function YNVision({ products }: { products: VisionCatalogItem[] }) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" className="visionBtn" aria-label={tr('Search by photo with YN Vision', 'ស្វែងរកដោយរូបថត YN Vision')} title="YN Vision" onClick={() => setOpen(true)}>
      <Camera /><i className="visionBtnRing" aria-hidden="true" />
    </button>
    {open && <Suspense fallback={null}><VisionSheet products={products} onClose={() => setOpen(false)} /></Suspense>}
  </>;
}
