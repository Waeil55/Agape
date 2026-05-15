import React, { useState } from 'react';
import { Archive, SearchX, RefreshCcw, Trash2 } from 'lucide-react';

const ArchivesPage = ({ trashedTrips = [], restoreTrip }) => {
  const [searchTerm, setSearchTerm] = useState('');

  const filtered = trashedTrips.filter(t =>
    !searchTerm || t.patient?.toLowerCase().includes(searchTerm.toLowerCase()) || t.id?.toLowerCase().includes(searchTerm.toLowerCase()) || t.bookingId?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">Archives</h2>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Search</label>
            <div className="flex gap-2">
              <input type="text" placeholder="Search archives..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="flex-1 px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500 text-sm" />
              {searchTerm && <button onClick={() => setSearchTerm('')} className="p-2 text-slate-600 hover:text-slate-900"><SearchX size={20} /></button>}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 sm:p-6 border-b border-slate-200 flex items-center gap-3">
          <Archive size={20} className="text-slate-600 shrink-0" />
          <div className="min-w-0">
            <h3 className="text-lg sm:text-xl font-bold text-slate-900">Deleted Trips</h3>
            <p className="text-xs sm:text-sm text-slate-600">{trashedTrips.length} archived trip{trashedTrips.length !== 1 ? 's' : ''}</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-[11px] sm:text-sm font-semibold text-slate-600">Booking ID</th>
                <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-[11px] sm:text-sm font-semibold text-slate-600">Patient</th>
                <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-[11px] sm:text-sm font-semibold text-slate-600 hidden sm:table-cell">Pickup</th>
                <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-[11px] sm:text-sm font-semibold text-slate-600 hidden sm:table-cell">Dropoff</th>
                <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-[11px] sm:text-sm font-semibold text-slate-600">Time</th>
                <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-[11px] sm:text-sm font-semibold text-slate-600">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan="6" className="px-3 sm:px-6 py-8 sm:py-12 text-center text-slate-500 text-sm">No archived trips found.</td></tr>
              ) : (
                filtered.map(trip => (
                  <tr key={trip.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-3 sm:px-6 py-2 sm:py-4 font-mono text-[11px] sm:text-sm text-slate-600">{trip.bookingId || '—'}</td>
                    <td className="px-3 sm:px-6 py-2 sm:py-4 text-xs sm:text-sm font-semibold text-slate-900 line-through">{trip.patient}</td>
                    <td className="px-3 sm:px-6 py-2 sm:py-4 text-[11px] sm:text-sm text-slate-600 max-w-[120px] sm:max-w-[200px] truncate hidden sm:table-cell">{trip.pickup}</td>
                    <td className="px-3 sm:px-6 py-2 sm:py-4 text-[11px] sm:text-sm text-slate-600 max-w-[120px] sm:max-w-[200px] truncate hidden sm:table-cell">{trip.dropoff}</td>
                    <td className="px-3 sm:px-6 py-2 sm:py-4 text-xs sm:text-sm text-slate-600">{trip.time}</td>
                    <td className="px-3 sm:px-6 py-2 sm:py-4">
                      {restoreTrip && (
                        <button onClick={() => restoreTrip(trip.id)} className="flex items-center gap-1 px-2 sm:px-3 py-1 sm:py-1.5 bg-emerald-100 text-emerald-700 rounded-lg text-[10px] sm:text-xs font-semibold hover:bg-emerald-200">
                          <RefreshCcw size={12} /> Restore
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ArchivesPage;
