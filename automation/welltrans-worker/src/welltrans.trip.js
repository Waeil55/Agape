const GRID_SELECTOR = 'core\\:grid[gridobject="Pass.UI.Grid.TripBrokerEventsGrid"]';
const REQUIRED_COLUMNS = [
  'Booking Id', 'Activity', 'Driver', 'Vehicle', 'Arrival Time',
  'Departure Time', 'Mileage/Odometer', 'Signature Captured?', 'Signature Captured',
];
const GRID_COLUMNS = [...REQUIRED_COLUMNS];

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

async function scrollGridTo(grid, offset) {
  await grid.evaluate((element, scrollOffset) => {
    for (const scroller of element.querySelectorAll('.GridScroller')) {
      scroller.scrollTop = scrollOffset;
      scroller.dispatchEvent(new Event('scroll', { bubbles: true }));
    }
  }, offset);
  await new Promise(resolve => setTimeout(resolve, 200));
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

async function exactCell(grid, top, left, columnTitle) {
  const cells = grid.locator('.GridCell');
  // Resolve the coordinate in one browser-context pass. The former
  // locator-per-cell loop caused hundreds of protocol round-trips for every
  // field on TripSpark's virtual grid.
  const index = await cells.evaluateAll((elements, coordinates) =>
    elements.findIndex(element =>
      Number.parseFloat(element.style.top) === coordinates.top
      && Number.parseFloat(element.style.left) === coordinates.left
      // At top:0, prefer the data-layer cell over the identically positioned
      // header-layer cell for this column.
      && !(coordinates.top === 0 && element.title === coordinates.columnTitle)),
  { top, left, columnTitle });
  return index >= 0 ? cells.nth(index) : null;
}

async function resolveColumnLeft(grid, columnTitle) {
  return grid.evaluate((element, title) => {
    const cells = [...element.querySelectorAll('.GridCell')];
    const header = cells.find(cell => cell.style.top === '0px' && cell.title === title);
    return header ? Number.parseFloat(header.style.left) : null;
  }, columnTitle);
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
  const openDialog = page.locator('.DropDownDialog:visible core\\:listitem:visible');
  if (await openDialog.count()) return true;
  const listbox = page.locator('.EditorWidgets core\\:listbox:visible').last();
  if (!await listbox.count()) return false;
  const dropBtn = listbox.locator('.dropdlgbutton');
  if (await dropBtn.count()) {
    await dropBtn.click({ force: true });
  } else {
    await listbox.click({ force: true });
  }
  await page.waitForTimeout(400);
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
    await page.waitForTimeout(100);
  }
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
  for (let attempt = 0; attempt < 8; attempt += 1) {
    values = await getListDropdownOptions(page, options);
    if (values.length) return values;
    await page.waitForTimeout(250);
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
    const box = await candidate.boundingBox().catch(() => null);
    if (box) pointerCandidates.push({ candidate, area: box.width * box.height });
  }
  pointerCandidates.sort((left, right) => left.area - right.area);
  if (pointerCandidates.length) {
    // Use Playwright's trusted pointer sequence. TripSpark's custom list
    // controller ignores HTMLElement.click() for some listbox releases.
    await pointerCandidates[0].candidate.click({ force: true });
    await page.waitForTimeout(200);
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
    await page.waitForTimeout(200);
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
      await page.waitForTimeout(200);
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
      await page.waitForTimeout(200);
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
  const colLeft = await resolveColumnLeft(grid, column);
  if (colLeft === null) throw new Error(`${column} column not found in grid`);
  const liveRow = await ensureLiveRow(grid, row);
  if (equalCellValue(column, liveRow.values?.[column], value)) return true;

  const cell = await exactCell(grid, liveRow.top, colLeft, column);
  if (!cell) throw new Error(`${column} cell unavailable at row ${row.activity} (top=${liveRow.top})`);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    await dismissActiveEditor(page);
    await cell.dblclick({ force: true });
    await page.waitForTimeout(250);

    const editor = page.locator('.EditorWidgets input:not([style*="z-index: -1"]):visible').last();
    const listbox = page.locator('.EditorWidgets core\\:listbox:visible').last();

    const directDialog = page.locator('.DropDownDialog:visible core\\:listitem:visible');
    if (await listbox.count() || await directDialog.count()) {
      await openListDropdown(page);
      try {
        await selectListOption(page, value, column);
        await page.keyboard.press('Tab');
        await page.waitForTimeout(200);
        await dismissActiveEditor(page);
        return true;
      } catch (error) {
        await page.keyboard.press('Escape').catch(() => {});
        await page.waitForTimeout(100);
        if (column !== 'Vehicle') throw error;
        return false;
      }
    }

    if (await editor.count()) {
      await editor.click();
      await editor.fill('');
      await page.waitForTimeout(50);
      await editor.fill(String(value));
      await page.waitForTimeout(150);
      await page.keyboard.press('Tab');
      await page.waitForTimeout(200);
      await dismissActiveEditor(page);
      return true;
    }

    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(150);
  }
  if (column === 'Vehicle') return false;
  throw new Error(`${column} editor did not open for ${row.activity}`);
}

async function setListCell(page, grid, row, column, option) {
  if (option === undefined || option === null || option === '') return;

  const colLeft = await resolveColumnLeft(grid, column);
  if (colLeft === null) throw new Error(`${column} column not found in grid`);
  const liveRow = await ensureLiveRow(grid, row);
  if (equalCellValue(column, liveRow.values?.[column], option)) return;

  const cell = await exactCell(grid, liveRow.top, colLeft, column);
  if (!cell) throw new Error(`${column} cell unavailable at row ${row.activity}`);

  await dismissActiveEditor(page);
  await cell.dblclick({ force: true });
  await page.waitForTimeout(250);

  const listbox = page.locator('.EditorWidgets core\\:listbox:visible');
  const directDialog = page.locator('.DropDownDialog:visible core\\:listitem:visible');
  if (!await listbox.count() && !await directDialog.count()) {
    throw new Error(`${column} listbox did not open for ${row.activity}`);
  }

  await openListDropdown(page);
  await selectListOption(page, option, column);
  await page.keyboard.press('Tab');
  await page.waitForTimeout(250);

  const selected = await cell.evaluate(element =>
    String(element.title || element.textContent || '').trim());

  if (!equalCellValue(column, selected, option)) {
    throw new Error(`${column} selection not confirmed: expected "${option}", found "${selected}"`);
  }
  await dismissActiveEditor(page);
}

const safePreflightError = error => {
  error.welltransSafeToContinue = true;
  error.welltransMutationStarted = false;
  return error;
};

async function preflightCell(page, grid, row, column, value, {
  required = false,
  optionalExactList = false,
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

  const colLeft = await resolveColumnLeft(grid, column);
  if (colLeft === null) {
    throw safePreflightError(new Error(`${column} column not found in grid`));
  }
  const liveRow = await ensureLiveRow(grid, row);
  const cell = await exactCell(grid, liveRow.top, colLeft, column);
  if (!cell) {
    throw safePreflightError(new Error(`${column} cell unavailable for ${row.activity}`));
  }

  await dismissActiveEditor(page);
  await cell.dblclick({ force: true });
  await page.waitForTimeout(250);
  const editor = page.locator('.EditorWidgets input:not([style*="z-index: -1"]):visible').last();
  const listbox = page.locator('.EditorWidgets core\\:listbox:visible').last();

  const directDialog = page.locator('.DropDownDialog:visible core\\:listitem:visible');
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
        return {
          skip: true, row, column, original, reason: 'no_unique_exact_match',
          availableOptions: options.slice(0, 20),
        };
      }
      throw safePreflightError(new Error(
        `${column} requires one unique exact WellTrans option for "${value}".`
        + `${options.length ? ` Available: ${options.slice(0, 20).join(', ')}` : ' Dropdown was empty.'}`,
      ));
    }
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
      throw safePreflightError(new Error(`${column} exact-option editor was unavailable for ${row.activity}`));
    }
    return {
      row, column, original, target: value, kind: 'text', needsWrite: true,
    };
  }

  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(100);
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
      const colLeft = await resolveColumnLeft(grid, entry.column);
      const liveRow = await ensureLiveRow(grid, entry.row);
      const cell = await exactCell(grid, liveRow.top, colLeft, entry.column);
      if (!cell) throw new Error(`${entry.row.activity} ${entry.column} rollback cell was unavailable`);
      await cell.dblclick({ force: true });
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
  const left = await resolveColumnLeft(grid, column);
  if (left === null) throw new Error(`${column} column not found in grid`);
  const liveRow = await ensureLiveRow(grid, row);
  const cell = await exactCell(grid, liveRow.top, left, column);
  if (!cell) throw new Error(`${column} cell unavailable for ${row.activity}`);
  if (column === 'Signature Captured') {
    return cell.evaluate(element => {
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
  return cell.evaluate(element => String(element.title || element.textContent || '').trim());
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

export async function syncWellTransTrip(page, payload) {
  const selectedDate = await getSelectedPortalDate(page);
  if (selectedDate !== payload.serviceDate) {
    throw safePreflightError(
      new Error(`WellTrans schedule ${selectedDate || 'unknown'} does not match trip service date ${payload.serviceDate}`),
    );
  }

  const grid = await openEditItinerary(page);
  const model = await gridModel(grid, payload.bookingId);
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
    plan.push(await preflightCell(page, grid, dropoff, 'Departure Time', payload.dropoff.departure));
    plan.push(await preflightCell(page, grid, dropoff, 'Mileage/Odometer', payload.dropoff.mileage, { required: true }));
    // Optional vehicle edits are last and require a semantic, unique, exact
    // option. Otherwise WellTrans keeps both vehicle cells unchanged.
    plan.push(await preflightCell(page, grid, pickup, 'Vehicle', payload.vehicle, { optionalExactList: true }));
    plan.push(await preflightCell(page, grid, dropoff, 'Vehicle', payload.vehicle, { optionalExactList: true }));
  } catch (error) {
    await page.keyboard.press('Escape').catch(() => {});
    throw safePreflightError(error);
  }

  const actionable = plan.filter(entry => !entry.skip && entry.needsWrite);
  const attempted = [];
  try {
    for (const entry of actionable) {
      // Record the attempt before editing because a browser/editor exception
      // can occur after the cell value has already changed.
      attempted.push(entry);
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
    warnings: [
      ...(plan.some(entry => entry.row === pickup && entry.column === 'Vehicle' && entry.skip)
        ? ['Pickup vehicle was left unchanged because no unique exact WellTrans match was found.'] : []),
      ...(plan.some(entry => entry.row === dropoff && entry.column === 'Vehicle' && entry.skip)
        ? ['Dropoff vehicle was left unchanged because no unique exact WellTrans match was found.'] : []),
    ],
  };
}
