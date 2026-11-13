import fs from 'fs';
import path from 'path';

const AUDIT_FILE = path.join(process.cwd(), '.data', 'audit-log.json');
let inMemoryAuditLog: AuditEntry[] = [];

function ensureDir() {
  try {
    const dir = path.dirname(AUDIT_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(AUDIT_FILE)) fs.writeFileSync(AUDIT_FILE, JSON.stringify([]));
  } catch {
    // Read-only filesystem in serverless environments
  }
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
  const next: AuditEntry = {
    id: `audit-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    timestamp: new Date().toISOString(),
    ...entry,
  };
  inMemoryAuditLog.unshift(next);
  try {
    ensureDir();
    const raw = fs.readFileSync(AUDIT_FILE, 'utf-8');
    const list: AuditEntry[] = JSON.parse(raw) || [];
    list.unshift(next);
    fs.writeFileSync(AUDIT_FILE, JSON.stringify(list, null, 2));
    return next;
  } catch (error) {
    console.warn('Filesystem read-only, saved audit entry to in-memory store:', error);
    return next;
  }
}

export function readAuditLog(): AuditEntry[] {
  try {
    ensureDir();
    if (!fs.existsSync(AUDIT_FILE)) return inMemoryAuditLog;
    const raw = fs.readFileSync(AUDIT_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
  } catch (error) {
    console.warn('Failed to read audit log, using in-memory store:', error);
  }
  return inMemoryAuditLog;
}
