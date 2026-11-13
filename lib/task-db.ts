import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const DB_FILE = path.join(process.cwd(), '.data', 'tasks.json');

export type TaskStatus = 'not_started' | 'in_progress' | 'blocked' | 'completed';

export interface TaskComment {
  by: string;
  byId: string;
  comment: string;
  at: string;
}

export interface ManagedTask {
  id: string;
  title: string;
  description: string;
  deadline: string;
  status: TaskStatus;
  progress: number;
  assignedToId: string;
  assignedToName: string;
  assignedToUsername: string;
  assignedById: string;
  assignedByName: string;
  createdAt: string;
  updatedAt: string;
  comments: TaskComment[];
}

function readDB(): ManagedTask[] {
  if (!fs.existsSync(DB_FILE)) return [];
  const tasks: unknown = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  if (!Array.isArray(tasks)) throw new Error('Task database has an invalid format');
  return tasks as ManagedTask[];
}

function writeDB(tasks: ManagedTask[]) {
  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
  fs.writeFileSync(DB_FILE, JSON.stringify(tasks, null, 2));
}

export function getTasks(): ManagedTask[] {
  return readDB();
}

export function createTask(input: Omit<ManagedTask, 'id' | 'createdAt' | 'updatedAt' | 'comments'>): ManagedTask {
  const tasks = readDB();
  const now = new Date().toISOString();
  const task: ManagedTask = {
    ...input,
    id: randomUUID(),
    createdAt: now,
    updatedAt: now,
    comments: [],
  };
  tasks.unshift(task);
  writeDB(tasks);
  return task;
}

export function updateTask(id: string, update: (task: ManagedTask) => void): ManagedTask | undefined {
  const tasks = readDB();
  const task = tasks.find((item) => item.id === id);
  if (!task) return undefined;
  update(task);
  task.updatedAt = new Date().toISOString();
  writeDB(tasks);
  return task;
}
