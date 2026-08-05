const numberOrNull = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
};

const normalize = (value) => String(value || '').trim().toLowerCase();

export function tripBelongsToVehicle(trip = {}, vehicle = {}, drivers = []) {
  if (!trip || !vehicle) return false;
  if (trip.vehicleId && vehicle.id && trip.vehicleId === vehicle.id) return true;
  const vehicleName = normalize(vehicle.name);
  if (vehicleName && [trip.completedVehicle, trip.vehicle, trip.vehicleName].some((value) => normalize(value) === vehicleName)) return true;
  const driver = drivers.find((item) => item.id === trip.driverId || (trip.driverEmail && normalize(item.email) === normalize(trip.driverEmail)));
  return Boolean(driver && (driver.vehicleId === vehicle.id || normalize(driver.vehicle) === vehicleName));
}

export function deriveVehicleOdometer(vehicle = {}, trips = [], drivers = []) {
  const readings = [numberOrNull(vehicle.odometer)].filter((value) => value !== null);
  trips.forEach((trip) => {
    if (!tripBelongsToVehicle(trip, vehicle, drivers)) return;
    [trip.dropoffOdometer, trip.endOdometer, trip.endMileage, trip.odometer].forEach((value) => {
      const reading = numberOrNull(value);
      if (reading !== null) readings.push(reading);
    });
  });
  return readings.length ? Math.max(...readings) : 0;
}

export function getVehicleMaintenanceStatus(vehicle = {}, trips = [], drivers = []) {
  const odometer = deriveVehicleOdometer(vehicle, trips, drivers);
  const interval = Math.max(500, numberOrNull(vehicle.oilChangeIntervalMiles) || 5000);
  const lastService = numberOrNull(vehicle.lastOilChangeOdometer);
  const explicitNext = numberOrNull(vehicle.nextOilChangeOdometer ?? vehicle.nextOilChange);
  const nextService = explicitNext ?? ((lastService ?? numberOrNull(vehicle.odometer) ?? 0) + interval);
  const milesRemaining = nextService - odometer;
  const status = milesRemaining < 0 ? 'overdue' : milesRemaining <= 500 ? 'due_soon' : 'healthy';
  return { odometer, interval, lastService, nextService, milesRemaining, status };
}

export function summarizeFleetMaintenance(vehicles = [], trips = [], drivers = []) {
  const records = vehicles.map((vehicle) => ({ vehicle, ...getVehicleMaintenanceStatus(vehicle, trips, drivers) }));
  return {
    records,
    overdue: records.filter((item) => item.status === 'overdue').length,
    dueSoon: records.filter((item) => item.status === 'due_soon').length,
    healthy: records.filter((item) => item.status === 'healthy').length,
  };
}
