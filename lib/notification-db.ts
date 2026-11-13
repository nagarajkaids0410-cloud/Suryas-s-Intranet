import fs from 'fs';
import path from 'path';

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
