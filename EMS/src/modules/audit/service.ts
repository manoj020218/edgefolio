import { AuditLog } from './model';

export async function logAudit(entry: {
  companyId?: string;
  actorUserId?: string;
  action: string;
  entityType: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}) {
  await AuditLog.create(entry);
}
