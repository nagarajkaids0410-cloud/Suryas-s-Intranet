import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const DB_FILE = path.join(process.cwd(), '.data', 'attendance.json');

export interface AttendanceRecord {
  id: string;
  userId: string;
  username: string;
  fullName: string;
  date: string;
  checkIn: string;
  checkOut?: string;
}

function readDB(): AttendanceRecord[] {
  if (!fs.existsSync(DB_FILE)) return [];
  const records: unknown = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  if (!Array.isArray(records)) throw new Error('Attendance database has an invalid format');
  return records as AttendanceRecord[];
}

function writeDB(records: AttendanceRecord[]) {
  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
  fs.writeFileSync(DB_FILE, JSON.stringify(records, null, 2));
}

export function getAttendanceForUser(userId: string): AttendanceRecord[] {
  return readDB()
    .filter((record) => record.userId === userId)
    .sort((a, b) => b.date.localeCompare(a.date));
}

export function recordAttendance(
  user: { id: string; username: string; fullName: string },
  date: string,
  action: 'check-in' | 'check-out'
): AttendanceRecord {
  const records = readDB();
  const existing = records.find((record) => record.userId === user.id && record.date === date);
  if (action === 'check-in') {
    if (existing) throw new Error('You have already checked in today');
    const record: AttendanceRecord = {
      id: randomUUID(),
      userId: user.id,
      username: user.username,
      fullName: user.fullName,
      date,
      checkIn: new Date().toISOString(),
    };
    records.unshift(record);
    writeDB(records);
    return record;
  }
  if (!existing) throw new Error('Check in before checking out');
  if (existing.checkOut) throw new Error('You have already checked out today');
  existing.checkOut = new Date().toISOString();
  writeDB(records);
  return existing;
}
