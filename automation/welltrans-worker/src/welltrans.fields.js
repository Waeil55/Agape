import { selectors } from './selectors.js';

const selectorWithMapping = (selector, label) => {
  const safe = String(label || '').replace(/["\\]/g, '');
  return safe ? `${selector}, input[aria-label*="${safe}" i], select[aria-label*="${safe}" i]` : selector;
};

const fillIfPresent = async (row, selector, label, value, required = false) => {
  const field = row.locator(selectorWithMapping(selector, label)).first();
  if (!await field.count()) {
    if (required) throw new Error(`Required field selector unavailable: ${selector}`);
    return;
  }
  const tag = await field.evaluate(element => element.tagName.toLowerCase());
  if (tag === 'select') await field.selectOption({ label: String(value) }).catch(() => field.selectOption(String(value)));
  else if (await field.getAttribute('type') === 'checkbox') {
    if (Boolean(value) !== await field.isChecked()) await field.click();
  } else await field.fill(String(value ?? ''));
};

export async function fillActivityRow(row, activity, common, mapping = {}) {
  await fillIfPresent(row, selectors.driver, mapping.driver, common.driver);
  await fillIfPresent(row, selectors.vehicle, mapping.vehicle, common.vehicle);
  await fillIfPresent(row, selectors.arrival, mapping.arrival, activity.arrival, true);
  await fillIfPresent(row, selectors.departure, mapping.departure, activity.departure);
  await fillIfPresent(row, selectors.mileage, mapping.mileage, activity.mileage ?? '', activity.mileage === null);
  await fillIfPresent(row, selectors.signature, mapping.signature, activity.signatureCaptured ? 'Yes' : 'No');
}
