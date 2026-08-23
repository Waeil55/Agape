import { describe, expect, it, vi } from 'vitest';

import {
  areTaskCardPropsEqual,
  areTaskCardValuesEqual,
  createTaskCardActionsBridge,
  getTaskCardActionShape,
} from './TaskCard';

const makeTask = () => ({
  id: 'trip-107',
  time: '10:30 AM',
  patient: 'Example Rider',
  patientName: 'Example Rider',
  status: 'Assigned',
  bookingId: '107',
  notes: 'Use the east entrance',
  urgentTrip: false,
  urgentDeadlineAt: null,
  urgentDeadlineTime: null,
  legs: '1 LEG',
  patientPhone: '3175550100',
  emergencyContact: { name: 'Dispatch', phone: '3175550199' },
  details: {
    distance: '5.98 mi',
    passengerType: 'AMB',
    mobility: 'WLK',
  },
  tags: ['Route Plan'],
  pickup: { address: '100 Pickup St', phone: '3175550101' },
  dropoff: { address: '200 Dropoff Ave', phone: '3175550102', time: null },
  workflowPhase: 'pickup',
  activeTrip: false,
});

const stableOnToggle = vi.fn();
const stableOnSelect = vi.fn();
const stableActions = { onCall: vi.fn(), onNoShow: vi.fn() };

const makeProps = (task = makeTask()) => ({
  task,
  expandedId: null,
  isSelected: false,
  onToggle: stableOnToggle,
  onSelect: stableOnSelect,
  actions: stableActions,
  timeEpochMinute: 123,
});

describe('TaskCard memoization contract', () => {
  it('skips the visual rerender for equivalent newly-created view-model values', () => {
    const previous = makeProps();
    const next = makeProps(structuredClone(previous.task));

    expect(previous.task).not.toBe(next.task);
    expect(areTaskCardPropsEqual(previous, next)).toBe(true);
  });

  it.each([
    ['visible status', (task) => { task.status = 'In Transit'; }],
    ['visible pickup', (task) => { task.pickup.address = '101 Pickup St'; }],
    ['nested details', (task) => { task.details.distance = '6.12 mi'; }],
    ['tag content', (task) => { task.tags.push('URGENT'); }],
    ['behavioral phone', (task) => { task.patientPhone = '3175559999'; }],
    ['behavioral contact', (task) => { task.emergencyContact.phone = '3175559998'; }],
  ])('rerenders when %s changes', (_label, mutate) => {
    const previous = makeProps();
    const nextTask = structuredClone(previous.task);
    mutate(nextTask);

    expect(areTaskCardPropsEqual(previous, makeProps(nextTask))).toBe(false);
  });

  it('rerenders for selection, expansion, action shape, and minute-boundary changes', () => {
    const previous = makeProps();

    expect(areTaskCardPropsEqual(previous, { ...previous, isSelected: true })).toBe(false);
    expect(areTaskCardPropsEqual(previous, { ...previous, expandedId: previous.task.id })).toBe(false);
    expect(areTaskCardPropsEqual(previous, { ...previous, actions: { ...stableActions } })).toBe(false);
    expect(areTaskCardPropsEqual(previous, { ...previous, timeEpochMinute: 124 })).toBe(false);
  });

  it('always rerenders an already-expanded card so caller-rendered workflow state stays current', () => {
    const previous = { ...makeProps(), expandedId: 'trip-107' };
    const next = { ...previous, task: structuredClone(previous.task) };

    expect(areTaskCardPropsEqual(previous, next)).toBe(false);
  });

  it('fails open to a rerender for unknown class instances', () => {
    class ContactValue {
      constructor(phone) {
        this.phone = phone;
      }
    }

    expect(areTaskCardValuesEqual(new ContactValue('3175550100'), new ContactValue('3175550100'))).toBe(false);
  });
});

describe('TaskCard latest-action bridge', () => {
  it('keeps an equivalent action shape stable across new callback identities', () => {
    const first = getTaskCardActionShape({ onCall: () => 'first', primaryLabel: 'Start' });
    const second = getTaskCardActionShape({ onCall: () => 'second', primaryLabel: 'Start' });

    expect(second).toBe(first);
    expect(getTaskCardActionShape({ onSms: vi.fn(), primaryLabel: 'Start' })).not.toBe(first);
    expect(getTaskCardActionShape({ onCall: vi.fn(), primaryLabel: 'Resume' })).not.toBe(first);
  });

  it('dispatches through a stable bridge to the latest callback', () => {
    const first = vi.fn();
    const latest = vi.fn();
    let currentProps = { actions: { onCall: first } };
    const bridge = createTaskCardActionsBridge(
      getTaskCardActionShape(currentProps.actions),
      () => currentProps,
    );

    currentProps = { actions: { onCall: latest } };
    bridge.onCall('trip-107');

    expect(first).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledWith('trip-107');
  });
});
