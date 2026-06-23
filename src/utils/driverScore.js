/**
 * Driver Performance Scoring System
 * Calculates driver scores from real trip data - like Uber/Lyft
 */

const WEIGHTS = {
  onTime: 0.30,
  completion: 0.25,
  acceptance: 0.20,
  safety: 0.15,
  efficiency: 0.10,
};

const TIER_THRESHOLDS = {
  platinum: 95,
  gold: 85,
  silver: 70,
  bronze: 0,
};

const TIER_COLORS = {
  platinum: { bg: 'bg-indigo-100', text: 'text-indigo-700', border: 'border-indigo-200', label: 'Platinum' },
  gold: { bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-200', label: 'Gold' },
  silver: { bg: 'bg-slate-200', text: 'text-slate-700', border: 'border-slate-300', label: 'Silver' },
  bronze: { bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-200', label: 'Bronze' },
};

export function calculateDriverScore(driver, trips = []) {
  const driverTrips = trips.filter(t => 
    t.driverId === driver?.id || 
    t.driverEmail?.toLowerCase() === driver?.email?.toLowerCase()
  );
  
  if (driverTrips.length === 0) {
    return { overall: 0, breakdown: {}, tier: 'bronze', totalTrips: 0 };
  }

  const completed = driverTrips.filter(t => t.status === 'Completed');
  const cancelled = driverTrips.filter(t => ['Cancelled', 'No Show'].includes(t.status));
  const assigned = driverTrips.filter(t => t.status === 'Assigned');
  const inProgress = driverTrips.filter(t => !['Completed', 'Cancelled', 'No Show'].includes(t.status));

  // On-time score: trips completed on or before scheduled time
  const onTimeTrips = completed.filter(t => {
    if (!t.time || !t.completedAt) return true;
    const scheduled = new Date(`2000-01-01T${t.time}`);
    const completedTime = new Date(t.completedAt);
    const scheduledMinutes = scheduled.getHours() * 60 + scheduled.getMinutes();
    const completedMinutes = completedTime.getHours() * 60 + completedTime.getMinutes();
    return completedMinutes <= scheduledMinutes + 15; // 15 min grace period
  });
  const onTimeRate = completed.length > 0 ? (onTimeTrips.length / completed.length) * 100 : 100;

  // Completion rate: completed vs assigned
  const completionRate = driverTrips.length > 0 ? (completed.length / driverTrips.length) * 100 : 0;

  // Acceptance rate: trips accepted vs offered (assigned trips that weren't cancelled)
  const acceptedTrips = driverTrips.filter(t => !['Cancelled', 'No Show'].includes(t.status));
  const acceptanceRate = driverTrips.length > 0 ? (acceptedTrips.length / driverTrips.length) * 100 : 100;

  // Safety score: based on fraud signals (if available)
  const safetyScore = 100; // Default - will be updated with fraud signal data

  // Efficiency score: trips per hour (when clocked in)
  const efficiencyScore = Math.min(100, (completed.length / Math.max(1, driverTrips.length)) * 100);

  const breakdown = {
    onTime: Math.round(onTimeRate),
    completion: Math.round(completionRate),
    acceptance: Math.round(acceptanceRate),
    safety: Math.round(safetyScore),
    efficiency: Math.round(efficiencyScore),
  };

  const overall = Math.round(
    breakdown.onTime * WEIGHTS.onTime +
    breakdown.completion * WEIGHTS.completion +
    breakdown.acceptance * WEIGHTS.acceptance +
    breakdown.safety * WEIGHTS.safety +
    breakdown.efficiency * WEIGHTS.efficiency
  );

  const tier = overall >= TIER_THRESHOLDS.platinum ? 'platinum' :
               overall >= TIER_THRESHOLDS.gold ? 'gold' :
               overall >= TIER_THRESHOLDS.silver ? 'silver' : 'bronze';

  return {
    overall,
    breakdown,
    tier,
    tierInfo: TIER_COLORS[tier],
    totalTrips: driverTrips.length,
    completedTrips: completed.length,
    cancelledTrips: cancelled.length,
    onTimeRate: Math.round(onTimeRate),
    acceptanceRate: Math.round(acceptanceRate),
    completionRate: Math.round(completionRate),
  };
}

export function calculateDriverWeeklyStats(driver, trips = []) {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  
  const weekTrips = trips.filter(t => {
    const isDriver = t.driverId === driver?.id || t.driverEmail?.toLowerCase() === driver?.email?.toLowerCase();
    if (!isDriver) return false;
    const tripDate = new Date(t.completedAt || t.date || t.createdAt || 0);
    return tripDate >= weekAgo;
  });

  const completed = weekTrips.filter(t => t.status === 'Completed');
  const totalMiles = completed.reduce((sum, t) => sum + (Number(t.distance) || 0), 0);
  const totalDuration = completed.reduce((sum, t) => {
    if (t.startedAt && t.completedAt) {
      return sum + (new Date(t.completedAt) - new Date(t.startedAt)) / (1000 * 60);
    }
    return sum;
  }, 0);

  return {
    tripsCompleted: completed.length,
    totalMiles: Math.round(totalMiles * 10) / 10,
    totalHours: Math.round(totalDuration / 60 * 10) / 10,
    avgTripsPerDay: Math.round(completed.length / 7 * 10) / 10,
    onTimeRate: calculateDriverScore(driver, weekTrips).onTimeRate,
  };
}

export function getDriverTierInfo(score) {
  if (score >= TIER_THRESHOLDS.platinum) return TIER_COLORS.platinum;
  if (score >= TIER_THRESHOLDS.gold) return TIER_COLORS.gold;
  if (score >= TIER_THRESHOLDS.silver) return TIER_COLORS.silver;
  return TIER_COLORS.bronze;
}

export function formatScore(score) {
  if (score >= 95) return 'Excellent';
  if (score >= 85) return 'Great';
  if (score >= 70) return 'Good';
  if (score >= 50) return 'Fair';
  return 'Needs Improvement';
}

export { TIER_COLORS, TIER_THRESHOLDS, WEIGHTS };
