const GRID_SELECTOR = 'core\\:grid[gridobject="Pass.UI.Grid.TripBrokerEventsGrid"]';
const REQUIRED_COLUMNS = [
  'Booking Id', 'Activity', 'Driver', 'Vehicle', 'Arrival Time',
  'Departure Time', 'Mileage/Odometer', 'Signature Captured?', 'Signature Captured',
];
const GRID_COLUMNS = [...REQUIRED_COLUMNS, 'Is Read Only'];
const TURBO_MODE = process.env.WELLTRANS_TURBO_MODE !== 'false';
const TURBO_SETTLE_MS = Math.max(
  15,
  Math.min(150, Number(process.env.WELLTRANS_TURBO_SETTLE_MS) || 35),
);
const provenEditorCapabilities = new Map();

const settleUi = (page, normalMs, turboMs = TURBO_SETTLE_MS) =>
  page.waitForTimeout(TURBO_MODE ? turboMs : normalMs);

export function resetWellTransSessionCaches() {
  provenEditorCapabilities.clear();
}

const ACTIVITY_PICKUP = /^(pickup|pick\s*up|pu)$/i;
const ACTIVITY_DROPOFF = /^(dropoff|drop\s*off|do|drop)$/i;

const portalDate = value => {
  const match = String(value || '').match(/\[(\d{2})-(\d{2})-(\d{4})\]/);
  return match ? `${match[3]}-${match[1]}-${match[2]}` : '';
};

export async function getSelectedPortalDate(page) {
  await waitForAssignedTask(page);
  return portalDate(await page.locator('.RunName').last().innerText());
}

async function waitForAssignedTask(page) {
  const grid = page.locator(`${GRID_SELECTOR}:visible`).first();
  if (await grid.count()) return;

  const proceed = page.getByRole('button', { name: 'Proceed', exact: true }).last();
  if (await proceed.isVisible().catch(() => false)) {
    await proceed.click();
  }
  await page.waitForFunction(() =>
    Boolean(document.querySelector('.RunName')?.textContent?.trim()
      && [...document.querySelectorAll('core\\:grid[gridobject="Pass.UI.Grid.TripBrokerEventsGrid"]')]
        .some(element => element.getClientRects().length > 0)),
  null, { timeout: 30000 });
}

async function openEditItinerary(page) {
  const grid = page.locator(`${GRID_SELECTOR}:visible:has(.GridCell[title="Signature Captured?"])`).last();
  for (let attempt = 0; attempt < 3 && !await grid.count(); attempt += 1) {
    const bulkEdit = page.locator('.BulkEdit[title="Bulk Edit"]:visible').last();
    if (await bulkEdit.count()) {
      await bulkEdit.click({ force: true });
    } else {
      const schedule = page.locator('.ChangeSchedule[title="Select Schedule"]:visible').last();
      if (!await schedule.count()) {
        throw new Error('TripSpark Bulk Edit command is unavailable on the current assigned-task screen');
      }
      await schedule.click({ force: true });
    }
    await grid.waitFor({ state: 'attached', timeout: 10000 }).catch(() => {});
  }
  if (!await grid.count()) throw new Error('TripSpark Edit Itinerary grid did not open after three attempts');
  const missing = await grid.evaluate((element, required) => {
    const headers = new Set([...element.querySelectorAll('.GridCell')]
      .filter(cell => cell.style.top === '0px').map(cell => cell.title));
    return required.filter(column => !headers.has(column));
  }, REQUIRED_COLUMNS);
  if (missing.length) throw new Error(`TripSpark edit grid is missing required columns: ${missing.join(', ')}`);
  return grid;
}

export const isEditItineraryOpen = async page =>
  Boolean(await page.locator(
    `${GRID_SELECTOR}:visible:has(.GridCell[title="Signature Captured?"])`,
  ).count().catch(() => 0));

export async function sortWellTransReviewGridByDriver(page) {
  const grid = await openEditItinerary(page);
  const sorted = await grid.evaluate(element => {
    const header = [...element.querySelectorAll('.GridCell')]
      .find(cell => cell.style.top === '0px' && cell.title === 'Driver');
    if (!header) return false;
    header.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    header.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
    header.click();
    return true;
  });
  if (!sorted) throw new Error('TripSpark Driver column header is unavailable for review grouping');
  await page.waitForTimeout(350);
  return true;
}

const normalizeBooking = value => String(value ?? '').trim().replace(/\s+/g, '').replace(/^TRIP-/i, '').toLowerCase();

async function gridModel(grid, bookingId) {
  const extractVisibleRows = () => grid.evaluate((element, columnTitles) => {
    const cells = [...element.querySelectorAll('.GridCell')];
    const header = title => cells.find(cell => cell.style.top === '0px' && cell.title === title);
    const headerCells = new Set(columnTitles.map(header).filter(Boolean));
    const left = title => Number.parseFloat(header(title)?.style.left);
    const columns = Object.fromEntries(columnTitles.map(title => [title, left(title)]));
    const bookingLeft = left('Booking Id');
    const rowMap = new Map();
    for (const cell of cells) {
      const cellTop = Number.parseFloat(cell.style.top);
      // TripSpark renders the first itinerary row at top:0 in its data layer,
      // the same coordinate used by the separate header layer. Exclude the
      // actual header elements, not every cell at top:0.
      if (headerCells.has(cell) || !Number.isFinite(cellTop)) continue;
      const raw = String(cell.title || cell.textContent || '').trim();
      if (Number.parseFloat(cell.style.left) === bookingLeft) {
        const key = String(cellTop);
        if (!rowMap.has(key)) rowMap.set(key, { top: cellTop, bookingRaw: raw, values: {} });
        rowMap.get(key).bookingRaw = raw;
        rowMap.get(key).values['Booking Id'] = raw;
      }
    }
    for (const cell of cells) {
      const cellTop = Number.parseFloat(cell.style.top);
      if (headerCells.has(cell) || !Number.isFinite(cellTop)) continue;
      const key = String(cellTop);
      const row = rowMap.get(key);
      if (!row) continue;
      for (const title of columnTitles) {
        if (Number.parseFloat(cell.style.left) === columns[title]) {
          row.values[title] = String(cell.title || cell.textContent || '').trim();
        }
      }
    }
    for (const row of rowMap.values()) {
      row.activity = row.values['Activity'] || '';
    }
    return { columns, rows: [...rowMap.values()] };
  }, GRID_COLUMNS);

  const scrollGridTo = offset => grid.evaluate((element, scrollOffset) => {
    for (const scroller of element.querySelectorAll('.GridScroller')) {
      scroller.scrollTop = scrollOffset;
      scroller.dispatchEvent(new Event('scroll', { bubbles: true }));
    }
  }, offset);

  const getAllScrollPositions = () => grid.evaluate((element) => {
    for (const scroller of element.querySelectorAll('.GridScroller')) {
      if (scroller.scrollHeight <= scroller.clientHeight) return [0];
      const positions = [0];
      const step = Math.max(50, Math.floor(scroller.clientHeight * 0.6));
      for (let pos = step; pos < scroller.scrollHeight; pos += step) {
        positions.push(pos);
      }
      positions.push(scroller.scrollHeight);
      return positions;
    }
    return [0];
  });

  const positions = await getAllScrollPositions();
  const target = normalizeBooking(bookingId);
  const matchedRows = new Map();

  for (const pos of positions) {
    await scrollGridTo(pos);
    await new Promise(resolve => setTimeout(resolve, 200));
    const extracted = await extractVisibleRows();
    for (const row of extracted.rows.filter(item => normalizeBooking(item.bookingRaw) === target)) {
      const key = `${normalizeBooking(row.bookingRaw)}|${normalized(row.activity)}|${row.top}`;
      if (!matchedRows.has(key)) matchedRows.set(key, { ...row, scrollOffset: pos });
    }
    const rows = [...matchedRows.values()];
    if (rows.some(row => ACTIVITY_PICKUP.test(row.activity))
      && rows.some(row => ACTIVITY_DROPOFF.test(row.activity))) {
      break;
    }
  }

  return { rows: [...matchedRows.values()] };
}

export async function buildWellTransGridIndex(page, expectedServiceDate) {
  const selectedDate = await getSelectedPortalDate(page);
  if (expectedServiceDate && selectedDate !== expectedServiceDate) {
    throw new Error(
      `Cannot index WellTrans schedule ${selectedDate || 'unknown'} for requested date ${expectedServiceDate}`,
    );
  }
  const grid = await openEditItinerary(page);
  const positions = await grid.evaluate((element) => {
    for (const scroller of element.querySelectorAll('.GridScroller')) {
      if (scroller.scrollHeight <= scroller.clientHeight) return [0];
      const result = [0];
      const step = Math.max(50, Math.floor(scroller.clientHeight * 0.8));
      for (let position = step; position < scroller.scrollHeight; position += step) {
        result.push(position);
      }
      result.push(scroller.scrollHeight);
      return result;
    }
    return [0];
  });
  const rowsByBooking = new Map();
  for (const scrollOffset of positions) {
    await scrollGridTo(grid, scrollOffset);
    const visible = await visibleGridRows(grid);
    const visibleByBooking = new Map();
    for (const row of visible) {
      const booking = normalizeBooking(row.bookingRaw);
      if (!booking) continue;
      if (!visibleByBooking.has(booking)) visibleByBooking.set(booking, []);
      visibleByBooking.get(booking).push({ ...row, scrollOffset });
    }
    for (const [booking, rows] of visibleByBooking) {
      const current = rowsByBooking.get(booking) || [];
      // Overlapping virtual-grid windows show the same booking more than once.
      // Keep the observation with the most rows so genuine duplicate
      // Pickup/Dropoff rows remain visible to fail-closed validation.
      if (rows.length > current.length) {
        rowsByBooking.set(booking, rows);
      } else {
        const merged = [...current];
        for (const row of rows) {
          if (!merged.some(item => normalized(item.activity) === normalized(row.activity))) {
            merged.push(row);
          }
        }
        rowsByBooking.set(booking, merged);
      }
    }
  }
  return {
    selectedDate,
    rowsByBooking,
    bookingCount: rowsByBooking.size,
    rowCount: [...rowsByBooking.values()].reduce((total, rows) => total + rows.length, 0),
    builtAt: Date.now(),
  };
}

export async function inspectWellTransPortalContract(page, expectedServiceDate, gridIndex = null) {
  const selectedDate = await getSelectedPortalDate(page);
  if (selectedDate !== expectedServiceDate) {
    return {
      passed: false,
      selectedDate,
      expectedServiceDate,
      errors: [`Opened date ${selectedDate || 'unknown'} does not match ${expectedServiceDate}`],
    };
  }
  const grid = await openEditItinerary(page);
  const headers = await grid.evaluate(element => [...new Set(
    [...element.querySelectorAll('.GridCell')]
      .filter(cell => cell.style.top === '0px')
      .map(cell => String(cell.title || '').trim())
      .filter(Boolean),
  )]);
  const missingColumns = REQUIRED_COLUMNS.filter(column => !headers.includes(column));
  const index = gridIndex || await buildWellTransGridIndex(page, expectedServiceDate);
  const ambiguousBookings = [];
  for (const [bookingId, rows] of index.rowsByBooking || []) {
    const pickupCount = rows.filter(row => ACTIVITY_PICKUP.test(row.activity)).length;
    const dropoffCount = rows.filter(row => ACTIVITY_DROPOFF.test(row.activity)).length;
    if (pickupCount !== 1 || dropoffCount !== 1) {
      ambiguousBookings.push({ bookingId, pickupCount, dropoffCount });
    }
  }
  const errors = [
    ...(missingColumns.length ? [`Missing required columns: ${missingColumns.join(', ')}`] : []),
    ...(!index.bookingCount ? ['No Booking IDs were indexed from the opened itinerary'] : []),
  ];
  return {
    passed: errors.length === 0,
    provider: 'welltrans',
    adapter: 'tripspark-novusmed',
    selectedDate,
    requiredColumns: [...REQUIRED_COLUMNS],
    headers,
    missingColumns,
    bookingCount: index.bookingCount,
    rowCount: index.rowCount,
    ambiguousBookingCount: ambiguousBookings.length,
    ambiguousBookings: ambiguousBookings.slice(0, 50),
    warnings: ambiguousBookings.length
      ? [`${ambiguousBookings.length} Booking ID(s) require trip-level fail-closed validation`]
      : [],
    errors,
  };
}

const indexedGridModel = (gridIndex, bookingId) => {
  if (!gridIndex?.rowsByBooking) return null;
  return {
    rows: gridIndex.rowsByBooking.get(normalizeBooking(bookingId)) || [],
  };
};

async function scrollGridTo(grid, offset) {
  const changed = await grid.evaluate((element, scrollOffset) => {
    let didChange = false;
    for (const scroller of element.querySelectorAll('.GridScroller')) {
      if (Math.abs(scroller.scrollTop - scrollOffset) > 1) didChange = true;
      scroller.scrollTop = scrollOffset;
      scroller.dispatchEvent(new Event('scroll', { bubbles: true }));
    }
    return didChange;
  }, offset);
  if (changed) await new Promise(resolve => setTimeout(resolve, 120));
}

async function visibleGridRows(grid) {
  return grid.evaluate((element, columnTitles) => {
    const cells = [...element.querySelectorAll('.GridCell')];
    const header = title => cells.find(cell => cell.style.top === '0px' && cell.title === title);
    const headerCells = new Set(columnTitles.map(header).filter(Boolean));
    const columns = Object.fromEntries(columnTitles.map(title => [
      title,
      Number.parseFloat(header(title)?.style.left),
    ]));
    const bookingLeft = columns['Booking Id'];
    const rowMap = new Map();
    for (const cell of cells) {
      const top = Number.parseFloat(cell.style.top);
      const left = Number.parseFloat(cell.style.left);
      if (headerCells.has(cell) || !Number.isFinite(top) || left !== bookingLeft) continue;
      rowMap.set(String(top), {
        top,
        bookingRaw: String(cell.title || cell.textContent || '').trim(),
        values: {},
      });
    }
    for (const cell of cells) {
      if (headerCells.has(cell)) continue;
      const top = Number.parseFloat(cell.style.top);
      const row = rowMap.get(String(top));
      if (!row) continue;
      const left = Number.parseFloat(cell.style.left);
      for (const title of columnTitles) {
        if (left === columns[title]) {
          row.values[title] = String(cell.title || cell.textContent || '').trim();
        }
      }
    }
    return [...rowMap.values()].map(row => ({
      ...row,
      activity: row.values['Activity'] || '',
    }));
  }, GRID_COLUMNS);
}

async function ensureLiveRow(grid, row) {
  const targetBooking = normalizeBooking(row.bookingRaw);
  const targetActivity = normalized(row.activity);
  const offsets = [row.scrollOffset, Math.max(0, row.scrollOffset - 80), row.scrollOffset + 80]
    .filter((value, index, list) => Number.isFinite(value) && list.indexOf(value) === index);

  for (const offset of offsets) {
    await scrollGridTo(grid, offset);
    const matches = (await visibleGridRows(grid)).filter(candidate =>
      normalizeBooking(candidate.bookingRaw) === targetBooking
      && normalized(candidate.activity) === targetActivity);
    if (matches.length === 1) return { ...matches[0], scrollOffset: offset };
  }
  throw new Error(`Booking ${row.bookingRaw} ${row.activity} row is not currently addressable in the virtual grid`);
}

export async function boundCellHandle(grid, row, columnTitle) {
  // TripSpark virtualizes and recycles grid nodes. A CSS locator based only on
  // top/left coordinates can therefore re-resolve to a stale clone or another
  // row after the editor closes. Resolve the exact Booking ID + Activity +
  // column in one browser-context operation and retain that exact DOM node as
  // an ElementHandle for the immediate read or double-click.
  let lastDetails = null;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    let liveRow;
    try {
      liveRow = await ensureLiveRow(grid, row);
    } catch (error) {
      lastDetails = { error: 'transient_virtual_row', message: error?.message };
      await grid.page().waitForTimeout(80 + (attempt * 40));
      continue;
    }
    const handle = await grid.evaluateHandle((element, criteria) => {
    const normalize = value => String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
    const normalizeBookingValue = value => String(value ?? '')
      .trim().replace(/\s+/g, '').replace(/^TRIP-/i, '').toLowerCase();
    const cells = [...element.querySelectorAll('.GridCell')];
    const header = title => cells.find(cell => cell.style.top === '0px' && cell.title === title);
    const headerCells = new Set(criteria.columnTitles.map(header).filter(Boolean));
    const bookingLeft = Number.parseFloat(header('Booking Id')?.style.left);
    const activityLeft = Number.parseFloat(header('Activity')?.style.left);
    const targetLeft = Number.parseFloat(header(criteria.columnTitle)?.style.left);
    if (![bookingLeft, activityLeft, targetLeft].every(Number.isFinite)) {
      return {
        error: 'missing_column',
        columnTitle: criteria.columnTitle,
      };
    }

    const visibleDataCells = cells.filter(cell => {
      if (headerCells.has(cell) || !cell.isConnected) return false;
      const rect = cell.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
    const matchingRows = visibleDataCells
      .filter(cell =>
        Number.parseFloat(cell.style.left) === bookingLeft
        && normalizeBookingValue(cell.title || cell.textContent) === criteria.bookingId)
      .filter(bookingCell => {
        const top = Number.parseFloat(bookingCell.style.top);
        return visibleDataCells.some(cell =>
          Number.parseFloat(cell.style.top) === top
          && Number.parseFloat(cell.style.left) === activityLeft
          && normalize(cell.title || cell.textContent) === criteria.activity);
      });
    if (matchingRows.length !== 1) {
      return {
        error: 'ambiguous_row',
        bookingId: criteria.bookingId,
        activity: criteria.activity,
        matchCount: matchingRows.length,
      };
    }

    const top = Number.parseFloat(matchingRows[0].style.top);
    const targetCells = visibleDataCells.filter(cell =>
      Number.parseFloat(cell.style.top) === top
      && Number.parseFloat(cell.style.left) === targetLeft);
    if (targetCells.length !== 1) {
      return {
        error: 'ambiguous_cell',
        bookingId: criteria.bookingId,
        activity: criteria.activity,
        columnTitle: criteria.columnTitle,
        matchCount: targetCells.length,
      };
    }
    return targetCells[0];
    }, {
      bookingId: normalizeBooking(liveRow.bookingRaw),
      activity: normalized(liveRow.activity),
      columnTitle,
      columnTitles: GRID_COLUMNS,
    });
    const cell = handle.asElement();
    if (cell) return cell;
    lastDetails = await handle.jsonValue().catch(() => null);
    await handle.dispose().catch(() => {});
    if (lastDetails?.error === 'missing_column') break;
    // TripSpark recycles the row immediately after a list selection or Tab.
    // Rebind semantically after the render settles instead of treating that
    // transient zero-match frame as a failed write and rolling the trip back.
    await grid.page().waitForTimeout(80 + (attempt * 40));
  }
  throw new Error(
    `Exact cell binding failed for Booking ${row.bookingRaw} ${row.activity} ${columnTitle}`
    + `${lastDetails?.error ? ` (${lastDetails.error}, matches=${lastDetails.matchCount ?? 'n/a'})` : ''}`,
  );
}

const normalized = value => String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
export const findUniqueExactOption = (options, target) => {
  const matches = [...new Set((options || []).map(option => String(option).trim()).filter(Boolean))]
    .filter(option => normalized(option) === normalized(target));
  return matches.length === 1 ? matches[0] : null;
};
const normalizedTime = value => {
  const match = String(value ?? '').trim().match(/(\d{1,2}):(\d{2})/);
  return match ? `${match[1].padStart(2, '0')}:${match[2]}` : normalized(value);
};
const normalizedNumber = value => String(value ?? '').replace(/[^\d.-]/g, '');
const EDITABLE_COLUMNS = [
  'Driver', 'Vehicle', 'Arrival Time', 'Departure Time',
  'Mileage/Odometer', 'Signature Captured?',
];

async function captureVisibleEditableSnapshot(grid) {
  const rows = await visibleGridRows(grid);
  return new Map(rows.map(row => [
    `${normalizeBooking(row.bookingRaw)}|${normalized(row.activity)}`,
    {
      bookingRaw: row.bookingRaw,
      activity: row.activity,
      values: Object.fromEntries(EDITABLE_COLUMNS.map(column => [
        column,
        String(row.values?.[column] ?? '').trim(),
      ])),
    },
  ]));
}

async function assertNoCrossBookingMutation(grid, before, allowedBookingId) {
  const after = await captureVisibleEditableSnapshot(grid);
  const allowed = normalizeBooking(allowedBookingId);
  const unexpected = [];
  for (const [key, prior] of before) {
    if (normalizeBooking(prior.bookingRaw) === allowed || !after.has(key)) continue;
    const current = after.get(key);
    for (const column of EDITABLE_COLUMNS) {
      if (equalCellValue(column, current.values[column], prior.values[column])) continue;
      unexpected.push(
        `${prior.bookingRaw} ${prior.activity} ${column}: `
        + `"${prior.values[column]}" -> "${current.values[column]}"`,
      );
    }
  }
  if (unexpected.length) {
    const error = new Error(
      `Cross-booking mutation detected while staging Booking ${allowedBookingId}: `
      + unexpected.slice(0, 5).join('; '),
    );
    error.welltransCrossBookingMutation = true;
    throw error;
  }
}

function equalCellValue(column, actual, expected) {
  if (column === 'Arrival Time' || column === 'Departure Time') {
    return normalizedTime(actual) === normalizedTime(expected);
  }
  if (column === 'Mileage/Odometer') {
    const actualNumber = Number(normalizedNumber(actual));
    const expectedNumber = Number(normalizedNumber(expected));
    return Number.isFinite(actualNumber) && Number.isFinite(expectedNumber)
      && Math.abs(actualNumber - expectedNumber) < 0.001;
  }
  if (column === 'Signature Captured') return Boolean(actual) === Boolean(expected);
  return normalized(actual) === normalized(expected);
}

async function openListDropdown(page) {
  // A direct TripSpark dropdown can be visible before its lazy options have
  // rendered. Treat the visible dialog itself as open; clicking the listbox
  // button again at that point toggles it closed and produces a false
  // "Dropdown was empty" failure.
  const openDialog = page.locator('.DropDownDialog:visible').last();
  if (await openDialog.count()) {
    await waitForListDropdownOptions(page);
    return true;
  }
  const listbox = page.locator('.EditorWidgets core\\:listbox:visible').last();
  if (!await listbox.count()) return false;
  const dropBtn = listbox.locator('.dropdlgbutton');
  if (await dropBtn.count()) {
    await dropBtn.click({ force: true });
  } else {
    await listbox.click({ force: true });
  }
  await waitForListDropdownOptions(page);
  return true;
}

async function dismissActiveEditor(page) {
  const activeEditor = page.locator(
    '.EditorWidgets input:not([style*="z-index: -1"]):visible, '
    + '.EditorWidgets select:visible, .EditorWidgets textarea:visible, '
    + '.EditorWidgets core\\:listbox:visible, .DropDownDialog:visible',
  );
  for (let attempt = 0; attempt < 3 && await activeEditor.count(); attempt += 1) {
    await page.keyboard.press('Escape').catch(() => {});
    await settleUi(page, 100, 20);
  }
}

async function waitForEditorSurface(page, timeoutMs = 1500) {
  const selector = [
    '.EditorWidgets input:not([style*="z-index: -1"]):visible',
    '.EditorWidgets select:visible',
    '.EditorWidgets textarea:visible',
    '.EditorWidgets core\\:listbox:visible',
    '.DropDownDialog:visible',
  ].join(', ');
  const surface = page.locator(selector).last();
  await surface.waitFor({ state: 'visible', timeout: timeoutMs }).catch(() => {});
  return surface.count();
}

async function getListDropdownOptions(page, { strict = false } = {}) {
  const optionTexts = await page.evaluate(({ strictOnly }) => {
    const results = [];
    const dialogSelectors = [
      '.DropDownDialog',
      '[class*="DropDown"]',
      '[class*="dropdown"]',
    ];
    for (const sel of dialogSelectors) {
      for (const dialog of document.querySelectorAll(sel)) {
        if (dialog.offsetParent === null && !dialog.classList.contains('visible')) continue;
        const rect = dialog.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        const optionEls = dialog.querySelectorAll('[role="option"], core\\:listitem, .ListBoxItem');
        for (const el of optionEls) {
          const text = String(el.textContent || el.getAttribute('title') || '').trim();
          if (text) results.push(text);
        }
      }
    }
    const widgetSelectors = [
      '.EditorWidgets [role="option"]',
      '.EditorWidgets core\\:listitem',
      '.EditorWidgets .ListBoxItem',
    ];
    for (const sel of widgetSelectors) {
      for (const el of document.querySelectorAll(sel)) {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        const text = String(el.textContent || el.getAttribute('title') || '').trim();
        if (text) results.push(text);
      }
    }
    if (strictOnly) return [...new Set(results)];

    // TripSpark releases have used several unlabelled custom elements for
    // dropdown rows. Inspect visible leaf text inside the active editor and
    // dropdown overlays, without ever relying on keyboard position.
    const roots = [
      ...document.querySelectorAll('.EditorWidgets, .DropDownDialog, [class*="DropDown"], [class*="dropdown"]'),
    ].filter(root => {
      const rect = root.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
    for (const root of roots) {
      for (const el of [root, ...root.querySelectorAll('*')]) {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        const text = String(el.textContent || el.getAttribute('title') || '').trim().replace(/\s+/g, ' ');
        if (!text || text.length > 120) continue;
        const childRepeatsText = [...el.children].some(child =>
          String(child.textContent || child.getAttribute('title') || '').trim().replace(/\s+/g, ' ') === text);
        if (!childRepeatsText) results.push(text);
      }
    }
    return [...new Set(results)];
  }, { strictOnly: strict });
  return optionTexts;
}

async function waitForListDropdownOptions(page, options = {}) {
  let values = [];
  const attempts = TURBO_MODE ? 60 : 20;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    values = await getListDropdownOptions(page, options);
    if (values.length) return values;
    await settleUi(page, 250, 40);
  }
  return values;
}

async function filterListDropdown(page, optionText) {
  const filter = page.locator(
    '.DropDownDialog input:visible, .EditorWidgets core\\:listbox:visible input:visible',
  ).last();
  if (!await filter.count()) return [];
  await filter.click({ force: true });
  await filter.fill('');
  await filter.fill(String(optionText));
  return waitForListDropdownOptions(page);
}

async function clickListOption(page, optionText) {
  const optionStr = String(optionText).trim();
  const textMatches = page.getByText(optionStr, { exact: true });
  const pointerCandidates = [];
  const textMatchCount = Math.min(await textMatches.count().catch(() => 0), 100);
  for (let index = 0; index < textMatchCount; index += 1) {
    const candidate = textMatches.nth(index);
    if (!await candidate.isVisible().catch(() => false)) continue;
    const belongsToActiveDropdown = await candidate.evaluate(element =>
      Boolean(element.closest(
        '.EditorWidgets, .DropDownDialog, [class*="DropDown"], [class*="dropdown"]',
      ))).catch(() => false);
    if (!belongsToActiveDropdown) continue;
    // Click the semantic option container. Clicking only its nested text span
    // can highlight a row without notifying TripSpark's list controller.
    const optionContainer = candidate.locator(
      'xpath=ancestor-or-self::*[@role="option" or local-name()="listitem" '
      + 'or contains(concat(" ", normalize-space(@class), " "), " ListBoxItem ")]',
    ).first();
    const clickTarget = await optionContainer.count() ? optionContainer : candidate;
    const box = await clickTarget.boundingBox().catch(() => null);
    if (box) pointerCandidates.push({ candidate: clickTarget, area: box.width * box.height });
  }
  pointerCandidates.sort((left, right) => left.area - right.area);
  if (pointerCandidates.length) {
    // Use Playwright's trusted pointer sequence. TripSpark's custom list
    // controller ignores HTMLElement.click() for some listbox releases.
    await pointerCandidates[0].candidate.click({ force: true });
    await settleUi(page, 200);
    return true;
  }

  const clicked = await page.evaluate((target) => {
    const normalizedTarget = target.trim().replace(/\s+/g, ' ').toLowerCase();
    const dialogSelectors = [
      '.DropDownDialog',
      '[class*="DropDown"]',
      '[class*="dropdown"]',
    ];
    for (const sel of dialogSelectors) {
      for (const dialog of document.querySelectorAll(sel)) {
        const rect = dialog.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        const optionEls = dialog.querySelectorAll('[role="option"], core\\:listitem, .ListBoxItem, [title]');
        for (const el of optionEls) {
          const text = String(el.textContent || el.getAttribute('title') || '').trim();
          if (text === target) {
            el.click();
            return true;
          }
        }
      }
    }
    const widgetSelectors = [
      '.EditorWidgets [role="option"]',
      '.EditorWidgets core\\:listitem',
      '.EditorWidgets .ListBoxItem',
    ];
    for (const sel of widgetSelectors) {
      for (const el of document.querySelectorAll(sel)) {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        const text = String(el.textContent || el.getAttribute('title') || '').trim();
        if (text === target) {
          el.click();
          return true;
        }
      }
    }

    const roots = [
      ...document.querySelectorAll('.EditorWidgets, .DropDownDialog, [class*="DropDown"], [class*="dropdown"]'),
    ].filter(root => {
      const rect = root.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
    const candidates = [];
    for (const root of roots) {
      for (const el of [root, ...root.querySelectorAll('*')]) {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        const text = String(el.textContent || el.getAttribute('title') || '')
          .trim().replace(/\s+/g, ' ').toLowerCase();
        if (text !== normalizedTarget) continue;
        const childRepeatsText = [...el.children].some(child =>
          String(child.textContent || child.getAttribute('title') || '')
            .trim().replace(/\s+/g, ' ').toLowerCase() === normalizedTarget);
        if (!childRepeatsText) candidates.push({ el, area: rect.width * rect.height });
      }
    }
    candidates.sort((left, right) => left.area - right.area);
    if (candidates.length) {
      candidates[0].el.click();
      return true;
    }
    return false;
  }, optionStr);
  return clicked;
}

async function selectListOption(page, option, column) {
  const optionStr = String(option).trim();
  if (!optionStr) return;

  let availableOptions = await waitForListDropdownOptions(page);

  const clicked = await clickListOption(page, optionStr);
  if (clicked) {
    await settleUi(page, 200);
    return;
  }

  // Some TripSpark listboxes populate only after their internal search input
  // receives text. Filtering is safe because the worker still requires a
  // semantic, unique, normalized-exact option and performs a pointer click;
  // the typed value itself is never committed.
  const filteredOptions = await filterListDropdown(page, optionStr);
  if (filteredOptions.length) {
    const exactFiltered = findUniqueExactOption(filteredOptions, optionStr);
    if (exactFiltered && await clickListOption(page, exactFiltered)) {
      await settleUi(page, 200);
      return;
    }
    availableOptions = [...new Set([...availableOptions, ...filteredOptions])];
  }

  if (column === 'Vehicle' || column === 'Driver' || column === 'Signature Captured?') {
    throw new Error(`${column} option "${optionStr}" was not found in dropdown.`
      + `${availableOptions.length ? ` Available: ${availableOptions.slice(0, 20).join(', ')}` : ' Dropdown may be empty.'}`);
  }

  const normalizedTarget = normalized(optionStr);
  const partialMatch = availableOptions.find(opt => normalized(opt).includes(normalizedTarget));
  if (partialMatch) {
    const clickedPartial = await clickListOption(page, partialMatch);
    if (clickedPartial) {
      await settleUi(page, 200);
      return;
    }
  }

  throw new Error(`Option "${optionStr}" was not found in dropdown.`
    + `${availableOptions.length ? ` Available: ${availableOptions.slice(0, 20).join(', ')}` : ' Dropdown may be empty.'}`);
}

async function setTextCell(page, grid, row, column, value, required = false, { allowEmpty = false } = {}) {
  if (value === undefined || value === null || (value === '' && !allowEmpty)) {
    if (required) throw new Error(`${column} is required for ${row.activity}`);
    return false;
  }
  const current = await readCellValue(grid, row, column);
  if (equalCellValue(column, current, value)) return true;

  let lastObserved = current;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await dismissActiveEditor(page);
    const cell = await boundCellHandle(grid, row, column);
    try {
      await cell.dblclick({ force: true });
    } finally {
      await cell.dispose().catch(() => {});
    }
    await waitForEditorSurface(page);

    const editor = page.locator('.EditorWidgets input:not([style*="z-index: -1"]):visible').last();
    const listbox = page.locator('.EditorWidgets core\\:listbox:visible').last();

    const directDialog = page.locator('.DropDownDialog:visible core\\:listitem:visible');
    if (await editor.count()) {
      await editor.click();
      const target = String(value);
      if (attempt === 0) {
        await editor.fill('');
        await settleUi(page, 50, 15);
        await editor.fill(target);
      } else {
        await page.keyboard.press('Control+A');
        await page.keyboard.press('Backspace');
        const typedTarget = attempt === 2 && ['Arrival Time', 'Departure Time'].includes(column)
          ? target.replace(/[^\d]/g, '')
          : target;
        await page.keyboard.type(typedTarget, { delay: attempt === 2 ? 35 : 15 });
      }
      await settleUi(page, 150);
      if (attempt === 2) await page.keyboard.press('Enter').catch(() => {});
      await page.keyboard.press('Tab').catch(() => {});
      await settleUi(page, 200);
      await dismissActiveEditor(page);
      lastObserved = await readCellValue(grid, row, column);
      if (equalCellValue(column, lastObserved, value)) return true;
      await settleUi(page, 180, 60);
      continue;
    }

    if (await listbox.count() || await directDialog.count()) {
      await openListDropdown(page);
      try {
        await selectListOption(page, value, column);
        await page.keyboard.press('Tab');
        await settleUi(page, 200);
        await dismissActiveEditor(page);
        return true;
      } catch (error) {
        await page.keyboard.press('Escape').catch(() => {});
        await settleUi(page, 100, 20);
        if (column !== 'Vehicle') throw error;
        return false;
      }
    }

    await page.keyboard.press('Escape').catch(() => {});
    await settleUi(page, 150);
  }
  if (column === 'Vehicle') return false;
  throw new Error(
    `${column} did not commit for ${row.activity}: expected "${value}", found "${lastObserved}"`,
  );
}

async function setListCell(page, grid, row, column, option) {
  if (option === undefined || option === null || option === '') return;

  const current = await readCellValue(grid, row, column);
  if (equalCellValue(column, current, option)) return;

  let selected = '';
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await dismissActiveEditor(page);
    const cell = await boundCellHandle(grid, row, column);
    try {
      await cell.dblclick({ force: true });
    } finally {
      await cell.dispose().catch(() => {});
    }
    await waitForEditorSurface(page, 2500);

    const listbox = page.locator('.EditorWidgets core\\:listbox:visible');
    const directDialog = page.locator(
      '.DropDownDialog:visible core\\:listitem:visible, '
      + '.DropDownDialog:visible [role="option"]:visible, '
      + '.DropDownDialog:visible .ListBoxItem:visible',
    );
    if (!await listbox.count() && !await directDialog.count()) {
      await page.keyboard.press('Escape').catch(() => {});
      if (attempt < 2) {
        await settleUi(page, 250, 80);
        continue;
      }
      throw new Error(`${column} listbox did not open for ${row.activity}`);
    }

    await openListDropdown(page);
    try {
      await selectListOption(page, option, column);
    } catch (error) {
      await page.keyboard.press('Escape').catch(() => {});
      await settleUi(page, 180 + (attempt * 80), 60);
      if (attempt < 2) continue;
      throw error;
    }
    await settleUi(page, 250, 80);
    selected = await readCellValue(grid, row, column);
    if (equalCellValue(column, selected, option)) {
      await dismissActiveEditor(page);
      return;
    }
    // Some portal releases commit only when focus leaves the list editor.
    await page.keyboard.press('Tab').catch(() => {});
    await settleUi(page, 300, 100);
    selected = await readCellValue(grid, row, column);
    if (equalCellValue(column, selected, option)) {
      await dismissActiveEditor(page);
      return;
    }
    await page.keyboard.press('Escape').catch(() => {});
    await settleUi(page, 180, 60);
  }
  throw new Error(
    `${column} selection not confirmed after 3 exact-option attempts: `
    + `expected "${option}", found "${selected}"`,
  );
}

const safePreflightError = error => {
  error.welltransSafeToContinue = true;
  error.welltransMutationStarted = false;
  return error;
};

// Editor capabilities are a property of the opened TripSpark schedule/grid,
// not an individual booking row. Prove each text column once and each exact
// list option once per review session. This removes thousands of pointless
// preflight double-clicks while keeping exact-option and fail-closed safety.
const capabilityKey = (_row, column, value, kind) =>
  `${kind}|${normalized(column)}|${kind === 'list' ? normalized(value) : '*'}`;

export const resolveCapabilityTarget = (kind, cached, authoritativeValue) =>
  kind === 'list' ? (cached?.target ?? authoritativeValue) : authoritativeValue;

async function preflightCell(page, grid, row, column, value, {
  required = false,
  optionalExactList = false,
  probeAttempt = 0,
} = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw safePreflightError(new Error(`${column} is required for ${row.activity}`));
    return { skip: true, row, column, reason: 'no_source_value' };
  }

  const original = await readCellValue(grid, row, column);
  if (equalCellValue(column, original, value)) {
    return {
      row, column, original, target: value, kind: 'unchanged', needsWrite: false,
    };
  }
  const readOnlyState = normalized(row.values?.['Is Read Only']);
  if (['true', 'yes', 'checked', '1', 'on'].includes(readOnlyState)) {
    throw safePreflightError(new Error(
      `Booking ${row.bookingRaw} ${row.activity} is read-only in WellTrans`,
    ));
  }

  const expectedKind = ['Driver', 'Vehicle', 'Signature Captured?'].includes(column)
    ? 'list'
    : 'text';
  const cached = provenEditorCapabilities.get(capabilityKey(row, column, value, expectedKind));
  if (cached) {
    if (cached.skip) {
      return {
        skip: true,
        row,
        column,
        original,
        reason: cached.reason,
        availableOptions: cached.availableOptions || [],
        capabilityCacheHit: true,
      };
    }
    return {
      row,
      column,
      original,
      // Text editor capability is reusable, but transportation data is not.
      // Every time/odometer target must always come from this trip's current
      // authoritative payload. Exact list options may reuse their proven
      // normalized portal option because the value is part of the cache key.
      target: resolveCapabilityTarget(expectedKind, cached, value),
      kind: expectedKind,
      needsWrite: true,
      optionalExactList,
      capabilityCacheHit: true,
    };
  }

  await dismissActiveEditor(page);
  const cell = await boundCellHandle(grid, row, column).catch(error => {
    throw safePreflightError(error);
  });
  try {
    await cell.dblclick({ force: true });
  } finally {
    await cell.dispose().catch(() => {});
  }
  await waitForEditorSurface(page);
  const editor = page.locator('.EditorWidgets input:not([style*="z-index: -1"]):visible').last();
  const listbox = page.locator('.EditorWidgets core\\:listbox:visible').last();

  const directDialog = page.locator('.DropDownDialog:visible core\\:listitem:visible');
  if (expectedKind === 'text' && await editor.count()) {
    await dismissActiveEditor(page);
    provenEditorCapabilities.set(capabilityKey(row, column, value, 'text'), {
      target: value,
      provenAt: Date.now(),
    });
    return {
      row, column, original, target: value, kind: 'text', needsWrite: true,
    };
  }

  if (await listbox.count() || await directDialog.count()) {
    await openListDropdown(page);
    // Vehicle is deliberately stricter than the other list fields. An input
    // value or editor container must never be mistaken for a real option.
    let options = await waitForListDropdownOptions(page, { strict: optionalExactList });
    let exactMatch = findUniqueExactOption(options, value);
    if (!exactMatch && !optionalExactList) {
      const filteredOptions = await filterListDropdown(page, value);
      options = [...new Set([...options, ...filteredOptions])];
      exactMatch = findUniqueExactOption(options, value);
    }
    await dismissActiveEditor(page);

    if (!exactMatch) {
      if (optionalExactList) {
        provenEditorCapabilities.set(capabilityKey(row, column, value, 'list'), {
          skip: true,
          reason: 'no_unique_exact_match',
          availableOptions: options.slice(0, 20),
          provenAt: Date.now(),
        });
        return {
          skip: true, row, column, original, reason: 'no_unique_exact_match',
          availableOptions: options.slice(0, 20),
        };
      }
      if (probeAttempt < 2) {
        await settleUi(page, 180 + (probeAttempt * 100), 60);
        return preflightCell(page, grid, row, column, value, {
          required,
          optionalExactList,
          probeAttempt: probeAttempt + 1,
        });
      }
      throw safePreflightError(new Error(
        `${column} requires one unique exact WellTrans option for "${value}".`
        + `${options.length ? ` Available: ${options.slice(0, 20).join(', ')}` : ' Dropdown was empty.'}`,
      ));
    }
    provenEditorCapabilities.set(capabilityKey(row, column, value, 'list'), {
      target: exactMatch,
      provenAt: Date.now(),
    });
    return {
      row, column, original, target: exactMatch, kind: 'list', needsWrite: true,
      optionalExactList,
    };
  }

  if (await editor.count()) {
    await dismissActiveEditor(page);
    if (column === 'Driver' || column === 'Vehicle' || column === 'Signature Captured?') {
      if (optionalExactList) {
        return { skip: true, row, column, original, reason: 'exact_list_unavailable' };
      }
      if (probeAttempt < 2) {
        await settleUi(page, 180 + (probeAttempt * 100), 60);
        return preflightCell(page, grid, row, column, value, {
          required,
          optionalExactList,
          probeAttempt: probeAttempt + 1,
        });
      }
      throw safePreflightError(new Error(`${column} exact-option editor was unavailable for ${row.activity}`));
    }
    provenEditorCapabilities.set(capabilityKey(row, column, value, 'text'), {
      target: value,
      provenAt: Date.now(),
    });
    return {
      row, column, original, target: value, kind: 'text', needsWrite: true,
    };
  }

  await page.keyboard.press('Escape').catch(() => {});
  await settleUi(page, 100, 20);
  throw safePreflightError(new Error(`${column} editor did not open for ${row.activity}`));
}

async function restorePlanEntry(page, grid, entry) {
  if (!entry.needsWrite) return;
  const current = await readCellValue(grid, entry.row, entry.column);
  if (equalCellValue(entry.column, current, entry.original)) return;
  if (entry.kind === 'list') {
    if (entry.original) {
      await setListCell(page, grid, entry.row, entry.column, entry.original);
    } else {
      await dismissActiveEditor(page);
      const cell = await boundCellHandle(grid, entry.row, entry.column);
      try {
        await cell.dblclick({ force: true });
      } finally {
        await cell.dispose().catch(() => {});
      }
      await page.waitForTimeout(250);
      const editor = page.locator('.EditorWidgets input:not([style*="z-index: -1"]):visible').last();
      if (await editor.count()) {
        await editor.click();
        await editor.fill('');
      } else {
        await page.keyboard.press('Delete');
      }
      await page.keyboard.press('Tab');
      await page.waitForTimeout(250);
    }
  } else {
    await setTextCell(page, grid, entry.row, entry.column, entry.original, false, { allowEmpty: true });
  }
  const restored = await readCellValue(grid, entry.row, entry.column);
  if (!equalCellValue(entry.column, restored, entry.original)) {
    throw new Error(
      `${entry.row.activity} ${entry.column} rollback expected "${entry.original}", found "${restored}"`,
    );
  }
}

async function rollbackAttemptedEntries(page, grid, attempted) {
  const errors = [];
  for (const entry of [...attempted].reverse()) {
    try {
      await restorePlanEntry(page, grid, entry);
    } catch (error) {
      errors.push(String(error?.message || error));
    }
  }
  return { verified: errors.length === 0, errors };
}

async function readCellValue(grid, row, column) {
  const cell = await boundCellHandle(grid, row, column);
  try {
    if (column === 'Signature Captured') {
      return await cell.evaluate(element => {
      const nodes = [element, ...element.querySelectorAll('*')];
      for (const node of nodes) {
        if (node instanceof HTMLInputElement && node.type === 'checkbox' && node.checked) return true;
        if (String(node.getAttribute('aria-checked') || '').toLowerCase() === 'true') return true;
        const state = [
          node.getAttribute('checked'),
          node.getAttribute('data-checked'),
          node.getAttribute('data-value'),
          node.getAttribute('value'),
          node.getAttribute('state'),
        ].filter(Boolean).join(' ').toLowerCase();
        if (/^(true|checked|yes|1|on)$/.test(state)) return true;
        const className = String(node.className || '').toLowerCase();
        if (/(check|tick)/.test(className) && /(checked|selected|active|true|on)/.test(className)) return true;
        const text = String(node.title || node.textContent || '').trim().toLowerCase();
        if (['true', 'yes', 'checked', 'captured', '1', '✓', '✔', '☑'].includes(text)) return true;
        for (const pseudo of [null, '::before', '::after']) {
          const content = String(getComputedStyle(node, pseudo).content || '').replace(/^["']|["']$/g, '');
          if (/[✓✔☑]/.test(content)) return true;
        }
      }
      return false;
      });
    }
    return await cell.evaluate(element => String(element.title || element.textContent || '').trim());
  } finally {
    await cell.dispose().catch(() => {});
  }
}

export async function validateWellTransTrip(page, payload) {
  const selectedDate = await getSelectedPortalDate(page);
  if (selectedDate !== payload.serviceDate) {
    throw new Error(`WellTrans schedule ${selectedDate || 'unknown'} does not match trip service date ${payload.serviceDate}`);
  }
  const grid = await openEditItinerary(page);
  const model = await gridModel(grid, payload.bookingId);
  const pickup = model.rows.filter(row => ACTIVITY_PICKUP.test(row.activity));
  const dropoff = model.rows.filter(row => ACTIVITY_DROPOFF.test(row.activity));
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(100);
  if (pickup.length !== 1 || dropoff.length !== 1) {
    throw new Error(`Booking ${payload.bookingId} matched ${pickup.length} Pickup and ${dropoff.length} Dropoff rows; expected exactly one of each`);
  }
  return { selectedDate, pickupRows: pickup.length, dropoffRows: dropoff.length };
}

export async function auditWellTransTrip(
  page,
  payload,
  { verifyVehicle = true, gridIndex = null } = {},
) {
  const selectedDate = await getSelectedPortalDate(page);
  if (selectedDate !== payload.serviceDate) {
    return {
      verified: false,
      selectedDate,
      mismatches: [
        `WellTrans schedule ${selectedDate || 'unknown'} does not match trip service date ${payload.serviceDate}`,
      ],
    };
  }

  const grid = await openEditItinerary(page);
  const model = indexedGridModel(gridIndex, payload.bookingId)
    || await gridModel(grid, payload.bookingId);
  const pickupRows = model.rows.filter(row => ACTIVITY_PICKUP.test(row.activity));
  const dropoffRows = model.rows.filter(row => ACTIVITY_DROPOFF.test(row.activity));
  if (pickupRows.length !== 1 || dropoffRows.length !== 1) {
    await dismissActiveEditor(page);
    return {
      verified: false,
      selectedDate,
      mismatches: [
        `Booking ${payload.bookingId} matched ${pickupRows.length} Pickup and ${dropoffRows.length} Dropoff rows; expected exactly one of each`,
      ],
    };
  }

  const pickup = pickupRows[0];
  const dropoff = dropoffRows[0];
  const expected = [
    [pickup, 'Driver', payload.driver],
    [pickup, 'Arrival Time', payload.pickup.arrival],
    [pickup, 'Departure Time', payload.pickup.departure],
    [pickup, 'Mileage/Odometer', payload.pickup.mileage ?? 0],
    [dropoff, 'Driver', payload.driver],
    [dropoff, 'Arrival Time', payload.dropoff.arrival],
    [dropoff, 'Departure Time', payload.dropoff.departure],
    [dropoff, 'Mileage/Odometer', payload.dropoff.mileage],
  ];
  if (verifyVehicle && payload.vehicle) {
    expected.push(
      [pickup, 'Vehicle', payload.vehicle],
      [dropoff, 'Vehicle', payload.vehicle],
    );
  }
  if (payload.dropoff.signatureCaptured) {
    expected.push(
      [pickup, 'Signature Captured?', 'Rider Signature Received'],
      [dropoff, 'Signature Captured?', 'Rider Signature Received'],
      [pickup, 'Signature Captured', true],
      [dropoff, 'Signature Captured', true],
    );
  }

  const mismatches = [];
  const observations = [];
  const verifiedFields = [];
  for (const [row, column, target] of expected) {
    const actual = await readCellValue(grid, row, column);
    if (column === 'Signature Captured' && target === true && actual === false) {
      // TripSpark renders this derived indicator as different sprites across
      // releases and may not expose a checked DOM state until Apply. The
      // editable reason is the deterministic source-of-truth. Accept the
      // indicator only when that exact reason reads back successfully.
      const reason = await readCellValue(grid, row, 'Signature Captured?');
      if (equalCellValue('Signature Captured?', reason, 'Rider Signature Received')) {
        observations.push({
          row: normalized(row.activity), column,
          expected: true, actual: true, matched: true, derivedFrom: 'Signature Captured?',
        });
        verifiedFields.push(`${normalized(row.activity)}.Signature Captured (derived)`);
        continue;
      }
    }
    const matched = equalCellValue(column, actual, target);
    observations.push({
      row: normalized(row.activity), column,
      expected: target, actual, matched,
    });
    if (!matched) {
      mismatches.push(
        `${row.activity} ${column}: expected "${target}", found "${actual}"`,
      );
    } else {
      verifiedFields.push(`${normalized(row.activity)}.${column}`);
    }
  }
  await dismissActiveEditor(page);
  return {
    verified: mismatches.length === 0,
    selectedDate,
    bookingId: String(payload.bookingId),
    pickupRows: 1,
    dropoffRows: 1,
    verifiedFields,
    observations,
    mismatches,
  };
}

export async function syncWellTransTrip(page, payload, _fieldMapping = {}, gridIndex = null) {
  const selectedDate = await getSelectedPortalDate(page);
  if (selectedDate !== payload.serviceDate) {
    throw safePreflightError(
      new Error(`WellTrans schedule ${selectedDate || 'unknown'} does not match trip service date ${payload.serviceDate}`),
    );
  }

  const grid = await openEditItinerary(page);
  const model = indexedGridModel(gridIndex, payload.bookingId)
    || await gridModel(grid, payload.bookingId);
  const pickupRows = model.rows.filter(row => ACTIVITY_PICKUP.test(row.activity));
  const dropoffRows = model.rows.filter(row => ACTIVITY_DROPOFF.test(row.activity));
  if (pickupRows.length !== 1 || dropoffRows.length !== 1) {
    await page.keyboard.press('Escape').catch(() => {});
    throw safePreflightError(
      new Error(`Booking ${payload.bookingId} matched ${pickupRows.length} Pickup and ${dropoffRows.length} Dropoff rows; expected exactly one of each`),
    );
  }

  const pickup = pickupRows[0];
  const dropoff = dropoffRows[0];
  const plan = [];
  try {
    // Complete the entire read-only preflight before the first edit. A missing
    // driver, signature option, row, or editor can therefore never leave a
    // partially staged trip.
    // Stage the most portal-specific edit first. If TripSpark changes its
    // signature editor, no driver/time/mileage fields have been touched.
    if (payload.dropoff.signatureCaptured) {
      plan.push(await preflightCell(
        page, grid, pickup, 'Signature Captured?', 'Rider Signature Received', { required: true },
      ));
      plan.push(await preflightCell(
        page, grid, dropoff, 'Signature Captured?', 'Rider Signature Received', { required: true },
      ));
    }
    plan.push(await preflightCell(page, grid, pickup, 'Driver', payload.driver, { required: true }));
    plan.push(await preflightCell(page, grid, pickup, 'Arrival Time', payload.pickup.arrival, { required: true }));
    plan.push(await preflightCell(page, grid, pickup, 'Departure Time', payload.pickup.departure, { required: true }));
    plan.push(await preflightCell(page, grid, pickup, 'Mileage/Odometer', payload.pickup.mileage ?? 0, { required: true }));
    plan.push(await preflightCell(page, grid, dropoff, 'Driver', payload.driver, { required: true }));
    plan.push(await preflightCell(page, grid, dropoff, 'Arrival Time', payload.dropoff.arrival, { required: true }));
    plan.push(await preflightCell(page, grid, dropoff, 'Departure Time', payload.dropoff.departure, { required: true }));
    plan.push(await preflightCell(page, grid, dropoff, 'Mileage/Odometer', payload.dropoff.mileage, { required: true }));
    // Optional vehicle edits are last and require a semantic, unique, exact
    // option. Otherwise WellTrans keeps both vehicle cells unchanged.
    plan.push(await preflightCell(page, grid, pickup, 'Vehicle', payload.vehicle, { optionalExactList: true }));
    plan.push(await preflightCell(page, grid, dropoff, 'Vehicle', payload.vehicle, { optionalExactList: true }));
  } catch (error) {
    await page.keyboard.press('Escape').catch(() => {});
    throw safePreflightError(error);
  }

  // Commit scalar fields first. TripSpark dropdowns are harder to clear during
  // rollback, so a masked time/odometer rejection must be discovered before
  // Driver, Signature, or Vehicle is changed.
  const actionable = plan
    .filter(entry => !entry.skip && entry.needsWrite)
    .sort((left, right) => Number(left.kind === 'list') - Number(right.kind === 'list'));
  const attempted = [];
  let verifiedFields = [];
  try {
    for (const entry of actionable) {
      // Record the attempt before editing because a browser/editor exception
      // can occur after the cell value has already changed.
      attempted.push(entry);
      await ensureLiveRow(grid, entry.row);
      await dismissActiveEditor(page);
      const neighboringRowsBefore = await captureVisibleEditableSnapshot(grid);
      if (entry.kind === 'list') {
        try {
          await setListCell(page, grid, entry.row, entry.column, entry.target);
        } catch (error) {
          if (!entry.optionalExactList) throw error;
          await page.keyboard.press('Escape').catch(() => {});
          await restorePlanEntry(page, grid, entry);
          attempted.pop();
          entry.skip = true;
          entry.needsWrite = false;
          entry.reason = 'portal_rejected_optional_exact_match';
          continue;
        }
      } else {
        await setTextCell(page, grid, entry.row, entry.column, entry.target, true);
      }
      await ensureLiveRow(grid, entry.row);
      await dismissActiveEditor(page);
      await assertNoCrossBookingMutation(
        grid,
        neighboringRowsBefore,
        entry.row.bookingRaw,
      );
      const actual = await readCellValue(grid, entry.row, entry.column);
      if (!equalCellValue(entry.column, actual, entry.target)) {
        throw new Error(
          `${entry.row.activity} ${entry.column}: expected "${entry.target}", found "${actual}"`,
        );
      }
    }

    const expected = plan
      .filter(entry => !entry.skip)
      .map(entry => [entry.row, entry.column, entry.target]);
    await page.waitForTimeout(400);
    const mismatches = [];
    for (const [row, column, value] of expected) {
      const actual = await readCellValue(grid, row, column);
      if (!equalCellValue(column, actual, value)) {
        mismatches.push(`${row.activity} ${column}: expected "${value}", found "${actual}"`);
      }
    }
    if (mismatches.length) {
      throw new Error(`Full-trip verification failed for Booking ${payload.bookingId}: ${mismatches.join('; ')}`);
    }
    verifiedFields = expected.map(([row, column]) => `${normalized(row.activity)}.${column}`);

    // Signature Captured is a read-only indicator derived from the exact
    // Signature Captured? reason. TripSpark versions render its green check as
    // an input, image, pseudo-element, or sprite. Verify the indicator when it
    // is machine-readable; otherwise re-verify the editable source-of-truth.
    if (payload.dropoff.signatureCaptured) {
      const signatureIndicators = await Promise.all([
        readCellValue(grid, pickup, 'Signature Captured'),
        readCellValue(grid, dropoff, 'Signature Captured'),
      ]);
      for (const [index, captured] of signatureIndicators.entries()) {
        if (captured) continue;
        const row = index === 0 ? pickup : dropoff;
        const reason = await readCellValue(grid, row, 'Signature Captured?');
        if (!equalCellValue('Signature Captured?', reason, 'Rider Signature Received')) {
          throw new Error(
            `${row.activity} signature was not confirmed: expected "Rider Signature Received", found "${reason}"`,
          );
        }
      }
    }
  } catch (error) {
    await page.keyboard.press('Escape').catch(() => {});
    const rollback = await rollbackAttemptedEntries(page, grid, attempted);
    error.welltransMutationStarted = attempted.length > 0;
    error.welltransRollbackVerified = rollback.verified;
    error.welltransRollbackErrors = rollback.errors;
    error.welltransSafeToContinue = rollback.verified;
    error.message = `${error.message}. `
      + (rollback.verified
        ? 'All attempted fields were restored to their original WellTrans values.'
        : `Automatic rollback could not be proven (${rollback.errors.join('; ')}). The batch was halted; use Close, not Apply.`);
    throw error;
  }

  return {
    selectedDate, stagedForReview: true, verified: true,
    verification: {
      bookingId: String(payload.bookingId),
      pickupRows: 1,
      dropoffRows: 1,
      requiredFieldCount: verifiedFields.length,
      verifiedFields,
      exactBookingMatch: true,
      manualApplyRequired: true,
    },
    warnings: [
      ...(plan.some(entry => entry.row === pickup && entry.column === 'Vehicle' && entry.skip)
        ? ['Pickup vehicle was left unchanged because no unique exact WellTrans match was found.'] : []),
      ...(plan.some(entry => entry.row === dropoff && entry.column === 'Vehicle' && entry.skip)
        ? ['Dropoff vehicle was left unchanged because no unique exact WellTrans match was found.'] : []),
    ],
  };
}
