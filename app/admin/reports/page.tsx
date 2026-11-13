'use client';

import React, { useEffect, useMemo, useState } from 'react';
import MainLayout from '@/components/main-layout';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar, Download, FileDown } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';
import FileViewerModal from '@/components/file-viewer-modal';
import { collectDecisionRemarks } from '@/lib/approval-remarks';
import { RequestApprovalDetails } from '@/components/request-approval-details';
import { exportToExcel, requestTrackingColumns, toRequestExportRow } from '@/lib/excel-export';

export default function AdminReports() {
  const { isAuthenticated, user } = useAuth();
  const router = useRouter();
  const [requests, setRequests] = useState<any[]>([]);
  const [selectedMonth, setSelectedMonth] = useState('');
  const [viewingFile, setViewingFile] = useState<any>(null);
  const [actingOnReportId, setActingOnReportId] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }

    const fetchRequests = async () => {
      const response = await fetch('/api/requests?target=all');
      if (!response.ok) return;
      const data = await response.json();
      setRequests(data.requests || []);
    };

    fetchRequests();
    const interval = setInterval(fetchRequests, 15000);
    return () => clearInterval(interval);
  }, [isAuthenticated, router]);

  const monthOptions = useMemo(() => {
    const months = new Set<string>();
    requests.forEach((req) => {
      const date = new Date(req.createdAt);
      if (!Number.isNaN(date.getTime())) {
        months.add(date.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }));
      }
    });
    const list = Array.from(months);
    return list.length ? list : [new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })];
  }, [requests]);

  useEffect(() => {
    if (!selectedMonth && monthOptions.length) {
      setSelectedMonth(monthOptions[0]);
    }
  }, [selectedMonth, monthOptions]);

  const monthlyRequests = useMemo(() => {
    if (!selectedMonth) return requests;
    return requests.filter((req) => {
      const date = new Date(req.createdAt);
      if (Number.isNaN(date.getTime())) return false;
      const label = date.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
      return label === selectedMonth;
    });
  }, [requests, selectedMonth]);

  const leaveStats = useMemo(() => {
    const items = monthlyRequests.filter((r) => r.type === 'leave');
    return {
      pending: items.filter((r) => r.status === 'pending').length,
      approved: items.filter((r) => r.status === 'approved').length,
      rejected: items.filter((r) => r.status === 'rejected').length,
      byType: items.reduce((acc: Record<string, number>, item) => {
        const type = item.payload?.leaveType || 'other';
        acc[type] = (acc[type] || 0) + 1;
        return acc;
      }, {}),
    };
  }, [monthlyRequests]);

  const taStats = useMemo(() => {
    const items = monthlyRequests.filter((r) => r.type === 'ta');
    const totalAmount = items.reduce((sum, item) => sum + Number(item.payload?.amount || 0), 0);
    return {
      pending: items.filter((r) => r.status === 'pending').length,
      approved: items.filter((r) => r.status === 'approved').length,
      rejected: items.filter((r) => r.status === 'rejected').length,
      totalAmount,
      averageAmount: items.length ? totalAmount / items.length : 0,
    };
  }, [monthlyRequests]);

  const projectStats = useMemo(() => {
    const items = monthlyRequests.filter((r) => r.type === 'proposal');
    const totalBudget = items.reduce((sum, item) => sum + Number(item.payload?.projectAmount || 0), 0);
    return {
      submitted: items.length,
      approved: items.filter((r) => r.status === 'approved').length,
      rejected: items.filter((r) => r.status === 'rejected').length,
      pending: items.filter((r) => r.status === 'pending').length,
      totalBudget,
    };
  }, [monthlyRequests]);

  const reportItems = monthlyRequests.filter((r) => r.type === 'report');
  const handleExportSummary = () => {
    try {
      exportToExcel(
        monthlyRequests.filter((request) => request.type !== 'internal-service').map(toRequestExportRow),
        requestTrackingColumns,
        `Request_Summary_${new Date().toISOString().slice(0, 10)}`
      );
    } catch (error) {
      console.error('Request summary export failed:', error);
      toast.error(error instanceof Error ? error.message : 'Unable to export request summary');
    }
  };
  const pendingReportReviews = requests.filter((request) => {
    const chain = request.payload?.approvalChain;
    const stage = request.payload?.currentApproverIndex ?? 0;
    return request.type === 'report' &&
      ['pending', 'forwarded'].includes(request.status) &&
      Array.isArray(chain) &&
      chain[stage] === user?.username;
  });

  const handleReportDecision = async (requestId: string, action: 'approve' | 'reject') => {
    const comment = collectDecisionRemarks(action);
    if (!comment) {
      toast.error('Decision remarks must contain at least five characters');
      return;
    }
    setActingOnReportId(requestId);
    try {
      const response = await fetch('/api/requests/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId, action, comment }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Report decision failed');
      toast.success(result.forwardedTo ? `Forwarded to ${result.forwardedTo}` : `Report ${action}d`);
      const refreshed = await fetch('/api/requests?target=all');
      if (refreshed.ok) {
        const data = await refreshed.json();
        setRequests(data.requests || []);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Report decision failed');
    } finally {
      setActingOnReportId(null);
    }
  };

  const downloadUploadedFile = (file: { name: string; type?: string; base64: string }) => {
    if (!file?.base64) {
      toast.error('No file data available');
      return;
    }
    const link = document.createElement('a');
    link.href = file.base64.startsWith('data:')
      ? file.base64
      : `data:${file.type || 'application/octet-stream'};base64,${file.base64}`;
    link.download = file.name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!isAuthenticated) {
    return <div>Loading...</div>;
  }

  return (
    <MainLayout>
      <div className="max-w-7xl space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">System Reports & Analytics</h1>
          <p className="text-slate-600">Live request stats and report downloads</p>
        </div>

        <section className="space-y-4">
          <h2 className="text-2xl font-bold text-slate-900">Reports awaiting your review</h2>
          {pendingReportReviews.length === 0 ? (
            <Card className="p-5 text-slate-600">No reports are assigned to you.</Card>
          ) : pendingReportReviews.map((report) => (
            <Card key={report.id} className="space-y-3 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-slate-900">{report.title}</h3>
                  <p className="text-sm text-slate-600">Submitted by {report.createdBy} · {report.payload?.reportFrequency || 'Formal'} report</p>
                  <p className="text-xs text-slate-500">
                    Employee ID: {report.createdByEmployeeId || report.payload?.id || 'Not Set'}
                    {' · '}{report.createdByDesignation || report.payload?.designation || 'Designation not set'}
                    {' · Team: '}{report.createdByDepartment || report.payload?.department || 'Not Set'}
                    {' · Phone: '}{report.createdByPhone || report.payload?.phone || 'Not Set'}
                  </p>
                </div>
                <span className="text-sm text-slate-500">{report.status}</span>
              </div>
              <p className="text-sm text-slate-700">{report.payload?.description}</p>
              <p className="text-sm text-slate-600">Applicant remarks: {report.remarks}</p>
              <RequestApprovalDetails request={report} />
              {Array.isArray(report.payload?.comments) && report.payload.comments.length > 0 && (
                <ol className="space-y-1 border-l-2 border-slate-200 pl-3 text-sm text-slate-600">
                  {report.payload.comments.map((entry: any, index: number) => (
                    <li key={`${entry.by}-${entry.at}-${index}`}>{entry.by}: {entry.comment}</li>
                  ))}
                </ol>
              )}
              <div className="flex gap-2">
                <Button disabled={actingOnReportId === report.id} onClick={() => handleReportDecision(report.id, 'approve')}>Approve / Forward</Button>
                <Button disabled={actingOnReportId === report.id} variant="destructive" onClick={() => handleReportDecision(report.id, 'reject')}>Reject</Button>
              </div>
            </Card>
          ))}
        </section>

        <div className="flex flex-col md:flex-row gap-4 items-center">
          <div className="flex items-center gap-2">
            <Calendar size={20} className="text-blue-500" />
            <select
              className="px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
            >
              {monthOptions.map((month) => (
                <option key={month} value={month}>{month}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <Button className="bg-green-600 hover:bg-green-700 text-white flex items-center gap-2" onClick={handleExportSummary} disabled={monthlyRequests.length === 0}>
              <Download size={18} /> Export Excel
            </Button>
            <Button className="bg-blue-500 hover:bg-blue-600 text-white flex items-center gap-2" onClick={() => window.print()}>
              <Download size={18} /> Export Summary
            </Button>
          </div>
        </div>

        <div className="space-y-4">
          <h2 className="text-2xl font-bold text-slate-900">Leave Reports</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="bg-yellow-50 p-6 border-l-4 border-yellow-500">
              <p className="text-sm text-slate-600 mb-1">Pending Requests</p>
              <p className="text-3xl font-bold text-yellow-600">{leaveStats.pending}</p>
              <p className="text-xs text-slate-500 mt-2">Awaiting approval</p>
            </Card>
            <Card className="bg-green-50 p-6 border-l-4 border-green-500">
              <p className="text-sm text-slate-600 mb-1">Approved Leaves</p>
              <p className="text-3xl font-bold text-green-600">{leaveStats.approved}</p>
            </Card>
            <Card className="bg-red-50 p-6 border-l-4 border-red-500">
              <p className="text-sm text-slate-600 mb-1">Rejected</p>
              <p className="text-3xl font-bold text-red-600">{leaveStats.rejected}</p>
            </Card>
            <Card className="bg-purple-50 p-6 border-l-4 border-purple-500">
              <p className="text-sm text-slate-600 mb-1">By Type</p>
              <div className="text-xs mt-3 space-y-1">
                {Object.keys(leaveStats.byType).length === 0 && (
                  <p className="text-slate-700">No data</p>
                )}
                {Object.entries(leaveStats.byType).map(([type, count]) => (
                  <p key={type} className="text-slate-700">{type}: {count}</p>
                ))}
              </div>
            </Card>
          </div>
        </div>

        <div className="space-y-4">
          <h2 className="text-2xl font-bold text-slate-900">Allowance Claims Reports</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="bg-yellow-50 p-6 border-l-4 border-yellow-500">
              <p className="text-sm text-slate-600 mb-1">Pending Claims</p>
              <p className="text-3xl font-bold text-yellow-600">{taStats.pending}</p>
            </Card>
            <Card className="bg-green-50 p-6 border-l-4 border-green-500">
              <p className="text-sm text-slate-600 mb-1">Approved Claims</p>
              <p className="text-3xl font-bold text-green-600">{taStats.approved}</p>
              <p className="text-xs text-slate-500 mt-2">₹{taStats.totalAmount.toLocaleString()} total</p>
            </Card>
            <Card className="bg-red-50 p-6 border-l-4 border-red-500">
              <p className="text-sm text-slate-600 mb-1">Rejected Claims</p>
              <p className="text-3xl font-bold text-red-600">{taStats.rejected}</p>
            </Card>
            <Card className="bg-blue-50 p-6 border-l-4 border-blue-500">
              <p className="text-sm text-slate-600 mb-1">Average Amount</p>
              <p className="text-3xl font-bold text-blue-600">₹{Math.round(taStats.averageAmount).toLocaleString()}</p>
            </Card>
          </div>
        </div>

        <div className="space-y-4">
          <h2 className="text-2xl font-bold text-slate-900">Project Reports</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="bg-blue-50 p-6 border-l-4 border-blue-500">
              <p className="text-sm text-slate-600 mb-1">Total Submitted</p>
              <p className="text-3xl font-bold text-blue-600">{projectStats.submitted}</p>
            </Card>
            <Card className="bg-green-50 p-6 border-l-4 border-green-500">
              <p className="text-sm text-slate-600 mb-1">Approved</p>
              <p className="text-3xl font-bold text-green-600">{projectStats.approved}</p>
            </Card>
            <Card className="bg-yellow-50 p-6 border-l-4 border-yellow-500">
              <p className="text-sm text-slate-600 mb-1">Under Review</p>
              <p className="text-3xl font-bold text-yellow-600">{projectStats.pending}</p>
            </Card>
            <Card className="bg-purple-50 p-6 border-l-4 border-purple-500">
              <p className="text-sm text-slate-600 mb-1">Total Budget</p>
              <p className="text-3xl font-bold text-purple-600">₹{projectStats.totalBudget.toLocaleString()}</p>
            </Card>
          </div>
        </div>

        <div className="space-y-4">
          <h2 className="text-2xl font-bold text-slate-900">Weekly/Monthly Reports</h2>
          {reportItems.length === 0 ? (
            <Card className="p-6 text-slate-600">No reports submitted.</Card>
          ) : (
            <div className="space-y-3">
              {reportItems.map((req) => (
                <Card key={req.id} className="bg-white p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{req.payload?.reportFrequency || 'Formal'} report</p>
                      <p className="text-xs text-slate-500">{req.createdBy}</p>
                      <p className="text-xs text-slate-500">
                        Employee ID: {req.createdByEmployeeId || req.payload?.id || 'Not Set'}
                        {' · '}{req.createdByDesignation || req.payload?.designation || 'Designation not set'}
                        {' · Team: '}{req.createdByDepartment || req.payload?.department || 'Not Set'}
                        {' · Phone: '}{req.createdByPhone || req.payload?.phone || 'Not Set'}
                      </p>
                    </div>
                    <span className="text-xs text-slate-500">{new Date(req.createdAt).toLocaleString('en-IN')}</span>
                  </div>
                  <p className="text-sm text-slate-700 mt-2">{req.payload?.description}</p>
                  <RequestApprovalDetails request={req} />
                  <div className="flex flex-wrap gap-2 mt-3">
                    {req.payload?.attachments?.map((file: any, index: number) => (
                      <React.Fragment key={`${file.name}-${index}`}>
                      <Button size="sm" variant="outline" onClick={() => setViewingFile({ name: file.name, type: file.type, base64: file.base64.startsWith('data:') ? file.base64 : `data:${file.type || 'application/octet-stream'};base64,${file.base64}` })}>
                        View PDF
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => downloadUploadedFile(file)}>
                        <FileDown size={14} className="mr-1" /> Download {file.name}
                      </Button>
                      </React.Fragment>
                    ))}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      <FileViewerModal file={viewingFile} onClose={() => setViewingFile(null)} />
    </MainLayout>
  );
}
