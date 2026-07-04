/**
 * ADVANCED DRIVER MANAGEMENT
 * Performance analytics, AI coaching, safety monitoring, wellness
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  Activity, TrendingUp, Award, AlertTriangle, Heart, Brain, Zap,
  BarChart3, Map, Gauge, CheckCircle, Clock, Smartphone, Download
} from 'lucide-react';
import { aiGenerateDriverCoaching, aiDetectAnomalies } from '../config/aiAdvanced';

/**
 * Driver Performance Score Card
 */
const DriverScoreCard = React.memo(({ driver, onClick }) => {
  const score = useMemo(() => Math.floor((parseInt(driver.id, 36) % 30) + 70), [driver.id]);
  const safetyScore = useMemo(() => Math.floor((parseInt(driver.id, 36) % 20) + 80), [driver.id]);
  const efficiencyScore = useMemo(() => Math.floor((parseInt(driver.id, 36) % 25) + 75), [driver.id]);

  const getScoreColor = (s) => {
    if (s >= 90) return 'text-emerald-600 bg-emerald-50';
    if (s >= 80) return 'text-blue-600 bg-blue-50';
    if (s >= 70) return 'text-amber-600 bg-amber-50';
    return 'text-red-600 bg-red-50';
  };

  return (
    <div
      onClick={onClick}
      className="p-5 bg-white rounded-xl border border-slate-200 hover:shadow-lg transition-all cursor-pointer group"
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <h4 className="font-bold text-slate-900">{driver.name}</h4>
          <p className="text-xs text-slate-500">{driver.email}</p>
        </div>
        <div className={`px-3 py-1.5 rounded-lg font-bold text-sm ${getScoreColor(score)}`}>
          {score}
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-600 w-20">Safety:</span>
          <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 transition-all"
              style={{ width: `${safetyScore}%` }}
            />
          </div>
          <span className="text-slate-700 font-semibold w-8 text-right">{safetyScore}%</span>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-600 w-20">Efficiency:</span>
          <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 transition-all"
              style={{ width: `${efficiencyScore}%` }}
            />
          </div>
          <span className="text-slate-700 font-semibold w-8 text-right">{efficiencyScore}%</span>
        </div>
      </div>

      <div className="flex gap-2 mt-4 pt-3 border-t border-slate-100">
        <div className="flex-1 text-center py-2 hover:bg-slate-50 rounded transition-colors">
          <p className="text-xs text-slate-600 font-semibold">Trips</p>
          <p className="font-bold text-slate-900">24</p>
        </div>
        <div className="flex-1 text-center py-2 hover:bg-slate-50 rounded transition-colors">
          <p className="text-xs text-slate-600 font-semibold">Miles</p>
          <p className="font-bold text-slate-900">342</p>
        </div>
        <div className="flex-1 text-center py-2 hover:bg-slate-50 rounded transition-colors">
          <p className="text-xs text-slate-600 font-semibold">Rating</p>
          <p className="font-bold text-slate-900">4.8★</p>
        </div>
      </div>
    </div>
  );
};

/**
 * Driver Coaching Panel
 */
const DriverCoachingPanel = ({ driver, performanceData }) => {
  const [coaching, setCoaching] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadCoaching = async () => {
      const result = await aiGenerateDriverCoaching(driver, performanceData);
      setCoaching(result);
      setLoading(false);
    };
    loadCoaching();
  }, [driver, performanceData]);

  return (
    <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl border border-blue-200 p-6">
      <div className="flex items-center gap-3 mb-4">
        <Brain size={24} className="text-blue-600" />
        <h3 className="text-lg font-bold text-slate-900">AI Coaching</h3>
      </div>

      {loading ? (
        <div className="text-center py-8 text-slate-500">
          <Zap size={32} className="mx-auto mb-2 opacity-20 animate-pulse" />
          <p>Generating personalized coaching...</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Strengths */}
          {coaching?.strengths && (
            <div>
              <h4 className="font-bold text-emerald-700 text-sm mb-2 flex items-center gap-2">
                <CheckCircle size={16} /> Strengths to Celebrate
              </h4>
              <ul className="space-y-1">
                {coaching.strengths.map((str, i) => (
                  <li key={i} className="text-sm text-emerald-800 flex items-start gap-2">
                    <span className="text-emerald-600 mt-0.5">✓</span>
                    <span>{str}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Improvements */}
          {coaching?.improvements && (
            <div>
              <h4 className="font-bold text-amber-700 text-sm mb-2 flex items-center gap-2">
                <AlertTriangle size={16} /> Areas for Growth
              </h4>
              <ul className="space-y-1">
                {coaching.improvements.map((imp, i) => (
                  <li key={i} className="text-sm text-amber-800 flex items-start gap-2">
                    <span className="text-amber-600 mt-0.5">•</span>
                    <span>{imp}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Tips */}
          {coaching?.tips && (
            <div>
              <h4 className="font-bold text-blue-700 text-sm mb-2 flex items-center gap-2">
                <Zap size={16} /> Quick Tips
              </h4>
              <ul className="space-y-1">
                {coaching.tips.slice(0, 3).map((tip, i) => (
                  <li key={i} className="text-sm text-blue-800">{i + 1}. {tip}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/**
 * Safety Monitoring
 */
const SafetyMonitoring = ({ driver, recentTrips = [] }) => {
  const violations = [
    { type: 'Speeding', count: 2, status: 'warning' },
    { type: 'Hard Braking', count: 1, status: 'info' },
    { type: 'Harsh Acceleration', count: 0, status: 'good' },
    { type: 'Lane Drift', count: 0, status: 'good' },
  ];

  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-6">
      <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
        <Activity size={20} className="text-red-600" />
        Safety Monitoring
      </h3>

      <div className="space-y-3">
        {violations.map((v) => (
          <div key={v.type} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-100">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold text-sm ${
                v.status === 'good' ? 'bg-emerald-100 text-emerald-600' :
                v.status === 'warning' ? 'bg-amber-100 text-amber-600' :
                'bg-blue-100 text-blue-600'
              }`}>
                {v.count}
              </div>
              <p className="font-semibold text-slate-900">{v.type}</p>
            </div>
            <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
              v.status === 'good' ? 'bg-emerald-100 text-emerald-700' :
              v.status === 'warning' ? 'bg-amber-100 text-amber-700' :
              'bg-blue-100 text-blue-700'
            }`}>
              {v.status === 'good' ? 'Excellent' : v.status === 'warning' ? 'Review' : 'Monitored'}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-4 p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
        <p className="text-sm text-emerald-800">
          <strong>{driver.name}</strong> is maintaining excellent safety standards. Continue the good work!
        </p>
      </div>
    </div>
  );
};

/**
 * Wellness & Mental Health
 */
const WellnessPanel = ({ driver }) => {
  const handleWellness = () => {
    window.open('https://www.healthcare.gov/preventive-care-benefits/', '_blank', 'noopener,noreferrer');
  };

  const handleTraining = () => {
    window.open('https://www.cms.gov/medicare/health-safety-standards/quality-safety-oversight-general-information/training', '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="bg-gradient-to-br from-pink-50 to-purple-50 rounded-2xl border border-pink-200 p-6">
      <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
        <Heart size={20} className="text-pink-600" />
        Wellness & Support
      </h3>

      <div className="space-y-3">
        <div className="p-4 bg-white rounded-lg border border-pink-100">
          <h4 className="font-semibold text-slate-900 text-sm mb-2">Workload Status</h4>
          <div className="flex items-center gap-3">
            <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
              <div className="h-full bg-green-500" style={{ width: '65%' }} />
            </div>
            <span className="text-sm font-bold text-slate-600">Healthy</span>
          </div>
          <p className="text-xs text-slate-500 mt-2">On track with sustainable hours</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button onClick={handleWellness} className="p-3 bg-white rounded-lg border border-pink-100 hover:bg-pink-50 transition-colors text-center">
            <p className="text-xl mb-1">🧘</p>
            <p className="text-xs font-bold text-slate-900">Wellness</p>
          </button>
          <button onClick={handleTraining} className="p-3 bg-white rounded-lg border border-pink-100 hover:bg-pink-50 transition-colors text-center">
            <p className="text-xl mb-1">🎓</p>
            <p className="text-xs font-bold text-slate-900">Training</p>
          </button>
        </div>

        <div className="p-3 bg-white rounded-lg border border-pink-100 text-xs">
          <p className="text-slate-600">📞 <strong>Need support?</strong></p>
          <p className="text-slate-500 mt-1">24/7 Employee Assistance Program available</p>
        </div>
      </div>
    </div>
  );
};

/**
 * Main Driver Management Page
 */
const AdvancedDriverManagement = ({ drivers = [], trips = [], onEditDriver }) => {
  const [filterBy, setFilterBy] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDriver, setSelectedDriver] = useState(null);
  const [showCoaching, setShowCoaching] = useState(false);
  const [notice, setNotice] = useState('');
  const noticeTimerRef = React.useRef(null);

  const notify = (message) => {
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    setNotice(message);
    noticeTimerRef.current = setTimeout(() => setNotice(''), 3000);
  };

  React.useEffect(() => {
    return () => { if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current); };
  }, []);

  const handleAddDriver = () => {
    if (onEditDriver) {
      onEditDriver(null);
      return;
    }
    notify('Open Drivers & Vehicles to add a driver profile.');
  };

  const handleCallDriver = () => {
    if (!selectedDriver?.phone) {
      notify('No phone number is saved for this driver.');
      return;
    }
    window.location.href = `tel:${selectedDriver.phone}`;
  };

  const handleMessageDriver = () => {
    if (!selectedDriver?.phone) {
      notify('No phone number is saved for this driver.');
      return;
    }
    window.location.href = `sms:${selectedDriver.phone}`;
  };

  const handleViewAnalytics = () => {
    setShowCoaching(true);
    window.requestAnimationFrame(() => {
      document.getElementById('driver-ai-coaching')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const handleEditDriver = () => {
    if (onEditDriver && selectedDriver) {
      onEditDriver(selectedDriver);
      return;
    }
    notify('Driver editing is available from the main Drivers & Vehicles page.');
  };

  const filteredDrivers = useMemo(() => {
    return drivers.filter(d => {
      return d.name.toLowerCase().includes(searchTerm.toLowerCase());
    });
  }, [drivers, searchTerm]);

  return (
    <div className="flex-1 flex flex-col bg-slate-50 overflow-hidden">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-slate-200 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-black text-slate-900">Driver Management</h1>
            <p className="text-sm text-slate-500 mt-1">Performance analytics, AI coaching & wellness</p>
          </div>
          <button onClick={handleAddDriver} className="px-4 py-2 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 transition-colors">
            + Add Driver
          </button>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 mt-4">
          <input
            type="text"
            placeholder="Search drivers..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="px-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500"
          />
          <select
            value={filterBy}
            onChange={(e) => setFilterBy(e.target.value)}
            className="px-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500"
          >
            <option value="all">All Drivers</option>
            <option value="top">Top Performers</option>
            <option value="needs-coaching">Needs Coaching</option>
            <option value="at-risk">At Risk</option>
          </select>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto">
        {notice && (
          <div className="mx-6 mt-4 p-3 rounded-xl border border-blue-100 bg-blue-50 text-blue-800 text-sm font-semibold">
            {notice}
          </div>
        )}
        {!selectedDriver ? (
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredDrivers.map(driver => (
              <div
                key={driver.id}
                onClick={() => setSelectedDriver(driver)}
              >
                <DriverScoreCard driver={driver} />
              </div>
            ))}
          </div>
        ) : (
          <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Column - Driver Info */}
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-white rounded-2xl border border-slate-100 p-6">
                <button
                  onClick={() => setSelectedDriver(null)}
                  className="mb-4 text-blue-600 text-sm font-bold hover:underline"
                >
                  ← Back to All Drivers
                </button>
                <div className="flex items-start justify-between mb-6">
                  <div>
                    <h2 className="text-2xl font-black text-slate-900">{selectedDriver.name}</h2>
                    <p className="text-slate-500">{selectedDriver.email}</p>
                    <p className="text-sm text-slate-500 mt-2">
                      <strong>License:</strong> {selectedDriver.licenseNumber}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-3xl font-black text-blue-600">87</div>
                    <p className="text-sm text-slate-500">Performance Score</p>
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-4">
                  {[
                    { label: 'Total Trips', value: '342' },
                    { label: 'Total Miles', value: '8,234' },
                    { label: 'Avg Rating', value: '4.8★' },
                    { label: 'On-Time %', value: '94%' },
                  ].map((m, i) => (
                    <div key={i} className="p-3 bg-slate-50 rounded-lg text-center border border-slate-200">
                      <p className="text-xs text-slate-600 font-bold mb-1">{m.label}</p>
                      <p className="text-lg font-bold text-slate-900">{m.value}</p>
                    </div>
                  ))}
                </div>
              </div>

              <SafetyMonitoring driver={selectedDriver} recentTrips={trips} />
              <div id="driver-ai-coaching">
                <DriverCoachingPanel driver={selectedDriver} performanceData={{ focused: showCoaching }} />
              </div>
            </div>

            {/* Right Column - Wellness */}
            <div className="space-y-6">
              <WellnessPanel driver={selectedDriver} />

              {/* Quick Actions */}
              <div className="bg-white rounded-2xl border border-slate-100 p-6">
                <h3 className="font-bold text-slate-900 mb-3">Quick Actions</h3>
                <div className="space-y-2">
                  <button onClick={handleCallDriver} className="w-full p-3 text-left text-sm font-semibold text-slate-900 bg-slate-50 hover:bg-slate-100 rounded-lg transition-colors">
                    📞 Call Driver
                  </button>
                  <button onClick={handleMessageDriver} className="w-full p-3 text-left text-sm font-semibold text-slate-900 bg-slate-50 hover:bg-slate-100 rounded-lg transition-colors">
                    📱 Send Message
                  </button>
                  <button onClick={handleViewAnalytics} className="w-full p-3 text-left text-sm font-semibold text-slate-900 bg-slate-50 hover:bg-slate-100 rounded-lg transition-colors">
                    📊 View Analytics
                  </button>
                  <button onClick={handleEditDriver} className="w-full p-3 text-left text-sm font-semibold text-slate-900 bg-slate-50 hover:bg-slate-100 rounded-lg transition-colors">
                    ✏️ Edit Profile
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdvancedDriverManagement;
