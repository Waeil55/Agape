import { useState, useMemo, useEffect } from 'react';
import { Archive, Calendar, Search, X, ChevronDown, ChevronRight, MoreHorizontal } from 'lucide-react';
import { tripMatchesSearch } from '../utils/search';
import TripActionCenter from './trips/TripActionCenter';

const formatClock24 = (value) => {
  if (!value) return '—';
  const s = String(value).trim();
  if (s.includes('T') || /^\d{4}-\d{2}-\d{2}/.test(s)) {
    const d = new Date(s);
    if (!isNaN(d.getTime())) {
      return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    }
  }
  const m = s.toUpperCase().match(/(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?/);
  if (m) {
    let h = parseInt(m[1], 10);
    const min = m[2];
    const p = m[3];
    if (p === 'PM' && h < 12) h += 12;
    if (p === 'AM' && h === 12) h = 0;
    return `${String(h).padStart(2, '0')}:${min}`;
  }
  return '—';
};

const timeToMinutes = (value) => {
  if (!value) return 1440;
  const cleanTime = String(value).toUpperCase().trim();
  if (cleanTime === 'WILL CALL' || cleanTime === 'WC') return 1440;
  const m = cleanTime.match(/(\d{1,2})(?::(\d{1,2}))?\s*(AM|PM)?/);
  if (!m) return 1440;
  let h = parseInt(m[1], 10);
  const minutes = parseInt(m[2] || '0', 10);
  const p = m[3];
  if (p === 'PM' && h < 12) h += 12;
  if (p === 'AM' && h === 12) h = 0;
  return h * 60 + minutes;
};

const parseDateOrClock = (value) => {
  if (!value) return null;
  const s = String(value).trim();
  if (!s) return null;
  if (s.includes('T') || /^\d{4}-\d{2}-\d{2}/.test(s)) {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const m = s.toUpperCase().match(/(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?/);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const p = m[3];
  if (p === 'PM' && h < 12) h += 12;
  if (p === 'AM' && h === 12) h = 0;
  const d = new Date();
  d.setHours(h, min, 0, 0);
  return d;
};

const calcMiles = (pickupOdo, dropoffOdo) => {
  if (!pickupOdo || !dropoffOdo) return '—';
  const diff = Number(dropoffOdo) - Number(pickupOdo);
  return diff > 0 ? diff.toFixed(1) : '—';
};

const calcDuration = (start, end) => {
  if (!start || !end) return '—';
  const s = parseDateOrClock(start);
  const e = parseDateOrClock(end);
  if (!s || !e || isNaN(s.getTime()) || isNaN(e.getTime())) return '—';
  const diff = Math.round((e - s) / 60000);
  if (diff < 0) return '—';
  const h = Math.floor(diff / 60);
  const m = diff % 60;
  return h > 0 ? `${h}h${m > 0 ? m : ''}` : `${m}m`;
};

const formatDateLabel = (dateStr) => {
  if (dateStr === 'No Date') return 'No Date';
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
};

const getDriverLabel = (trip, drivers) => {
  if (!drivers || !trip) return '—';
  const driver = drivers.find(d => d.id === trip.driverId || d.email === trip.driverEmail);
  return driver?.name || trip.driverName || '—';
};





const ArchivesPage = ({ trashedTrips = [], restoreTrip, drivers = [], role }) => {
  const [searchQuery, setSearchQuery] = useState(() => localStorage.getItem('agape_archiveSearch') || '');
  const [sortColumn] = useState(() => localStorage.getItem('agape_archiveSortCol') || 'time');
  const [sortDirection] = useState(() => localStorage.getItem('agape_archiveSortDir') || 'asc');
  const [startDate, setStartDate] = useState(() => localStorage.getItem('agape_archiveStartDate') || '');
  const [endDate, setEndDate] = useState(() => localStorage.getItem('agape_archiveEndDate') || '');
  const [activeRow, setActiveRow] = useState(null);
  const [actionTrip, setActionTrip] = useState(null);
  const [expandedGroups, setExpandedGroups] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('agape_archiveExpandedGroups') || '{}');
    } catch { return {}; }
  });

  useEffect(() => {
    localStorage.setItem('agape_archiveSearch', searchQuery);
    localStorage.setItem('agape_archiveSortCol', sortColumn);
    localStorage.setItem('agape_archiveSortDir', sortDirection);
    localStorage.setItem('agape_archiveStartDate', startDate);
    localStorage.setItem('agape_archiveEndDate', endDate);
    localStorage.setItem('agape_archiveExpandedGroups', JSON.stringify(expandedGroups));
  }, [searchQuery, sortColumn, sortDirection, startDate, endDate, expandedGroups]);

  const toggleGroup = (dateLabel) => {
    setExpandedGroups(prev => ({
      ...prev,
      [dateLabel]: !prev[dateLabel]
    }));
  };

  // ===== RESIZABLE COLUMNS =====
  const DEFAULT_COL_WIDTHS = {
    date: 100, driver: 100, time: 80, bookingId: 90,
    patient: 110, pickup: 160, dropoff: 160,
    arrivalTime: 80, departedPickupTime: 80, arrivalDropoffTime: 80,
    pickupOdometer: 90, dropoffOdometer: 90,
    travelTime: 80, distance: 80, signature: 75, vehicle: 80,
  };
  const [colWidths] = useState(() => {
    try { return { ...DEFAULT_COL_WIDTHS, ...JSON.parse(localStorage.getItem('agape_archiveColWidths') || '{}') }; } catch { return { ...DEFAULT_COL_WIDTHS }; }
  });
  useEffect(() => { localStorage.setItem('agape_archiveColWidths', JSON.stringify(colWidths)); }, [colWidths]);
  // =========================





  const getSortValue = (trip, key) => {
    switch (key) {
      case 'date': return trip.date || '';
      case 'driver': return getDriverLabel(trip, drivers);
      case 'time':
        if ((trip.date || '') !== '') return trip.date + String(timeToMinutes(trip.time)).padStart(4, '0');
        return String(timeToMinutes(trip.time)).padStart(4, '0');
      case 'bookingId': return trip.bookingId || trip.id || '';
      case 'patient': return trip.patient || '';
      case 'pickup': return trip.pickup || '';
      case 'dropoff': return trip.dropoff || '';
      case 'arrivalTime': return trip.arrivalTime || '';
      case 'departedPickupTime': return trip.departedPickupTime || '';
      case 'arrivalDropoffTime': return trip.arrivalDropoffTime || '';
      case 'pickupOdometer': return Number(trip.pickupOdometer || 0);
      case 'dropoffOdometer': return Number(trip.dropoffOdometer || 0);
      case 'travelTime': return (trip.departedPickupTime || trip.arrivalTime) && (trip.arrivalDropoffTime || trip.completedAt) ? new Date(trip.arrivalDropoffTime || trip.completedAt) - new Date(trip.departedPickupTime || trip.arrivalTime) : 0;
      case 'distance': return calcMiles(trip.pickupOdometer, trip.dropoffOdometer);
      case 'signature': return trip.paperSignatureConfirmed ? 1 : 0;
      case 'vehicle': return trip.completedVehicle || '';
      default: return '';
    }
  };

  const renderCellValue = (trip, col) => {
    switch (col.key) {
      case 'date': return formatDateLabel(trip.date || 'No Date');
      case 'driver': return getDriverLabel(trip, drivers);
      case 'time': return formatClock24(trip.time) !== '—' ? formatClock24(trip.time) : formatClock24(trip.arrivalTime);
      case 'bookingId': return trip.bookingId || trip.id || '—';
      case 'patient': return trip.patient || '—';
      case 'pickup': return trip.pickup || '—';
      case 'dropoff': return trip.dropoff || '—';
      case 'arrivalTime': return formatClock24(trip.arrivalTime);
      case 'departedPickupTime': return formatClock24(trip.departedPickupTime);
      case 'arrivalDropoffTime': return formatClock24(trip.arrivalDropoffTime || trip.completedAt);
      case 'pickupOdometer': return trip.pickupOdometer || '';
      case 'dropoffOdometer': return trip.dropoffOdometer || '';
      case 'travelTime': return calcDuration(trip.departedPickupTime || trip.arrivalTime, trip.arrivalDropoffTime || trip.completedAt);
      case 'distance': { const m = calcMiles(trip.pickupOdometer, trip.dropoffOdometer); return m !== '—' ? m : '—'; }
      case 'signature': {
        if (!('paperSignatureConfirmed' in trip)) return '—';
        return trip.paperSignatureConfirmed ? 'Yes' : 'No';
      }
      case 'vehicle': { const v = trip.completedVehicle || ''; return v && v !== 'Pending Assignment' ? v : '—'; }
      default: return '—';
    }
  };



  const filtered = useMemo(() => {
    let list = [...trashedTrips];

    if (startDate) list = list.filter(t => (t.date || '') >= startDate);
    if (endDate) list = list.filter(t => (t.date || '') <= endDate);

    if (searchQuery) {
      list = list.filter(t => tripMatchesSearch(t, searchQuery, [
        getDriverLabel(t, drivers),
        drivers.find(driver => driver.id === t.driverId)?.phone,
      ]));
    }

    list.sort((a, b) => {
      let cmp = 0;
      const aVal = getSortValue(a, sortColumn);
      const bVal = getSortValue(b, sortColumn);
      if (typeof aVal === 'string' && typeof bVal === 'string') cmp = aVal.localeCompare(bVal);
      else if (aVal < bVal) cmp = -1;
      else if (aVal > bVal) cmp = 1;
      return sortDirection === 'asc' ? cmp : -cmp;
    });

    return list;
  }, [trashedTrips, searchQuery, sortColumn, sortDirection, startDate, endDate, drivers]);

  const grouped = useMemo(() => {
    const groups = filtered.reduce((acc, trip) => {
      const key = trip.date || 'No Date';
      if (!acc[key]) acc[key] = [];
      acc[key].push(trip);
      return acc;
    }, {});
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);









  const renderMobileArchiveCard = (trip) => (
    <div key={trip.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900">{renderCellValue(trip, { key: 'patient' })}</p>
          <p className="mt-0.5 text-xs font-mono font-semibold text-blue-600">{renderCellValue(trip, { key: 'bookingId' })}</p>
        </div>
        <span className="shrink-0 rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">{renderCellValue(trip, { key: 'time' })}</span>
      </div>
      <div className="mt-3 space-y-2 text-xs font-medium text-slate-600">
        <p className="flex items-start gap-2"><span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-emerald-500" /><span className="break-words text-emerald-700">{renderCellValue(trip, { key: 'pickup' })}</span></p>
        <p className="flex items-start gap-2"><span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-rose-500" /><span className="break-words text-rose-700">{renderCellValue(trip, { key: 'dropoff' })}</span></p>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-xl bg-slate-50 p-3">
          <p className="font-semibold uppercase tracking-wide text-slate-500">Driver</p>
          <p className="mt-1 font-semibold text-slate-700">{renderCellValue(trip, { key: 'driver' })}</p>
        </div>
        <div className="rounded-xl bg-slate-50 p-3">
          <p className="font-semibold uppercase tracking-wide text-slate-500">Vehicle</p>
          <p className="mt-1 font-semibold text-slate-700">{renderCellValue(trip, { key: 'vehicle' })}</p>
        </div>
        <div className="rounded-xl bg-slate-50 p-3">
          <p className="font-semibold uppercase tracking-wide text-slate-500">Miles</p>
          <p className="mt-1 font-semibold text-slate-700">{renderCellValue(trip, { key: 'distance' })}</p>
        </div>
        <div className="rounded-xl bg-slate-50 p-3">
          <p className="font-semibold uppercase tracking-wide text-slate-500">Signature</p>
          <p className="mt-1 font-semibold text-slate-700">{renderCellValue(trip, { key: 'signature' })}</p>
        </div>
      </div>
      <button onClick={() => setActionTrip(trip)} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-50 px-3 py-2 text-xs font-bold text-blue-800 transition-colors hover:bg-blue-100"><MoreHorizontal size={14} /> Trip actions</button>
    </div>
  );

  return (
    <div aria-label="Archived trips" className="flex flex-col flex-1 min-h-0 bg-slate-100 overflow-hidden">
      <div className="bg-white border-b border-slate-200 px-3 py-1.5 flex flex-col lg:flex-row lg:items-center shrink-0 gap-1.5 sticky top-0 z-20">
        <div className="flex items-center gap-1.5 flex-wrap">
          <div className="flex items-center gap-1 bg-slate-100 rounded px-2 py-1 min-w-[140px] max-w-[240px]">
            <Search size={11} className="text-slate-500 shrink-0" />
            <input type="text" placeholder="Search..." value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent text-xs outline-none w-full placeholder:text-slate-500" />
            {searchQuery && <button onClick={() => setSearchQuery('')} className="text-slate-500 hover:text-slate-600"><X size={11} /></button>}
          </div>
          <div className="flex items-center gap-1 bg-slate-100 rounded px-2 py-1">
            <Calendar size={11} className="text-slate-500" />
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
              className="px-1 py-0.5 border border-slate-200 rounded text-xs outline-none focus:border-blue-500 w-[110px]" />
            <span className="text-xs text-slate-500">to</span>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
              className="px-1 py-0.5 border border-slate-200 rounded text-xs outline-none focus:border-blue-500 w-[110px]" />
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain">
        {grouped.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-500">
            <Archive size={40} className="mb-3 opacity-40" />
              <p className="text-sm font-medium">No archived trips found</p>
              <p className="mt-1 text-xs text-slate-500">Try clearing the search or changing the date range.</p>
          </div>
        ) : (
          grouped.map(([dateLabel, dayTrips]) => {
            const isExpanded = expandedGroups[dateLabel] !== false; // default to true
            return (
            <div key={dateLabel} className="border-b border-slate-200 last:border-b-0">
              <div
                className="sticky top-0 z-10 bg-slate-100 border-b border-slate-200 px-4 py-2 flex items-center gap-2 cursor-pointer hover:bg-slate-200 transition-colors"
                onClick={() => toggleGroup(dateLabel)}
              >
                {isExpanded ? <ChevronDown size={16} className="text-slate-500" /> : <ChevronRight size={16} className="text-slate-500" />}
                <Calendar size={13} className="text-slate-500" />
                <span className="text-sm font-semibold text-slate-700">{formatDateLabel(dateLabel)}</span>
                <span className="text-xs text-slate-500 bg-white px-2 py-0.5 rounded-full border border-slate-200">{dayTrips.length} trips</span>
              </div>

              {isExpanded && (
              <>
              <div className="space-y-3 p-3 sm:hidden">
                {dayTrips.map(renderMobileArchiveCard)}
              </div>
              <div className="hidden w-full overflow-x-auto sm:block">
                <table className="w-full table-fixed text-xs">
                  <colgroup>
                    <col className="w-[7%]" />
                    <col className="w-[8%]" />
                    <col className="w-[7%]" />
                    <col className="w-[8%]" />
                    <col className="w-[9%]" />
                    <col className="w-[14%]" />
                    <col className="w-[14%]" />
                    <col className="w-[7%]" />
                    <col className="w-[7%]" />
                    <col className="w-[7%]" />
                    <col className="w-[7%]" />
                    <col className="w-[7%]" />
                    <col className="w-20" />
                  </colgroup>
                  <thead className="sticky top-0 z-10 bg-slate-100 text-slate-700 shadow-sm">
                    <tr>
                      <th className="rounded-tl-xl px-3 py-1.5 text-left font-semibold">Date</th>
                      <th className="px-3 py-1.5 text-left font-semibold">Driver</th>
                      <th className="px-3 py-1.5 text-left font-semibold">Time</th>
                      <th className="px-3 py-1.5 text-left font-semibold">Trip ID</th>
                      <th className="px-3 py-1.5 text-left font-semibold">Passenger</th>
                      <th className="px-3 py-1.5 text-left font-semibold">Pickup</th>
                      <th className="px-3 py-1.5 text-left font-semibold">Dropoff</th>
                      <th className="px-3 py-1.5 text-left font-semibold">PU Time</th>
                      <th className="px-3 py-1.5 text-left font-semibold">DO Time</th>
                      <th className="px-3 py-1.5 text-left font-semibold">PU Odo</th>
                      <th className="px-3 py-1.5 text-left font-semibold">DO Odo</th>
                      <th className="px-3 py-1.5 text-left font-semibold">Vehicle</th>
                      <th className="rounded-tr-xl px-3 py-1.5 text-left font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {dayTrips.map((trip) => {
                      const driverName = getDriverLabel(trip, drivers);
                      const keyVal = (key) => {
                        switch (key) {
                          case 'date': return formatDateLabel(trip.date || 'No Date');
                          case 'driver': return driverName;
                          case 'time': return formatClock24(trip.time) !== '—' ? formatClock24(trip.time) : formatClock24(trip.arrivalTime);
                          case 'bookingId': return trip.bookingId || trip.id || '—';
                          case 'patient': return trip.patient || '—';
                          case 'pickup': return trip.pickup || '—';
                          case 'dropoff': return trip.dropoff || '—';
                          case 'arrivalTime': return formatClock24(trip.arrivalTime);
                          case 'arrivalDropoffTime': return formatClock24(trip.arrivalDropoffTime || trip.completedAt);
                          case 'pickupOdometer': return trip.pickupOdometer || '—';
                          case 'dropoffOdometer': return trip.dropoffOdometer || '—';
                          case 'vehicle': return trip.completedVehicle || '—';
                          default: return '—';
                        }
                      };

                      return (
                        <tr key={trip.id} className={`${activeRow === trip.id ? 'bg-blue-100' : ''} hover:bg-blue-50/50 transition-colors`}>
                          <td className="px-3 py-1.5 text-slate-900">{keyVal('date')}</td>
                          <td className="px-3 py-1.5 text-slate-700">{keyVal('driver')}</td>
                          <td className="px-3 py-1.5 font-mono text-slate-900">{keyVal('time')}</td>
                          <td className="px-3 py-1.5 font-mono text-blue-600">{keyVal('bookingId')}</td>
                          <td className="px-3 py-1.5 text-slate-900">{keyVal('patient')}</td>
                          <td className="px-3 py-1.5 font-mono text-emerald-700 truncate" title={trip.pickup}>{keyVal('pickup')}</td>
                          <td className="px-3 py-1.5 font-mono text-rose-700 truncate" title={trip.dropoff}>{keyVal('dropoff')}</td>
                          <td className="px-3 py-1.5 font-mono text-emerald-600">{keyVal('arrivalTime')}</td>
                          <td className="px-3 py-1.5 font-mono text-rose-600">{keyVal('arrivalDropoffTime')}</td>
                          <td className="px-3 py-1.5 font-mono text-emerald-600">{keyVal('pickupOdometer')}</td>
                          <td className="px-3 py-1.5 font-mono text-rose-600">{keyVal('dropoffOdometer')}</td>
                          <td className="px-3 py-1.5 font-mono text-slate-500 text-[11px] uppercase">{keyVal('vehicle')}</td>
                          <td className="px-3 py-1.5 whitespace-nowrap">
                            <button onClick={() => setActionTrip(trip)} className="flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-800 rounded-lg text-xs font-semibold hover:bg-blue-100 transition-colors"><MoreHorizontal size={12} /> Actions</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              </>
              )}
            </div>
          );
        })
        )}
      </div>
      <TripActionCenter
        open={Boolean(actionTrip)}
        trip={actionTrip}
        driver={actionTrip ? drivers.find((entry) => entry.id === actionTrip.driverId || entry.email === actionTrip.driverEmail) : null}
        role={role}
        onClose={() => setActionTrip(null)}
        callbacks={{
          onView: (trip) => setActiveRow(trip.id),
          onRestore: restoreTrip ? (trip) => restoreTrip(trip.id) : undefined,
        }}
      />
    </div>
  );
};

export default ArchivesPage;
