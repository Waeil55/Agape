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

  // TripSpark returns to its schedule calendar after closing an itinerary.
  // The selected RunName remains present; Proceed restores the same locked task.
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

async function selectUniqueListOption(page, option, column) {
  const visibleMatches = async locator => {
    const matches = [];
    for (let index = 0; index < await locator.count(); index += 1) {
      if (await locator.nth(index).isVisible().catch(() => false)) matches.push(locator.nth(index));
    }
    return matches;
  };
  const exact = await visibleMatches(page.getByText(String(option), { exact: true }));
  if (exact.length) {
    await exact.at(-1).click();
    return;
  }
  // Vehicle identifiers are operational identifiers, not display labels. A
  // prefix/substring match can select a different vehicle (for example,
  // "TOYOTA 002" must never select "TOYOTA 0025 3311").
  if (column === 'Vehicle') {
    throw new Error(`${column} option "${option}" was not found exactly`);
  }
  const contained = await visibleMatches(page.getByText(String(option), { exact: false }));
  if (contained.length === 1) {
    await contained[0].click();
    return;
  }
  const visibleOptions = await page.locator(
    '.EditorWidgets [role="option"]:visible, .EditorWidgets core\\:listitem:visible, '
    + '.EditorWidgets .ListBoxItem:visible, .DropDownDialog:visible [title]',
  ).evaluateAll(elements => elements.map(element =>
    String(element.textContent || element.getAttribute('title') || '').trim()).filter(Boolean)).catch(() => []);
  throw new Error(`${column} option "${option}" was ${contained.length > 1 ? 'ambiguous' : 'not found'}`
    + `${visibleOptions.length ? `. Available values: ${[...new Set(visibleOptions)].slice(0, 20).join(', ')}` : ''}`);
}

async function setTextCell(page, grid, model, row, column, value, required = false) {
  if (value === undefined || value === null || value === '') {
    if (required) throw new Error(`${column} is required for ${row.activity}`);
    return false;
  }
  if (equalCellValue(column, row.values?.[column], value)) return true;
  const cell = await exactCell(grid, row.top, model.columns[column]);
  if (!cell) throw new Error(`${column} cell is unavailable for ${row.activity}`);
  await cell.dblclick({ force: true });
  const editor = page.locator('.EditorWidgets input:not([style*="z-index: -1"]):visible').last();
  const listbox = page.locator('.EditorWidgets core\\:listbox:visible').last();
  if (await editor.count()) {
    await editor.fill(String(value));
    await page.keyboard.press('Tab');
    return true;
  }
  if (await listbox.count()) {
    await listbox.locator('.dropdlgbutton').click({ force: true });
    await page.waitForTimeout(250);
    try {
      await selectUniqueListOption(page, value, column);
      return true;
    } catch (error) {
      if (column !== 'Vehicle') throw error;
      await page.keyboard.press('Escape').catch(() => {});
      return false;
    }
  }
  if (column === 'Vehicle' || column === 'Driver') return false;
  throw new Error(`${column} editor did not open for ${row.activity}`);
}

async function setListCell(page, grid, model, row, column, option) {
  if (!option) return;
  if (equalCellValue(column, row.values?.[column], option)) return;
  const cell = await exactCell(grid, row.top, model.columns[column]);
  if (!cell) throw new Error(`${column} cell is unavailable for ${row.activity}`);
  await cell.dblclick({ force: true });
  const listbox = page.locator('.EditorWidgets core\\:listbox').last();
  await listbox.locator('.dropdlgbutton').click({ force: true });
  await page.waitForTimeout(250);
  if (column === 'Signature Captured?') {
    // The TripSpark dropdown is keyboard-backed even when its choices are
    // rendered outside the accessible DOM. "Rider Signature Received" is the
    // first option; Home + Enter commits that exact option deterministically.
    await page.keyboard.press('Home');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Tab');
  } else {
    await selectUniqueListOption(page, option, column);
  }
  await page.waitForTimeout(250);
  let selected = await cell.evaluate(element =>
    String(element.title || element.textContent || '').trim());
  if (column === 'Signature Captured?' && !equalCellValue(column, selected, option)) {
    // TripSpark can highlight a type-ahead result without committing it.
    // Reopen the list, select its confirmed first value, and leave the editor.
    await cell.dblclick({ force: true });
    const retryListbox = page.locator('.EditorWidgets core\\:listbox').last();
    await retryListbox.locator('.dropdlgbutton').click({ force: true });
    await page.keyboard.press('Home');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Tab');
    await page.waitForTimeout(250);
    selected = await cell.evaluate(element =>
      String(element.title || element.textContent || '').trim());
  }
  if (!equalCellValue(column, selected, option)) {
    throw new Error(`${column} selection was not confirmed: expected "${option}", found "${selected}"`);
  }
}

async function closeEditorWithoutSaving(page) {
  const close = page.getByRole('button', { name: 'Close', exact: true }).last();
  if (await close.count()) await close.click();
  else await page.keyboard.press('Escape');
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
  await closeEditorWithoutSaving(page);
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
    await closeEditorWithoutSaving(page);
    throw new Error(`Booking ${payload.bookingId} matched ${pickupRows.length} Pickup and ${dropoffRows.length} Dropoff rows; expected exactly one of each`);
  }

  const pickup = pickupRows[0];
  const dropoff = dropoffRows[0];
  const pickupDriverSet = await setTextCell(page, grid, model, pickup, 'Driver', payload.driver);
  const pickupVehicleSet = await setTextCell(page, grid, model, pickup, 'Vehicle', payload.vehicle);
  await setTextCell(page, grid, model, pickup, 'Arrival Time', payload.pickup.arrival, true);
  await setTextCell(page, grid, model, pickup, 'Departure Time', payload.pickup.departure, true);
  await setTextCell(page, grid, model, pickup, 'Mileage/Odometer', payload.pickup.mileage ?? 0, true);

  const dropoffDriverSet = await setTextCell(page, grid, model, dropoff, 'Driver', payload.driver);
  const dropoffVehicleSet = await setTextCell(page, grid, model, dropoff, 'Vehicle', payload.vehicle);
  await setTextCell(page, grid, model, dropoff, 'Arrival Time', payload.dropoff.arrival, true);
  await setTextCell(page, grid, model, dropoff, 'Departure Time', payload.dropoff.departure);
  await setTextCell(page, grid, model, dropoff, 'Mileage/Odometer', payload.dropoff.mileage, true);
  if (payload.dropoff.signatureCaptured) {
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
      ? [[dropoff, 'Signature Captured?', 'Rider Signature Received']] : []),
  ].filter(([, , value]) => value !== undefined && value !== null && value !== '');
  // Human approval is mandatory. Never click Apply or close the staged editor.
  // Verify only the values currently staged in the visible TripSpark grid.
  await page.waitForTimeout(300);
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
      ...(!pickupDriverSet ? ['Pickup driver was left unchanged because the WellTrans editor was unavailable.'] : []),
      ...(!dropoffDriverSet ? ['Dropoff driver was left unchanged because the WellTrans editor was unavailable.'] : []),
      ...(!pickupVehicleSet ? ['Pickup vehicle was left unchanged because no unique WellTrans match was found.'] : []),
      ...(!dropoffVehicleSet ? ['Dropoff vehicle was left unchanged because no unique WellTrans match was found.'] : []),
    ],
  };
}
