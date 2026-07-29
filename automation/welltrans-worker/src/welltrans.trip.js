const GRID_SELECTOR = 'core\\:grid[gridobject="Pass.UI.Grid.TripBrokerEventsGrid"]';
const REQUIRED_COLUMNS = [
  'Booking Id', 'Activity', 'Driver', 'Vehicle', 'Arrival Time',
  'Departure Time', 'Mileage/Odometer', 'Signature Captured?',
];

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
  const columnTitles = [
    'Booking Id', 'Activity', 'Driver', 'Vehicle', 'Arrival Time',
    'Departure Time', 'Mileage/Odometer', 'Signature Captured?',
  ];

  const extractAllCells = () => grid.evaluate((element) => {
    const cells = [...element.querySelectorAll('.GridCell')];
    const header = title => cells.find(cell => cell.style.top === '0px' && cell.title === title);
    const left = title => Number.parseFloat(header(title)?.style.left);
    const columns = Object.fromEntries(columnTitles.map(title => [title, left(title)]));
    const bookingLeft = left('Booking Id');
    const activityLeft = left('Activity');
    const rowMap = new Map();
    for (const cell of cells) {
      const cellLeft = Number.parseFloat(cell.style.left);
      const cellTop = Number.parseFloat(cell.style.top);
      if (cellTop === 0 || !Number.isFinite(cellTop)) continue;
      const raw = String(cell.title || cell.textContent || '').trim();
      if (cellLeft === bookingLeft) {
        const key = String(cellTop);
        if (!rowMap.has(key)) rowMap.set(key, { top: cellTop, bookingRaw: raw, values: {} });
        rowMap.get(key).bookingRaw = raw;
        rowMap.get(key).values['Booking Id'] = raw;
      }
    }
    for (const cell of cells) {
      const cellLeft = Number.parseFloat(cell.style.left);
      const cellTop = Number.parseFloat(cell.style.top);
      if (cellTop === 0 || !Number.isFinite(cellTop)) continue;
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
  });

  const matchRows = (allRows, target) => {
    const normalizedTarget = normalizeBooking(target);
    return allRows.filter(row => normalizeBooking(row.bookingRaw) === normalizedTarget);
  };

  const scrollGridTo = async (offset) => grid.evaluate((element, scrollOffset) => {
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
  const allRowsMap = new Map();

  for (const pos of positions) {
    await scrollGridTo(pos);
    await new Promise(resolve => setTimeout(resolve, 150));
    const extracted = await extractAllCells();
    for (const row of extracted.rows) {
      const key = String(row.top);
      if (!allRowsMap.has(key)) {
        allRowsMap.set(key, row);
      } else {
        const existing = allRowsMap.get(key);
        for (const title of columnTitles) {
          if (!existing.values[title] && row.values[title]) {
            existing.values[title] = row.values[title];
          }
        }
      }
    }
  }

  await scrollGridTo(0);
  await new Promise(resolve => setTimeout(resolve, 100));

  const allRows = [...allRowsMap.values()];
  return {
    columns: allRows[0]?.values ? Object.fromEntries(
      columnTitles.map(title => {
        const headerCell = allRows.find(r => r.values[title] !== undefined);
        return [title, 0];
      })
    ) : {},
    rows: matchRows(allRows, bookingId),
  };
}

async function exactCell(grid, top, left) {
  const cells = grid.locator('.GridCell');
  const count = await cells.count();
  for (let index = 0; index < count; index += 1) {
    const cell = cells.nth(index);
    const coordinates = await cell.evaluate(element => ({
      top: Number.parseFloat(element.style.top),
      left: Number.parseFloat(element.style.left),
    }));
    if (coordinates.top === top && coordinates.left === left) return cell;
  }
  return null;
}

async function resolveColumnLeft(grid, columnTitle) {
  return grid.evaluate((element, title) => {
    const cells = [...element.querySelectorAll('.GridCell')];
    const header = cells.find(cell => cell.style.top === '0px' && cell.title === title);
    return header ? Number.parseFloat(header.style.left) : null;
  }, columnTitle);
}

const normalized = value => String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
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
  return normalized(actual) === normalized(expected);
}

async function openListDropdown(page) {
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

async function getListDropdownOptions(page) {
  const optionTexts = await page.evaluate(() => {
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
        const optionEls = dialog.querySelectorAll('[role="option"], core\\:listitem, .ListBoxItem, [title]');
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
    return [...new Set(results)];
  });
  return optionTexts;
}

async function clickListOption(page, optionText) {
  const optionStr = String(optionText).trim();
  const clicked = await page.evaluate((target) => {
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
    return false;
  }, optionStr);
  return clicked;
}

async function selectListOption(page, option, column) {
  const optionStr = String(option).trim();
  if (!optionStr) return;

  const availableOptions = await getListDropdownOptions(page);

  const clicked = await clickListOption(page, optionStr);
  if (clicked) {
    await page.waitForTimeout(200);
    return;
  }

  if (column === 'Vehicle' || column === 'Driver') {
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

async function setTextCell(page, grid, row, column, value, required = false) {
  if (value === undefined || value === null || value === '') {
    if (required) throw new Error(`${column} is required for ${row.activity}`);
    return false;
  }
  const colLeft = await resolveColumnLeft(grid, column);
  if (colLeft === null) throw new Error(`${column} column not found in grid`);
  if (equalCellValue(column, row.values?.[column], value)) return true;

  const cell = await exactCell(grid, row.top, colLeft);
  if (!cell) throw new Error(`${column} cell unavailable at row ${row.activity} (top=${row.top})`);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    await cell.dblclick({ force: true });
    await page.waitForTimeout(250);

    const editor = page.locator('.EditorWidgets input:not([style*="z-index: -1"]):visible').last();
    const listbox = page.locator('.EditorWidgets core\\:listbox:visible').last();

    if (await editor.count()) {
      await editor.click();
      await editor.fill('');
      await page.waitForTimeout(50);
      await editor.fill(String(value));
      await page.waitForTimeout(150);
      await page.keyboard.press('Tab');
      await page.waitForTimeout(200);
      return true;
    }

    if (await listbox.count()) {
      await openListDropdown(page);
      try {
        await selectListOption(page, value, column);
        await page.keyboard.press('Tab');
        await page.waitForTimeout(200);
        return true;
      } catch (error) {
        await page.keyboard.press('Escape').catch(() => {});
        await page.waitForTimeout(100);
        if (column !== 'Vehicle') throw error;
        return false;
      }
    }

    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(150);
  }
  if (column === 'Vehicle') return false;
  throw new Error(`${column} editor did not open for ${row.activity}`);
}

async function setListCell(page, grid, row, column, option) {
  if (!option) return;
  if (equalCellValue(column, row.values?.[column], option)) return;

  const colLeft = await resolveColumnLeft(grid, column);
  if (colLeft === null) throw new Error(`${column} column not found in grid`);

  const cell = await exactCell(grid, row.top, colLeft);
  if (!cell) throw new Error(`${column} cell unavailable at row ${row.activity}`);

  await cell.dblclick({ force: true });
  await page.waitForTimeout(250);

  if (!await page.locator('.EditorWidgets core\\:listbox:visible').count()) {
    throw new Error(`${column} listbox did not open for ${row.activity}`);
  }

  if (column === 'Signature Captured?') {
    await openListDropdown(page);
    for (let index = 0; index < 20; index += 1) await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Tab');
  } else {
    await openListDropdown(page);
    await selectListOption(page, option, column);
    await page.keyboard.press('Tab');
  }
  await page.waitForTimeout(250);

  let selected = await cell.evaluate(element =>
    String(element.title || element.textContent || '').trim());

  if (column === 'Signature Captured?' && !equalCellValue(column, selected, option)) {
    await cell.dblclick({ force: true });
    await page.waitForTimeout(250);
    if (await page.locator('.EditorWidgets core\\:listbox:visible').count()) {
      await openListDropdown(page);
      for (let index = 0; index < 20; index += 1) await page.keyboard.press('ArrowUp');
      await page.keyboard.press('Enter');
      await page.keyboard.press('Tab');
      await page.waitForTimeout(250);
    }
    selected = await cell.evaluate(element =>
      String(element.title || element.textContent || '').trim());
  }

  if (!equalCellValue(column, selected, option)) {
    throw new Error(`${column} selection not confirmed: expected "${option}", found "${selected}"`);
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

export async function syncWellTransTrip(page, payload) {
  const selectedDate = await getSelectedPortalDate(page);
  if (selectedDate !== payload.serviceDate) {
    throw new Error(`WellTrans schedule ${selectedDate || 'unknown'} does not match trip service date ${payload.serviceDate}`);
  }

  const grid = await openEditItinerary(page);
  const model = await gridModel(grid, payload.bookingId);
  const pickupRows = model.rows.filter(row => ACTIVITY_PICKUP.test(row.activity));
  const dropoffRows = model.rows.filter(row => ACTIVITY_DROPOFF.test(row.activity));
  if (pickupRows.length !== 1 || dropoffRows.length !== 1) {
    await page.keyboard.press('Escape').catch(() => {});
    throw new Error(`Booking ${payload.bookingId} matched ${pickupRows.length} Pickup and ${dropoffRows.length} Dropoff rows; expected exactly one of each`);
  }

  const pickup = pickupRows[0];
  const dropoff = dropoffRows[0];
  const pickupDriverSet = await setTextCell(page, grid, pickup, 'Driver', payload.driver, true);
  const pickupVehicleSet = await setTextCell(page, grid, pickup, 'Vehicle', payload.vehicle);
  await setTextCell(page, grid, pickup, 'Arrival Time', payload.pickup.arrival, true);
  await setTextCell(page, grid, pickup, 'Departure Time', payload.pickup.departure, true);
  await setTextCell(page, grid, pickup, 'Mileage/Odometer', payload.pickup.mileage ?? 0, true);

  const dropoffDriverSet = await setTextCell(page, grid, dropoff, 'Driver', payload.driver, true);
  const dropoffVehicleSet = await setTextCell(page, grid, dropoff, 'Vehicle', payload.vehicle);
  await setTextCell(page, grid, dropoff, 'Arrival Time', payload.dropoff.arrival, true);
  await setTextCell(page, grid, dropoff, 'Departure Time', payload.dropoff.departure);
  await setTextCell(page, grid, dropoff, 'Mileage/Odometer', payload.dropoff.mileage, true);
  if (payload.dropoff.signatureCaptured) {
    await setListCell(page, grid, pickup, 'Signature Captured?', 'Rider Signature Received');
    await setListCell(page, grid, dropoff, 'Signature Captured?', 'Rider Signature Received');
  }

  const colLefts = {};
  for (const title of REQUIRED_COLUMNS) {
    colLefts[title] = await resolveColumnLeft(grid, title);
  }

  const expected = [
    ...(pickupDriverSet ? [[pickup.top, 'Driver', payload.driver]] : []),
    ...(pickupVehicleSet ? [[pickup.top, 'Vehicle', payload.vehicle]] : []),
    [pickup.top, 'Arrival Time', payload.pickup.arrival],
    [pickup.top, 'Departure Time', payload.pickup.departure],
    [pickup.top, 'Mileage/Odometer', payload.pickup.mileage ?? 0],
    ...(dropoffDriverSet ? [[dropoff.top, 'Driver', payload.driver]] : []),
    ...(dropoffVehicleSet ? [[dropoff.top, 'Vehicle', payload.vehicle]] : []),
    [dropoff.top, 'Arrival Time', payload.dropoff.arrival],
    [dropoff.top, 'Departure Time', payload.dropoff.departure],
    [dropoff.top, 'Mileage/Odometer', payload.dropoff.mileage],
    ...(payload.dropoff.signatureCaptured
      ? [
        [pickup.top, 'Signature Captured?', 'Rider Signature Received'],
        [dropoff.top, 'Signature Captured?', 'Rider Signature Received'],
      ] : []),
  ].filter(([, , value]) => value !== undefined && value !== null && value !== '');

  await page.waitForTimeout(400);

  const mismatches = [];
  for (const [rowTop, column, value] of expected) {
    const left = colLefts[column];
    if (left === null) continue;
    const cell = await exactCell(grid, rowTop, left);
    if (!cell) {
      mismatches.push(`${column} at top ${rowTop}: cell not found`);
      continue;
    }
    const actual = await cell.evaluate(element =>
      String(element.title || element.textContent || '').trim());
    if (!equalCellValue(column, actual, value)) {
      mismatches.push(`${column} at top ${rowTop}: expected "${value}", found "${actual}"`);
    }
  }

  if (mismatches.length) {
    throw new Error(`Post-save verification failed for Booking ${payload.bookingId}: ${mismatches.join('; ')}`);
  }

  return {
    selectedDate, stagedForReview: true, verified: true,
    warnings: [
      ...(!pickupVehicleSet ? ['Pickup vehicle was left unchanged because no unique WellTrans match was found.'] : []),
      ...(!dropoffVehicleSet ? ['Dropoff vehicle was left unchanged because no unique WellTrans match was found.'] : []),
    ],
  };
}
