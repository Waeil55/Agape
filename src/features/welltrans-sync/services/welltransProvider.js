import { buildWellTransPayload, DEFAULT_WELLTRANS_FIELD_MAPPING, validateTripForWellTrans } from '../utils/welltransMapping';

export const WellTransProvider = Object.freeze({
  id: 'welltrans',
  displayName: 'WellTrans',
  defaultSettings: {
    enabled: false,
    portalUrl: 'https://tripspark.welltransnemt.com/',
    automationMethod: 'playwright',
    fieldMapping: DEFAULT_WELLTRANS_FIELD_MAPPING,
  },
  validateSettings(settings = {}) {
    const errors = [];
    if (!settings.portalUrl || !/^https:\/\//i.test(settings.portalUrl)) errors.push('A secure HTTPS portal URL is required');
    if (settings.automationMethod !== 'playwright') errors.push('Only the Playwright automation method is supported');
    return errors;
  },
  validateTrip: validateTripForWellTrans,
  mapTrip: buildWellTransPayload,
});

export const BROKER_PROVIDERS = Object.freeze({ welltrans: WellTransProvider });
