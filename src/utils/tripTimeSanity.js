// Sanity-checks the two real, already-recorded timestamps of one trip leg
// (arrival at a location vs. departure from it). This never invents or
// changes a value — it only tells an editor's UI that the two numbers look
// wrong together, so a human notices and can correct them deliberately.
// See AGENTS.md "WellTrans non-negotiable safety contract": timestamps are
// never inferred or auto-filled, only flagged for human review.

// A pickup/dropoff leg is loading or unloading a rider — normally a few
// minutes. Above this, the gap is unusual enough to call out, without being
// so tight it nags on every ordinary longer curb wait.
export const TRIP_LEG_MAX_GAP_MINUTES = 60;

export function evaluateTripLegGap(arrivalIso, departureIso, maxGapMinutes = TRIP_LEG_MAX_GAP_MINUTES) {
  if (!arrivalIso || !departureIso) return null;
  const arrival = new Date(arrivalIso);
  const departure = new Date(departureIso);
  if (Number.isNaN(arrival.getTime()) || Number.isNaN(departure.getTime())) return null;
  const gapMinutes = Math.round((departure.getTime() - arrival.getTime()) / 60000);
  if (gapMinutes < 0) {
    return {
      severity: 'invalid',
      gapMinutes,
      message: `Departure is ${Math.abs(gapMinutes)} min before arrival — check these times.`,
    };
  }
  if (gapMinutes > maxGapMinutes) {
    return {
      severity: 'warn',
      gapMinutes,
      message: `${gapMinutes} min between arrival and departure — check these times.`,
    };
  }
  return null;
}
