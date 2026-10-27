/* Delivery fee maths, split out of mapCheckout.tsx so the checkout page can price delivery
   without downloading the map library (Leaflet). */
export type Pt = { lat: number; lng: number };

/** Straight-line distance in km (haversine). */
export function distanceKm(a: Pt, b: Pt) {
  const R = 6371, rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Uses the prices from Admin → Settings: base fee covers base_km, then extra_fee for every extra_km step. */
export function calcFee(cfg: any, store: Pt, to: Pt) {
  const km = distanceKm(store, to);
  const baseFee = Number(cfg?.base_fee ?? 1), baseKm = Number(cfg?.base_km ?? 2);
  const extraFee = Number(cfg?.extra_fee ?? 0.5), extraKm = Math.max(0.1, Number(cfg?.extra_km ?? 1));
  const steps = Math.max(0, Math.ceil((km - baseKm) / extraKm));
  return { km, fee: Math.max(0, baseFee + steps * extraFee) };
}
