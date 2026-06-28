import React, { useState, useEffect } from 'react';
import { 
  Home, Map, Clock, MessageCircle, Settings,
  PhoneCall, ChevronLeft, ChevronRight, Search, 
  CheckCircle2, XCircle, AlertTriangle, RefreshCw, User, ChevronDown, 
  Edit2, RotateCcw, Check, Video, Info, PlusCircle, ImageIcon, 
  Camera, Mic, Send
} from 'lucide-react';
import DriverPage from './DriverPage';
import AdminPage from './AdminPage';
import ReportsPage from './ReportsPage';
import MobileChatPage from './MobileChatPage';
import LiveMapPage from './LiveMapPage';

const MobileEnterpriseDashboard = (props) => {
  const { trips, drivers, dispatchers, currentUser, role, onSignOut } = props;
  const [currentView, setCurrentView] = useState('reports'); // home, map, reports, chat, settings

  const getProfileAbbr = () => {
    return role === 'admin' ? 'AD' : 'DS';
  };

  const getProfileTitle = () => {
    return role === 'admin' ? 'Agape Care Admin' : 'Agape Care Dispatch';
  };

  const renderTopBar = (title) => (
    <div className="px-4 py-3 flex items-center justify-between bg-white border-b border-gray-100 shrink-0 sticky top-0 z-50">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-blue-50 rounded-full flex items-center justify-center text-blue-600 font-bold border border-blue-100 shrink-0">
          <span className="text-xs">{getProfileAbbr()}</span>
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-extrabold text-sm text-gray-900">{getProfileTitle()}</h1>
            <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full"></div>
          </div>
          <p className="text-xs text-gray-500 font-medium">{currentUser}</p>
        </div>
      </div>
      
      <div className="flex items-center gap-2">
        <button className="flex items-center gap-1 border border-gray-200 rounded-full px-2.5 py-1 text-[10px] font-bold text-gray-500 hover:bg-gray-50 shadow-sm transition-all active:scale-95">
          <PhoneCall className="w-3 h-3" /> DISP
        </button>
        <button className="flex items-center gap-1 border border-gray-200 rounded-full px-2.5 py-1 text-[10px] font-bold text-gray-500 hover:bg-gray-50 shadow-sm transition-all active:scale-95">
          <Map className="w-3 h-3" /> ROUT
        </button>
      </div>
    </div>
  );

  const renderContent = () => {
    if (currentView === 'home') {
      return (
        <div className="flex-1 overflow-hidden relative">
          {renderTopBar('Drive')}
          <div className="absolute inset-0 top-[65px]">
            <DriverPage {...props} isEmbedded={true} />
          </div>
        </div>
      );
    }

    if (currentView === 'map') {
      return (
        <div className="flex-1 overflow-hidden flex flex-col bg-gray-50 relative">
          <div className="absolute inset-0 top-0">
            <LiveMapPage {...props} />
          </div>
        </div>
      );
    }
    
    if (currentView === 'reports') {
      return (
        <div className="flex-1 overflow-hidden flex flex-col bg-gray-50">
          {renderTopBar('History')}
          <div className="flex-1 overflow-y-auto">
             <ReportsPage {...props} />
          </div>
        </div>
      );
    }

    if (currentView === 'chat') {
      return (
        <div className="flex-1 overflow-hidden flex flex-col bg-gray-50">
          <MobileChatPage {...props} />
        </div>
      );
    }

    if (currentView === 'settings') {
      return (
        <div className="flex-1 overflow-hidden flex flex-col bg-gray-50">
          {renderTopBar('Admin Tools')}
          <div className="flex-1 overflow-y-auto">
             <AdminPage {...props} />
          </div>
        </div>
      );
    }

    // Default or Placeholder views
    return (
      <div className="flex-1 overflow-hidden flex flex-col bg-white">
        {renderTopBar(currentView.charAt(0).toUpperCase() + currentView.slice(1))}
        <div className="flex-1 flex items-center justify-center">
          <p className="text-gray-400 font-medium">{currentView} View Content</p>
        </div>
      </div>
    );
  };

  return (
    <div className="w-full h-[100dvh] bg-white flex flex-col relative max-w-md mx-auto shadow-xl">
      {/* Dynamic Content */}
      {renderContent()}

      {/* BOTTOM NAVIGATION (Exact match to user's code) */}
      <div className="absolute bottom-0 w-full bg-white border-t border-gray-200 pb-safe z-20 shrink-0">
        <div className="flex justify-around items-center pt-2 pb-6 px-2">
          <button 
            onClick={() => setCurrentView('home')}
            className={`flex flex-col items-center gap-1 p-2 w-16 transition-colors ${currentView === 'home' ? 'text-[#2b4c7e]' : 'text-gray-400 hover:text-[#2b4c7e]'}`}
          >
            {currentView === 'home' && <Home className="w-6 h-6 opacity-20 absolute top-2 left-1/2 -translate-x-1/2" fill="currentColor" />}
            <Home className="w-6 h-6 relative z-10" />
            <span className="text-[10px] font-semibold mt-1">Trips</span>
          </button>

          <button 
            onClick={() => setCurrentView('map')}
            className={`flex flex-col items-center gap-1 p-2 w-16 transition-colors ${currentView === 'map' ? 'text-[#2b4c7e]' : 'text-gray-400 hover:text-[#2b4c7e]'}`}
          >
            {currentView === 'map' && <Map className="w-6 h-6 opacity-20 absolute top-2 left-1/2 -translate-x-1/2" fill="currentColor" />}
            <Map className="w-6 h-6 relative z-10" />
            <span className="text-[10px] font-semibold mt-1">Route</span>
          </button>

          <button 
            onClick={() => setCurrentView('reports')}
            className={`flex flex-col items-center gap-1 p-2 w-16 relative transition-colors ${currentView === 'reports' ? 'text-[#2b4c7e]' : 'text-gray-400 hover:text-[#2b4c7e]'}`}
          >
            {currentView === 'reports' && <Clock className="w-6 h-6 opacity-20 absolute top-2 left-1/2 -translate-x-1/2" fill="currentColor" />}
            <Clock className="w-6 h-6 relative z-10" />
            <span className="text-[10px] font-bold mt-1">History</span>
          </button>

          <button 
            onClick={() => setCurrentView('chat')}
            className={`flex flex-col items-center gap-1 p-2 w-16 transition-colors ${currentView === 'chat' ? 'text-[#2b4c7e]' : 'text-gray-400 hover:text-[#2b4c7e]'}`}
          >
            {currentView === 'chat' && <MessageCircle className="w-6 h-6 opacity-20 absolute top-2 left-1/2 -translate-x-1/2" fill="currentColor" />}
            <MessageCircle className="w-6 h-6 relative z-10" />
            <span className="text-[10px] font-semibold mt-1">Chat</span>
          </button>

          <button 
            onClick={() => setCurrentView('settings')}
            className={`flex flex-col items-center gap-1 p-2 w-16 transition-colors ${currentView === 'settings' ? 'text-[#2b4c7e]' : 'text-gray-400 hover:text-[#2b4c7e]'}`}
          >
            {currentView === 'settings' && <Settings className="w-6 h-6 opacity-20 absolute top-2 left-1/2 -translate-x-1/2" fill="currentColor" />}
            <Settings className="w-6 h-6 relative z-10" />
            <span className="text-[10px] font-semibold mt-1">Settings</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default MobileEnterpriseDashboard;
