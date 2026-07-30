const normalized = value => String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
const normalizedBooking = value => String(value ?? '').trim().replace(/\s+/g, '').toLowerCase();

const uniqueExactOption = (options, target) => {
  const matches = [...new Set(options.map(value => String(value).trim()).filter(Boolean))]
    .filter(value => normalized(value) === normalized(target));
  return matches.length === 1 ? matches[0] : null;
};

const clone = value => structuredClone(value);

export class TripSparkDigitalTwin {
  constructor(bookings = [], {
    driverOptions = ['Mikhaeil Waeil'],
    vehicleOptions = ['TOYOTA 002'],
    signatureOptions = [
      'Rider Signature Received',
      'Rider Unable to Sign',
      'Rider Refused to Sign',
      'Signature Not Requested',
    ],
  } = {}) {
    this.options = { driverOptions, vehicleOptions, signatureOptions };
    this.persisted = bookings.flatMap(item => [
      this.#row(item, 'Pickup'),
      this.#row(item, 'Dropoff'),
    ]);
    this.staged = clone(this.persisted);
    this.index = null;
  }

  #row(item, activity) {
    return {
      bookingId: String(item.bookingId),
      activity,
      driver: '',
      vehicle: '',
      arrival: '',
      departure: '',
      mileage: '',
      signatureReason: '',
      signatureCaptured: false,
    };
  }

  buildVirtualGridIndex({ viewportRows = 120, overlapRows = 24 } = {}) {
    const step = Math.max(1, viewportRows - overlapRows);
    const rowsByBooking = new Map();
    for (let offset = 0; offset < this.staged.length; offset += step) {
      const visible = this.staged.slice(offset, offset + viewportRows);
      for (const row of visible) {
        const key = normalizedBooking(row.bookingId);
        if (!rowsByBooking.has(key)) rowsByBooking.set(key, []);
        const rows = rowsByBooking.get(key);
        if (!rows.some(item => item.activity === row.activity)) rows.push(row);
      }
    }
    this.index = rowsByBooking;
    return {
      bookingCount: rowsByBooking.size,
      rowCount: [...rowsByBooking.values()].reduce((total, rows) => total + rows.length, 0),
    };
  }

  stageTrip(payload, { failAfterField = '' } = {}) {
    if (!this.index) this.buildVirtualGridIndex();
    const rows = this.index.get(normalizedBooking(payload.bookingId)) || [];
    const pickupRows = rows.filter(row => row.activity === 'Pickup');
    const dropoffRows = rows.filter(row => row.activity === 'Dropoff');
    if (pickupRows.length !== 1 || dropoffRows.length !== 1) {
      throw new Error(
        `Booking ${payload.bookingId} matched ${pickupRows.length} Pickup and ${dropoffRows.length} Dropoff rows; expected exactly one of each`,
      );
    }
    const pickup = pickupRows[0];
    const dropoff = dropoffRows[0];
    const beforePickup = clone(pickup);
    const beforeDropoff = clone(dropoff);
    const driver = uniqueExactOption(this.options.driverOptions, payload.driver);
    if (!driver) throw new Error(`Driver requires one unique exact option for "${payload.driver}"`);
    const vehicle = payload.vehicle
      ? uniqueExactOption(this.options.vehicleOptions, payload.vehicle)
      : null;
    const signature = payload.dropoff.signatureCaptured
      ? uniqueExactOption(this.options.signatureOptions, 'Rider Signature Received')
      : '';
    if (payload.dropoff.signatureCaptured && !signature) {
      throw new Error('Signature requires one unique exact Rider Signature Received option');
    }

    const writes = [
      [pickup, 'driver', driver],
      [pickup, 'arrival', payload.pickup.arrival],
      [pickup, 'departure', payload.pickup.departure],
      [pickup, 'mileage', payload.pickup.mileage ?? 0],
      [dropoff, 'driver', driver],
      [dropoff, 'arrival', payload.dropoff.arrival],
      [dropoff, 'departure', payload.dropoff.departure],
      [dropoff, 'mileage', payload.dropoff.mileage],
    ];
    if (vehicle) writes.push([pickup, 'vehicle', vehicle], [dropoff, 'vehicle', vehicle]);
    if (signature) {
      writes.push(
        [pickup, 'signatureReason', signature],
        [dropoff, 'signatureReason', signature],
        [pickup, 'signatureCaptured', true],
        [dropoff, 'signatureCaptured', true],
      );
    }

    try {
      for (const [row, field, value] of writes) {
        row[field] = value;
        if (failAfterField === `${row.activity}.${field}`) {
          throw new Error(`Injected TripSpark failure after ${failAfterField}`);
        }
      }
    } catch (error) {
      Object.assign(pickup, beforePickup);
      Object.assign(dropoff, beforeDropoff);
      throw error;
    }
    return {
      bookingId: String(payload.bookingId),
      stagedForReview: true,
      vehicleSkipped: Boolean(payload.vehicle && !vehicle),
      verifiedFieldCount: writes.length,
      manualApplyRequired: true,
    };
  }

  reviewBooking(bookingId) {
    return clone(this.staged.filter(row =>
      normalizedBooking(row.bookingId) === normalizedBooking(bookingId)));
  }

  persistedBooking(bookingId) {
    return clone(this.persisted.filter(row =>
      normalizedBooking(row.bookingId) === normalizedBooking(bookingId)));
  }

  applyByOperator() {
    this.persisted = clone(this.staged);
  }

  closeWithoutApply() {
    this.staged = clone(this.persisted);
    this.buildVirtualGridIndex();
  }
}
