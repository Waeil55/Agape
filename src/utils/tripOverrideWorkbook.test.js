import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { buildTripOverrideWorkbook, OVERRIDE_EXPORT_HEADERS, writeTripOverrideWorkbook } from './tripOverrideWorkbook';

describe('trip override workbook', () => {
  it('exports labeled typed rows, decisions, and formula subtotals', () => {
    const workbook = buildTripOverrideWorkbook([{
      serviceDate: '2026-08-01',
      trip: { id: 't1', bookingId: 'B-100', driverId: 'd1', patient: 'Aaron King' },
      clientName: 'Aaron King',
      legLabel: 'Before pickup', originCity: 'Carmel', destinationCity: 'Fishers',
      tripPickupCity: 'Indianapolis', tripDropoffCity: 'Carmel',
      originalTripCost: 40, tripType: 'A', unloadedMiles: 25, unloadedRate: 0.8,
      unloadedAmount: 20, rawGapHours: 2.25, waitHours: 1.5, waitRate: 9,
      waitCost: 13.5, totalCost: 73.5, unloadedReason: 'Qualifying empty segment',
      waitReason: 'Billable time after threshold, rounded up to 30 min',
      mileageExcluded: false, waitingExcluded: true,
      matchedExclusionRules: [{ scope: 'waiting', fromCity: 'Carmel', toCity: 'Fishers' }],
    }], new Map([['d1', { name: 'Driver One' }]]));
    const sheet = workbook.Sheets['Trip Cost Overrides'];
    expect(XLSX.utils.sheet_to_json(sheet, { header: 1 })[0]).toEqual(OVERRIDE_EXPORT_HEADERS);
    expect(sheet.A2).toMatchObject({ t: 'd', z: 'yyyy-mm-dd' });
    expect(sheet.C2.v).toBe('Aaron King');
    expect(sheet.H2).toMatchObject({ t: 'n', v: 40, z: '$#,##0.00' });
    expect(sheet.J2).toMatchObject({ t: 'n', v: 25, z: '0.00' });
    expect(sheet.E2.v).toBe('Before pickup');
    expect(sheet.F2.v).toBe('Carmel');
    expect(sheet.G2.v).toBe('Fishers');
    expect(OVERRIDE_EXPORT_HEADERS).not.toContain('Next Booking ID');
    expect(sheet.T2.v).toBe('No');
    expect(sheet.U2.v).toBe('Yes');
    expect(sheet.V2.v).toBe('waiting: Carmel > Fishers');
    expect(sheet.W2.v).toBe('Indianapolis');
    expect(sheet.X2.v).toBe('Carmel');
    expect(sheet['!cols']).toHaveLength(OVERRIDE_EXPORT_HEADERS.length);
    expect(sheet.H3.f).toBe('SUM(H2:H2)');
    expect(sheet.Q3.f).toBe('SUM(Q2:Q2)');
    expect(sheet['!autofilter'].ref).toBe('A1:X2');

    const serialized = writeTripOverrideWorkbook([{
      serviceDate: '2026-08-01', trip: { id: 't1' }, legLabel: 'Before pickup',
      originCity: 'B', destinationCity: 'C', tripPickupCity: 'A', tripDropoffCity: 'B',
      originalTripCost: 40, tripType: 'A', unloadedMiles: 25,
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
    expect(sheet.H2.f).toBe('0');
    expect(sheet.L2.f).toBe('0');
    expect(sheet.P2.f).toBe('0');
    expect(sheet.Q2.f).toBe('0');
  });
});
