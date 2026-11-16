import fs from 'fs';
import path from 'path';
import { getPool, initDatabase } from './db';

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  targetUser: string; // 'all' or specific user ID
  relatedId?: string;
  timestamp: string;
  read: boolean;
  userId?: string; // User who created the notification (e.g., admin approving)
}

const DB_PATH = path.join(process.cwd(), '.data', 'notifications.json');
let inMemoryNotifications: Notification[] = [];

export async function syncNotificationsWithDb(): Promise<Notification[]> {
  const pool = getPool();
  if (!pool) return readNotificationsDB();

  try {
    await initDatabase();
    const res = await pool.query('SELECT * FROM notifications ORDER BY created_at DESC');
    if (res && res.rows && res.rows.length > 0) {
      const dbNotifs: Notification[] = res.rows.map((r: any) => ({
        id: r.id,
        type: r.type,
        title: r.title,
        message: r.message,
        targetUser: r.target_user,
        relatedId: r.related_id,
        read: r.read,
        timestamp: r.created_at,
      }));
      for (const notif of dbNotifs) {
        const idx = inMemoryNotifications.findIndex((n) => n.id === notif.id);
        if (idx !== -1) {
          inMemoryNotifications[idx] = notif;
        } else {
          inMemoryNotifications.push(notif);
        }
      }
    }
  } catch (err) {
    console.warn('[NOTIFICATION-DB] Failed to sync notifications from Supabase:', err);
  }
  return inMemoryNotifications;
}

export async function saveNotificationToPostgres(notif: Notification): Promise<void> {
  const pool = getPool();
  if (!pool) return;

  try {
    await initDatabase();
    await pool.query(`
      INSERT INTO notifications (id, type, title, message, target_user, related_id, read, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (id) DO UPDATE SET
        read = EXCLUDED.read;
    `, [
      notif.id,
      notif.type,
      notif.title,
      notif.message,
      notif.targetUser,
      notif.relatedId || null,
      notif.read || false,
      notif.timestamp || new Date().toISOString(),
    ]);
  } catch (err) {
    console.error('[NOTIFICATION-DB] Failed to persist notification to Supabase:', err);
  }
}

function ensureDBDir() {
  try {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  } catch {
    // Read-only filesystem in serverless environments (e.g. Vercel)
  }
}

export function readNotificationsDB(): Notification[] {
  try {
    ensureDBDir();
    if (!fs.existsSync(DB_PATH)) {
      return inMemoryNotifications;
    }
    const data = fs.readFileSync(DB_PATH, 'utf-8');
    const parsed = JSON.parse(data);
    if (Array.isArray(parsed)) {
      if (inMemoryNotifications.length === 0 && parsed.length > 0) {
        inMemoryNotifications = parsed;
      }
      return parsed;
    }
    return inMemoryNotifications;
  } catch (err) {
    console.warn('Error reading notifications DB, using in-memory store:', err);
    return inMemoryNotifications;
  }
}

export function writeNotificationsDB(notifications: Notification[]): void {
  inMemoryNotifications = notifications;
  try {
    ensureDBDir();
    fs.writeFileSync(DB_PATH, JSON.stringify(notifications, null, 2), 'utf-8');
  } catch (err) {
    console.warn('Filesystem read-only, saved notifications to in-memory store:', err);
  }
}

export function addNotificationDB(notification: Omit<Notification, 'id' | 'timestamp'>): Notification {
  const notifications = readNotificationsDB();
  const newNotification: Notification = {
    ...notification,
    id: `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    timestamp: new Date().toISOString(),
  };
  notifications.unshift(newNotification);
  writeNotificationsDB(notifications);
  saveNotificationToPostgres(newNotification).catch(() => {});
  return newNotification;
}

export function getNotificationsByTargetDB(targetUsers: string | string[]): Notification[] {
  const notifications = readNotificationsDB();
  const targets = Array.isArray(targetUsers) ? targetUsers : [targetUsers];
  return notifications.filter(
    (n) => n.targetUser === 'all' || targets.includes(n.targetUser) || !n.targetUser
  );
}

export function markAsReadDB(notificationId: string): boolean {
  const notifications = readNotificationsDB();
  const index = notifications.findIndex((n) => n.id === notificationId);
  if (index !== -1) {
    notifications[index].read = true;
    writeNotificationsDB(notifications);
    saveNotificationToPostgres(notifications[index]).catch(() => {});
    return true;
  }
  return false;
}

export function markAllAsReadDB(targetUsers: string | string[]): void {
  const notifications = readNotificationsDB();
  const targets = Array.isArray(targetUsers) ? targetUsers : [targetUsers];
  const updated = notifications.map((n) => 
    (targets.includes(n.targetUser) || n.targetUser === 'all') ? { ...n, read: true } : n
  );
  writeNotificationsDB(updated);
}

export function markNotificationsByRelatedIdDB(
  relatedId: string,
  options?: { type?: string; targetUsers?: string[] }
): number {
  const notifications = readNotificationsDB();
  let updatedCount = 0;

  const updated = notifications.map((n) => {
    const matchRelated = n.relatedId === relatedId;
    const matchType = !options?.type || n.type === options.type;
    const matchTarget = !options?.targetUsers || options.targetUsers.includes(n.targetUser);

    if (matchRelated && matchType && matchTarget && !n.read) {
      updatedCount += 1;
      return { ...n, read: true };
    }
    return n;
  });

  if (updatedCount > 0) {
    writeNotificationsDB(updated);
  }

  return updatedCount;
}
