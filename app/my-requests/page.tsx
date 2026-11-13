'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import MainLayout from '@/components/main-layout';
import { Card } from '@/components/ui/card';
import { useAuth } from '@/lib/auth-context';
import { RequestApprovalDetails } from '@/components/request-approval-details';
import { Button } from '@/components/ui/button';
import { exportToExcel, requestTrackingColumns, toRequestExportRow } from '@/lib/excel-export';
import { toast } from 'sonner';

const typeLabels: Record<string, string> = {
  leave: 'Leave',
  proposal: 'Project',
  ta: 'Allowance',
  report: 'Report',
  'attendance-report': 'Attendance report',
  certificate: 'Certificate',
  relieving: 'Relieving letter',
};

export default function MyRequestsPage() {
  const { isAuthenticated, user } = useAuth();
  const router = useRouter();
  const [requests, setRequests] = useState<any[]>([]);
  const [filter, setFilter] = useState('all');
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }

    let active = true;
    const fetchRequests = async () => {
      try {
        const response = await fetch('/api/requests?target=all');
        if (!response.ok) throw new Error('Unable to load your requests');
        const data = await response.json();
        if (!active) return;
        setRequests((data.requests || []).filter((request: any) =>
          request.createdById === user?.id && request.type !== 'internal-service'
        ));
        setLoadError('');
      } catch (error) {
        console.error('My requests fetch failed:', error);
        if (active) setLoadError('Could not load your requests. Please refresh the page.');
      }
    };

    fetchRequests();
    const interval = setInterval(fetchRequests, 15000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [isAuthenticated, router, user?.id]);

  const visibleRequests = useMemo(
    () => requests.filter((request) => filter === 'all' || request.type === filter),
    [filter, requests]
  );

  const handleExport = () => {
    try {
      exportToExcel(visibleRequests.map(toRequestExportRow), requestTrackingColumns, 'my-requests');
    } catch (error) {
      console.error('My requests export failed:', error);
      toast.error(error instanceof Error ? error.message : 'Unable to export requests');
    }
  };

  if (!isAuthenticated) return <div>Loading...</div>;

  return (
    <MainLayout>
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">My Requests</h1>
            <p className="mt-1 text-slate-600">Track leave, project, allowance, and report submissions with their approval history.</p>
          </div>
          <Button onClick={handleExport} disabled={visibleRequests.length === 0}>Export to Excel</Button>
        </header>

        <div className="flex flex-wrap gap-2">
          {[
            ['all', 'All requests'],
            ['leave', 'Leave'],
            ['proposal', 'Project'],
            ['ta', 'Allowance'],
            ['report', 'Report'],
            ['attendance-report', 'Attendance'],
            ['certificate', 'Certificates'],
            ['relieving', 'Relieving letters'],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              className={`rounded-full border px-4 py-2 text-sm ${
                filter === value ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 bg-white text-slate-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {loadError && <Card className="border-red-200 bg-red-50 p-4 text-red-800">{loadError}</Card>}
        {visibleRequests.length === 0 ? (
          <Card className="p-8 text-center text-slate-600">
            {requests.length === 0 ? 'You have not submitted any requests yet.' : 'No requests match this filter.'}
          </Card>
        ) : (
          <div className="space-y-4">
            {visibleRequests.map((request) => (
              <Card key={request.id} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <span className="text-xs font-semibold uppercase tracking-wide text-blue-700">
                      {typeLabels[request.type] || request.type}
                    </span>
                    <h2 className="mt-1 text-lg font-bold text-slate-900">{request.title}</h2>
                    {request.type === 'leave' && (
                      <p className="text-sm text-slate-600">
                        {request.payload?.leaveType || 'Leave'} · {request.payload?.fromDate || '—'} to {request.payload?.toDate || '—'}
                      </p>
                    )}
                    {request.type === 'proposal' && (
                      <p className="text-sm text-slate-600">{request.payload?.projectTitle || 'Project proposal'}</p>
                    )}
                    {request.type === 'ta' && (
                      <p className="text-sm text-slate-600">₹{Number(request.payload?.amount || 0).toLocaleString()} · {request.payload?.description || 'Allowance claim'}</p>
                    )}
                    {request.type === 'report' && (
                      <p className="text-sm text-slate-600">{request.payload?.reportFrequency || 'Report'} · {request.payload?.description || ''}</p>
                    )}
                    <p className="mt-1 text-xs text-slate-500">
                      Employee ID: {request.createdByEmployeeId || request.payload?.id || 'Not Set'}
                      {' · '}{request.createdByDesignation || request.payload?.designation || 'Designation not set'}
                      {' · Team: '}{request.createdByDepartment || request.payload?.department || 'Not Set'}
                      {' · Phone: '}{request.createdByPhone || request.payload?.phone || 'Not Set'}
                    </p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-sm font-semibold ${
                    request.status === 'approved'
                      ? 'bg-green-100 text-green-800'
                      : request.status === 'rejected'
                        ? 'bg-red-100 text-red-800'
                        : 'bg-amber-100 text-amber-800'
                  }`}>
                    {request.status === 'forwarded' ? 'In approval workflow' : request.status}
                  </span>
                </div>
                <RequestApprovalDetails request={request} />
                {request.officialDocument && (
                  <a
                    className="mt-3 inline-flex rounded-md bg-green-700 px-4 py-2 text-sm font-semibold text-white hover:bg-green-800"
                    href={request.officialDocument.base64}
                    download={request.officialDocument.name}
                  >
                    Download official PDF · issued by {request.officialDocument.issuedBy}
                  </a>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>
    </MainLayout>
  );
}
