/**
 * Driver Earnings & Payroll System
 * Tracks earnings per trip, daily, weekly, monthly
 */

export const EARNINGS_CONFIG = {
  baseRatePerTrip: 25.00,
  perMileRate: 1.50,
  perMinuteRate: 0.25,
  overtimeMultiplier: 1.5,
  overtimeThresholdHours: 8,
  weekendMultiplier: 1.25,
};

export function calculateTripEarnings(trip, config = EARNINGS_CONFIG) {
  if (!trip || trip.status !== 'Completed') return null;

  const miles = Number(trip.actualMiles || trip.distance || 0);
  const minutes = Number(trip.tripDurationMinutes || 0);
  const isWeekend = isWeekendDate(trip.completedAt || trip.date);

  let baseEarnings = config.baseRatePerTrip;
  let mileageEarnings = miles * config.perMileRate;
  let timeEarnings = minutes * config.perMinuteRate;

  let total = baseEarnings + mileageEarnings + timeEarnings;

  if (isWeekend) {
    total *= config.weekendMultiplier;
  }

  return {
    base: Math.round(baseEarnings * 100) / 100,
    mileage: Math.round(mileageEarnings * 100) / 100,
    time: Math.round(timeEarnings * 100) / 100,
    total: Math.round(total * 100) / 100,
    miles,
    minutes,
    isWeekend,
  };
}

export function calculateDailyEarnings(driver, trips, date) {
  const dateKey = typeof date === 'string' ? date : formatDateKey(date);
  const dayTrips = trips.filter(t => {
    const isDriver = t.driverId === driver?.id || t.driverEmail?.toLowerCase() === driver?.email?.toLowerCase();
    if (!isDriver) return false;
    const tripDate = getTripDateKey(t);
    return tripDate === dateKey;
  });

  const completedTrips = dayTrips.filter(t => t.status === 'Completed');
  const earnings = completedTrips.map(t => calculateTripEarnings(t)).filter(Boolean);

  return {
    date: dateKey,
    tripsCompleted: completedTrips.length,
    totalEarnings: earnings.reduce((sum, e) => sum + e.total, 0),
    totalMiles: earnings.reduce((sum, e) => sum + e.miles, 0),
    totalMinutes: earnings.reduce((sum, e) => sum + e.minutes, 0),
    earnings,
  };
}

export function calculateWeeklyEarnings(driver, trips) {
  const today = new Date();
  const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

  const weekTrips = trips.filter(t => {
    const isDriver = t.driverId === driver?.id || t.driverEmail?.toLowerCase() === driver?.email?.toLowerCase();
    if (!isDriver) return false;
    const tripDate = new Date(t.completedAt || t.date || 0);
    return tripDate >= weekAgo;
  });

  const completedTrips = weekTrips.filter(t => t.status === 'Completed');
  const earnings = completedTrips.map(t => calculateTripEarnings(t)).filter(Boolean);

  return {
    tripsCompleted: completedTrips.length,
    totalEarnings: earnings.reduce((sum, e) => sum + e.total, 0),
    totalMiles: earnings.reduce((sum, e) => sum + e.miles, 0),
    totalHours: earnings.reduce((sum, e) => sum + e.minutes, 0) / 60,
    avgEarningsPerTrip: completedTrips.length > 0 ? earnings.reduce((sum, e) => sum + e.total, 0) / completedTrips.length : 0,
    avgEarningsPerMile: earnings.reduce((sum, e) => sum + e.miles, 0) > 0 ? earnings.reduce((sum, e) => sum + e.total, 0) / earnings.reduce((sum, e) => sum + e.miles, 0) : 0,
  };
}

export function calculateMonthlyEarnings(driver, trips) {
  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

  const monthTrips = trips.filter(t => {
    const isDriver = t.driverId === driver?.id || t.driverEmail?.toLowerCase() === driver?.email?.toLowerCase();
    if (!isDriver) return false;
    const tripDate = new Date(t.completedAt || t.date || 0);
    return tripDate >= monthStart;
  });

  const completedTrips = monthTrips.filter(t => t.status === 'Completed');
  const earnings = completedTrips.map(t => calculateTripEarnings(t)).filter(Boolean);

  return {
    tripsCompleted: completedTrips.length,
    totalEarnings: earnings.reduce((sum, e) => sum + e.total, 0),
    totalMiles: earnings.reduce((sum, e) => sum + e.miles, 0),
    totalHours: earnings.reduce((sum, e) => sum + e.minutes, 0) / 60,
  };
}

function isWeekendDate(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const day = d.getDay();
  return day === 0 || day === 6;
}

function formatDateKey(date) {
  const d = date instanceof Date ? date : new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getTripDateKey(trip) {
  if (!trip) return null;
  if (trip.dateKey) return trip.dateKey;
  const dateFields = ['date', 'scheduledDate', 'scheduleDate', 'completedAt'];
  for (const field of dateFields) {
    if (trip[field]) {
      const d = new Date(trip[field]);
      if (!isNaN(d.getTime())) {
        return formatDateKey(d);
      }
    }
  }
  return null;
}

export default {
  EARNINGS_CONFIG,
  calculateTripEarnings,
  calculateDailyEarnings,
  calculateWeeklyEarnings,
  calculateMonthlyEarnings,
};
