import fs from 'fs';
import path from 'path';
import type { Circular } from '@/app/api/circulars/route';

const DB_PATH = path.join(process.cwd(), '.data', 'circulars.json');
let inMemoryCirculars: Circular[] = [];

function ensureDBDir() {
  try {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  } catch {
    // Read-only filesystem in serverless environments (e.g. Vercel)
  }
}

export function getCircularsDB(): Circular[] {
  try {
    ensureDBDir();
    if (!fs.existsSync(DB_PATH)) return inMemoryCirculars;

    const data = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8')) as unknown;
    if (Array.isArray(data)) {
      if (inMemoryCirculars.length === 0 && data.length > 0) {
        inMemoryCirculars = data as Circular[];
      }
      return data as Circular[];
    }
  } catch (err) {
    console.warn('Error reading circulars DB, using in-memory store:', err);
  }
  return inMemoryCirculars;
}

function writeCircularsDB(circulars: Circular[]) {
  inMemoryCirculars = circulars;
  try {
    ensureDBDir();
    fs.writeFileSync(DB_PATH, JSON.stringify(circulars, null, 2), 'utf-8');
  } catch (err) {
    console.warn('Filesystem read-only, saved circulars to in-memory store:', err);
  }
}

export function addCircularDB(circular: Circular): Circular {
  const circulars = getCircularsDB();
  circulars.unshift(circular);
  writeCircularsDB(circulars);
  return circular;
}

export function updateCircularDB(
  id: string,
  updates: Pick<Circular, 'title' | 'content' | 'priority' | 'meta'>
): Circular | undefined {
  const circulars = getCircularsDB();
  const index = circulars.findIndex((circular) => circular.id === id);
  if (index === -1) return undefined;

  circulars[index] = { ...circulars[index], ...updates };
  writeCircularsDB(circulars);
  return circulars[index];
}
