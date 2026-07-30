import {
  buildWellTransPayload,
  DEFAULT_WELLTRANS_FIELD_MAPPING,
  validateTripForWellTrans,
} from '../utils/welltransMapping';

const unavailableAdapter = displayName => ({
  valid: false,
  errors: [`The certified ${displayName} adapter is not installed. No records were queued or changed.`],
});

export const createBrokerProvider = ({
  id,
  displayName,
  status = 'planned',
  capabilities = {},
  defaultSettings = {},
  validateSettings = () => [],
  validateTrip = () => unavailableAdapter(displayName),
  mapTrip = () => {
    throw new Error(`The certified ${displayName} adapter is not installed.`);
  },
}) => Object.freeze({
  id,
  displayName,
  status,
  capabilities: Object.freeze({
    exactBookingMatch: false,
    deterministicMapping: false,
    humanApply: true,
    queue: false,
    ...capabilities,
  }),
  defaultSettings: Object.freeze(defaultSettings),
  validateSettings,
  validateTrip,
  mapTrip,
});

export const WellTransProvider = createBrokerProvider({
  id: 'welltrans',
  displayName: 'WellTrans',
  status: 'production',
  capabilities: {
    exactBookingMatch: true,
    deterministicMapping: true,
    humanApply: true,
    queue: true,
    readBackVerification: true,
  },
  defaultSettings: {
    enabled: false,
    portalUrl: 'https://tripspark.welltransnemt.com/',
    automationMethod: 'playwright',
    fieldMapping: DEFAULT_WELLTRANS_FIELD_MAPPING,
  },
  validateSettings(settings = {}) {
    const errors = [];
    if (!settings.portalUrl || !/^https:\/\//i.test(settings.portalUrl)) {
      errors.push('A secure HTTPS portal URL is required');
    }
    if (settings.automationMethod !== 'playwright') {
      errors.push('Only the certified Playwright adapter is supported');
    }
    return errors;
  },
  validateTrip: validateTripForWellTrans,
  mapTrip: buildWellTransPayload,
});

const plannedProvider = (id, displayName) => createBrokerProvider({
  id,
  displayName,
  status: 'planned',
});

export const BROKER_PROVIDERS = Object.freeze({
  welltrans: WellTransProvider,
  mtm: plannedProvider('mtm', 'MTM'),
  modivcare: plannedProvider('modivcare', 'Modivcare'),
  access2care: plannedProvider('access2care', 'Access2Care'),
});

export const getBrokerProvider = (providerId) => {
  const provider = BROKER_PROVIDERS[String(providerId || '').toLowerCase()];
  if (!provider) throw new Error(`Unknown broker provider: ${providerId || 'empty'}`);
  return provider;
};

export const listBrokerProviders = () => Object.values(BROKER_PROVIDERS);
