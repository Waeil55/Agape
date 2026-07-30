import { describe, expect, it } from 'vitest';
import {
  BROKER_PROVIDERS,
  getBrokerProvider,
  listBrokerProviders,
  WellTransProvider,
} from './welltransProvider';

describe('broker provider registry', () => {
  it('exposes WellTrans as the only production queue adapter', () => {
    expect(WellTransProvider.status).toBe('production');
    expect(WellTransProvider.capabilities.queue).toBe(true);
    expect(listBrokerProviders().filter(provider => provider.capabilities.queue)).toEqual([WellTransProvider]);
  });

  it.each(['mtm', 'modivcare', 'access2care'])('fails closed for uninstalled %s adapter', id => {
    const provider = BROKER_PROVIDERS[id];
    expect(provider.status).toBe('planned');
    expect(provider.capabilities.queue).toBe(false);
    expect(provider.validateTrip({}).valid).toBe(false);
    expect(() => provider.mapTrip({})).toThrow(/not installed/i);
  });

  it('rejects unknown broker providers', () => {
    expect(() => getBrokerProvider('unknown')).toThrow(/unknown broker provider/i);
  });
});
