'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import MainLayout from '@/components/main-layout';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useAuth } from '@/lib/auth-context';
import { toast } from 'sonner';

interface TaskComment { by: string; comment: string; at: string }
interface Task {
  id: string;
  title: string;
  description: string;
  deadline: string;
  status: 'not_started' | 'in_progress' | 'blocked' | 'completed';
  progress: number;
  assignedToId: string;
  assignedToName: string;
  comments: TaskComment[];
}

const statuses: Array<Task['status']> = ['not_started', 'in_progress', 'blocked', 'completed'];

export default function TasksPage() {
  const { isAuthenticated, user } = useAuth();
  const router = useRouter();
  const isAdmin = ['admin', 'founder', 'managing-partner'].includes(user?.role || '');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [members, setMembers] = useState<Array<{
    id: string;
    fullName: string;
    username?: string;
    role: string;
    designation?: string;
  }>>([]);
  const [form, setForm] = useState({ title: '', description: '', deadline: '', assignedToId: '' });
  const [comments, setComments] = useState<Record<string, string>>({});
  const [reassignments, setReassignments] = useState<Record<string, string>>({});

  const refresh = async () => {
    const response = await fetch('/api/tasks');
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Unable to load tasks');
    setTasks(data.tasks || []);
  };

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }
    refresh().catch((error) => toast.error(error.message));
    if (isAdmin) {
      fetch('/api/users/directory')
        .then((response) => response.json())
        .then((data) => setMembers((data.users || []).filter((member: { role: string }) => member.role !== 'admin')))
        .catch((error) => console.error('Unable to load task assignees:', error));
    }
  }, [isAuthenticated, router, isAdmin]);

  const createTask = async (event: React.FormEvent) => {
    event.preventDefault();
    const response = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const data = await response.json();
    if (!response.ok) return toast.error(data.error || 'Unable to create task');
    setTasks((current) => [data.task, ...current]);
    setForm({ title: '', description: '', deadline: '', assignedToId: '' });
    toast.success('Task assigned');
  };

  const updateTask = async (task: Task, updates: Record<string, unknown>) => {
    const response = await fetch('/api/tasks', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId: task.id, ...updates }),
    });
    const data = await response.json();
    if (!response.ok) return toast.error(data.error || 'Unable to update task');
    setTasks((current) => current.map((item) => item.id === task.id ? data.task : item));
    if ('comment' in updates) setComments((current) => ({ ...current, [task.id]: '' }));
    toast.success(updates.action === 'reassign' ? 'Task reassigned' : 'Task updated');
  };

  const getAssigneeDesignation = (member: (typeof members)[number]) =>
    member.designation?.trim() || member.role.split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');

  return (
    <MainLayout>
      <div className="mx-auto max-w-5xl space-y-6">
        <header>
          <h1 className="text-3xl font-bold text-slate-900">Tasks</h1>
          <p className="mt-1 text-slate-600">Admins assign work and deadlines; assigned employees and interns update progress and comments.</p>
        </header>
        {isAdmin && (
          <Card className="p-6">
            <h2 className="text-xl font-semibold">Create and assign task</h2>
            <form onSubmit={createTask} className="mt-4 grid gap-3 md:grid-cols-2">
              <input required maxLength={200} className="rounded-md border p-2" placeholder="Task title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              <input required type="date" className="rounded-md border p-2" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} />
              <textarea className="rounded-md border p-2 md:col-span-2" placeholder="Task description" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              <select required className="rounded-md border p-2" value={form.assignedToId} onChange={(e) => setForm({ ...form, assignedToId: e.target.value })}>
                <option value="">Select active user (excluding Admin)</option>
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.fullName || member.username} ({getAssigneeDesignation(member)})
                  </option>
                ))}
              </select>
              <div><Button type="submit">Assign task</Button></div>
            </form>
          </Card>
        )}
        <div className="space-y-4">
          {tasks.map((task) => (
            <Card key={task.id} className="space-y-4 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><h2 className="text-lg font-bold">{task.title}</h2><p className="text-sm text-slate-600">{task.description}</p></div>
                <div className="text-sm text-slate-600">Due {new Date(task.deadline).toLocaleDateString()} · {task.assignedToName}</div>
              </div>
              {isAdmin ? (
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <label>Reassign task</label>
                  <select className="rounded-md border p-2" value={reassignments[task.id] || task.assignedToId} onChange={(e) => setReassignments({ ...reassignments, [task.id]: e.target.value })}>
                    {members.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.fullName || member.username} ({getAssigneeDesignation(member)})
                      </option>
                    ))}
                  </select>
                  <Button size="sm" variant="outline" disabled={(reassignments[task.id] || task.assignedToId) === task.assignedToId} onClick={() => updateTask(task, { action: 'reassign', assignedToId: reassignments[task.id] })}>Reassign</Button>
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="text-sm">Status
                      <select className="ml-2 rounded-md border p-2" value={task.status} onChange={(e) => updateTask(task, { status: e.target.value })}>
                        {statuses.map((status) => <option key={status} value={status}>{status.replace('_', ' ')}</option>)}
                      </select>
                    </label>
                    <label className="text-sm">Progress {task.progress}%
                      <input className="ml-2 align-middle" type="range" min="0" max="100" step="5" value={task.progress} onChange={(e) => updateTask(task, { progress: Number(e.target.value) })} />
                    </label>
                  </div>
                  <div className="flex gap-2">
                    <input className="min-w-0 flex-1 rounded-md border p-2 text-sm" maxLength={2000} placeholder="Add a task comment" value={comments[task.id] || ''} onChange={(e) => setComments({ ...comments, [task.id]: e.target.value })} />
                    <Button size="sm" disabled={!comments[task.id]?.trim()} onClick={() => updateTask(task, { comment: comments[task.id] })}>Comment</Button>
                  </div>
                </>
              )}
              {task.comments.length > 0 && <ul className="space-y-1 text-sm text-slate-600">{task.comments.map((comment, index) => <li key={`${task.id}-${index}`}>{comment.by} · {new Date(comment.at).toLocaleString()}: {comment.comment}</li>)}</ul>}
            </Card>
          ))}
          {tasks.length === 0 && <Card className="p-8 text-center text-slate-600">No tasks assigned to you.</Card>}
        </div>
      </div>
    </MainLayout>
  );
}
