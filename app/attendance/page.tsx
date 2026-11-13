'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import MainLayout from '@/components/main-layout';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useAuth } from '@/lib/auth-context';
import { toast } from 'sonner';

interface AttendanceRecord {
  id: string;
  date: string;
  checkIn: string;
  checkOut?: string;
}

export default function AttendancePage() {
  const { isAuthenticated } = useAuth();
  const router = useRouter();
  const [today, setToday] = useState('');
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [remarks, setRemarks] = useState('');
  const [busy, setBusy] = useState(false);
  const current = records.find((record) => record.date === today);

  const refresh = async () => {
    const response = await fetch('/api/attendance');
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Unable to load attendance');
    setToday(data.today);
    setRecords(data.records || []);
  };

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }
    refresh().catch((error) => {
      console.error('Attendance loading failed:', error);
      toast.error(error.message);
    });
  }, [isAuthenticated, router]);

  const takeAction = async (action: 'check-in' | 'check-out') => {
    setBusy(true);
    try {
      const response = await fetch('/api/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Attendance update failed');
      await refresh();
      toast.success(action === 'check-in' ? 'Check-in recorded' : 'Check-out recorded');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Attendance update failed');
    } finally {
      setBusy(false);
    }
  };

  const submitReport = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      const response = await fetch('/api/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'submit-report', fromDate, toDate, remarks }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Report submission failed');
      setRemarks('');
      toast.success('Attendance report submitted through the approval chain');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Report submission failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <MainLayout>
      <div className="mx-auto max-w-5xl space-y-6">
        <header>
          <h1 className="text-3xl font-bold text-slate-900">Attendance</h1>
          <p className="mt-1 text-slate-600">Record your daily attendance and submit date-range reports for approval.</p>
        </header>
        <Card className="flex flex-wrap items-center justify-between gap-4 p-6">
          <div>
            <p className="text-sm text-slate-500">Today · {today || 'Loading date...'}</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">
              {current?.checkIn
                ? `Checked in ${new Date(current.checkIn).toLocaleTimeString()}${current.checkOut ? ` · Checked out ${new Date(current.checkOut).toLocaleTimeString()}` : ''}`
                : 'No check-in recorded'}
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => takeAction('check-in')} disabled={busy || !!current}>Check in</Button>
            <Button variant="outline" onClick={() => takeAction('check-out')} disabled={busy || !current || !!current.checkOut}>Check out</Button>
          </div>
        </Card>
        <Card className="p-6">
          <h2 className="text-xl font-semibold text-slate-900">Submit attendance report</h2>
          <p className="mt-1 text-sm text-slate-600">Reports are routed through Hareesh V → Santhana Kumar V → G. K. Bharath.</p>
          <form onSubmit={submitReport} className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="text-sm text-slate-700">From date<input className="mt-1 block w-full rounded-md border p-2" type="date" required value={fromDate} onChange={(e) => setFromDate(e.target.value)} /></label>
            <label className="text-sm text-slate-700">To date<input className="mt-1 block w-full rounded-md border p-2" type="date" required value={toDate} onChange={(e) => setToDate(e.target.value)} /></label>
            <label className="text-sm text-slate-700 md:col-span-2">Remarks<textarea className="mt-1 block w-full rounded-md border p-2" required minLength={5} value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={2} /></label>
            <div><Button type="submit" disabled={busy}>Submit report</Button></div>
          </form>
        </Card>
        <Card className="overflow-x-auto p-6">
          <h2 className="mb-4 text-xl font-semibold text-slate-900">Attendance history</h2>
          <table className="w-full text-left text-sm">
            <thead><tr className="border-b text-slate-500"><th className="py-2">Date</th><th>Check-in</th><th>Check-out</th></tr></thead>
            <tbody>{records.map((record) => (
              <tr key={record.id} className="border-b last:border-0">
                <td className="py-3">{record.date}</td>
                <td>{new Date(record.checkIn).toLocaleTimeString()}</td>
                <td>{record.checkOut ? new Date(record.checkOut).toLocaleTimeString() : 'Not checked out'}</td>
              </tr>
            ))}</tbody>
          </table>
          {records.length === 0 && <p className="text-sm text-slate-500">No attendance recorded yet.</p>}
        </Card>
      </div>
    </MainLayout>
  );
}
