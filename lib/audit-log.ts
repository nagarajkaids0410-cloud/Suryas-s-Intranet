import fs from 'fs';
import path from 'path';

const AUDIT_FILE = path.join(process.cwd(), '.data', 'audit-log.json');

function ensureDir() {
  const dir = path.dirname(AUDIT_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(AUDIT_FILE)) fs.writeFileSync(AUDIT_FILE, JSON.stringify([]));
}

export interface AuditEntry {
  id: string;
  action: string;
  actor?: string;
  actorId?: string;
  details?: Record<string, any>;
  timestamp: string;
}

export function addAuditEntry(entry: Omit<AuditEntry, 'id' | 'timestamp'>) {
  try {
    ensureDir();
    const raw = fs.readFileSync(AUDIT_FILE, 'utf-8');
    const list: AuditEntry[] = JSON.parse(raw) || [];
    const next: AuditEntry = {
      id: `audit-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp: new Date().toISOString(),
      ...entry,
    };
    list.unshift(next);
    fs.writeFileSync(AUDIT_FILE, JSON.stringify(list, null, 2));
    return next;
  } catch (error) {
    console.error('Failed to write audit log:', error);
    return null;
  }
}

export function readAuditLog(): AuditEntry[] {
  try {
    ensureDir();
    const raw = fs.readFileSync(AUDIT_FILE, 'utf-8');
    return JSON.parse(raw) || [];
  } catch (error) {
    console.error('Failed to read audit log:', error);
    return [];
  }
}
