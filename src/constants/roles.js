/**
 * Role Definitions & Permissions
 */

export const ROLES = {
  ADMIN: 'admin',
  DISPATCHER: 'dispatcher',
  DRIVER: 'driver',
  BILLING: 'billing',
  QA_AUDITOR: 'qa_auditor',
  FLEET_MANAGER: 'fleet_manager',
  SUPERVISOR: 'supervisor',
};

export const ROLE_LABELS = {
  admin: 'CEO / Owner',
  dispatcher: 'Dispatcher',
  driver: 'Driver',
  billing: 'Billing',
  qa_auditor: 'QA Auditor',
  fleet_manager: 'Fleet Manager',
  supervisor: 'Supervisor',
};

export const ROLE_COLORS = {
  admin: '#2563eb',
  dispatcher: '#059669',
  driver: '#7c3aed',
  billing: '#dc2626',
  qa_auditor: '#f59e0b',
  fleet_manager: '#06b6d4',
  supervisor: '#8b5cf6',
};

export const ROLE_BADGE_STYLES = {
  admin: 'bg-blue-100 text-blue-800',
  dispatcher: 'bg-emerald-100 text-emerald-800',
  driver: 'bg-purple-100 text-purple-800',
  billing: 'bg-red-100 text-red-800',
  qa_auditor: 'bg-amber-100 text-amber-800',
  fleet_manager: 'bg-cyan-100 text-cyan-800',
  supervisor: 'bg-indigo-100 text-indigo-800',
};

export const PERMISSIONS = {
  admin: {
    canDeleteTrip: true,
    canAssignTrip: true,
    canManageUsers: true,
    canViewReports: true,
    canEditFleet: true,
    canViewLiveMap: true,
    canOptimizeFleet: true,
    canResetSystem: true,
    canSendSms: true,
  },
  dispatcher: {
    canDeleteTrip: true,
    canAssignTrip: true,
    canManageUsers: false,
    canViewReports: true,
    canEditFleet: false,
    canViewLiveMap: true,
    canOptimizeFleet: true,
    canResetSystem: false,
    canSendSms: true,
  },
  driver: {
    canDeleteTrip: false,
    canAssignTrip: false,
    canManageUsers: false,
    canViewReports: false,
    canEditFleet: false,
    canViewLiveMap: false,
    canOptimizeFleet: false,
    canResetSystem: false,
    canSendSms: false,
  },
  billing: {
    canDeleteTrip: false,
    canAssignTrip: false,
    canManageUsers: false,
    canViewReports: true,
    canEditFleet: false,
    canViewLiveMap: false,
    canOptimizeFleet: false,
    canResetSystem: false,
    canSendSms: false,
  },
  qa_auditor: {
    canDeleteTrip: false,
    canAssignTrip: false,
    canManageUsers: false,
    canViewReports: true,
    canEditFleet: false,
    canViewLiveMap: true,
    canOptimizeFleet: false,
    canResetSystem: false,
    canSendSms: false,
  },
  fleet_manager: {
    canDeleteTrip: false,
    canAssignTrip: true,
    canManageUsers: false,
    canViewReports: true,
    canEditFleet: true,
    canViewLiveMap: true,
    canOptimizeFleet: true,
    canResetSystem: false,
    canSendSms: false,
  },
  supervisor: {
    canDeleteTrip: false,
    canAssignTrip: false,
    canManageUsers: false,
    canViewReports: true,
    canEditFleet: false,
    canViewLiveMap: true,
    canOptimizeFleet: false,
    canResetSystem: false,
    canSendSms: false,
  },
};

export function hasPermission(role, action) {
  return PERMISSIONS[role]?.[action] || false;
}
