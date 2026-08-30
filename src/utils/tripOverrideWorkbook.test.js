import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { buildTripOverrideWorkbook, OVERRIDE_EXPORT_HEADERS, writeTripOverrideWorkbook } from './tripOverrideWorkbook';

describe('trip override workbook', () => {
  it('exports labeled typed rows, decisions, and formula subtotals', () => {
    const workbook = buildTripOverrideWorkbook([{
      serviceDate: '2026-08-01',
      trip: { id: 't1', bookingId: 'B-100', driverId: 'd1' },
      nextTrip: { id: 't2', bookingId: 'B-101' },
      pickupCity: 'Indianapolis', dropoffCity: 'Carmel', nextPickupCity: 'Fishers',
      originalTripCost: 40, tripType: 'A', unloadedMiles: 25, unloadedRate: 0.8,
      unloadedAmount: 20, rawGapHours: 2.25, waitHours: 1.5, waitRate: 9,
      waitCost: 13.5, totalCost: 73.5, unloadedReason: 'Qualifying empty segment',
      waitReason: 'Billable time after threshold, rounded up to 30 min',
    }], new Map([['d1', { name: 'Driver One' }]]));
    const sheet = workbook.Sheets['Trip Cost Overrides'];
    expect(XLSX.utils.sheet_to_json(sheet, { header: 1 })[0]).toEqual(OVERRIDE_EXPORT_HEADERS);
    expect(sheet.A2).toMatchObject({ t: 'd', z: 'yyyy-mm-dd' });
    expect(sheet.G2).toMatchObject({ t: 'n', v: 40, z: '$#,##0.00' });
    expect(sheet.I2).toMatchObject({ t: 'n', v: 25, z: '0.00' });
    expect(sheet.D2.v).toBe('Carmel');
    expect(sheet.E2.v).toBe('Fishers');
    expect(sheet.F2.v).toBe('B-101');
    expect(sheet.S2.v).toBe('Indianapolis');
    expect(sheet.T2.v).toBe('Carmel');
    expect(sheet['!cols']).toHaveLength(OVERRIDE_EXPORT_HEADERS.length);
    expect(sheet.G3.f).toBe('SUM(G2:G2)');
    expect(sheet.P3.f).toBe('SUM(P2:P2)');
    expect(sheet['!autofilter'].ref).toBe('A1:T2');

    const serialized = writeTripOverrideWorkbook([{
      serviceDate: '2026-08-01', trip: { id: 't1' }, pickupCity: 'A', dropoffCity: 'B',
      nextPickupCity: 'C', originalTripCost: 40, tripType: 'A', unloadedMiles: 25,
      unloadedRate: 0.8, unloadedAmount: 20, rawGapHours: 2, waitHours: 1,
      waitRate: 9, waitCost: 9, totalCost: 69, unloadedReason: 'Included', waitReason: 'Included',
    }]);
    const archive = XLSX.CFB.read(serialized, { type: 'buffer' });
    const stylesXml = new TextDecoder().decode(XLSX.CFB.find(archive, 'styles.xml').content);
    const sheetXml = new TextDecoder().decode(XLSX.CFB.find(archive, 'sheet1.xml').content);
    expect(stylesXml).toContain('<b/>');
    expect(stylesXml).toContain('FF2A52AC');
    expect(sheetXml).toMatch(/<c r="A1" s="\d+"/);
    expect(sheetXml).toMatch(/<c r="A3" s="\d+"/);
  });

  it('keeps an empty export subtotal valid without a reversed or circular range', () => {
    const sheet = buildTripOverrideWorkbook([]).Sheets['Trip Cost Overrides'];
    expect(sheet.G2.f).toBe('0');
    expect(sheet.K2.f).toBe('0');
    expect(sheet.O2.f).toBe('0');
    expect(sheet.P2.f).toBe('0');
  });
});
