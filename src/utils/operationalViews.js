export const OPERATIONAL_VIEW_PRESETS = Object.freeze([
  { id: 'all', label: 'All trips', status: 'all', urgency: 'all', driver: 'all', attention: false, sort: 'time' },
  { id: 'attention', label: 'Needs attention', status: 'all', urgency: 'all', driver: 'all', attention: true, sort: 'urgency' },
  { id: 'unassigned', label: 'Unassigned', status: 'Unassigned', urgency: 'all', driver: 'unassigned', attention: false, sort: 'time' },
  { id: 'active', label: 'Active work', status: 'in-progress', urgency: 'all', driver: 'all', attention: false, sort: 'time' },
  { id: 'late', label: 'Late now', status: 'all', urgency: 'late', driver: 'all', attention: false, sort: 'urgency' },
  { id: 'completed', label: 'Completed', status: 'Completed', urgency: 'all', driver: 'all', attention: false, sort: 'time' },
]);

export const getOperationalViewPreset = (id) => OPERATIONAL_VIEW_PRESETS.find((view) => view.id === id) || OPERATIONAL_VIEW_PRESETS[0];
