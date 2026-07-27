const GRID_SELECTOR = 'core\\:grid[gridobject="Pass.UI.Grid.TripBrokerEventsGrid"]';
const REQUIRED_COLUMNS = [
  'Booking Id', 'Activity', 'Driver', 'Vehicle', 'Arrival Time',
  'Departure Time', 'Mileage/Odometer', 'Signature Captured?',
];

const portalDate = value => {
  const match = String(value || '').match(/\[(\d{2})-(\d{2})-(\d{4})\]/);
  return match ? `${match[3]}-${match[1]}-${match[2]}` : '';
};

async function waitForAssignedTask(page) {
  await page.waitForFunction(() =>
    Boolean(document.querySelector('.RunName')?.textContent?.trim()
      && document.querySelector('core\\:grid[gridobject="Pass.UI.Grid.TripBrokerEventsGrid"]')),
  null, { timeout: 45000 });
}

async function openEditItinerary(page) {
  const grid = page.locator(`${GRID_SELECTOR}:has(.GridCell[title="Signature Captured?"])`).last();
  for (let attempt = 0; attempt < 3 && !await grid.count(); attempt += 1) {
    // TripSpark 7.5 exposes the edit command through this calendar-styled control.
    await page.locator('.ChangeSchedule[title="Select Schedule"]').evaluate(element => element.click());
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
  return grid.evaluate((element, booking) => {
    const cells = [...element.querySelectorAll('.GridCell')];
    const header = title => cells.find(cell => cell.style.top === '0px' && cell.title === title);
    const left = title => Number.parseFloat(header(title)?.style.left);
    const bookingLeft = left('Booking Id');
    const activityLeft = left('Activity');
    const matches = cells.filter(cell =>
      Number.parseFloat(cell.style.left) === bookingLeft && cell.title === booking);
    return {
      columns: Object.fromEntries([
        'Booking Id', 'Activity', 'Driver', 'Vehicle', 'Arrival Time',
        'Departure Time', 'Mileage/Odometer', 'Signature Captured?',
      ].map(title => [title, left(title)])),
      rows: matches.map(cell => {
        const top = Number.parseFloat(cell.style.top);
        const activity = cells.find(candidate =>
          Number.parseFloat(candidate.style.left) === activityLeft
          && Number.parseFloat(candidate.style.top) === top)?.title || '';
        return { top, activity };
      }),
    };
  }, String(bookingId));
}

const cellAt = (grid, top, left) =>
  grid.locator(`.GridCell[style*="top: ${top}px"][style*="left: ${left}px"]`).first();

async function setTextCell(page, grid, model, row, column, value, required = false) {
  if (value === undefined || value === null || value === '') {
    if (required) throw new Error(`${column} is required for ${row.activity}`);
    return;
  }
  const cell = cellAt(grid, row.top, model.columns[column]);
  if (!await cell.count()) throw new Error(`${column} cell is unavailable for ${row.activity}`);
  await cell.dblclick({ force: true });
  const editor = page.locator('.EditorWidgets input:not([style*="z-index: -1"])').last();
  await editor.waitFor({ state: 'attached', timeout: 5000 });
  await editor.fill(String(value));
  await page.keyboard.press('Tab');
}

async function setListCell(page, grid, model, row, column, option) {
  if (!option) return;
  const cell = cellAt(grid, row.top, model.columns[column]);
  await cell.dblclick({ force: true });
  const listbox = page.locator('.EditorWidgets core\\:listbox').last();
  await listbox.locator('.dropdlgbutton').click({ force: true });
  const choice = page.getByText(option, { exact: true }).last();
  await choice.waitFor({ state: 'visible', timeout: 5000 });
  await choice.click();
}

async function closeEditorWithoutSaving(page) {
  const close = page.getByRole('button', { name: 'Close', exact: true }).last();
  if (await close.count()) await close.click();
  else await page.keyboard.press('Escape');
}

export async function validateWellTransTrip(page, payload) {
  await waitForAssignedTask(page);
  const selectedDate = portalDate(await page.locator('.RunName').innerText());
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
  await waitForAssignedTask(page);
  const selectedDate = portalDate(await page.locator('.RunName').innerText());
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
  await setTextCell(page, grid, model, pickup, 'Driver', payload.driver);
  await setTextCell(page, grid, model, pickup, 'Vehicle', payload.vehicle);
  await setTextCell(page, grid, model, pickup, 'Arrival Time', payload.pickup.arrival, true);
  await setTextCell(page, grid, model, pickup, 'Departure Time', payload.pickup.departure, true);
  await setTextCell(page, grid, model, pickup, 'Mileage/Odometer', payload.pickup.mileage ?? 0, true);
  await setListCell(page, grid, model, pickup, 'Signature Captured?', 'Signature Not Requested');

  await setTextCell(page, grid, model, dropoff, 'Driver', payload.driver);
  await setTextCell(page, grid, model, dropoff, 'Vehicle', payload.vehicle);
  await setTextCell(page, grid, model, dropoff, 'Arrival Time', payload.dropoff.arrival, true);
  await setTextCell(page, grid, model, dropoff, 'Departure Time', payload.dropoff.departure);
  await setTextCell(page, grid, model, dropoff, 'Mileage/Odometer', payload.dropoff.mileage, true);
  await setListCell(page, grid, model, dropoff, 'Signature Captured?',
    payload.dropoff.signatureCaptured ? 'Rider Signature Received' : 'Signature Not Requested');

  const apply = page.getByRole('button', { name: 'Apply', exact: true }).last();
  await apply.click();
  await page.waitForFunction(
    selector => document.querySelectorAll(selector).length === 1,
    GRID_SELECTOR.replaceAll('\\\\', '\\'),
    { timeout: 20000 },
  );

  // Reopen and verify that the exact booking still has one row per activity.
  const verifyGrid = await openEditItinerary(page);
  const verified = await gridModel(verifyGrid, payload.bookingId);
  await closeEditorWithoutSaving(page);
  if (verified.rows.filter(row => /^pickup$/i.test(row.activity)).length !== 1
    || verified.rows.filter(row => /^dropoff$/i.test(row.activity)).length !== 1) {
    throw new Error(`Post-save verification failed for Booking ${payload.bookingId}`);
  }
}
