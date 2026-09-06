import * as XLSX from 'xlsx';

export const OVERRIDE_EXPORT_HEADERS = [
  'Trip Date',
  'Booking ID',
  'Client Name',
  'Driver',
  'Leg',
  'From City',
  'To City',
  'Original Trip Cost',
  'Amb/Wheel',
  'Unloaded Miles',
  'Cost per Unloaded Mile',
  'Override Amount',
  'Gap Hours',
  'Wait Time Hours',
  'Cost per Wait Hour',
  'Wait Cost',
  'Known Subtotal',
  'Unloaded Decision',
  'Waiting Decision',
  'Mileage Excluded',
  'Waiting Excluded',
  'Matched Exclusion Rules',
  'Passenger Pickup City',
  'Passenger Dropoff City',
  'Original Cost Status',
  'Original Cost Decision',
];

const currencyColumns = [7, 10, 11, 14, 15, 16];
const numberColumns = [9, 12, 13];
const excelServiceDate = (value) => {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return value || '';
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0, 0);
};
const rowValues = (row, driverName) => [
  excelServiceDate(row.serviceDate),
  row.trip.bookingId || row.trip.id || '',
  row.clientName || row.trip.patient || row.trip.patientName || row.trip.clientName || row.trip.memberName || row.trip.passengerName || row.trip.passenger || '',
  driverName || row.trip.completedDriverName || row.trip.driverName || '',
  row.legLabel,
  row.originCity,
  row.destinationCity,
  row.originalTripCost,
  row.tripType,
  row.unloadedMiles,
  row.unloadedRate,
  row.unloadedAmount,
  row.rawGapHours,
  row.waitHours,
  row.waitRate,
  row.waitCost,
  row.totalCost,
  row.unloadedReason,
  row.waitReason,
  row.mileageExcluded ? 'Yes' : 'No',
  row.waitingExcluded ? 'Yes' : 'No',
  (row.matchedExclusionRules || []).map((rule) => `${rule.scope}: ${rule.fromCity} > ${rule.toCity === '*' ? 'Any destination' : rule.toCity}`).join('; '),
  row.tripPickupCity,
  row.tripDropoffCity,
  row.originalTripCostStatus === 'valid' ? 'Verified' : row.originalTripCostStatus === 'invalid' ? 'Invalid' : row.originalTripCostStatus === 'missing' ? 'Not provided' : 'Counted on another leg',
  row.originalTripCostReason || '',
];

export const buildTripOverrideWorkbook = (rows = [], driverById = new Map()) => {
  const values = [OVERRIDE_EXPORT_HEADERS];
  rows.forEach((row) => {
    const driver = driverById.get(row.trip.driverId);
    values.push(rowValues(row, driver?.name));
  });
  const subtotalRow = rows.length + 2;
  const subtotal = (column) => (rows.length ? { f: `SUM(${column}2:${column}${subtotalRow - 1})` } : { f: '0' });
  values.push([
    'SUBTOTALS', '', '', '', '', '', '',
    subtotal('H'), '',
    subtotal('J'), '',
    subtotal('L'), '',
    subtotal('N'), '',
    subtotal('P'),
    subtotal('Q'), '', '', '', '', '', '', '', '', '',
  ]);

  const sheet = XLSX.utils.aoa_to_sheet(values, { cellDates: true });
  sheet['!cols'] = [
    { wch: 12 }, { wch: 15 }, { wch: 24 }, { wch: 22 }, { wch: 20 }, { wch: 18 }, { wch: 18 },
    { wch: 18 }, { wch: 15 }, { wch: 18 }, { wch: 11 }, { wch: 16 }, { wch: 23 }, { wch: 18 }, { wch: 12 },
    { wch: 17 }, { wch: 19 }, { wch: 42 }, { wch: 42 }, { wch: 18 }, { wch: 18 }, { wch: 42 }, { wch: 22 }, { wch: 22 },
    { wch: 22 }, { wch: 48 },
  ];
  sheet['!autofilter'] = { ref: `A1:Z${Math.max(1, subtotalRow - 1)}` };
  sheet['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft', state: 'frozen' };

  for (let row = 1; row < subtotalRow; row += 1) {
    const dateCell = sheet[XLSX.utils.encode_cell({ r: row, c: 0 })];
    if (dateCell && dateCell.t === 'd') dateCell.z = 'yyyy-mm-dd';
    currencyColumns.forEach((column) => {
      const cell = sheet[XLSX.utils.encode_cell({ r: row, c: column })];
      if (cell) cell.z = '$#,##0.00';
    });
    numberColumns.forEach((column) => {
      const cell = sheet[XLSX.utils.encode_cell({ r: row, c: column })];
      if (cell) cell.z = '0.00';
    });
  }
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Trip Cost Overrides');
  workbook.Props = { Title: 'Trip Cost Overrides', Subject: 'Auditable unloaded mileage and waiting-time supplements' };
  return workbook;
};

const encodeXml = (value) => new TextEncoder().encode(value);
const decodeXml = (value) => new TextDecoder().decode(value);
const replaceEntryContent = (entry, content) => {
  const encoded = encodeXml(content);
  entry.content = encoded;
  entry.size = encoded.length;
};
const binaryToBytes = (binary) => {
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index) & 0xff;
  return bytes;
};

const applyWorkbookStyles = (binary, subtotalRow) => {
  const archive = XLSX.CFB.read(binary, { type: 'binary' });
  const stylesEntry = XLSX.CFB.find(archive, 'styles.xml');
  const sheetEntry = XLSX.CFB.find(archive, 'sheet1.xml');
  if (!stylesEntry || !sheetEntry) throw new Error('The generated workbook is missing required worksheet styles.');

  let stylesXml = decodeXml(stylesEntry.content);
  const fontsMatch = stylesXml.match(/<fonts count="(\d+)">([\s\S]*?)<\/fonts>/);
  const fillsMatch = stylesXml.match(/<fills count="(\d+)">([\s\S]*?)<\/fills>/);
  const xfsMatch = stylesXml.match(/<cellXfs count="(\d+)">([\s\S]*?)<\/cellXfs>/);
  if (!fontsMatch || !fillsMatch || !xfsMatch) throw new Error('The generated workbook style table could not be validated.');

  const baseXfs = xfsMatch[2].match(/<xf\b[^>]*\/>/g) || [];
  const boldFontId = Number(fontsMatch[1]);
  const whiteBoldFontId = boldFontId + 1;
  const blueFillId = Number(fillsMatch[1]);
  const boldFont = '<font><b/><sz val="12"/><color theme="1"/><name val="Calibri"/><family val="2"/><scheme val="minor"/></font>';
  const whiteBoldFont = '<font><b/><sz val="12"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/><scheme val="minor"/></font>';
  const blueFill = '<fill><patternFill patternType="solid"><fgColor rgb="FF2A52AC"/><bgColor indexed="64"/></patternFill></fill>';
  stylesXml = stylesXml.replace(fontsMatch[0], `<fonts count="${boldFontId + 2}">${fontsMatch[2]}${boldFont}${whiteBoldFont}</fonts>`);
  stylesXml = stylesXml.replace(fillsMatch[0], `<fills count="${blueFillId + 1}">${fillsMatch[2]}${blueFill}</fills>`);

  const headerStyleId = baseXfs.length;
  const headerXf = `<xf numFmtId="0" fontId="${whiteBoldFontId}" fillId="${blueFillId}" borderId="0" xfId="0" applyFont="1" applyFill="1"><alignment vertical="center"/></xf>`;
  const boldStyleMap = new Map();
  const boldXfs = baseXfs.map((xf, oldStyleId) => {
    const newStyleId = headerStyleId + 1 + oldStyleId;
    boldStyleMap.set(oldStyleId, newStyleId);
    return xf
      .replace(/fontId="\d+"/, `fontId="${boldFontId}"`)
      .replace(/\/>$/, ' applyFont="1"/>');
  });
  const allXfs = `${xfsMatch[2]}${headerXf}${boldXfs.join('')}`;
  stylesXml = stylesXml.replace(xfsMatch[0], `<cellXfs count="${baseXfs.length + 1 + boldXfs.length}">${allXfs}</cellXfs>`);
  replaceEntryContent(stylesEntry, stylesXml);

  let sheetXml = decodeXml(sheetEntry.content);
  sheetXml = sheetXml.replace(/<c r="([A-Z]+)(\d+)"(?: s="(\d+)")?/g, (match, column, row, styleId) => {
    const rowNumber = Number(row);
    if (rowNumber === 1) return `<c r="${column}${row}" s="${headerStyleId}"`;
    if (rowNumber === subtotalRow) return `<c r="${column}${row}" s="${boldStyleMap.get(Number(styleId || 0))}"`;
    return match;
  });
  replaceEntryContent(sheetEntry, sheetXml);
  return XLSX.CFB.write(archive, { type: 'binary', fileType: 'zip', compression: true });
};

export const writeTripOverrideWorkbook = (rows = [], driverById = new Map()) => {
  const workbook = buildTripOverrideWorkbook(rows, driverById);
  const binary = XLSX.write(workbook, { type: 'binary', bookType: 'xlsx', compression: true, cellStyles: true });
  return binaryToBytes(applyWorkbookStyles(binary, rows.length + 2));
};

export const downloadTripOverrideWorkbook = (rows, driverById, filename) => {
  const bytes = writeTripOverrideWorkbook(rows, driverById);
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};
