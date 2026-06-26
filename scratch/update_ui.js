const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/components/OperationsCommandCenter.jsx');
let content = fs.readFileSync(filePath, 'utf8');

const newRenderManifestCard = \
  const renderManifestCard = (trip) => {
    const isExpanded = isTripExpanded(trip.id);
    const isSelected = selectedTasks.includes(trip.id);
    const urgency = getTripUrgencyLevel(trip);
    const isLate = urgency === 'late';
    const driver = drivers.find((entry) => entry.id === trip.driverId);
    
    // Formatting logic
    const timeDisplay = to12hr(trip.time);
    const urgencyDisplay = isLate ? 'LATE' : urgency === 'soon' ? 'SOON' : null;
    const passengerName = trip.patient || 'Unnamed Client';
    const distanceTop = trip.estMiles ? \\\\\\ mi\\\ : (trip.distance ? \\\\\\ mi\\\ : '');
    const legsCount = trip.type || trip.serviceType || 'TRIP';
    const pickupAddress = trip.pickup || 'Missing pickup address';
    const dropoffAddress = trip.dropoff || 'Missing dropoff address';
    const driverName = driver ? driver.name : 'Unassigned';
    const driverCar = driver ? (driver.vehicle || 'Active') : 'N/A';
    const etaDisplay = trip.eta || 'Pending';
    const routeMileage = trip.estMiles ? \\\\\\ mi\\\ : (trip.distance ? \\\\\\ mi\\\ : 'N/A');

    return (
      <div key={trip.id} className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 transition-all duration-200">
        {/* Top Row */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 md:gap-3 min-w-0">
            <button 
              type="button" 
              onClick={(e) => { e.stopPropagation(); setSelectedTasks((prev) => prev.includes(trip.id) ? prev.filter((id) => id !== trip.id) : [...prev, trip.id]); }}
              className={\\\shrink-0 transition-colors \\\\\\}
            >
              {isSelected ? <CheckSquare size={20} /> : <Square size={20} />}
            </button>
            <div className="flex items-center gap-1.5 shrink-0">
              <Clock size={16} className={isLate ? 'text-rose-500' : 'text-orange-500'} />
              <span className={\\\ont-bold text-base md:text-lg \\\\\\}>{timeDisplay}</span>
              {urgencyDisplay && (
                <span className={\\\	ext-[10px] font-bold px-2 py-0.5 rounded-md \\\\\\}>
                  {urgencyDisplay}
                </span>
              )}
            </div>
            <span className="hidden md:inline text-slate-300 font-bold mx-1 shrink-0">•</span>
            <span className="font-bold text-slate-800 uppercase truncate max-w-[120px] md:max-w-none">
              {passengerName}
            </span>
          </div>
          
          <div className="flex items-center gap-2 md:gap-3 shrink-0 ml-2">
            {distanceTop && <span className="hidden md:inline text-xs text-slate-500 font-medium">{distanceTop}</span>}
            <span className="border border-slate-200 text-slate-600 text-[10px] font-bold px-1.5 py-0.5 rounded uppercase">
              {legsCount}
            </span>
          </div>
        </div>

        {/* Addresses & Expand Button */}
        <div className="flex items-start justify-between">
          <div className="flex-1 space-y-3 min-w-0">
            <div className="flex items-start gap-3">
              <div className="mt-1.5 w-2.5 h-2.5 rounded-full bg-blue-500 shrink-0 shadow-sm" />
              <span className="text-slate-600 text-xs md:text-sm leading-relaxed break-words">{pickupAddress}</span>
            </div>
            <div className="flex items-start gap-3">
              <div className="mt-1.5 w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0 shadow-sm" />
              <span className="text-slate-600 text-xs md:text-sm leading-relaxed break-words">{dropoffAddress}</span>
            </div>
          </div>

          <button 
            onClick={() => toggleTripExpanded(trip.id)}
            className="ml-3 p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-full transition-colors shrink-0"
          >
            {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
          </button>
        </div>

        {/* Dispatcher Extra Info Line */}
        <div className="mt-4 pt-3 border-t border-slate-100 grid grid-cols-2 md:grid-cols-4 gap-3 bg-slate-50/50 -mx-4 px-4 pb-1">
          <div className="flex items-center gap-2 min-w-0">
            <User size={14} className="text-slate-400 shrink-0" />
            <span className="text-[11px] font-medium text-slate-700 truncate">
              {driver ? driverName : <span className="text-rose-500 italic">Unassigned</span>}
            </span>
          </div>
          <div className="flex items-center gap-2 min-w-0">
            <Car size={14} className="text-slate-400 shrink-0" />
            <span className="text-[11px] font-medium text-slate-700 truncate">{driverCar}</span>
          </div>
          <div className="flex items-center gap-2 min-w-0">
            <Navigation size={14} className="text-slate-400 shrink-0" />
            <span className="text-[11px] font-medium text-slate-700 truncate">ETA: {etaDisplay}</span>
          </div>
          <div className="flex items-center gap-2 min-w-0">
            <Map size={14} className="text-slate-400 shrink-0" />
            <span className="text-[11px] font-medium text-slate-700 truncate">{routeMileage}</span>
          </div>
        </div>

        {/* Expanded Actions Panel */}
        {isExpanded && (
          <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-2 sm:grid-cols-3 md:flex md:flex-wrap gap-2 animate-in fade-in slide-in-from-top-2 duration-200">
            {!driver ? (
              <>
                <button onClick={() => setManualAssignTrip(trip)} className="flex-1 min-w-[110px] flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg text-xs font-semibold transition-colors">
                  <UserPlus size={14} /> Assign
                </button>
                <button onClick={() => triggerSmartAssign(trip)} className="flex-1 min-w-[110px] flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-2 rounded-lg text-xs font-semibold transition-colors">
                  <BrainCircuit size={14} /> Auto
                </button>
              </>
            ) : (
              <button onClick={() => setEditTrip(trip)} className="flex-1 min-w-[110px] flex items-center justify-center gap-1.5 bg-blue-100 hover:bg-blue-200 text-blue-700 px-3 py-2 rounded-lg text-xs font-semibold transition-colors">
                <Edit2 size={14} /> Edit Trip
              </button>
            )}
            
            <button onClick={() => updateTrip && updateTrip(trip.id, { status: 'Rerouted' })} className="flex-1 min-w-[110px] flex items-center justify-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-white px-3 py-2 rounded-lg text-xs font-semibold transition-colors">
              <MapPin size={14} /> Reroute
            </button>
            
            <button onClick={() => updateTrip && updateTrip(trip.id, { status: 'No Show' })} className="flex-1 min-w-[110px] flex items-center justify-center gap-1.5 bg-slate-700 hover:bg-slate-800 text-white px-3 py-2 rounded-lg text-xs font-semibold transition-colors">
              <AlertCircle size={14} /> No Show
            </button>

            <button onClick={() => updateTrip && updateTrip(trip.id, { status: 'Cancelled' })} className="flex-1 min-w-[110px] flex items-center justify-center gap-1.5 bg-rose-500 hover:bg-rose-600 text-white px-3 py-2 rounded-lg text-xs font-semibold transition-colors">
              <XCircle size={14} /> Cancel
            </button>

            <button onClick={() => requestDeleteTrip(trip.id)} className="flex-1 min-w-[110px] flex items-center justify-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-2 rounded-lg text-xs font-semibold transition-colors">
              <Archive size={14} /> Archive
            </button>

            {(trip.patientPhone || trip.pickupPhone || trip.dropoffPhone) && (
              <button onClick={() => makeCall(trip.patientPhone || trip.pickupPhone, trip.patient)} className="flex-1 min-w-[110px] flex items-center justify-center gap-1.5 bg-teal-500 hover:bg-teal-600 text-white px-3 py-2 rounded-lg text-xs font-semibold transition-colors">
                <Phone size={14} /> Contacts
              </button>
            )}
          </div>
        )}
        {/* Render detailed metadata block inside expanded state as well */}
        {isExpanded && (
           <div className="mt-3 pt-3 border-t border-slate-100 animate-in fade-in">
             {renderExpandedTripDetails(trip, { compact: false })}
           </div>
        )}
      </div>
    );
  };\n\n\n\n\n\

const newRenderControlBar = \
  const renderControlBar = () => (
    <div className="flex flex-col gap-3 px-3 py-3 border-b border-slate-200 bg-white shrink-0 sticky top-0 z-20 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        {/* Main Tabs */}
        <div className="flex items-center gap-1.5 shrink-0">
          <div className="flex items-center gap-0.5 shrink-0 bg-[#e8eff6] p-1 rounded-full">
            {['manifest', 'willcall', 'fleet'].map(tab => (
              <button
                key={tab}
                onClick={() => setOperationsTab(tab)}
                className={\\\px-4 py-1.5 rounded-full text-xs font-black transition-all duration-200 uppercase tracking-wider \\\\\\}
              >
                {tab === 'manifest' ? 'Manifest' : tab === 'willcall' ? 'Will Call' : 'Fleet'}
              </button>
            ))}
          </div>
        </div>

        {/* Global Toolbar Actions (Right) */}
        <div className="flex items-center gap-1.5 shrink-0 ml-auto">
          <button
            type="button"
            onClick={() => setShowAddTripModal(true)}
            className="inline-flex items-center gap-1 rounded-lg bg-blue-600 hover:bg-blue-700 px-3 py-1.5 text-xs font-semibold text-white transition-colors"
          >
            <Plus size={14} /> Trip
          </button>
          <button
            type="button"
            onClick={() => setShowUploadModal(true)}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors hidden sm:flex"
          >
            <UploadCloud size={14} /> Upload
          </button>
          <button
            type="button"
            onClick={() => onOpenSequencer?.()}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors hidden sm:flex"
          >
            <Route size={14} /> Routes
          </button>
          <button
            type="button"
            onClick={() => onOpenLiveMap?.()}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
          >
            <MapPin size={14} /> Map
          </button>
          
          <div className="hidden lg:flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5">
            <Search size={14} className="text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search"
              className="w-32 bg-transparent text-xs font-medium text-slate-700 placeholder:text-slate-400 outline-none"
            />
          </div>
        </div>
      </div>

      {/* Sorting / Filter Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 bg-slate-50 rounded-xl p-2 border border-slate-100">
        <div className="flex items-center gap-2 text-slate-500 font-bold text-[11px] uppercase tracking-wider px-2 shrink-0">
          <Filter size={14} />
          <span>Sort & Filter:</span>
        </div>
        
        <div className="flex flex-wrap gap-2 flex-1">
          {SORT_OPTIONS.map(option => (
            <button
              key={option.value}
              onClick={() => {
                if (sortBy === option.value) {
                  setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
                } else {
                  handleSortSelect(option.value);
                  setSortDirection('asc');
                }
              }}
              className={\\\lex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors \\\\\\}
            >
              {option.label}
              {sortBy === option.value && (
                sortDirection === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />
              )}
            </button>
          ))}
          
          <div className="w-px h-6 bg-slate-200 mx-1 hidden sm:block"></div>
          
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="px-3 py-1.5 text-xs font-bold bg-white border border-slate-200 rounded-lg text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 hover:bg-slate-50 cursor-pointer shadow-sm">
            <option value="all">Status: All</option>
            <option value="Unassigned">Status: Unassigned</option>
            <option value="Assigned">Status: Assigned</option>
            <option value="in-progress">Status: In Progress</option>
            <option value="Completed">Status: Completed</option>
          </select>
          
          <select value={driverFilter} onChange={(e) => setDriverFilter(e.target.value)} className="px-3 py-1.5 text-xs font-bold bg-white border border-slate-200 rounded-lg text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 hover:bg-slate-50 cursor-pointer shadow-sm">
            <option value="all">Driver: All</option>
            <option value="unassigned">Driver: None</option>
            {driverOptions.map((driver) => (
              <option key={driver.id} value={driver.id}>{driver.name}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
\

// Replace renderManifestCard
const startManifestCard = content.indexOf('  const renderManifestCard = (trip) => {');
const endManifestCard = content.indexOf('  const renderManifestBoard = () => (');
if (startManifestCard !== -1 && endManifestCard !== -1) {
  content = content.substring(0, startManifestCard) + newRenderManifestCard + content.substring(endManifestCard);
} else {
  console.error("Could not find renderManifestCard boundaries");
}

// Replace renderControlBar
const startControlBar = content.indexOf('  const renderControlBar = () => (');
const endControlBar = content.indexOf('  const renderManifestCard = (trip) => {', startControlBar);
if (startControlBar !== -1 && endControlBar !== -1) {
  content = content.substring(0, startControlBar) + newRenderControlBar + content.substring(endControlBar);
} else {
  console.error("Could not find renderControlBar boundaries");
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('Update successful');
