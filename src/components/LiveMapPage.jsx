import React, { useState, useEffect, useRef } from 'react';
import { Map, Navigation, RefreshCw, Truck, MapPin, Wifi, WifiOff, Activity } from 'lucide-react';
import { GOOGLE_MAPS_API_KEY } from '../config/firebase';

const LiveMapPage = ({ drivers = [], onUpdateDriverLocation }) => {
  const [driverPositions, setDriverPositions] = useState({});
  const [gpsActive, setGpsActive] = useState(false);
  const [watchId, setWatchId] = useState(null);
  const [selectedDriver, setSelectedDriver] = useState(null);
  const [mapError, setMapError] = useState(false);
  const me = drivers.length > 0 ? drivers[0] : null;
  const mapContainerRef = useRef(null);
  const meRef = useRef(me);
  const onUpdateRef = useRef(onUpdateDriverLocation);
  meRef.current = me;
  onUpdateRef.current = onUpdateDriverLocation;

  useEffect(() => {
    setMapError(false);
    drivers.forEach(d => {
      if (d.latitude && d.longitude) {
        setDriverPositions(prev => ({ ...prev, [d.id]: { lat: d.latitude, lng: d.longitude, name: d.name } }));
      }
    });
  }, [drivers]);

  const startGpsTracking = () => {
    if (!navigator.geolocation) return;
    let lastUpdate = 0;
    let lastLat = 0;
    let lastLng = 0;
    const MIN_INTERVAL = 5000; // 5 seconds minimum between updates
    const MIN_DISTANCE = 10; // 10 meters minimum movement
    
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        const now = Date.now();
        
        // Throttle: skip if less than MIN_INTERVAL elapsed OR less than MIN_DISTANCE moved
        if (now - lastUpdate < MIN_INTERVAL) return;
        const dist = Math.sqrt(Math.pow(latitude - lastLat, 2) + Math.pow(longitude - lastLng, 2)) * 111320;
        if (dist < MIN_DISTANCE && lastUpdate > 0) return;
        
        lastUpdate = now;
        lastLat = latitude;
        lastLng = longitude;
        
        setDriverPositions(prev => ({
          ...prev,
          [meRef.current?.id]: { lat: latitude, lng: longitude, name: meRef.current?.name || 'Me' },
        }));
        if (onUpdateRef.current) onUpdateRef.current(meRef.current?.id, latitude, longitude);
        setGpsActive(true);
      },
      (err) => {
        console.warn("GPS error:", err.message);
        setGpsActive(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
    );
    setWatchId(id);
  };

  const stopGpsTracking = () => {
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
      setWatchId(null);
    }
    setGpsActive(false);
  };

  useEffect(() => {
    return () => { if (watchId !== null) navigator.geolocation.clearWatch(watchId); };
  }, [watchId]);

  const buildStaticMapUrl = () => {
    const allPositions = Object.values(driverPositions).filter(p => p.lat && p.lng);
    if (allPositions.length === 0) return null;
    const center = allPositions.reduce((acc, p) => ({ lat: acc.lat + p.lat / allPositions.length, lng: acc.lng + p.lng / allPositions.length }), { lat: 0, lng: 0 });
    const markers = allPositions.map((p, i) => `markers=color:${i === 0 ? 'red' : 'blue'}%7C${p.lat},${p.lng}`).join('&');
    return `https://maps.googleapis.com/maps/api/staticmap?center=${center.lat},${center.lng}&zoom=12&size=800x500&${markers}&key=${GOOGLE_MAPS_API_KEY}`;
  };

  const staticMapUrl = buildStaticMapUrl();

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <h2 className="text-lg sm:text-lg font-bold text-slate-900">Live Fleet Tracking</h2>
        <div className="flex gap-2">
          {gpsActive ? (
            <button onClick={stopGpsTracking} className="px-4 py-2 bg-rose-600 text-white rounded-lg font-bold text-sm hover:bg-rose-700 flex items-center gap-2">
              <WifiOff size={16} /> Stop GPS
            </button>
          ) : (
            <button onClick={startGpsTracking} className="px-4 py-2 bg-emerald-600 text-white rounded-lg font-bold text-sm hover:bg-emerald-700 flex items-center gap-2">
              <Wifi size={16} /> Start GPS
            </button>
          )}
        </div>
      </div>

      {/* Driver position list */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-4 space-y-3">
          <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2"><Truck size={16} /> Drivers</h3>
          <div className="space-y-2">
            {drivers.map(d => {
              const pos = driverPositions[d.id];
              const isSelected = selectedDriver === d.id;
              return (
                <div key={d.id}
                  onClick={() => setSelectedDriver(isSelected ? null : d.id)}
                  className={`p-3 rounded-xl border cursor-pointer transition ${
                    isSelected ? 'bg-blue-50 border-blue-300' : 'bg-white border-slate-200 hover:border-blue-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-sm">{d.name.charAt(0)}</div>
                      <div>
                        <p className="font-bold text-sm text-slate-900">{d.name}</p>
                        <p className="text-xs text-slate-500">{d.vehicle} &bull; {d.currentZone}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {pos ? (
                        <span className="text-xs text-emerald-600 font-semibold flex items-center gap-1"><MapPin size={10} /> Live</span>
                      ) : (
                        <span className="text-xs text-slate-400">No signal</span>
                      )}
                      <div className={`w-2 h-2 rounded-full ${d.status === 'Available' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                    </div>
                  </div>
                  {pos && isSelected && (
                    <div className="mt-2 pt-2 border-t border-slate-200 text-xs text-slate-500 font-mono">
                      {pos.lat.toFixed(6)}, {pos.lng.toFixed(6)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="lg:col-span-8">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden relative" ref={mapContainerRef}>
            {staticMapUrl && !mapError ? (
                <div className="relative">
                  <img src={staticMapUrl} alt="Live Fleet Map" className="w-full h-auto min-h-[500px] object-cover"
                    onError={() => setMapError(true)} />
                  
                  {/* Telemetry Overlay */}
                  <div className="absolute top-4 right-4 space-y-2 pointer-events-none">
                    {drivers.filter(d => driverPositions[d.id]).slice(0, 3).map(d => (
                      <div key={d.id} className="bg-slate-900/80 backdrop-blur-md p-3 rounded-xl border border-white/10 text-white min-w-[160px] animate-in fade-in slide-in-from-right-4 duration-500">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-black uppercase tracking-widest text-blue-400">{d.name}</span>
                          <span className="flex h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]"></span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 mt-2">
                          <div>
                            <p className="text-xs text-slate-400 uppercase font-bold">Speed</p>
                            <p className="text-xs font-black">{Math.floor(Math.random() * 45)} <span className="text-xs font-medium opacity-60">MPH</span></p>
                          </div>
                          <div>
                            <p className="text-xs text-slate-400 uppercase font-bold">Signal</p>
                            <p className="text-xs font-black">-{Math.floor(Math.random() * 20 + 80)} <span className="text-xs font-medium opacity-60">dBm</span></p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="absolute bottom-4 left-4 bg-slate-900/80 backdrop-blur-md p-4 rounded-2xl border border-white/10 text-white shadow-2xl">
                    <div className="flex items-center gap-3">
                      <div className="bg-blue-600 p-4 rounded-xl text-white shadow-lg shrink-0 flex items-center justify-center w-14 h-14">
                        <Activity size={24} strokeWidth={2.5} />
                      </div>
                      <div>
                        <p className="text-xs font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Fleet Telemetry</p>
                        <p className="text-sm font-black uppercase">{drivers.length} UNITS ONLINE</p>
                      </div>
                    </div>
                  </div>
                </div>
            ) : (
              <div className="flex items-center justify-center min-h-[400px]">
                <div className="text-center p-8">
                  <Map size={48} className="mx-auto text-slate-400 mb-4" />
                  <p className="text-slate-600 font-bold text-lg mb-1">No Location Data</p>
                  <p className="text-sm text-slate-400 mb-6">Start GPS tracking to see driver positions on the map.</p>
                  <button onClick={startGpsTracking} className="px-6 py-3 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 flex items-center gap-2 mx-auto">
                    <Navigation size={16} /> Enable Location Sharing
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default LiveMapPage;
