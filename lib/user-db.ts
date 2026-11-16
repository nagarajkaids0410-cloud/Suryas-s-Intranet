import fs from 'fs';
import path from 'path';
import { StoredUser } from './user-database';

const DB_FILE = path.join(process.cwd(), '.data', 'users.json');

function ensureDBDir() {
  try {
    const dir = path.dirname(DB_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  } catch {
    // Read-only filesystem in serverless environments (e.g. Vercel)
  }
}

let inMemoryUsers: StoredUser[] = [];

function readDB(): StoredUser[] {
  try {
    ensureDBDir();
    if (!fs.existsSync(DB_FILE)) {
      return inMemoryUsers;
    }
    const data = fs.readFileSync(DB_FILE, 'utf-8');
    const parsed = JSON.parse(data) || [];
    if (inMemoryUsers.length === 0 && parsed.length > 0) {
      inMemoryUsers = parsed;
    }
    return parsed.length > 0 ? parsed : inMemoryUsers;
  } catch (error) {
    return inMemoryUsers;
  }
}

function writeDB(users: StoredUser[]): boolean {
  inMemoryUsers = users;
  try {
    ensureDBDir();
    fs.writeFileSync(DB_FILE, JSON.stringify(users, null, 2));
    return true;
  } catch (error) {
    // Read-only filesystem in serverless environments (e.g. Netlify/Vercel)
    // Return true because inMemoryUsers is updated and Supabase handles real persistence
    return true;
  }
}

export function saveUsersToDB(users: StoredUser[]) {
  writeDB(users);
}

export function loadUsersFromDB(): StoredUser[] {
  return readDB();
}

export function updateUserInDB(id: string, updates: Partial<StoredUser>) {
  const users = readDB();
  const index = users.findIndex((u) => u.id === id);
  if (index !== -1) {
    users[index] = { ...users[index], ...updates };
    return writeDB(users) ? users[index] : undefined;
  }
  return undefined;
}

export function updateUserByUsernameInDB(username: string, updates: Partial<StoredUser>) {
  const users = readDB();
  const index = users.findIndex((u) => u.username === username);
  if (index !== -1) {
    users[index] = { ...users[index], ...updates };
    return writeDB(users) ? users[index] : undefined;
  }
  return undefined;
}
