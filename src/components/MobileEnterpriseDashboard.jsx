import React, { useState, useEffect } from 'react';
import { 
  Home, Map, Clock, MessageCircle, Settings,
  PhoneCall, ChevronLeft, ChevronRight, Search, 
  CheckCircle2, XCircle, AlertTriangle, RefreshCw, User, ChevronDown, 
  Edit2, RotateCcw, Check, Video, Info, PlusCircle, ImageIcon, 
  Camera, Mic, Send, Menu, Users, Truck, List
} from 'lucide-react';
import DriverPage from './DriverPage';
import AdminPage from './AdminPage';
import ReportsPage from './ReportsPage';
import MobileChatPage from './MobileChatPage';
import LiveMapPage from './LiveMapPage';
import MobileDispatchView from './MobileDispatchView';
import MobileMenuPage from './MobileMenuPage';

const MobileEnterpriseDashboard = (props) => {
  const { trips, drivers, dispatchers, currentUser, role, onSignOut } = props;
  const [currentView, setCurrentView] = useState('trips'); // trips, fleet, map, chat, menu
  const [subView, setSubView] = useState(null); // admin, reports, settings, archives

  const handleNavClick = (view) => {
    setCurrentView(view);
    setSubView(null);
  };

  const getProfileAbbr = () => {
    return role === 'admin' ? 'AD' : 'DS';
  };

  const getProfileTitle = () => {
    return role === 'admin' ? 'Agape Care Admin' : 'Agape Care Dispatch';
  };

  const renderTopBar = (title, showBack = false) => (
    <div className="px-4 py-3 flex items-center justify-between bg-slate-800 border-b border-slate-700/50 shrink-0 sticky top-0 z-50">
      <div className="flex items-center gap-3">
        {showBack && (
          <button onClick={() => setSubView(null)} className="p-1.5 -ml-1.5 mr-1 text-slate-400 hover:text-white rounded-full bg-slate-700/30">
            <ChevronLeft size={20} />
          </button>
        )}
        <div className="w-9 h-9 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-white font-black border border-blue-400/30 shrink-0 shadow-sm">
          <span className="text-xs">{getProfileAbbr()}</span>
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-black text-sm text-white tracking-wide">{title}</h1>
          </div>
          <p className="text-[10px] text-blue-300 font-bold uppercase tracking-widest">{currentUser}</p>
        </div>
      </div>
    </div>
  );

  const renderContent = () => {
    // Handle Sub-views (from Menu)
    if (subView === 'reports') {
      return (
        <div className="flex-1 overflow-hidden flex flex-col bg-[#0f172a]">
          {renderTopBar('Reports & Export', true)}
          <div className="flex-1 overflow-y-auto">
             <ReportsPage {...props} />
          </div>
        </div>
      );
    }
    
    if (subView === 'admin') {
      return (
        <div className="flex-1 overflow-hidden flex flex-col bg-[#0f172a]">
          {renderTopBar('User Management', true)}
          <div className="flex-1 overflow-y-auto">
             <AdminPage {...props} />
          </div>
        </div>
      );
    }

    if (subView) {
      return (
        <div className="flex-1 overflow-hidden flex flex-col bg-[#0f172a]">
          {renderTopBar(subView.charAt(0).toUpperCase() + subView.slice(1), true)}
          <div className="flex-1 flex items-center justify-center">
            <p className="text-slate-500 font-medium text-sm">Under Construction</p>
          </div>
        </div>
      );
    }

    // Main Navigation Views
    if (currentView === 'trips' || currentView === 'fleet') {
      return (
        <div className="flex-1 overflow-hidden flex flex-col relative bg-[#0f172a]">
          <div className="absolute inset-0">
            <MobileDispatchView {...props} activeTab={currentView === 'trips' ? 'trips' : 'drivers'} />
          </div>
        </div>
      );
    }

    if (currentView === 'map') {
      return (
        <div className="flex-1 overflow-hidden flex flex-col relative bg-[#0f172a]">
          <div className="absolute inset-0">
            <LiveMapPage {...props} />
          </div>
        </div>
      );
    }

    if (currentView === 'chat') {
      return (
        <div className="flex-1 overflow-hidden flex flex-col bg-[#0f172a]">
          <MobileChatPage {...props} />
        </div>
      );
    }

    if (currentView === 'menu') {
      return (
        <div className="flex-1 overflow-hidden flex flex-col bg-[#0f172a]">
          <MobileMenuPage {...props} setSubView={setSubView} />
        </div>
      );
    }

    return null;
  };

  return (
    <div className="w-full h-[100dvh] bg-[#0f172a] flex flex-col relative max-w-md mx-auto shadow-2xl overflow-hidden">
      {/* Dynamic Content */}
      {renderContent()}

      {/* BOTTOM NAVIGATION */}
      <div className="absolute bottom-0 w-full bg-[#0f172a]/95 backdrop-blur-xl border-t border-slate-700/50 pb-safe z-[60] shrink-0">
        <div className="flex justify-around items-center pt-2 pb-6 px-1">
          <button 
            onClick={() => handleNavClick('trips')}
            className={`flex flex-col items-center gap-1 p-2 w-16 transition-colors ${currentView === 'trips' && !subView ? 'text-blue-400' : 'text-slate-500 hover:text-blue-300'}`}
          >
            {currentView === 'trips' && !subView && <List className="w-6 h-6 opacity-20 absolute top-2 left-1/2 -translate-x-1/2" fill="currentColor" />}
            <List className="w-6 h-6 relative z-10" />
            <span className="text-[9px] font-bold mt-1 uppercase tracking-wider">Trips</span>
          </button>

          <button 
            onClick={() => handleNavClick('fleet')}
            className={`flex flex-col items-center gap-1 p-2 w-16 transition-colors ${currentView === 'fleet' && !subView ? 'text-blue-400' : 'text-slate-500 hover:text-blue-300'}`}
          >
            {currentView === 'fleet' && !subView && <Truck className="w-6 h-6 opacity-20 absolute top-2 left-1/2 -translate-x-1/2" fill="currentColor" />}
            <Truck className="w-6 h-6 relative z-10" />
            <span className="text-[9px] font-bold mt-1 uppercase tracking-wider">Fleet</span>
          </button>

          <button 
            onClick={() => handleNavClick('map')}
            className={`flex flex-col items-center gap-1 p-2 w-16 transition-colors ${currentView === 'map' && !subView ? 'text-blue-400' : 'text-slate-500 hover:text-blue-300'}`}
          >
            {currentView === 'map' && !subView && <Map className="w-6 h-6 opacity-20 absolute top-2 left-1/2 -translate-x-1/2" fill="currentColor" />}
            <Map className="w-6 h-6 relative z-10" />
            <span className="text-[9px] font-bold mt-1 uppercase tracking-wider">Map</span>
          </button>

          <button 
            onClick={() => handleNavClick('chat')}
            className={`flex flex-col items-center gap-1 p-2 w-16 transition-colors ${currentView === 'chat' && !subView ? 'text-blue-400' : 'text-slate-500 hover:text-blue-300'}`}
          >
            {currentView === 'chat' && !subView && <MessageCircle className="w-6 h-6 opacity-20 absolute top-2 left-1/2 -translate-x-1/2" fill="currentColor" />}
            <MessageCircle className="w-6 h-6 relative z-10" />
            <span className="text-[9px] font-bold mt-1 uppercase tracking-wider">Chat</span>
          </button>

          <button 
            onClick={() => handleNavClick('menu')}
            className={`flex flex-col items-center gap-1 p-2 w-16 transition-colors ${currentView === 'menu' || subView ? 'text-blue-400' : 'text-slate-500 hover:text-blue-300'}`}
          >
            {currentView === 'menu' && !subView && <Menu className="w-6 h-6 opacity-20 absolute top-2 left-1/2 -translate-x-1/2" fill="currentColor" />}
            <Menu className="w-6 h-6 relative z-10" />
            <span className="text-[9px] font-bold mt-1 uppercase tracking-wider">More</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default MobileEnterpriseDashboard;
