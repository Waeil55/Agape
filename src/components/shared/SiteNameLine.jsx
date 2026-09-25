import { useEffect, useState } from 'react';
import { resolveSiteName } from '../../utils/siteNameLookup';

/**
 * Shows a location's facility/site name under its address. When the trip
 * record already has one (from import), it renders immediately. When it is
 * missing, this looks one up for the bare address (Google Places, cached)
 * and quietly fills in once resolved — never a loading spinner, never a
 * layout shift promise, just nothing until (if) a name is found.
 */
export default function SiteNameLine({ siteName, address, className }) {
  const [resolved, setResolved] = useState(null);

  useEffect(() => {
    setResolved(null);
    if (siteName || !address) return undefined;
    let cancelled = false;
    // Loading the full Google Maps library just to name a site is too heavy
    // for a phone; there, only use an existing shared-cache hit unless Maps
    // is already loaded for another reason.
    const isPhone = typeof window !== 'undefined' && window.matchMedia?.('(max-width: 767px)')?.matches;
    const allowLiveLookup = !isPhone || Boolean(window.google?.maps?.places);
    resolveSiteName(address, { allowLiveLookup }).then((name) => {
      if (!cancelled) setResolved(name);
    });
    return () => { cancelled = true; };
  }, [siteName, address]);

  const label = siteName || resolved;
  if (!label) return null;
  return <p className={className}>{label}</p>;
}
