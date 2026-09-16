import React, { useState, useEffect, useMemo, useCallback, useRef, Suspense, lazy } from 'react';
import { 
  ChevronLeft, Navigation, Phone, MessageSquare, Edit2, MoreHorizontal, 
  MapPin, User, Clock, Truck, AlertCircle, CheckCircle2, XCircle,
  FileText, History, Archive, RotateCcw, Download, Copy, Eye, EyeOff
} from 'lucide-react';
import { 
  doc, getDoc, onSnapshot, collection, query, where, orderBy, limit, 
  getDocs, startAfter, DocumentSnapshot 
} from 'firebase/firestore';
import { db } from '../../config/firebase';
import { designTokens, getStatusTokens } from '../../utils/designTokens';
import { tripCalendarDateKey, timeToMinutes, localCalendarYmd } from '../../utils/tripDate';
import { resolveClientPhoneForTrip } from '../../utils/clientPhoneResolution';
import { normalizeEmail } from '../../utils/accessControl';
import { openNavigation, makeCall, sendSMS } from '../../utils/nativeActions';
import { useHeader } from '../shared';

const MessageThread = lazy(() => import('../shared/TripDetailMessageThread').then(m => ({ default: m.MessageThread })));
const AuditHistory = lazy(() => import('../shared/TripDetailAuditHistory').then(m => ({ default: m.AuditHistory })));
const MapPreview = lazy(() => import('../shared/TripDetailMapPreview').then(m => ({ default: m.MapPreview })));
const NotesSection = lazy(() => import('../shared/TripDetailNotes').then(m => ({ default: m.NotesSection })));
const OdometerSection = lazy(() => import('../shared/TripDetailOdometer').then(m => ({ default: m.OdometerSection })));

const FALLBACK = () => (
  <div className="flex items-center justify-center py-12">
    <div className="w-6 h-6 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
  </div>
);

const STATUS_ORDER = [
  'Unassigned', 'Assigned', 'Navigating Pickup', 'At Pickup', 'In Transit', 
  'At Dropoff', 'Arrived', 'Completed', 'No Show', 'Cancelled', 'Rerouted'
];

const formatTime12hr = (time) => {
  if (!time || time === 'Will Call') return 'Will Call';
  const m = String(time).match(/(\d{1,2}):?(\d{2})?\s*(AM|PM)?/i);
  if (!m) return time;
  let h = parseInt(m[1], 10);
  const min = m[2] || '00';
  const p = m[3]?.toUpperCase();
  const ampm = p || (h >= 12 ? 'PM' : 'AM');
  h = h % 12 || 12;
  return `${h}:${min} ${ampm}`;
};

const truncate = (str, n) => str && str.length > n ? str.slice(0, n) + '…' : str || '';

const getAddr = (v) => typeof v === 'object' ? v?.address || '' : v || '';

const buildTripTitle = (trip) => trip?.patient || trip?.memberName || trip?.bookingId || trip?.id || 'Trip Details';

const TripDetailView = ({ 
  tripId, 
  role = 'dispatcher',
  currentUser = '',
  drivers = [],
  onClose,
  onEdit,
  onDrive,
  onAssign,
  onMessage,
  onNavigate,
  onCall,
  onArchive,
  onReroute,
  onNoShow,
  onCancel,
  onAudit,
  onUpdateTrip,
  isWorkflowMode = false,
  readOnly = false,
}) => {
  const tokens = designTokens;
  const { setHeader, clearHeader } = useHeader();
  const [trip, setTrip] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [driver, setDriver] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [auditEntries, setAuditEntries] = useState([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [showContacts, setShowContacts] = useState(false);
  const [activeSection, setActiveSection] = useState('summary');
  const unsubscribeRef = useRef(null);
  const lastTripRef = useRef(null);

  const statusTokens = useMemo(() => trip ? getStatusTokens(trip.status) : tokens.colors.status.slate, [trip?.status]);

  useEffect(() => {
    if (!tripId) {
      setLoading(false);
      setError('No trip ID provided');
      return;
    }

    if (lastTripRef.current === tripId) return;
    lastTripRef.current = tripId;

    let cancelled = false;
    setLoading(true);
    setError(null);

    const fetchTrip = async () => {
      try {
        const tripDoc = await getDoc(doc(db, 'trips', tripId));
        if (cancelled) return;
        
        if (!tripDoc.exists()) {
          setError('Trip not found');
          setLoading(false);
          return;
        }

        const tripData = { id: tripDoc.id, ...tripDoc.data() };
        setTrip(tripData);

        if (tripData.driverId && drivers.length > 0) {
          const matchedDriver = drivers.find(d => 
            d.id === tripData.driverId || 
            (tripData.driverName && d.name === tripData.driverName) ||
            (tripData.driverEmail && normalizeEmail(d.email) === normalizeEmail(tripData.driverEmail))
          );
          if (matchedDriver) setDriver(matchedDriver);
        }

        setHeader({
          title: buildTripTitle(tripData),
          subtitle: `${tripData.bookingId ? `#${tripData.bookingId}` : tripData.id} · ${tripData.status || 'Open'}`,
          showBack: true,
          onBack: onClose,
          role,
          rightActions: [
            { id: 'nav-pickup', icon: Navigation, onClick: () => onNavigate?.(tripData, 'pickup'), ariaLabel: 'Navigate to pickup', variant: 'secondary' },
            { id: 'nav-dropoff', icon: MapPin, onClick: () => onNavigate?.(tripData, 'dropoff'), ariaLabel: 'Navigate to dropoff', variant: 'secondary' },
            { id: 'call', icon: Phone, onClick: () => onCall?.(tripData), ariaLabel: 'Call passenger', variant: 'secondary' },
            { id: 'message', icon: MessageSquare, onClick: () => onMessage?.(tripData), ariaLabel: 'Message passenger', variant: 'secondary' },
            { id: 'more', icon: MoreHorizontal, onClick: () => setShowContacts(true), ariaLabel: 'More actions', variant: 'secondary' },
          ],
        });

        setupRealtimeListener(tripId);
      } catch (err) {
        if (!cancelled) {
          setError('Failed to load trip');
          console.error('[TripDetailView] Load error:', err);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    const setupRealtimeListener = (id) => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
      
      unsubscribeRef.current = onSnapshot(
        doc(db, 'trips', id),
        (snapshot) => {
          if (cancelled || !snapshot.exists()) return;
          const updated = { id: snapshot.id, ...snapshot.data() };
          setTrip(updated);
          
          setHeader({
            title: buildTripTitle(updated),
            subtitle: `${updated.bookingId ? `#${updated.bookingId}` : updated.id} · ${updated.status || 'Open'}`,
            showBack: true,
            onBack: onClose,
            role,
            rightActions: [
              { id: 'nav-pickup', icon: Navigation, onClick: () => onNavigate?.(updated, 'pickup'), ariaLabel: 'Navigate to pickup', variant: 'secondary' },
              { id: 'nav-dropoff', icon: MapPin, onClick: () => onNavigate?.(updated, 'dropoff'), ariaLabel: 'Navigate to dropoff', variant: 'secondary' },
              { id: 'call', icon: Phone, onClick: () => onCall?.(updated), ariaLabel: 'Call passenger', variant: 'secondary' },
              { id: 'message', icon: MessageSquare, onClick: () => onMessage?.(updated), ariaLabel: 'Message passenger', variant: 'secondary' },
              { id: 'more', icon: MoreHorizontal, onClick: () => setShowContacts(true), ariaLabel: 'More actions', variant: 'secondary' },
            ],
          });
        },
        (err) => {
          console.error('[TripDetailView] Realtime error:', err);
        }
      );
    };

    fetchTrip();

    return () => {
      cancelled = true;
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
  }, [tripId, drivers, role, onClose, onNavigate, onCall, onMessage, setHeader]);

  const loadMessages = useCallback(async () => {
    if (!tripId || messagesLoading) return;
    setMessagesLoading(true);
    try {
      const msgsQuery = query(
        collection(db, 'trips', tripId, 'messages'),
        orderBy('createdAt', 'desc'),
        limit(50)
      );
      const snapshot = await getDocs(msgsQuery);
      setMessages(snapshot.docs.map(d => ({ id: d.id, ...d.data() })).reverse());
    } catch (err) {
      console.error('[TripDetailView] Messages load error:', err);
    } finally {
      setMessagesLoading(false);
    }
  }, [tripId, messagesLoading]);

  const loadAudit = useCallback(async () => {
    if (!tripId || auditLoading) return;
    setAuditLoading(true);
    try {
      const auditQuery = query(
        collection(db, 'trips', tripId, 'audit'),
        orderBy('timestamp', 'desc'),
        limit(50)
      );
      const snapshot = await getDocs(auditQuery);
      setAuditEntries(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error('[TripDetailView] Audit load error:', err);
    } finally {
      setAuditLoading(false);
    }
  }, [tripId, auditLoading]);

  useEffect(() => {
    if (activeSection === 'messages') loadMessages();
    if (activeSection === 'audit') loadAudit();
  }, [activeSection, loadMessages, loadAudit]);

  const handleAction = (action, tripData) => {
    switch (action) {
      case 'edit': onEdit?.(tripData); break;
      case 'drive': onDrive?.(tripData); break;
      case 'assign': onAssign?.(tripData); break;
      case 'archive': onArchive?.(tripData); break;
      case 'reroute': onReroute?.(tripData); break;
      case 'noshow': onNoShow?.(tripData); break;
      case 'cancel': onCancel?.(tripData); break;
      case 'audit': onAudit?.(tripData); break;
    }
  };

  if (loading && !trip) {
    return (
      <div className="flex-1 flex items-center justify-center" role="status" aria-label="Loading trip details">
        <FALLBACK />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
        <div className="w-16 h-16 rounded-full bg-rose-100 flex items-center justify-center mb-4">
          <AlertCircle size={32} className="text-rose-600" />
        </div>
        <h3 className="text-lg font-semibold text-slate-900 mb-2">Unable to Load Trip</h3>
        <p className="text-slate-500 mb-4">{error}</p>
        <button onClick={onClose} className="px-4 py-2 bg-blue-600 text-white rounded-xl font-semibold">Go Back</button>
      </div>
    );
  }

  const t = trip;
  const pickup = getAddr(t.pickup);
  const dropoff = getAddr(t.dropoff);
  const timeLabel = t.time === 'Will Call' || !t.time ? 'Will Call' : formatTime12hr(t.time);
  const dateLabel = t.date ? (() => { try { return new Date(t.date + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }); } catch { return t.date; } })() : 'No date';
  const clientPhone = resolveClientPhoneForTrip(t, []);

  const sections = [
    { id: 'summary', label: 'Summary', icon: FileText },
    { id: 'messages', label: 'Messages', icon: MessageSquare, badge: messages.length },
    { id: 'audit', label: 'History', icon: History, badge: auditEntries.length },
  ];

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-slate-50" role="main">
      <div className={`flex-1 overflow-y-auto ${tokens.safeArea.bottom} ${tokens.spacing.inset.pageMobile}`}>
        <div className="space-y-4 max-w-xl mx-auto">
          
          {/* Status Header Card */}
          <div className={`rounded-2xl border overflow-hidden ${tokens.elevation.sm} ${tokens.colors.background.secondary} ${statusTokens.border}`}>
            <div className={`h-1 ${statusTokens.dot}`} />
            <div className="p-4 space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${statusTokens.dot}20` }}>
                  <User size={24} className={statusTokens.text} />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className={`text-lg font-bold ${tokens.colors.foreground.primary} truncate`}>{buildTripTitle(t)}</h2>
                  <p className={`text-sm ${tokens.colors.foreground.secondary}`}>{t.bookingId ? `#${t.bookingId}` : t.id}</p>
                </div>
                <span className={`shrink-0 px-3 py-1 rounded-full ${tokens.typography.caption2} ${statusTokens.bg} ${statusTokens.text}`}>
                  {t.status || 'Open'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <div className="bg-slate-50 rounded-xl p-3">
                  <p className={`${tokens.typography.caption2Upper} ${tokens.colors.foreground.tertiary}`} style={{ letterSpacing: '0.08em' }}>Scheduled</p>
                  <p className={`${tokens.typography.calloutEmphasized} ${tokens.colors.foreground.primary} mt-0.5`}>{dateLabel} · {timeLabel}</p>
                </div>
                <div className="bg-slate-50 rounded-xl p-3">
                  <p className={`${tokens.typography.caption2Upper} ${tokens.colors.foreground.tertiary}`} style={{ letterSpacing: '0.08em' }}>Driver</p>
                  <p className={`${tokens.typography.calloutEmphasized} ${tokens.colors.foreground.primary} mt-0.5`}>{driver?.name || t.driverName || 'Unassigned'}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Addresses Card */}
          <div className={`rounded-2xl border overflow-hidden ${tokens.elevation.sm} ${tokens.colors.background.secondary}`}>
            <div className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
                  <MapPin size={18} className="text-emerald-600" />
                </div>
                <div>
                  <p className={`${tokens.typography.caption2Upper} text-emerald-700`} style={{ letterSpacing: '0.08em' }}>Pickup</p>
                  <p className={`${tokens.typography.callout} ${tokens.colors.foreground.primary} mt-0.5 truncate`}>{pickup || 'Not set'}</p>
                </div>
              </div>
              <div className="h-px bg-slate-200 mx-4" />
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-rose-100 flex items-center justify-center shrink-0">
                  <MapPin size={18} className="text-rose-600" />
                </div>
                <div>
                  <p className={`${tokens.typography.caption2Upper} text-rose-700`} style={{ letterSpacing: '0.08em' }}>Dropoff</p>
                  <p className={`${tokens.typography.callout} ${tokens.colors.foreground.primary} mt-0.5 truncate`}>{dropoff || 'Not set'}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-2">
                <button 
                  type="button" 
                  onClick={() => openNavigation(pickup)}
                  className="flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 text-sm font-semibold touch-manipulation active:scale-[0.98]"
                >
                  <Navigation size={16} /> Navigate
                </button>
                <button 
                  type="button" 
                  onClick={() => openNavigation(dropoff)}
                  className="flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 text-sm font-semibold touch-manipulation active:scale-[0.98]"
                >
                  <MapPin size={16} /> Navigate
                </button>
              </div>
            </div>
          </div>

          {/* Passenger Card */}
          <div className={`rounded-2xl border overflow-hidden ${tokens.elevation.sm} ${tokens.colors.background.secondary}`}>
            <div className="p-4 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
                  <User size={24} className="text-blue-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className={`${tokens.typography.caption2Upper} ${tokens.colors.foreground.tertiary}`} style={{ letterSpacing: '0.08em' }}>Passenger</p>
                  <p className={`${tokens.typography.calloutEmphasized} ${tokens.colors.foreground.primary}`}>{buildTripTitle(t)}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 pt-2">
                {clientPhone && (
                  <button 
                    type="button" 
                    onClick={() => makeCall(clientPhone, buildTripTitle(t))}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 text-sm font-semibold touch-manipulation active:scale-[0.98]"
                  >
                    <Phone size={16} /> {clientPhone}
                  </button>
                )}
                {t.pickupPhone && (
                  <button 
                    type="button" 
                    onClick={() => makeCall(t.pickupPhone, 'Pickup Location')}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 text-sm font-semibold touch-manipulation active:scale-[0.98]"
                  >
                    <MapPin size={16} /> {t.pickupPhone}
                  </button>
                )}
                {t.dropoffPhone && (
                  <button 
                    type="button" 
                    onClick={() => makeCall(t.dropoffPhone, 'Dropoff Location')}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 text-sm font-semibold touch-manipulation active:scale-[0.98]"
                  >
                    <MapPin size={16} /> {t.dropoffPhone}
                  </button>
                )}
                <button 
                  type="button" 
                  onClick={() => setShowContacts(true)}
                  className="flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 text-sm font-semibold touch-manipulation active:scale-[0.98]"
                >
                  <MoreHorizontal size={16} /> More
                </button>
              </div>
            </div>
          </div>

          {/* Section Navigation */}
          <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1" role="tablist">
            {sections.map((section) => (
              <button
                key={section.id}
                role="tab"
                aria-selected={activeSection === section.id}
                onClick={() => setActiveSection(section.id)}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg ${tokens.typography.caption1} transition-colors touch-manipulation ${activeSection === section.id 
                  ? 'bg-white text-blue-600 shadow-sm' 
                  : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <section.icon size={16} />
                {section.label}
                {section.badge && section.badge > 0 && (
                  <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold flex items-center justify-center">
                    {section.badge > 99 ? '99+' : section.badge}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Section Content */}
          <div className="space-y-4" role="tabpanel">
            {activeSection === 'summary' && (
              <>
                <Suspense fallback={<FALLBACK />}>
                  <NotesSection trip={t} readOnly={readOnly} onUpdate={onUpdateTrip} />
                </Suspense>
                <Suspense fallback={<FALLBACK />}>
                  <OdometerSection trip={t} driver={driver} readOnly={readOnly} onUpdate={onUpdateTrip} />
                </Suspense>
                <Suspense fallback={<FALLBACK />}>
                  <MapPreview 
                    trip={t} 
                    expanded={showMap} 
                    onToggle={() => setShowMap(!showMap)} 
                    pickup={pickup}
                    dropoff={dropoff}
                  />
                </Suspense>
              </>
            )}

            {activeSection === 'messages' && (
              <Suspense fallback={<FALLBACK />}>
                <MessageThread 
                  tripId={tripId} 
                  messages={messages} 
                  loading={messagesLoading}
                  currentUser={currentUser}
                  role={role}
                  onSend={(body) => {
                    // Message sending handled by MessageThread
                  }}
                />
              </Suspense>
            )}

            {activeSection === 'audit' && (
              <Suspense fallback={<FALLBACK />}>
                <AuditHistory 
                  tripId={tripId} 
                  entries={auditEntries} 
                  loading={auditLoading} 
                />
              </Suspense>
            )}
          </div>

          {/* Action Bar */}
          {!readOnly && !isWorkflowMode && (
            <div className="sticky bottom-0 bg-slate-50/80 backdrop-blur-sm pt-4 pb-6" style={{ marginBottom: '-16px' }}>
              <div className="grid grid-cols-3 gap-2 max-w-xl mx-auto">
                {canTransition(t.status, 'drive') && (
                  <button type="button" onClick={() => handleAction('drive', t)} className="col-span-2 py-3 bg-blue-600 text-white rounded-xl font-semibold text-sm touch-manipulation active:scale-[0.98]">
                    <Navigation size={16} className="inline-block mr-1" /> Open Driver Workspace
                  </button>
                )}
                {canTransition(t.status, 'edit') && (
                  <button type="button" onClick={() => handleAction('edit', t)} className="py-3 border border-slate-200 bg-white text-slate-700 rounded-xl font-semibold text-sm touch-manipulation active:scale-[0.98]">
                    <Edit2 size={16} className="inline-block mr-1" /> Edit
                  </button>
                )}
                {canTransition(t.status, 'assign') && !driver && (
                  <button type="button" onClick={() => handleAction('assign', t)} className="py-3 border border-slate-200 bg-white text-slate-700 rounded-xl font-semibold text-sm touch-manipulation active:scale-[0.98]">
                    <User size={16} className="inline-block mr-1" /> Assign
                  </button>
                )}
                {isTerminalStatus(t.status) && (
                  <button type="button" onClick={() => handleAction('audit', t)} className="py-3 border border-slate-200 bg-white text-slate-700 rounded-xl font-semibold text-sm touch-manipulation active:scale-[0.98]">
                    <History size={16} className="inline-block mr-1" /> Audit
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Workflow Mode Actions */}
          {isWorkflowMode && (
            <div className="sticky bottom-0 bg-slate-50/80 backdrop-blur-sm pt-4 pb-6" style={{ marginBottom: '-16px' }}>
              <div className="grid grid-cols-3 gap-2 max-w-xl mx-auto">
                {canTransition(t.status, 'complete') && (
                  <button type="button" onClick={() => handleAction('complete', t)} className="col-span-2 py-3 bg-emerald-600 text-white rounded-xl font-semibold text-sm touch-manipulation active:scale-[0.98]">
                    <CheckCircle2 size={16} className="inline-block mr-1" /> Complete Trip
                  </button>
                )}
                {canTransition(t.status, 'noshow') && (
                  <button type="button" onClick={() => handleAction('noshow', t)} className="py-3 bg-orange-600 text-white rounded-xl font-semibold text-sm touch-manipulation active:scale-[0.98]">
                    <AlertCircle size={16} className="inline-block mr-1" /> No Show
                  </button>
                )}
                {canTransition(t.status, 'cancel') && (
                  <button type="button" onClick={() => handleAction('cancel', t)} className="py-3 bg-rose-600 text-white rounded-xl font-semibold text-sm touch-manipulation active:scale-[0.98]">
                    <XCircle size={16} className="inline-block mr-1" /> Cancel
                  </button>
                )}
                {canTransition(t.status, 'reroute') && (
                  <button type="button" onClick={() => handleAction('reroute', t)} className="py-3 bg-amber-600 text-white rounded-xl font-semibold text-sm touch-manipulation active:scale-[0.98]">
                    <RotateCcw size={16} className="inline-block mr-1" /> Reroute
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Contacts Sheet */}
      {showContacts && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-end" onClick={() => setShowContacts(false)}>
          <div className="w-full bg-white rounded-t-2xl shadow-xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-slate-200 flex items-center justify-between shrink-0">
              <h3 className="text-lg font-semibold text-slate-900">Trip Actions</h3>
              <button onClick={() => setShowContacts(false)} className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200">
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {[
                { id: 'edit', label: 'Edit trip', icon: Edit2, disabled: !canTransition(t.status, 'edit'), variant: 'secondary' },
                { id: 'drive', label: 'Open driver workspace', icon: Navigation, disabled: !canTransition(t.status, 'drive'), variant: 'primary' },
                { id: 'assign', label: driver ? 'Reassign driver' : 'Assign driver', icon: User, disabled: !canTransition(t.status, 'assign'), variant: 'secondary' },
                { id: 'message', label: 'Message passenger', icon: MessageSquare, disabled: !clientPhone, variant: 'secondary' },
                { id: 'call', label: 'Call passenger', icon: Phone, disabled: !clientPhone, variant: 'secondary' },
                { id: 'nav-pickup', label: 'Navigate to pickup', icon: MapPin, disabled: !pickup, variant: 'secondary' },
                { id: 'nav-dropoff', label: 'Navigate to dropoff', icon: MapPin, disabled: !dropoff, variant: 'secondary' },
                { id: 'audit', label: 'View audit history', icon: History, disabled: false, variant: 'secondary' },
                { id: 'archive', label: 'Archive trip', icon: Archive, disabled: !canTransition(t.status, 'archive') || isTerminalStatus(t.status), variant: 'danger' },
                { id: 'reroute', label: 'Mark rerouted', icon: RotateCcw, disabled: !canTransition(t.status, 'reroute'), variant: 'warning' },
                { id: 'noshow', label: 'Mark no show', icon: AlertCircle, disabled: !canTransition(t.status, 'noshow'), variant: 'warning' },
                { id: 'cancel', label: 'Cancel trip', icon: XCircle, disabled: !canTransition(t.status, 'cancel'), variant: 'danger' },
              ].map((action) => (
                <button
                  key={action.id}
                  type="button"
                  onClick={() => { handleAction(action.id, t); setShowContacts(false); }}
                  disabled={action.disabled}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl ${action.variant === 'primary' 
                    ? 'bg-blue-600 text-white hover:bg-blue-700' 
                    : action.variant === 'danger' 
                    ? 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200'
                    : action.variant === 'warning'
                    ? 'bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200'
                    : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'
                  } ${action.disabled ? 'opacity-40 cursor-not-allowed' : 'touch-manipulation active:scale-[0.98]'}`}
                >
                  <span className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ 
                    backgroundColor: action.variant === 'primary' ? 'rgba(255,255,255,0.15)' : 
                    action.variant === 'danger' ? 'rgba(251,113,133,0.1)' :
                    action.variant === 'warning' ? 'rgba(245,158,11,0.1)' : 'rgba(148,163,184,0.1)' 
                  }}>
                    <action.icon size={20} style={{ color: action.variant === 'primary' ? 'white' : 
                      action.variant === 'danger' ? '#fb7185' :
                      action.variant === 'warning' ? '#f59e0b' : '#64748b' }} />
                  </span>
                  <span className="font-semibold">{action.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const canTransition = (status, action) => {
  const terminal = ['Completed', 'Cancelled', 'No Show', 'Rerouted'];
  const active = ['Assigned', 'In Mission', 'In Progress', 'Navigating Pickup', 'En Route', 'At Pickup', 'In Transit', 'Navigating Dropoff', 'At Dropoff', 'Arrived'];
  
  if (terminal.includes(status)) {
    return action === 'audit' || action === 'archive';
  }
  if (status === 'Unassigned') {
    return ['edit', 'assign', 'archive', 'cancel'].includes(action);
  }
  if (active.includes(status)) {
    return ['drive', 'edit', 'reroute', 'noshow', 'cancel', 'complete', 'audit'].includes(action);
  }
  return false;
};

const isTerminalStatus = (status) => ['Completed', 'Cancelled', 'No Show', 'Rerouted'].includes(status);

export default React.memo(TripDetailView);