import React, { useState, useEffect } from 'react';
import { Moon, Sun, Type, MapPin, Bell, Share2, LogOut } from 'lucide-react';

const DriverSettings = () => {
  const [darkMode, setDarkMode] = useState(localStorage.getItem('darkMode') === 'true');
  const [fontSize, setFontSize] = useState(localStorage.getItem('fontSize') || 'medium');
  const [gpsApp, setGpsApp] = useState(localStorage.getItem('gpsApp') || 'google');
  const [notificationsEnabled, setNotificationsEnabled] = useState(
    localStorage.getItem('notifications') !== 'false'
  );
  const [locationSharing, setLocationSharing] = useState(
    localStorage.getItem('locationSharing') === 'true'
  );

  useEffect(() => {
    localStorage.setItem('darkMode', darkMode);
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  useEffect(() => {
    localStorage.setItem('fontSize', fontSize);
    const rootElement = document.documentElement;
    if (fontSize === 'small') {
      rootElement.style.fontSize = '14px';
    } else if (fontSize === 'large') {
      rootElement.style.fontSize = '18px';
    } else {
      rootElement.style.fontSize = '16px';
    }
  }, [fontSize]);

  useEffect(() => {
    localStorage.setItem('gpsApp', gpsApp);
  }, [gpsApp]);

  useEffect(() => {
    localStorage.setItem('notifications', notificationsEnabled);
  }, [notificationsEnabled]);

  useEffect(() => {
    localStorage.setItem('locationSharing', locationSharing);
  }, [locationSharing]);

  const handleLocationSharingToggle = async () => {
    if (!locationSharing) {
      try {
        await navigator.permissions.query({ name: 'geolocation' });
        setLocationSharing(true);
      } catch (error) {
        console.error('Geolocation permission error:', error);
      }
    } else {
      setLocationSharing(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-6">
      <h2 className="text-2xl font-bold mb-6">Driver Settings</h2>

      <div className="bg-white dark:bg-gray-800 rounded-lg p-4 space-y-4">
        <h3 className="font-bold text-lg flex items-center gap-2">
          {darkMode ? <Moon size={20} /> : <Sun size={20} />}
          Appearance
        </h3>

        <div className="flex justify-between items-center">
          <label className="flex items-center gap-2 cursor-pointer">
            {darkMode ? <Moon size={18} /> : <Sun size={18} />}
            <span>Dark Mode</span>
          </label>
          <button
            onClick={() => setDarkMode(!darkMode)}
            className={`relative w-14 h-8 rounded-full transition-colors ${darkMode ? 'bg-blue-600' : 'bg-gray-300'}`}
          >
            <div className={`absolute top-1 w-6 h-6 bg-white rounded-full transition-transform ${darkMode ? 'translate-x-7' : 'translate-x-1'}`} />
          </button>
        </div>

        <div className="space-y-2">
          <label className="flex items-center gap-2 font-semibold">
            <Type size={18} />
            Font Size
          </label>
          <div className="grid grid-cols-3 gap-2">
            {['small', 'medium', 'large'].map((size) => (
              <button
                key={size}
                onClick={() => setFontSize(size)}
                className={`py-2 px-4 rounded font-semibold transition-colors ${
                  fontSize === size
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white'
                }`}
              >
                {size.charAt(0).toUpperCase() + size.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg p-4 space-y-4">
        <h3 className="font-bold text-lg flex items-center gap-2">
          <MapPin size={20} />
          Navigation
        </h3>

        <div className="space-y-2">
          <label className="block font-semibold">Preferred GPS App</label>
          <select
            value={gpsApp}
            onChange={(e) => setGpsApp(e.target.value)}
            className="w-full px-4 py-2 border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded-lg focus:outline-none focus:border-blue-500"
          >
            <option value="google">Maps - Google</option>
            <option value="apple">Maps - Apple</option>
            <option value="waze">Navigation - Waze</option>
          </select>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg p-4 space-y-4">
        <h3 className="font-bold text-lg flex items-center gap-2">
          <Share2 size={20} />
          Privacy & Location
        </h3>

        <div className="flex justify-between items-center">
          <label className="flex items-center gap-2 cursor-pointer">
            <Share2 size={18} />
            <div>
              <p className="font-semibold">Location Sharing</p>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Share with dispatcher & admin
              </p>
            </div>
          </label>
          <button
            onClick={handleLocationSharingToggle}
            className={`relative w-14 h-8 rounded-full transition-colors ${locationSharing ? 'bg-green-600' : 'bg-gray-300'}`}
          >
            <div className={`absolute top-1 w-6 h-6 bg-white rounded-full transition-transform ${locationSharing ? 'translate-x-7' : 'translate-x-1'}`} />
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg p-4 space-y-4">
        <h3 className="font-bold text-lg flex items-center gap-2">
          <Bell size={20} />
          Notifications
        </h3>

        <div className="space-y-3">
          {[
            { key: 'trip', label: 'Trip Updates', description: 'New trips and changes' },
            { key: 'message', label: 'Messages', description: 'From dispatcher' },
            { key: 'urgent', label: 'Urgent Changes', description: 'Schedule changes' }
          ].map((notif) => (
            <div key={notif.key} className="flex justify-between items-start">
              <div>
                <p className="font-semibold">{notif.label}</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">{notif.description}</p>
              </div>
              <button
                className={`relative w-12 h-7 rounded-full transition-colors ${notificationsEnabled ? 'bg-blue-600' : 'bg-gray-300'}`}
              >
                <div className={`absolute top-1 w-5 h-5 bg-white rounded-full transition-transform ${notificationsEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg p-4 space-y-4">
        <h3 className="font-bold text-lg">Account</h3>
        <button className="w-full py-3 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 flex items-center justify-center gap-2">
          <LogOut size={18} />
          Sign Out
        </button>
      </div>

      <div className="text-center text-sm text-gray-600 dark:text-gray-400 pb-4">
        <p>Driver App v1.0.0</p>
        <p>Copyright 2026 Agape Care</p>
      </div>
    </div>
  );
};

export default DriverSettings;
