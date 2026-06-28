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
      <div className="absolute bottom-0 w-full bg-[#0f172a] border-t border-slate-800 pb-safe shadow-[0_-8px_30px_rgba(0,0,0,0.3)] z-[60] shrink-0">
        <div className="flex items-stretch justify-around px-1">
          <button 
            onClick={() => handleNavClick('trips')}
            className={`flex flex-col items-center justify-center gap-0.5 py-1 px-2 transition-all duration-200 relative flex-1 min-h-[52px] ${currentView === 'trips' && !subView ? 'text-blue-400' : 'text-slate-500 hover:text-slate-400'}`}
          >
            <List size={22} strokeWidth={currentView === 'trips' && !subView ? 2.5 : 1.5} className={`transition-all duration-200 ${currentView === 'trips' && !subView ? 'text-blue-400' : 'text-slate-500'}`} />
            <span className={`text-[10px] tracking-wide transition-all leading-none ${currentView === 'trips' && !subView ? 'text-blue-600 font-bold' : 'text-slate-400 font-medium'}`}>Trips</span>
          </button>

          <button 
            onClick={() => handleNavClick('fleet')}
            className={`flex flex-col items-center justify-center gap-0.5 py-1 px-2 transition-all duration-200 relative flex-1 min-h-[52px] ${currentView === 'fleet' && !subView ? 'text-blue-400' : 'text-slate-500 hover:text-slate-400'}`}
          >
            <Truck size={22} strokeWidth={currentView === 'fleet' && !subView ? 2.5 : 1.5} className={`transition-all duration-200 ${currentView === 'fleet' && !subView ? 'text-blue-400' : 'text-slate-500'}`} />
            <span className={`text-[10px] tracking-wide transition-all leading-none ${currentView === 'fleet' && !subView ? 'text-blue-600 font-bold' : 'text-slate-400 font-medium'}`}>Fleet</span>
          </button>

          <button 
            onClick={() => handleNavClick('map')}
            className={`flex flex-col items-center justify-center gap-0.5 py-1 px-2 transition-all duration-200 relative flex-1 min-h-[52px] ${currentView === 'map' && !subView ? 'text-blue-400' : 'text-slate-500 hover:text-slate-400'}`}
          >
            <Map size={22} strokeWidth={currentView === 'map' && !subView ? 2.5 : 1.5} className={`transition-all duration-200 ${currentView === 'map' && !subView ? 'text-blue-400' : 'text-slate-500'}`} />
            <span className={`text-[10px] tracking-wide transition-all leading-none ${currentView === 'map' && !subView ? 'text-blue-600 font-bold' : 'text-slate-400 font-medium'}`}>Map</span>
          </button>

          <button 
            onClick={() => handleNavClick('chat')}
            className={`flex flex-col items-center justify-center gap-0.5 py-1 px-2 transition-all duration-200 relative flex-1 min-h-[52px] ${currentView === 'chat' && !subView ? 'text-blue-400' : 'text-slate-500 hover:text-slate-400'}`}
          >
            <MessageCircle size={22} strokeWidth={currentView === 'chat' && !subView ? 2.5 : 1.5} className={`transition-all duration-200 ${currentView === 'chat' && !subView ? 'text-blue-400' : 'text-slate-500'}`} />
            <span className={`text-[10px] tracking-wide transition-all leading-none ${currentView === 'chat' && !subView ? 'text-blue-600 font-bold' : 'text-slate-400 font-medium'}`}>Chat</span>
          </button>

          <button 
            onClick={() => handleNavClick('menu')}
            className={`flex flex-col items-center justify-center gap-0.5 py-1 px-2 transition-all duration-200 relative flex-1 min-h-[52px] ${currentView === 'menu' || subView ? 'text-blue-400' : 'text-slate-500 hover:text-slate-400'}`}
          >
            <Menu size={22} strokeWidth={currentView === 'menu' || subView ? 2.5 : 1.5} className={`transition-all duration-200 ${currentView === 'menu' || subView ? 'text-blue-400' : 'text-slate-500'}`} />
            <span className={`text-[10px] tracking-wide transition-all leading-none ${currentView === 'menu' || subView ? 'text-blue-600 font-bold' : 'text-slate-400 font-medium'}`}>More</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default MobileEnterpriseDashboard;
