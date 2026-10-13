import React from 'react';
import { useThemeConfig } from './secretTheme';
import { mascotsForProduct, motionFor, normalizeProductMascots } from './productMascotsCore';

/**
 * The mascot(s) drawn on one product card. Which mascot a product gets comes from the theme's
 * "Product mascots" settings (Admin → Product Mascots) – new products are picked up automatically.
 */
export function ProductMascots({ productId }: { productId: string }) {
  const cfg = useThemeConfig();
  const raw = cfg?.productMascots;
  if (!raw || !raw.enabled) return null;
  const pm = normalizeProductMascots(raw);
  const { items } = mascotsForProduct(pm, productId);
  if (!items.length) return null;
  return (
    <>
      {items.map((m, i) => {
        const mo = motionFor(pm, productId, i);
        return (
          <span key={m.id + i} className={'ynPM ynPM' + i} aria-hidden="true" style={{ ['--pm-s' as any]: pm.size / 100 }}>
            <img src={m.url} alt="" draggable={false} loading="lazy"
              className={mo.type !== 'none' ? 'ynPMa ynPMa-' + mo.type : undefined}
              style={mo.type !== 'none' ? { animationDelay: mo.delay + 's' } : undefined} />
          </span>
        );
      })}
    </>
  );
}
