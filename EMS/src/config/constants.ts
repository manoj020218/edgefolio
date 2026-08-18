export const ROLES = [
  'SUPER_ADMIN',
  'COMPANY_ADMIN',
  'REGIONAL_MANAGER',
  'SALES_MANAGER',
  'TEAM_LEADER',
  'EMPLOYEE',
] as const;

export const COMPANY_STATUSES = ['active', 'disabled'] as const;
export const USER_STATUSES = ['active', 'disabled'] as const;
export const EMPLOYEE_STATUSES = ['active', 'inactive'] as const;
export const DEVICE_STATUSES = ['active', 'inactive', 'lost', 'retired'] as const;
export const VISIT_STATUSES = ['open', 'closed', 'cancelled'] as const;
export const CALL_DIRECTIONS = ['incoming', 'outgoing'] as const;
export const CALL_STATUSES = ['answered', 'missed', 'rejected', 'cancelled', 'failed'] as const;
export const VIDEO_STATUSES = ['ringing', 'answered', 'ended', 'missed', 'cancelled'] as const;
export const COMMAND_TYPES = [
  'VIDEO_CALL',
  'SYNC_NOW',
  'CONFIG_UPDATED',
  'ADMIN_MESSAGE',
  'DEVICE_STATUS_REQUEST',
] as const;

export const ADMIN_ROLES = ROLES.filter((role) => role !== 'EMPLOYEE');
export const MAX_LOCATION_BATCH = 500;
