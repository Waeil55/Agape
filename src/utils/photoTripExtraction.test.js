import { describe, it, expect } from 'vitest';
import {
  PHOTO_ROW_KEYS,
  PHOTO_MAX_COUNT,
  parsePhotoTripJson,
} from './photoTripExtraction';

describe('parsePhotoTripJson — trip-sheet photo extraction contract', () => {
  it('parses a valid extraction array into canonical rows', () => {
    const raw = JSON.stringify([
      {
        'Booking Id': '123',
        'Client Name': 'Jane Doe',
        'Pickup Address': '1 Main St',
        'Dropoff Address': '2 Oak Ave',
        'Phone Pickup': '5551234567',
        'Phone Dropoff': '',
        'Pickup Time': '09:30',
        'Dropoff Time': '',
        'Date': '09/13/2026',
        'Notes': 'gate code',
      },
    ]);
    const { rows, skipped } = parsePhotoTripJson(raw, 'photo 1');
    expect(skipped).toBe(0);
    expect(rows).toHaveLength(1);
    expect(rows[0]['Client Name']).toBe('Jane Doe');
    expect(rows[0]['Pickup Address']).toBe('1 Main St');
    expect(rows[0]['Phone Pickup']).toBe('5551234567');
  });

  it('strips markdown code fences the model may add', () => {
    const raw = '```json\n[{"Client Name": "John", "Pickup Address": "A", "Dropoff Address": "B"}]\n```';
    const { rows } = parsePhotoTripJson(raw, 'photo 1');
    expect(rows).toHaveLength(1);
    expect(rows[0]['Client Name']).toBe('John');
  });

  it('strips unknown keys so the model cannot inject arbitrary fields', () => {
    const raw = JSON.stringify([{ 'Client Name': 'Ann', 'Pickup Address': 'A', 'Dropoff Address': 'B', 'driverId': 'evil', 'status': 'Completed' }]);
    const { rows } = parsePhotoTripJson(raw, 'photo 1');
    expect(rows).toHaveLength(1);
    expect(Object.keys(rows[0]).sort()).toEqual([...PHOTO_ROW_KEYS].sort());
    expect(rows[0]).not.toHaveProperty('driverId');
    expect(rows[0]).not.toHaveProperty('status');
  });

  it('drops empty rows instead of importing stubs, and counts them', () => {
    const raw = JSON.stringify([
      { 'Client Name': '', 'Pickup Address': '', 'Dropoff Address': '' },
      { 'Client Name': 'Real', 'Pickup Address': 'A', 'Dropoff Address': 'B' },
      null,
      'junk',
    ]);
    const { rows, skipped } = parsePhotoTripJson(raw, 'photo 2');
    expect(rows).toHaveLength(1);
    expect(rows[0]['Client Name']).toBe('Real');
    expect(skipped).toBe(3);
  });

  it('coerces non-string values to trimmed strings', () => {
    const raw = JSON.stringify([{ 'Client Name': 123, 'Pickup Address': ' A ', 'Dropoff Address': null }]);
    const { rows } = parsePhotoTripJson(raw, 'photo 1');
    expect(rows[0]['Client Name']).toBe('123');
    expect(rows[0]['Pickup Address']).toBe('A');
    expect(rows[0]['Dropoff Address']).toBe('');
  });

  it('fails closed on empty output, naming the photo', () => {
    expect(() => parsePhotoTripJson('   ', 'photo 3')).toThrow(/photo 3/);
  });

  it('fails closed on garbage text, naming the photo', () => {
    expect(() => parsePhotoTripJson('not json at all {{{', 'photo 1')).toThrow(/photo 1/);
  });

  it('fails closed on non-array JSON, naming the photo', () => {
    expect(() => parsePhotoTripJson('{"Client Name": "x"}', 'photo 2')).toThrow(/photo 2/);
  });

  it('returns zero rows (not an error) when the model reports no legible trips', () => {
    const { rows, skipped } = parsePhotoTripJson('[]', 'photo 1');
    expect(rows).toEqual([]);
    expect(skipped).toBe(0);
  });

  it('keeps the per-batch photo cap at a sane bound', () => {
    expect(PHOTO_MAX_COUNT).toBeLessThanOrEqual(5);
  });
});
