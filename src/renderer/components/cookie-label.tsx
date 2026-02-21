import { getCookieAbbreviation, getCookieColor } from '../../cookie-constants';

export function CookieLabel({ variety }: { variety: string }) {
  const color = getCookieColor(variety);
  return (
    <>
      {color && <span class="inventory-chip-dot" style={{ background: color }} />}
      {getCookieAbbreviation(variety)}
    </>
  );
}
