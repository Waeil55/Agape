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
    <div className="px-4 py-3 flex items-center justify-between bg-white border-b border-gray-100 shrink-0 sticky top-0 z-50">
      <div className="flex items-center gap-3">
        {showBack && (
          <button onClick={() => setSubView(null)} className="p-1.5 -ml-1.5 mr-1 text-gray-400 hover:text-gray-600 rounded-full bg-gray-50">
            <ChevronLeft size={20} />
          </button>
        )}
        <div className="w-10 h-10 bg-blue-50 rounded-full flex items-center justify-center text-blue-600 font-bold border border-blue-100 shrink-0">
          <span className="text-xs">{getProfileAbbr()}</span>
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-extrabold text-sm text-gray-900 tracking-wide">{title}</h1>
          </div>
          <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">{currentUser}</p>
        </div>
      </div>
    </div>
  );

  const renderContent = () => {
    // Handle Sub-views (from Menu)
    if (subView === 'reports') {
      return (
        <div className="flex-1 overflow-hidden flex flex-col bg-gray-50">
          {renderTopBar('Reports & Export', true)}
          <div className="flex-1 overflow-y-auto">
             <ReportsPage {...props} />
          </div>
        </div>
      );
    }
    
    if (subView === 'admin') {
      return (
        <div className="flex-1 overflow-hidden flex flex-col bg-gray-50">
          {renderTopBar('User Management', true)}
          <div className="flex-1 overflow-y-auto">
             <AdminPage {...props} />
          </div>
        </div>
      );
    }

    if (subView) {
      return (
        <div className="flex-1 overflow-hidden flex flex-col bg-gray-50">
          {renderTopBar(subView.charAt(0).toUpperCase() + subView.slice(1), true)}
          <div className="flex-1 flex items-center justify-center">
            <p className="text-gray-400 font-medium text-sm">Under Construction</p>
          </div>
        </div>
      );
    }

    // Main Navigation Views
    if (currentView === 'trips' || currentView === 'fleet') {
      return (
        <div className="flex-1 overflow-hidden flex flex-col relative bg-gray-50">
          <div className="absolute inset-0">
            <MobileDispatchView {...props} activeTab={currentView === 'trips' ? 'trips' : 'drivers'} />
          </div>
        </div>
      );
    }

    if (currentView === 'map') {
      return (
        <div className="flex-1 overflow-hidden flex flex-col relative bg-gray-50">
          <div className="absolute inset-0">
            <LiveMapPage {...props} />
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

    if (currentView === 'menu') {
      return (
        <div className="flex-1 overflow-hidden flex flex-col bg-gray-50">
          <MobileMenuPage {...props} setSubView={setSubView} />
        </div>
      );
    }

    return null;
  };

  return (
    <div className="w-full h-[100dvh] bg-white flex flex-col relative max-w-md mx-auto shadow-xl overflow-hidden">
      {/* Dynamic Content */}
      {renderContent()}

      {/* BOTTOM NAVIGATION */}
      <div className="absolute bottom-0 w-full bg-white border-t border-gray-200 pb-safe z-[60] shrink-0">
        <div className="flex justify-around items-center pt-2 pb-6 px-1">
          <button 
            onClick={() => handleNavClick('trips')}
            className={`flex flex-col items-center gap-1 p-2 w-16 transition-colors ${currentView === 'trips' && !subView ? 'text-[#2b4c7e]' : 'text-gray-400 hover:text-[#2b4c7e]'}`}
          >
            {currentView === 'trips' && !subView && <List className="w-6 h-6 opacity-20 absolute top-2 left-1/2 -translate-x-1/2" fill="currentColor" />}
            <List className="w-6 h-6 relative z-10" />
            <span className="text-[10px] font-bold mt-1">Trips</span>
          </button>

          <button 
            onClick={() => handleNavClick('fleet')}
            className={`flex flex-col items-center gap-1 p-2 w-16 transition-colors ${currentView === 'fleet' && !subView ? 'text-[#2b4c7e]' : 'text-gray-400 hover:text-[#2b4c7e]'}`}
          >
            {currentView === 'fleet' && !subView && <Truck className="w-6 h-6 opacity-20 absolute top-2 left-1/2 -translate-x-1/2" fill="currentColor" />}
            <Truck className="w-6 h-6 relative z-10" />
            <span className="text-[10px] font-bold mt-1">Fleet</span>
          </button>

          <button 
            onClick={() => handleNavClick('map')}
            className={`flex flex-col items-center gap-1 p-2 w-16 transition-colors ${currentView === 'map' && !subView ? 'text-[#2b4c7e]' : 'text-gray-400 hover:text-[#2b4c7e]'}`}
          >
            {currentView === 'map' && !subView && <Map className="w-6 h-6 opacity-20 absolute top-2 left-1/2 -translate-x-1/2" fill="currentColor" />}
            <Map className="w-6 h-6 relative z-10" />
            <span className="text-[10px] font-bold mt-1">Map</span>
          </button>

          <button 
            onClick={() => handleNavClick('chat')}
            className={`flex flex-col items-center gap-1 p-2 w-16 transition-colors ${currentView === 'chat' && !subView ? 'text-[#2b4c7e]' : 'text-gray-400 hover:text-[#2b4c7e]'}`}
          >
            {currentView === 'chat' && !subView && <MessageCircle className="w-6 h-6 opacity-20 absolute top-2 left-1/2 -translate-x-1/2" fill="currentColor" />}
            <MessageCircle className="w-6 h-6 relative z-10" />
            <span className="text-[10px] font-bold mt-1">Chat</span>
          </button>

          <button 
            onClick={() => handleNavClick('menu')}
            className={`flex flex-col items-center gap-1 p-2 w-16 transition-colors ${currentView === 'menu' || subView ? 'text-[#2b4c7e]' : 'text-gray-400 hover:text-[#2b4c7e]'}`}
          >
            {currentView === 'menu' && !subView && <Menu className="w-6 h-6 opacity-20 absolute top-2 left-1/2 -translate-x-1/2" fill="currentColor" />}
            <Menu className="w-6 h-6 relative z-10" />
            <span className="text-[10px] font-bold mt-1">More</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default MobileEnterpriseDashboard;
