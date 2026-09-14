import fs from 'node:fs/promises';
import path from 'node:path';
import { Workbook } from '@oai/artifact-tool';

const downloadsDir = 'C:/Users/waeil/Downloads';
const outputDir = 'C:/Users/waeil/Desktop/Agape Care/App10/outputs/welltrans-2026-09-14-108-series';
const outputPath = path.join(outputDir, 'WellTrans_Trips_2026-09-14.csv');
const previewPath = path.join(outputDir, '_preview.png');

const rowPlan = [
  { source: 'download (17).csv', oldId: '107748557', newId: '108091401', client: 'LEGEND DAVIS', time: '07:30' },
  { source: 'download (17).csv', oldId: '107748558', newId: '108091402', client: 'LEGEND DAVIS', time: '' },
  { source: 'download (17).csv', oldId: '107748559', newId: '108091403', client: 'LEGEND DAVIS', time: '14:45' },
  { source: 'download (17).csv', oldId: '107748560', newId: '108091404', client: 'LEGEND DAVIS', time: '' },
  { source: 'download (18).csv', oldId: '107863088', newId: '108091405', client: 'Theresa Mcmeans', time: '04:15' },
  { source: 'download (18).csv', oldId: '107863089', newId: '108091406', client: 'Theresa Mcmeans', time: '' },
  { source: 'download (18).csv', oldId: '107831387', newId: '108091407', client: 'Thomas Bourne', time: '05:00' },
  { source: 'download (18).csv', oldId: '107831388', newId: '108091408', client: 'Thomas Bourne', time: '' },
  { source: 'download (18).csv', oldId: '107834593', newId: '108091409', client: 'EDNA WILSON', time: '04:00' },
  { source: 'download (18).csv', oldId: '107834594', newId: '108091410', client: 'EDNA WILSON', time: '10:30' },
  { source: 'download (15).csv', oldId: '107767707', newId: '108091411', client: 'BEVERLY WADE', time: '11:00' },
  { source: 'download (15).csv', oldId: '107767732', newId: '108091412', client: 'BEVERLY WADE', time: '' },
];

async function sourceTable(filename) {
  const text = await fs.readFile(path.join(downloadsDir, filename), 'utf8');
  const sourceWorkbook = await Workbook.fromCSV(text, { sheetName: 'Source' });
  const values = sourceWorkbook.worksheets.getItem('Source').getUsedRange(true).values;
  const headers = values[0].map((value) => String(value ?? '').trim());
  const records = values.slice(1).map((row) => Object.fromEntries(headers.map((header, index) => [header, String(row[index] ?? '')])));
  return { headers, records };
}

const sourceCache = new Map();
for (const filename of [...new Set(rowPlan.map((item) => item.source))]) {
  sourceCache.set(filename, await sourceTable(filename));
}

const canonicalHeaders = sourceCache.get('download (18).csv').headers;
if (canonicalHeaders.length !== 26 || canonicalHeaders[0] !== 'Booking Id' || canonicalHeaders[23] !== 'Date') {
  throw new Error('The historical WellTrans CSV schema does not match the expected 26-column import contract.');
}

const outputRecords = rowPlan.map((planned) => {
  const source = sourceCache.get(planned.source);
  if (source.headers.join('\u001f') !== canonicalHeaders.join('\u001f')) {
    throw new Error(`CSV schema mismatch in ${planned.source}.`);
  }
  const matches = source.records.filter((record) => record['Booking Id'] === planned.oldId);
  if (matches.length !== 1) throw new Error(`Expected one source row for historical booking ${planned.oldId}; found ${matches.length}.`);
  const record = { ...matches[0] };
  if (record['Client Name'] !== planned.client || record['Requested Time Pickup'] !== planned.time) {
    throw new Error(`Historical identity/time mismatch for booking ${planned.oldId}.`);
  }
  record['Booking Id'] = planned.newId;
  record.Date = '09-14-2026';
  if (planned.client === 'LEGEND DAVIS' && !planned.time) {
    record['Phone Dropoff'] = '(317) 376-5188';
  }
  return record;
});

const newIds = outputRecords.map((record) => record['Booking Id']);
if (new Set(newIds).size !== rowPlan.length || newIds.some((id) => !/^108\d{6}$/.test(id))) {
  throw new Error('The generated 108-series Booking IDs are not unique nine-digit identifiers.');
}

const downloadedFiles = (await fs.readdir(downloadsDir)).filter((name) => /^download.*\.csv$/i.test(name));
for (const filename of downloadedFiles) {
  const text = await fs.readFile(path.join(downloadsDir, filename), 'utf8');
  const collision = newIds.find((id) => text.includes(`"${id}"`));
  if (collision) throw new Error(`Booking ID ${collision} already exists in historical download ${filename}.`);
}

const expectedCounts = new Map([
  ['LEGEND DAVIS', 4],
  ['Theresa Mcmeans', 2],
  ['Thomas Bourne', 2],
  ['EDNA WILSON', 2],
  ['BEVERLY WADE', 2],
]);
for (const [client, expected] of expectedCounts) {
  const actual = outputRecords.filter((record) => record['Client Name'] === client).length;
  if (actual !== expected) throw new Error(`${client} has ${actual} rows; expected ${expected}.`);
}

const matrix = [canonicalHeaders, ...outputRecords.map((record) => canonicalHeaders.map((header) => record[header] ?? ''))];
const workbook = Workbook.create();
const sheet = workbook.worksheets.add('Trips');
sheet.showGridLines = false;
sheet.getRangeByIndexes(0, 0, matrix.length, canonicalHeaders.length).values = matrix;
sheet.freezePanes.freezeRows(1);
sheet.getRange('A1:Z1').format = {
  fill: '#1E3A8A',
  font: { name: 'Arial', size: 10, bold: true, color: '#FFFFFF' },
  horizontalAlignment: 'center',
  verticalAlignment: 'center',
  wrapText: false,
};
sheet.getRange('A2:Z13').format = {
  font: { name: 'Arial', size: 10, color: '#0F172A' },
  verticalAlignment: 'center',
  wrapText: false,
};
sheet.getRange('A1:Z13').format.autofitColumns();
sheet.getRange('A1:Z13').format.autofitRows();
workbook.recalculate();

const inspection = await workbook.inspect({
  kind: 'table',
  range: 'Trips!A1:Z13',
  include: 'values,formulas',
  tableMaxRows: 13,
  tableMaxCols: 26,
  tableMaxCellChars: 120,
  maxChars: 18000,
});
console.log(inspection.ndjson);

const preview = await workbook.render({ sheetName: 'Trips', range: 'A1:Z13', scale: 1, format: 'png' });
await fs.writeFile(previewPath, new Uint8Array(await preview.arrayBuffer()));

const quoteCsv = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
const csv = `${matrix.map((row) => row.map(quoteCsv).join(',')).join('\r\n')}\r\n`;
await fs.writeFile(outputPath, csv, 'utf8');

console.log(JSON.stringify({
  outputPath,
  rowCount: outputRecords.length,
  bookingIds: newIds,
  serviceDate: '09-14-2026',
  correctedLegendReturnPhoneRows: outputRecords.filter((record) => record['Client Name'] === 'LEGEND DAVIS' && !record['Requested Time Pickup']).length,
}));
