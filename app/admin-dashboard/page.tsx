'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';
import MainLayout from '@/components/main-layout';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CheckCircle, XCircle, Clock, Trash2, FileDown } from 'lucide-react';
import { toast } from 'sonner';
import FileViewerModal from '@/components/file-viewer-modal';
import { RequestApprovalDetails } from '@/components/request-approval-details';

export default function AdminDashboard() {
  const { isAuthenticated, user } = useAuth();
  const router = useRouter();
  const isFounder = user?.role === 'founder' || user?.username?.toLowerCase() === 'gkbharath' || user?.id === 'founder-001';
  const canReviewAccessRequests = ['hareeshv', 'santhanakumarv', 'gkbharath'].includes(user?.username || '') || user?.role === 'admin' || user?.role === 'founder';

  const [requests, setRequests] = useState<any[]>([]);
  const [founderRequests, setFounderRequests] = useState<any[]>([]);
  const lastFounderReportCount = useRef(0);

  const [guestLogins, setGuestLogins] = useState<any[]>([]);
  const [guestInquiries, setGuestInquiries] = useState<any[]>([]);
  const [viewingFile, setViewingFile] = useState<any>(null);
  const [accessRequests, setAccessRequests] = useState<any[]>([]);
  const [accessHistory, setAccessHistory] = useState<any[]>([]);
  const [loadingAccess, setLoadingAccess] = useState(false);
  const [companyLedger, setCompanyLedger] = useState<{ balance: number; transactions: any[] }>({
    balance: 0,
    transactions: [],
  });

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, router]);

  const fetchRequests = async () => {
    try {
      const response = await fetch('/api/requests?target=all');
      if (response.ok) {
        const data = await response.json();
        setRequests(data.requests || []);
        setFounderRequests(data.requests || []);
        if (isFounder) {
          const internReports = (data.requests || []).filter(
            (req: any) => req.type === 'report' && (req.createdByDesignation || '').toLowerCase().includes('intern')
          );
          if (internReports.length > lastFounderReportCount.current) {
            toast.success('New intern report submitted');
            lastFounderReportCount.current = internReports.length;
          }
        }
      }
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => {
    if (!isAuthenticated) return;
    fetchRequests();
    const interval = setInterval(fetchRequests, 15000);
    return () => clearInterval(interval);
  }, [isAuthenticated, isFounder, user]);

  useEffect(() => {
    if (user?.role !== 'admin') return;
    const fetchLedger = async () => {
      try {
        const response = await fetch('/api/company-ledger');
        if (!response.ok) return;
        const data = await response.json();
        if (data.ledger) {
          setCompanyLedger({
            balance: Number(data.ledger.balance || 0),
            transactions: data.ledger.transactions || [],
          });
        }
      } catch (error) {
        console.error('Company ledger fetch error:', error);
      }
    };
    fetchLedger();
    const interval = setInterval(fetchLedger, 15000);
    return () => clearInterval(interval);
  }, [user]);

  const exportApprovalRecords = () => {
    if (user?.role !== 'admin') {
      return;
    }

    const exportItems = requests.filter((req) =>
      req.type === 'leave' || req.type === 'ta' || req.type === 'proposal'
    );

    if (exportItems.length === 0) {
      toast.error('No approval records to export');
      return;
    }

    const statusLabel = (status: string) => {
      if (status === 'approved') return 'Approved';
      if (status === 'rejected') return 'Rejected';
      return 'Pending';
    };

    const typeLabel = (type: string) => {
      if (type === 'leave') return 'Leave';
      if (type === 'ta') return 'Allowance Claim';
      return 'Proposal';
    };

    const reasonValue = (req: any) => {
      if (req.type === 'leave') {
        const reason = req.payload?.reason || '';
        return req.payload?.isPastDateRequest ? `Past-date leave: ${reason}` : reason;
      }
      if (req.type === 'ta') {
        return req.payload?.description || '';
      }
      return req.payload?.projectTitle || req.payload?.abstract || '';
    };

    const csvEscape = (value: string) => {
      const text = value ?? '';
      const needsQuotes = /[",\n]/.test(text);
      const escaped = String(text).replace(/"/g, '""');
      return needsQuotes ? `"${escaped}"` : escaped;
    };

    const headers = ['User Name', 'Request Type', 'Reason', 'Status', 'Applied On'];
    const rows = exportItems.map((req) => [
      req.createdBy || '',
      typeLabel(req.type),
      reasonValue(req),
      statusLabel(req.status),
      req.createdAt ? new Date(req.createdAt).toLocaleString('en-IN') : '',
    ]);

    const csvContent = [headers, ...rows]
      .map((row) => row.map(csvEscape).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const dateStamp = new Date().toISOString().split('T')[0];
    link.href = url;
    link.download = `approval-records-${dateStamp}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const fetchAccessRequests = async () => {
    if (!canReviewAccessRequests) return;
    setLoadingAccess(true);
    try {
      const response = await fetch('/api/admin/access-requests?includeHistory=true');
      if (!response.ok) return;
      const data = await response.json();
      setAccessRequests(data.requests || []);
      setAccessHistory(data.history || []);
    } catch (error) {
      console.error('Access request fetch error:', error);
    } finally {
      setLoadingAccess(false);
    }
  };

  useEffect(() => {
    fetchAccessRequests();
    const interval = setInterval(fetchAccessRequests, 30000);
    return () => clearInterval(interval);
  }, [user, canReviewAccessRequests]);

  // Load guest logins from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('guestLogins');
    if (stored) {
      try {
        setGuestLogins(JSON.parse(stored));
      } catch (e) {
        console.error('Failed to parse guest logins:', e);
      }
    }
  }, []);

  useEffect(() => {
    const fetchInquiries = async () => {
      try {
        const response = await fetch('/api/guest-inquiries', { headers: { 'x-user-role': user?.role || '', 'x-user-id': user?.id || '' } });
        if (!response.ok) return;
        const data = await response.json();
        setGuestInquiries(data.inquiries || []);
      } catch (error) {
        console.error('Failed to fetch guest inquiries:', error);
      }
    };

    fetchInquiries();
    const interval = setInterval(fetchInquiries, 15000);
    return () => clearInterval(interval);
  }, []);

  const handleRequestAction = (requestId: string, action: 'approve' | 'reject') => {
    void requestId;
    void action;
    router.push('/admin/approvals');
  };

  const canActOnRequest = (request: any) => {
    const payload = request.payload || {};
    const chain = Array.isArray(payload.approvalChain) ? payload.approvalChain : [];
    const index = request.status === 'forwarded'
      ? payload.currentApproverIndex
      : request.status === 'pending'
        ? 0
        : -1;
    return Number.isInteger(index) && chain[index] === user?.username?.toLowerCase();
  };

  const handleInquiryStatusChange = (inquiryId: string, newStatus: string) => {
    setGuestInquiries(prev => 
      prev.map(inquiry => 
        inquiry.id === inquiryId ? { ...inquiry, status: newStatus } : inquiry
      )
    );
  };

  const handleDeleteInquiry = (inquiryId: string) => {
    setGuestInquiries(prev => prev.filter(inquiry => inquiry.id !== inquiryId));
  };

  const downloadRequestPdf = (request: any) => {
    const payload = request.payload || {};
    const html = `
      <html>
        <head>
          <title>${request.title}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 32px; color: #0f172a; }
            h1 { font-size: 20px; margin-bottom: 8px; }
            h2 { font-size: 14px; margin-top: 20px; }
            .meta { font-size: 12px; color: #475569; margin-bottom: 16px; }
            .section { margin-top: 16px; }
            .line { margin: 6px 0; }
            .footer { margin-top: 32px; font-size: 12px; color: #64748b; }
          </style>
        </head>
        <body>
          <h1>${request.title}</h1>
          <div class="meta">Submitted by ${request.createdBy} • ${new Date(request.createdAt).toLocaleString('en-IN')}</div>
          <div class="section">
            <h2>Requester Details</h2>
            <div class="line">Name: ${request.createdBy}</div>
            <div class="line">Employee ID: ${request.createdByEmployeeId || request.payload?.id || '-'}</div>
            <div class="line">Designation: ${request.createdByDesignation || '-'}</div>
            <div class="line">Team Name: ${request.createdByDepartment || request.payload?.department || '-'}</div>
            <div class="line">Phone: ${request.createdByPhone || request.payload?.phone || '-'}</div>
            <div class="line">Role: ${request.createdByRole || '-'}</div>
          </div>
          <div class="section">
            <h2>Request Information</h2>
            ${Object.entries(payload)
              .map(([key, value]) => `<div class="line">${key}: ${value ?? '-'}</div>`)
              .join('')}
          </div>
          <div class="footer">Official Letter - Proposal Intranet System</div>
        </body>
      </html>
    `;

    const pdfWindow = window.open('', '_blank');
    if (!pdfWindow) return;
    pdfWindow.document.write(html);
    pdfWindow.document.close();
    pdfWindow.focus();
    setTimeout(() => pdfWindow.print(), 300);
  };

  const downloadUploadedFile = (request: any) => {
    if (!request.uploadedFile) {
      toast.error('No file available');
      return;
    }
    const link = document.createElement('a');
    link.href = request.uploadedFile.base64;
    link.download = request.uploadedFile.name;
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
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">
              Admin Management — {user?.fullName || user?.username} - {user?.designation || user?.role}
            </h1>
            <p className="text-slate-600">🔐 Full system control and oversight panel</p>
          </div>
          {user?.role === 'admin' && (
            <Button
              variant="outline"
              className="border-slate-300"
              onClick={exportApprovalRecords}
            >
              Export Records
            </Button>
          )}
        </div>


        {/* Quick Stats */}
        <div>
          <h3 className="text-xl font-bold text-slate-900 mb-4">📊 Dashboard Overview</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <Card className="bg-white p-6 border-l-4 border-yellow-500 hover:shadow-lg transition">
              <p className="text-slate-600 text-sm">Pending Leave Requests</p>
              <p className="text-3xl font-bold text-slate-900">{requests.filter((r) => r.type === 'leave' && (r.status === 'pending' || r.status === 'forwarded')).length}</p>
              <p className="text-xs text-yellow-600 mt-2">Action required</p>
            </Card>
            <Card className="bg-white p-6 border-l-4 border-orange-500 hover:shadow-lg transition">
              <p className="text-slate-600 text-sm">Pending Allowance Claims</p>
              <p className="text-3xl font-bold text-slate-900">{requests.filter((r) => r.type === 'ta' && (r.status === 'pending' || r.status === 'forwarded')).length}</p>
              <p className="text-xs text-orange-600 mt-2">Under review</p>
            </Card>
            <Card className="bg-white p-6 border-l-4 border-blue-500 hover:shadow-lg transition">
              <p className="text-slate-600 text-sm">Total Requests</p>
              <p className="text-3xl font-bold text-slate-900">{requests.length}</p>
              <p className="text-xs text-blue-600 mt-2">All submissions</p>
            </Card>
            <Card className="bg-white p-6 border-l-4 border-red-500 hover:shadow-lg transition">
              <p className="text-slate-600 text-sm">Guest Inquiries</p>
              <p className="text-3xl font-bold text-slate-900">{guestInquiries.filter(i => i.status === 'new').length}</p>
              <p className="text-xs text-red-600 mt-2">Unread messages</p>
            </Card>
            <Card className="bg-white p-6 border-l-4 border-green-500 hover:shadow-lg transition">
              <p className="text-slate-600 text-sm">Guest Visitors</p>
              <p className="text-3xl font-bold text-slate-900">{guestLogins.length}</p>
              <p className="text-xs text-green-600 mt-2">Total visits</p>
            </Card>
          </div>
        </div>

        {user?.role === 'admin' && (
          <Card className="bg-white p-6">
            <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
              <div>
                <h2 className="text-xl font-bold text-slate-900">Company Ledger</h2>
                <p className="text-sm text-slate-600">Credits and debits from approvals</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-500">Total Available Amount</p>
                <p className="text-2xl font-bold text-slate-900">₹{companyLedger.balance.toLocaleString()}</p>
              </div>
            </div>
            {companyLedger.transactions.length === 0 ? (
              <p className="text-sm text-slate-600">No transactions recorded yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="text-left px-4 py-3 font-semibold text-slate-900">Date</th>
                      <th className="text-left px-4 py-3 font-semibold text-slate-900">Purpose</th>
                      <th className="text-left px-4 py-3 font-semibold text-slate-900">Amount</th>
                      <th className="text-left px-4 py-3 font-semibold text-slate-900">Type</th>
                      <th className="text-left px-4 py-3 font-semibold text-slate-900">Balance After</th>
                    </tr>
                  </thead>
                  <tbody>
                    {companyLedger.transactions.map((txn) => (
                      <tr key={txn.id} className="border-b border-slate-100">
                        <td className="px-4 py-3 text-slate-700">
                          {new Date(txn.date).toLocaleString('en-IN')}
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          <div className="font-medium text-slate-900">{txn.purpose}</div>
                          {txn.remarks && (
                            <div className="text-xs text-slate-500">{txn.remarks}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-700">₹{Number(txn.amount).toLocaleString()}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 text-xs rounded font-medium ${
                            txn.type === 'credited'
                              ? 'bg-green-100 text-green-800'
                              : 'bg-red-100 text-red-800'
                          }`}>
                            {txn.type === 'credited' ? 'Credited' : 'Debited'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-700">₹{Number(txn.balanceAfter).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        )}

        {canReviewAccessRequests && (
          <Card id="access-requests" className="bg-white p-6">
            <h2 className="text-xl font-bold text-slate-900 mb-4">User Access Requests</h2>
            {loadingAccess && <p className="text-sm text-slate-600">Loading requests...</p>}
            {!loadingAccess && accessRequests.length === 0 && (
              <p className="text-sm text-slate-600">No pending access requests.</p>
            )}
            {!loadingAccess && accessRequests.length > 0 && (
              <div className="space-y-3">
                {accessRequests.map((request) => (
                  <div key={request.id} className="border rounded-lg p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{request.fullName}</p>
                      <p className="text-xs text-slate-500">Employee ID: {request.employeeId || 'Not Set'}</p>
                      <p className="text-xs text-slate-500">
                        {request.designation || 'Designation not set'}
                        {' · Team: '}{request.department || 'Not Set'}
                        {' · Phone: '}{request.phone || 'Not Set'}
                      </p>
                      <p className="text-xs text-slate-500">{request.email}</p>
                      <p className="text-xs text-slate-400 mt-1">
                        Requested: {new Date(request.requestedAt).toLocaleString('en-IN')}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="bg-green-600 hover:bg-green-700 text-xs"
                        onClick={() => router.push('/admin/approvals')}
                      >
                        Review in Approvals
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!loadingAccess && accessHistory.length > 0 && (
              <div className="mt-6">
                <h3 className="text-lg font-semibold text-slate-900 mb-3">Past Requests</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="text-left px-4 py-3 font-semibold text-slate-900">Name</th>
                        <th className="text-left px-4 py-3 font-semibold text-slate-900">Email</th>
                        <th className="text-left px-4 py-3 font-semibold text-slate-900">Status</th>
                        <th className="text-left px-4 py-3 font-semibold text-slate-900">Requested</th>
                        <th className="text-left px-4 py-3 font-semibold text-slate-900">Decision</th>
                      </tr>
                    </thead>
                    <tbody>
                      {accessHistory.map((entry) => {
                        const decisionAt = entry.approvedAt || entry.rejectedAt || entry.requestedAt;
                        const statusClass = entry.status === 'active'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-red-100 text-red-800';
                        return (
                          <tr key={entry.id} className="border-b border-slate-100">
                            <td className="px-4 py-3 text-slate-900">{entry.fullName}</td>
                            <td className="px-4 py-3 text-slate-700">{entry.email}</td>
                            <td className="px-4 py-3">
                              <span className={`px-2 py-1 text-xs rounded font-medium ${statusClass}`}>
                                {entry.status === 'active' ? 'Approved' : 'Rejected'}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-slate-700">
                              {entry.requestedAt ? new Date(entry.requestedAt).toLocaleString('en-IN') : '-'}
                            </td>
                            <td className="px-4 py-3 text-slate-700">
                              {decisionAt ? new Date(decisionAt).toLocaleString('en-IN') : '-'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </Card>
        )}

        {/* Leave Requests */}
        <Card className="bg-white p-6">
          <h2 className="text-xl font-bold text-slate-900 mb-4">Leave Requests - Approval/Rejection Authority</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-slate-900">Employee</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-900">Leave Type</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-900">Dates</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-900">Reason</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-900">Status</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-900">Action</th>
                </tr>
              </thead>
              <tbody>
                {requests.filter((req) => req.type === 'leave').map((request) => (
                  <tr key={request.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-900">{request.createdBy}</td>
                    <td className="px-4 py-3 text-slate-900">
                      {request.payload.leaveType}
                      {request.payload?.isPastDateRequest && (
                        <span className="ml-2 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                          Past Date
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-900">
                      {request.payload.fromDate} - {request.payload.toDate}
                    </td>
                    <td className="px-4 py-3 text-slate-900">
                      <p className="truncate">{request.payload.reason}</p>
                      <RequestApprovalDetails request={request} />
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-1 text-xs rounded font-medium ${
                          request.status === 'pending' || request.status === 'forwarded'
                            ? 'bg-yellow-100 text-yellow-800'
                            : request.status === 'approved'
                              ? 'bg-green-100 text-green-800'
                              : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {request.status.charAt(0).toUpperCase() + request.status.slice(1)}
                      </span>
                    </td>
                    <td className="px-4 py-3 flex flex-wrap gap-2">
                      {canActOnRequest(request) && (
                        <>
                          <Button
                            size="sm"
                            className="bg-green-600 hover:bg-green-700 text-xs"
                            onClick={() => handleRequestAction(request.id, 'approve')}
                          >
                            Review in Approvals
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            className="text-xs"
                            onClick={() => handleRequestAction(request.id, 'reject')}
                          >
                          </Button>
                        </>
                      )}
                      {request.uploadedFile && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs"
                          onClick={() => setViewingFile(request.uploadedFile)}
                        >
                          View Form
                        </Button>
                      )}
                      {request.uploadedFile && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs"
                          onClick={() => downloadUploadedFile(request)}
                        >
                          Download Form
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs"
                        onClick={() => downloadRequestPdf(request)}
                      >
                        <FileDown size={14} className="mr-1" /> PDF
                      </Button>
                      {request.status === 'approved' && <CheckCircle size={18} className="text-green-600" />}
                      {request.status === 'rejected' && <XCircle size={18} className="text-red-600" />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Guest Activity Log */}
        <Card className="bg-white p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              👥 Guest Activity Log
            </h2>
            {guestLogins.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (confirm('Are you sure you want to clear all guest activity history?')) {
                    localStorage.removeItem('guestLogins');
                    setGuestLogins([]);
                    toast.success('Guest activity history cleared');
                  }
                }}
              >
                Clear History
              </Button>
            )}
          </div>
          {guestLogins.length === 0 ? (
            <p className="text-sm text-slate-600">No guest visits recorded yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold text-slate-900">Guest Name</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-900">Email</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-900">Company</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-900">Visit Date</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-900">Visit Time</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-900">Purpose</th>
                  </tr>
                </thead>
                <tbody>
                  {guestLogins.map((guest) => (
                    <tr key={guest.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-4 py-3 text-slate-900 font-medium">{guest.name}</td>
                      <td className="px-4 py-3 text-slate-900">{guest.email || 'N/A'}</td>
                      <td className="px-4 py-3 text-slate-900">{guest.companyName || 'N/A'}</td>
                      <td className="px-4 py-3 text-slate-900">{guest.visitDate}</td>
                      <td className="px-4 py-3 text-slate-900">{guest.visitTime}</td>
                      <td className="px-4 py-3 text-slate-700 max-w-xs truncate">{guest.purpose}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* TA Claims */}
        <Card className="bg-white p-6">
          <h2 className="text-xl font-bold text-slate-900 mb-4">Pending Allowance Approvals</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-slate-900">Employee</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-900">Amount (₹)</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-900">Description</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-900">Status</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-900">Action</th>
                </tr>
              </thead>
              <tbody>
                {requests.filter((req) => req.type === 'ta' && canActOnRequest(req)).map((claim) => (
                  <tr key={claim.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-900">
                      <p>{claim.createdBy}</p>
                      {claim.payload?.id && <p className="text-xs font-mono text-slate-500">{claim.payload.id}</p>}
                    </td>
                    <td className="px-4 py-3 text-slate-900 font-semibold">{claim.payload.amount}</td>
                    <td className="px-4 py-3 text-slate-900">
                      <p className="truncate">{claim.payload.description}</p>
                      <RequestApprovalDetails request={claim} />
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-1 text-xs rounded font-medium ${
                          claim.status === 'pending' || claim.status === 'forwarded'
                            ? 'bg-yellow-100 text-yellow-800'
                            : claim.status === 'approved'
                              ? 'bg-green-100 text-green-800'
                              : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {claim.status.charAt(0).toUpperCase() + claim.status.slice(1)}
                      </span>
                    </td>
                    <td className="px-4 py-3 flex flex-wrap gap-2">
                      {canActOnRequest(claim) && (
                        <>
                          <Button
                            size="sm"
                            className="bg-green-600 hover:bg-green-700 text-xs"
                            onClick={() => handleRequestAction(claim.id, 'approve')}
                          >
                            Review in Approvals
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            className="text-xs"
                            onClick={() => handleRequestAction(claim.id, 'reject')}
                          >
                          </Button>
                        </>
                      )}
                      {claim.uploadedFile && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs"
                          onClick={() => setViewingFile(claim.uploadedFile)}
                        >
                          View Form
                        </Button>
                      )}
                      {claim.uploadedFile && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs"
                          onClick={() => downloadUploadedFile(claim)}
                        >
                          Download Form
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs"
                        onClick={() => downloadRequestPdf(claim)}
                      >
                        <FileDown size={14} className="mr-1" /> PDF
                      </Button>
                      {claim.status === 'approved' && <CheckCircle size={18} className="text-green-600" />}
                      {claim.status === 'rejected' && <XCircle size={18} className="text-red-600" />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Proposal Requests */}
        <Card className="bg-white p-6">
          <h2 className="text-xl font-bold text-slate-900 mb-4">Proposal Requests</h2>
          <div className="space-y-3">
            {requests.filter((req) => req.type === 'proposal').map((req) => (
              <div key={req.id} className="border rounded-lg p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{req.payload.projectTitle}</p>
                    <p className="text-xs text-slate-500">Submitted by {req.createdBy}</p>
                  </div>
                  <span className="text-xs text-slate-500">{new Date(req.createdAt).toLocaleString('en-IN')}</span>
                </div>
                <div className="flex flex-wrap gap-2 mt-3">
                  {req.uploadedFile && (
                    <Button size="sm" variant="outline" onClick={() => setViewingFile(req.uploadedFile)}>
                      View Form
                    </Button>
                  )}
                  {req.uploadedFile && (
                    <Button size="sm" variant="outline" onClick={() => downloadUploadedFile(req)}>
                      Download Form
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => downloadRequestPdf(req)}>
                    <FileDown size={14} className="mr-1" /> PDF
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Report Requests */}
        <Card className="bg-white p-6">
          <h2 className="text-xl font-bold text-slate-900 mb-4">Reports</h2>
          <div className="space-y-3">
            {requests.filter((req) => req.type === 'report').map((req) => (
              <div key={req.id} className="border rounded-lg p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{req.payload.reportType} report</p>
                    <p className="text-xs text-slate-500">{req.createdBy}</p>
                  </div>
                  <span className="text-xs text-slate-500">{new Date(req.createdAt).toLocaleString('en-IN')}</span>
                </div>
                <p className="text-sm text-slate-700 mt-2">{req.payload.reportContent}</p>
                <div className="flex flex-wrap gap-2 mt-3">
                  {req.uploadedFile && (
                    <Button size="sm" variant="outline" onClick={() => setViewingFile(req.uploadedFile)}>
                      View PDF
                    </Button>
                  )}
                  {req.uploadedFile && (
                    <Button size="sm" variant="outline" onClick={() => downloadUploadedFile(req)}>
                      Download PDF
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => downloadRequestPdf(req)}>
                    <FileDown size={14} className="mr-1" /> PDF
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {isFounder && (
          <Card className="bg-white p-6">
            <h2 className="text-xl font-bold text-slate-900 mb-4">Requests Awaiting Your Approval</h2>
            <div className="space-y-3">
              {founderRequests.filter((req) => canActOnRequest(req)).length === 0 && (
                <p className="text-sm text-slate-600">No requests are currently awaiting your approval.</p>
              )}
              {founderRequests
                .filter((req) => canActOnRequest(req))
                .map((req) => (
                <div key={req.id} className="border rounded-lg p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{req.title}</p>
                      <p className="text-xs text-slate-500">{req.createdBy} • {req.createdByDesignation || ''}</p>
                      <p className="text-xs text-slate-500">
                        Employee ID: {req.createdByEmployeeId || req.payload?.id || 'Not Set'}
                        {' · Team: '}{req.createdByDepartment || req.payload?.department || 'Not Set'}
                        {' · Phone: '}{req.createdByPhone || req.payload?.phone || 'Not Set'}
                      </p>
                    </div>
                    <span className="text-xs text-slate-500">{new Date(req.createdAt).toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-3">
                    {req.uploadedFile && (
                      <Button size="sm" variant="outline" onClick={() => setViewingFile(req.uploadedFile)}>
                        View Form
                      </Button>
                    )}
                    {req.uploadedFile && (
                      <Button size="sm" variant="outline" onClick={() => downloadUploadedFile(req)}>
                        Download Form
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => downloadRequestPdf(req)}>
                      <FileDown size={14} className="mr-1" /> PDF
                    </Button>
                    <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => handleRequestAction(req.id, 'approve')}>
                      Review in Approvals
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Guest Inquiries */}
        <Card className="bg-white p-6">
          <h2 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
            💬 Guest Inquiries & Messages
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-slate-900">Guest Name</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-900">Subject</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-900">Message</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-900">Date & Time</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-900">Status</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-900">Action</th>
                </tr>
              </thead>
              <tbody>
                {guestInquiries.map((inquiry) => (
                  <tr key={inquiry.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-900 font-medium">{inquiry.guestName}</td>
                    <td className="px-4 py-3 text-slate-900 font-semibold">{inquiry.subject}</td>
                    <td className="px-4 py-3 text-slate-700 max-w-xs truncate">{inquiry.message}</td>
                    <td className="px-4 py-3 text-slate-900 text-xs">
                      {inquiry.date} <br /> {inquiry.time}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-1 text-xs rounded font-medium ${
                          inquiry.status === 'new'
                            ? 'bg-red-100 text-red-800'
                            : inquiry.status === 'read'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-green-100 text-green-800'
                        }`}
                      >
                        {inquiry.status.charAt(0).toUpperCase() + inquiry.status.slice(1)}
                      </span>
                    </td>
                    <td className="px-4 py-3 flex gap-2">
                      {inquiry.status === 'new' && (
                        <Button
                          size="sm"
                          className="bg-blue-600 hover:bg-blue-700 text-xs"
                          onClick={() => handleInquiryStatusChange(inquiry.id, 'read')}
                        >
                          Mark Read
                        </Button>
                      )}
                      {inquiry.status !== 'resolved' && (
                        <Button
                          size="sm"
                          className="bg-green-600 hover:bg-green-700 text-xs"
                          onClick={() => handleInquiryStatusChange(inquiry.id, 'resolved')}
                        >
                          Resolve
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="destructive"
                        className="text-xs"
                        onClick={() => handleDeleteInquiry(inquiry.id)}
                      >
                        Delete
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

      </div>
      <FileViewerModal file={viewingFile} onClose={() => setViewingFile(null)} />
    </MainLayout>
  );
}
