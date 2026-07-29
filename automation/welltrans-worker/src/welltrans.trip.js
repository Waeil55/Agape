const GRID_SELECTOR = 'core\\:grid[gridobject="Pass.UI.Grid.TripBrokerEventsGrid"]';
const REQUIRED_COLUMNS = [
  'Booking Id', 'Activity', 'Driver', 'Vehicle', 'Arrival Time',
  'Departure Time', 'Mileage/Odometer', 'Signature Captured?',
];

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

async function gridModel(grid, bookingId) {
  await grid.evaluate(element => {
    for (const scroller of element.querySelectorAll('.GridScroller')) {
      if (scroller.scrollHeight > scroller.clientHeight) {
        scroller.scrollTop = 0;
        scroller.dispatchEvent(new Event('scroll', { bubbles: true }));
      }
    }
  });
  await new Promise(resolve => setTimeout(resolve, 150));
  return grid.evaluate((element, booking) => {
    const cells = [...element.querySelectorAll('.GridCell')];
    const header = title => cells.find(cell => cell.style.top === '0px' && cell.title === title);
    const left = title => Number.parseFloat(header(title)?.style.left);
    const bookingLeft = left('Booking Id');
    const activityLeft = left('Activity');
    const matches = cells.filter(cell =>
      Number.parseFloat(cell.style.left) === bookingLeft
      && String(cell.title || cell.textContent || '').trim() === String(booking).trim());
    const columnTitles = [
      'Booking Id', 'Activity', 'Driver', 'Vehicle', 'Arrival Time',
      'Departure Time', 'Mileage/Odometer', 'Signature Captured?',
    ];
    return {
      columns: Object.fromEntries([
        ...columnTitles,
      ].map(title => [title, left(title)])),
      rows: matches.map(cell => {
        const top = Number.parseFloat(cell.style.top);
        const activity = cells.find(candidate =>
          Number.parseFloat(candidate.style.left) === activityLeft
          && Number.parseFloat(candidate.style.top) === top)?.title?.trim() || '';
        const values = Object.fromEntries(columnTitles.map(title => {
          const valueCell = cells.find(candidate =>
            Number.parseFloat(candidate.style.left) === left(title)
            && Number.parseFloat(candidate.style.top) === top);
          return [title, String(valueCell?.title || valueCell?.textContent || '').trim()];
        }));
        return { top, activity, values };
      }),
    };
  }, String(bookingId));
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

async function waitForDropdownVisible(page, timeoutMs = 3000) {
  const dropdownSelectors = [
    '.DropDownDialog:visible',
    '.EditorWidgets [role="option"]:visible',
    '.EditorWidgets core\\:listitem:visible',
    '.EditorWidgets .ListBoxItem:visible',
    '[class*="DropDown"]:visible [role="option"]',
    '[class*="dropdown"]:visible [role="option"]',
    '[class*="listbox"]:visible [role="option"]',
  ];
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const selector of dropdownSelectors) {
      if (await page.locator(selector).first().count()) return true;
    }
    await page.waitForTimeout(100);
  }
  return false;
}

async function getVisibleDropdownOptions(page) {
  const optionSelectors = [
    '.DropDownDialog:visible [title]',
    '.EditorWidgets [role="option"]:visible',
    '.EditorWidgets core\\:listitem:visible',
    '.EditorWidgets .ListBoxItem:visible',
    '[class*="DropDown"]:visible [role="option"]',
    '[class*="dropdown"]:visible [role="option"]',
    '[class*="listbox"]:visible [role="option"]',
  ];
  for (const selector of optionSelectors) {
    const options = await page.locator(selector).evaluateAll(elements =>
      elements.map(element => ({
        text: String(element.textContent || element.getAttribute('title') || '').trim(),
        element,
      })).filter(item => item.text)
    ).catch(() => []);
    if (options.length) return options.map(o => o.text);
  }
  return [];
}

async function selectUniqueListOption(page, option, column) {
  const optionStr = String(option).trim();
  if (!optionStr) return;

  await waitForDropdownVisible(page, 3000);

  const exactMatches = await page.getByText(optionStr, { exact: true }).evaluateAll(elements =>
    elements.filter(el => {
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    }).length
  ).catch(() => 0);

  if (exactMatches === 1) {
    await page.getByText(optionStr, { exact: true }).evaluate(elements => {
      const visible = elements.filter(el => {
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });
      if (visible.length) visible[visible.length - 1].click();
    });
    await page.waitForTimeout(200);
    return;
  }

  if (exactMatches > 1) {
    const allExact = page.getByText(optionStr, { exact: true });
    const count = await allExact.count();
    for (let i = count - 1; i >= 0; i--) {
      const el = allExact.nth(i);
      if (await el.isVisible().catch(() => false)) {
        await el.click();
        await page.waitForTimeout(200);
        return;
      }
    }
  }

  if (column === 'Vehicle' || column === 'Driver') {
    const availableOptions = await getVisibleDropdownOptions(page);
    throw new Error(`${column} option "${optionStr}" was not found exactly.`
      + `${availableOptions.length ? ` Available: ${[...new Set(availableOptions)].slice(0, 15).join(', ')}` : ''}`);
  }

  const containedMatches = await page.getByText(optionStr, { exact: false }).evaluateAll(elements =>
    elements.filter(el => {
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    })
  ).catch(() => []);

  if (containedMatches.length === 1) {
    const el = page.getByText(optionStr, { exact: false });
    const count = await el.count();
    for (let i = 0; i < count; i++) {
      if (await el.nth(i).isVisible().catch(() => false)) {
        await el.nth(i).click();
        await page.waitForTimeout(200);
        return;
      }
    }
  }

  const availableOptions = await getVisibleDropdownOptions(page);
  throw new Error(`${column} option "${optionStr}" was ${containedMatches.length > 1 ? 'ambiguous' : 'not found'}`
    + `${availableOptions.length ? `. Available: ${[...new Set(availableOptions)].slice(0, 15).join(', ')}` : ''}`);
}

async function setTextCell(page, grid, model, row, column, value, required = false) {
  if (value === undefined || value === null || value === '') {
    if (required) throw new Error(`${column} is required for ${row.activity}`);
    return false;
  }
  if (equalCellValue(column, row.values?.[column], value)) return true;
  const cell = await exactCell(grid, row.top, model.columns[column]);
  if (!cell) throw new Error(`${column} cell is unavailable for ${row.activity}`);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    await cell.dblclick({ force: true });
    await page.waitForTimeout(200);

    const editor = page.locator('.EditorWidgets input:not([style*="z-index: -1"]):visible').last();
    const listbox = page.locator('.EditorWidgets core\\:listbox:visible').last();

    if (await editor.count()) {
      await editor.click();
      await editor.fill('');
      await page.waitForTimeout(50);
      await editor.fill(String(value));
      await page.waitForTimeout(100);
      await page.keyboard.press('Tab');
      await page.waitForTimeout(150);
      return true;
    }

    if (await listbox.count()) {
      const dropBtn = listbox.locator('.dropdlgbutton');
      if (await dropBtn.count()) {
        await dropBtn.click({ force: true });
      } else {
        await listbox.click({ force: true });
      }
      await page.waitForTimeout(300);

      try {
        await selectUniqueListOption(page, value, column);
        await page.waitForTimeout(150);
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

async function setListCell(page, grid, model, row, column, option) {
  if (!option) return;
  if (equalCellValue(column, row.values?.[column], option)) return;
  const cell = await exactCell(grid, row.top, model.columns[column]);
  if (!cell) throw new Error(`${column} cell is unavailable for ${row.activity}`);

  await cell.dblclick({ force: true });
  await page.waitForTimeout(200);

  const listbox = page.locator('.EditorWidgets core\\:listbox:visible').last();
  if (!await listbox.count()) throw new Error(`${column} listbox did not open for ${row.activity}`);

  const dropBtn = listbox.locator('.dropdlgbutton');
  if (await dropBtn.count()) {
    await dropBtn.click({ force: true });
  } else {
    await listbox.click({ force: true });
  }
  await page.waitForTimeout(300);

  if (column === 'Signature Captured?') {
    for (let index = 0; index < 20; index += 1) await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Tab');
  } else {
    await selectUniqueListOption(page, option, column);
  }
  await page.waitForTimeout(250);

  let selected = await cell.evaluate(element =>
    String(element.title || element.textContent || '').trim());

  if (column === 'Signature Captured?' && !equalCellValue(column, selected, option)) {
    await cell.dblclick({ force: true });
    await page.waitForTimeout(200);
    const retryListbox = page.locator('.EditorWidgets core\\:listbox:visible').last();
    if (await retryListbox.count()) {
      const retryDropBtn = retryListbox.locator('.dropdlgbutton');
      if (await retryDropBtn.count()) {
        await retryDropBtn.click({ force: true });
      } else {
        await retryListbox.click({ force: true });
      }
      await page.waitForTimeout(300);
      for (let index = 0; index < 20; index += 1) await page.keyboard.press('ArrowUp');
      await page.keyboard.press('Enter');
      await page.keyboard.press('Tab');
      await page.waitForTimeout(250);
    }
    selected = await cell.evaluate(element =>
      String(element.title || element.textContent || '').trim());
  }

  if (!equalCellValue(column, selected, option)) {
    throw new Error(`${column} selection was not confirmed: expected "${option}", found "${selected}"`);
  }
}

async function dismissTransientEditor(page) {
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(100);
}

export async function validateWellTransTrip(page, payload) {
  const selectedDate = await getSelectedPortalDate(page);
  if (selectedDate !== payload.serviceDate) {
    throw new Error(`WellTrans schedule ${selectedDate || 'unknown'} does not match trip service date ${payload.serviceDate}`);
  }
  const grid = await openEditItinerary(page);
  const model = await gridModel(grid, payload.bookingId);
  const pickup = model.rows.filter(row => /^pickup$/i.test(row.activity));
  const dropoff = model.rows.filter(row => /^dropoff$/i.test(row.activity));
  await dismissTransientEditor(page);
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
  const pickupRows = model.rows.filter(row => /^pickup$/i.test(row.activity));
  const dropoffRows = model.rows.filter(row => /^dropoff$/i.test(row.activity));
  if (pickupRows.length !== 1 || dropoffRows.length !== 1) {
    await dismissTransientEditor(page);
    throw new Error(`Booking ${payload.bookingId} matched ${pickupRows.length} Pickup and ${dropoffRows.length} Dropoff rows; expected exactly one of each`);
  }

  const pickup = pickupRows[0];
  const dropoff = dropoffRows[0];
  const pickupDriverSet = await setTextCell(page, grid, model, pickup, 'Driver', payload.driver, true);
  const pickupVehicleSet = await setTextCell(page, grid, model, pickup, 'Vehicle', payload.vehicle);
  await setTextCell(page, grid, model, pickup, 'Arrival Time', payload.pickup.arrival, true);
  await setTextCell(page, grid, model, pickup, 'Departure Time', payload.pickup.departure, true);
  await setTextCell(page, grid, model, pickup, 'Mileage/Odometer', payload.pickup.mileage ?? 0, true);

  const dropoffDriverSet = await setTextCell(page, grid, model, dropoff, 'Driver', payload.driver, true);
  const dropoffVehicleSet = await setTextCell(page, grid, model, dropoff, 'Vehicle', payload.vehicle);
  await setTextCell(page, grid, model, dropoff, 'Arrival Time', payload.dropoff.arrival, true);
  await setTextCell(page, grid, model, dropoff, 'Departure Time', payload.dropoff.departure);
  await setTextCell(page, grid, model, dropoff, 'Mileage/Odometer', payload.dropoff.mileage, true);
  if (payload.dropoff.signatureCaptured) {
    await setListCell(page, grid, model, pickup, 'Signature Captured?', 'Rider Signature Received');
    await setListCell(page, grid, model, dropoff, 'Signature Captured?', 'Rider Signature Received');
  }

  const expected = [
    ...(pickupDriverSet ? [[pickup, 'Driver', payload.driver]] : []),
    ...(pickupVehicleSet ? [[pickup, 'Vehicle', payload.vehicle]] : []),
    [pickup, 'Arrival Time', payload.pickup.arrival],
    [pickup, 'Departure Time', payload.pickup.departure],
    [pickup, 'Mileage/Odometer', payload.pickup.mileage ?? 0],
    ...(dropoffDriverSet ? [[dropoff, 'Driver', payload.driver]] : []),
    ...(dropoffVehicleSet ? [[dropoff, 'Vehicle', payload.vehicle]] : []),
    [dropoff, 'Arrival Time', payload.dropoff.arrival],
    [dropoff, 'Departure Time', payload.dropoff.departure],
    [dropoff, 'Mileage/Odometer', payload.dropoff.mileage],
    ...(payload.dropoff.signatureCaptured
      ? [
        [pickup, 'Signature Captured?', 'Rider Signature Received'],
        [dropoff, 'Signature Captured?', 'Rider Signature Received'],
      ] : []),
  ].filter(([, , value]) => value !== undefined && value !== null && value !== '');

  await page.waitForTimeout(400);
  const verified = await gridModel(grid, payload.bookingId);
  const verifiedPickup = verified.rows.filter(row => /^pickup$/i.test(row.activity));
  const verifiedDropoff = verified.rows.filter(row => /^dropoff$/i.test(row.activity));
  if (verifiedPickup.length !== 1 || verifiedDropoff.length !== 1) {
    throw new Error(`Post-save row verification failed for Booking ${payload.bookingId}`);
  }
  const verificationExpected = expected.map(([row, column, value]) => [
    /^pickup$/i.test(row.activity) ? verifiedPickup[0] : verifiedDropoff[0], column, value,
  ]);
  const mismatches = verificationExpected
    .filter(([row, column, value]) => !equalCellValue(column, row.values?.[column], value))
    .map(([row, column, value]) => `${row.activity} ${column}: expected "${value}", found "${row.values?.[column] || ''}"`);
  if (mismatches.length) {
    throw new Error(`Post-save value verification failed for Booking ${payload.bookingId}: ${mismatches.join('; ')}`);
  }
  return {
    selectedDate, stagedForReview: true, verified: true,
    warnings: [
      ...(!pickupVehicleSet ? ['Pickup vehicle was left unchanged because no unique WellTrans match was found.'] : []),
      ...(!dropoffVehicleSet ? ['Dropoff vehicle was left unchanged because no unique WellTrans match was found.'] : []),
    ],
  };
}
