/**
 * @vitest-environment jsdom
 */


import ReactDOM from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isValidWellTransServiceDate } from '../utils/welltransDate';
import WellTransSyncPage from './WellTransSyncPage';

const mockUseWellTransSync = vi.fn();

vi.mock('../hooks/useWellTransSync', () => ({
  useWellTransSync: (...args) => mockUseWellTransSync(...args),
}));

vi.mock('../hooks/useWellTransAutoSync', () => ({
  useWellTransAutoSync: vi.fn(() => ({ autoLog: false })),
}));

vi.mock('../services/welltransService', () => ({
  confirmWellTransReviewBatchApplied: vi.fn(),
  explainWellTransFailure: vi.fn(),
  explainWellTransFailureAI: vi.fn(),
  exportWellTransLogsCSV: vi.fn(),
  isWellTransFailureRetryable: vi.fn(() => false),
  queueWellTransSync: vi.fn(),
  saveWellTransSettings: vi.fn(),
  clearLocalWellTransCredentials: vi.fn(),
  getLocalWellTransCredentialStatus: vi.fn(),
  saveLocalWellTransCredentials: vi.fn(),
  categorizeFailure: vi.fn(),
  FAILURE_CATEGORIES: [],
}));

describe('WellTrans service date transition', () => {
  it('accepts an actual ISO service date', () => {
    expect(isValidWellTransServiceDate('2026-07-31')).toBe(true);
  });

  it('rejects the empty intermediate value emitted by native date inputs', () => {
    expect(isValidWellTransServiceDate('')).toBe(false);
  });

  it('rejects impossible calendar dates', () => {
    expect(isValidWellTransServiceDate('2026-02-31')).toBe(false);
  });
});

describe('WellTransSyncPage', () => {
  let root;
  let container;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    global.fetch = vi.fn(() => Promise.resolve({ ok: false, status: 404, json: async () => ({}) }));
    mockUseWellTransSync.mockReturnValue({
      settings: {
        enabled: false,
        portalUrl: '',
        automationMethod: 'playwright',
        lastSync: null,
        autoStart: false,
        autoQueue: false,
        autoRetryEnabled: false,
        autoRetryDelayMs: 30000,
        maxConcurrent: 1,
        fieldMapping: {},
      },
      logs: [],
      worker: null,
      workers: [],
      activeWorkers: [],
      standbyWorkers: [],
      operations: null,
      canary: null,
      coverage: { coveragePercent: 0 },
      workerOnline: false,
      workerCalibrated: false,
      workerUpgradeRequired: false,
      requiredWorkerVersion: '5.0.2',
      workerStandby: false,
      loading: false,
      dateTrips: [],
      allCompletedTrips: [],
      completedTrips: [
        {
          id: '107485530',
          bookingId: '107485530',
          dateKey: '2026-08-03',
          completedAt: '2026-08-03T04:48:00.000Z',
          arrivalTime: '2026-08-03T04:40:00.000Z',
          departedPickupTime: '2026-08-03T04:42:00.000Z',
          arrivalDropoffTime: '2026-08-03T04:48:00.000Z',
          pickupOdometer: 100,
          dropoffOdometer: 110,
          paperSignatureConfirmed: true,
          driverName: 'Test Driver',
          vehicle: 'Test Vehicle',
        },
      ],
      readyTrips: [],
      latestByTrip: new Map(),
      healthScore: 0,
      successfulCount: 0,
    });
  });

  afterEach(() => {
    if (root) root.unmount();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('renders a completed trip row for a trip completed via completedAt evidence only', async () => {
    await act(async () => {
      root = ReactDOM.createRoot(container);
      root.render(<WellTransSyncPage trips={[]} drivers={[]} vehicles={[]} role="dispatcher" />);
    });

    await Promise.resolve();

    expect(container.querySelectorAll('[data-testid="welltrans-toolbar"]')).toHaveLength(1);
    expect(container.querySelector('[data-testid="welltrans-toolbar"]')?.className).toContain('!flex-nowrap');
    expect(container.querySelector('[data-testid="welltrans-toolbar"] .\\!min-w-\\[84px\\]')).not.toBeNull();
    expect(container.textContent).toContain('0/1 verified');
    expect(container.textContent).not.toContain('1 total');
    expect(container.textContent).not.toContain('0 Review');
    expect(container.textContent).not.toContain('0 Issues');
    expect(container.textContent).toContain('107485530');
    expect(container.textContent).toContain('Test Driver');
  });
});
