import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const driverHistorySource = readFileSync(
  new URL('../components/DriverPage.jsx', import.meta.url),
  'utf8',
);
const mobileReportsSource = readFileSync(
  new URL('../components/MobileReportsPage.jsx', import.meta.url),
  'utf8',
);

describe('mobile trip history disclosure', () => {
  it('keeps driver history collapsed until one trip is selected', () => {
    expect(driverHistorySource).toContain('useState(null);');
    expect(driverHistorySource).toContain("historyExpandedId === trip.id || isEditing");
    expect(driverHistorySource).not.toContain('const isExpanded = true');
  });

  it('keeps mobile reports collapsed and allows only the selected trip to expand', () => {
    expect(mobileReportsSource).toContain('const [expandedTripId, setExpandedTripId] = useState(null);');
    expect(mobileReportsSource).toContain('expandedTripId === trip.id || isEditing');
    expect(mobileReportsSource).not.toContain('const isExpanded = true');
  });
});
