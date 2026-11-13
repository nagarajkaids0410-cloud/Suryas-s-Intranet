'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';
import MainLayout from '@/components/main-layout';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileDown } from 'lucide-react';
import FileViewerModal from '@/components/file-viewer-modal';
import { toast } from 'sonner';

export default function Page() {
  const { isAuthenticated, user } = useAuth();
  const router = useRouter();
  const [requests, setRequests] = useState<any[]>([]);
  const [viewingFile, setViewingFile] = useState<any>(null);
  const approverNames: Record<string, string> = {
    hareeshv: 'Hareesh V',
    santhanakumarv: 'Santhana Kumar V',
    gkbharath: 'GOLLA KUMAR BHARATH',
  };

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, router]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const fetchRequests = async () => {
      const response = await fetch('/api/requests?target=all');
      if (!response.ok) return;
      const data = await response.json();
      const userRequests = (data.requests || []).filter((req: any) =>
        req.type !== 'internal-service' && (
        req.createdById === user?.id ||
        (req.type === 'proposal' && req.payload?.projectTeam?.some((member: any) => member.userId === user?.id))
        )
      );
      setRequests(userRequests);
    };
    fetchRequests();
    const interval = setInterval(fetchRequests, 15000);
    return () => clearInterval(interval);
  }, [isAuthenticated, user]);

  if (!isAuthenticated) {
    return <div>Loading...</div>;
  }

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

  const getPendingApprover = (request: any) => {
    if (request.status !== 'pending' && request.status !== 'forwarded') return '—';
    const chain = request.payload?.approvalChain;
    if (!Array.isArray(chain)) return 'Leadership review';
    const index = request.status === 'forwarded'
      ? request.payload?.currentApproverIndex
      : 0;
    const username = Number.isInteger(index) ? chain[index] : undefined;
    return username ? approverNames[username] || username : '—';
  };

  const getFinalDecision = (request: any) => {
    if (request.status !== 'approved' && request.status !== 'rejected') return 'Not decided';
    const comments = Array.isArray(request.payload?.comments) ? request.payload.comments : [];
    const decision = comments.find((entry: any) => entry.decision === request.status);
    const actor = decision?.by ? approverNames[decision.by] || decision.by : 'Approver';
    return `${request.status === 'approved' ? 'Approved' : 'Rejected'} by ${actor}`;
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Welcome, {user?.fullName || 'User'}!</h1>
          <p className="text-slate-600">Here's your personal dashboard</p>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="bg-white p-6 border-l-4 border-blue-500">
            <p className="text-slate-600 text-sm">Total Requests</p>
            <p className="text-3xl font-bold text-slate-900">{requests.length}</p>
          </Card>
          <Card className="bg-white p-6 border-l-4 border-yellow-500">
            <p className="text-slate-600 text-sm">Pending</p>
            <p className="text-3xl font-bold text-slate-900">
              {requests.filter((r) => r.status === 'pending' || r.status === 'forwarded').length}
            </p>
          </Card>
          <Card className="bg-white p-6 border-l-4 border-green-500">
            <p className="text-slate-600 text-sm">Approved</p>
            <p className="text-3xl font-bold text-slate-900">
              {requests.filter((r) => r.status === 'approved').length}
            </p>
          </Card>
          <Card className="bg-white p-6 border-l-4 border-red-500">
            <p className="text-slate-600 text-sm">Rejected</p>
            <p className="text-3xl font-bold text-slate-900">
              {requests.filter((r) => r.status === 'rejected').length}
            </p>
          </Card>
        </div>

        <Card className="bg-white p-6">
          <h2 className="text-xl font-bold text-slate-900 mb-4">My Requests — Status & Approval History</h2>
          {requests.filter((request) => request.createdById === user?.id).length === 0 ? (
            <p className="text-sm text-slate-600">You have not submitted any requests yet.</p>
          ) : (
            <div className="space-y-4">
              {requests
                .filter((request) => request.createdById === user?.id)
                .map((request) => {
                  const history = Array.isArray(request.payload?.comments) ? request.payload.comments : [];
                  const approvalRoute = Array.isArray(request.payload?.approvalChain)
                    ? request.payload.approvalChain.map((username: string) => approverNames[username] || username).join(' → ')
                    : 'Leadership review';
                  return (
                    <article key={request.id} className="rounded-lg border border-slate-200 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h3 className="font-semibold text-slate-900">{request.title}</h3>
                          <p className="mt-1 text-xs text-slate-500">Request ID: {request.id}</p>
                          <p className="text-xs text-slate-500">Submission ID: {request.submissionId || request.id}</p>
                          <p className="text-xs text-slate-500">Submitted: {new Date(request.createdAt).toLocaleString('en-IN')}</p>
                        </div>
                        <span className={`rounded px-2 py-1 text-xs font-semibold ${
                          request.status === 'approved'
                            ? 'bg-green-100 text-green-800'
                            : request.status === 'rejected'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-amber-100 text-amber-800'
                        }`}>
                          {request.status === 'forwarded' ? 'In approval workflow' : request.status}
                        </span>
                      </div>
                      <div className="mt-3 grid gap-2 text-sm text-slate-700 md:grid-cols-2">
                        <p><strong>Pending approver:</strong> {getPendingApprover(request)}</p>
                        <p><strong>Final decision:</strong> {getFinalDecision(request)}</p>
                        <p className="md:col-span-2"><strong>Approval route:</strong> {approvalRoute}</p>
                        <p className="md:col-span-2"><strong>Your remarks:</strong> {request.remarks || request.payload?.remarks || '—'}</p>
                      </div>
                      <div className="mt-3 border-t pt-3">
                        <h4 className="text-sm font-semibold text-slate-800">Approval history</h4>
                        {history.length === 0 ? (
                          <p className="mt-1 text-sm text-slate-500">No approval action has been recorded yet.</p>
                        ) : (
                          <ol className="mt-2 space-y-2">
                            {history.map((entry: any, index: number) => (
                              <li key={`${entry.at || 'history'}-${index}`} className="text-sm text-slate-600">
                                <span className="font-medium text-slate-800">
                                  {approverNames[entry.by] || entry.by || 'Approver'}
                                </span>
                                {' · '}
                                {entry.decision === 'approve' ? 'Approved / forwarded' : entry.decision === 'reject' ? 'Rejected' : entry.decision || 'Updated'}
                                {entry.at ? ` · ${new Date(entry.at).toLocaleString('en-IN')}` : ''}
                                {entry.comment ? <span className="block pl-2">{entry.comment}</span> : null}
                              </li>
                            ))}
                          </ol>
                        )}
                      </div>
                    </article>
                  );
                })}
            </div>
          )}
        </Card>

        {requests.some((req) => req.type === 'proposal' && req.payload?.projectTeam?.some((member: any) => member.userId === user?.id)) && (
          <Card className="bg-white p-6">
            <h2 className="text-xl font-bold text-slate-900 mb-4">My Assigned Projects</h2>
            <div className="space-y-3">
              {requests
                .filter((req) => req.type === 'proposal' && req.payload?.projectTeam?.some((member: any) => member.userId === user?.id))
                .map((req) => {
                  const assignment = req.payload.projectTeam.find((member: any) => member.userId === user?.id);
                  return (
                    <div key={req.id} className="rounded-lg border border-slate-200 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <h3 className="font-semibold text-slate-900">{req.payload?.projectTitle || req.title}</h3>
                          <p className="text-sm text-slate-600">Role: {assignment.projectRole}</p>
                          <p className="text-xs text-slate-500">
                            Employee ID: {assignment.employeeId || user?.employeeId || 'Not Set'}
                            {' · '}{assignment.designation || user?.designation || 'Designation not set'}
                            {' · Team: '}{assignment.department || user?.department || 'Not Set'}
                            {' · Phone: '}{assignment.phone || user?.phone || 'Not Set'}
                          </p>
                          <p className="text-sm text-slate-600">Responsibilities: {assignment.responsibility}</p>
                        </div>
                        <span className="rounded bg-blue-100 px-2 py-1 text-xs font-medium text-blue-800">
                          {req.status}
                        </span>
                      </div>
                    </div>
                  );
                })}
            </div>
          </Card>
        )}

        {/* Approval History (No Balance Exposure) */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold text-slate-900 mb-4">Approval History</h2>
          {requests.filter((req) => (req.type === 'ta' || req.type === 'proposal') && req.status === 'approved').length === 0 ? (
            <p className="text-slate-600">No approval history yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold text-slate-900">Date</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-900">Amount</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-900">Purpose</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-900">Remarks</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-900">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {requests
                    .filter((req) => (req.type === 'ta' || req.type === 'proposal') && req.status === 'approved')
                    .map((req) => {
                      const isAllowance = req.type === 'ta';
                      const amount = isAllowance
                        ? req.payload?.amount
                        : req.payload?.projectAmount;
                      const purpose = isAllowance
                        ? req.payload?.description
                        : req.payload?.projectTitle;
                      const remarks = isAllowance
                        ? (req.payload?.claimType || req.payload?.billFileName || '')
                        : '';
                      const statusLabel = isAllowance ? 'Debited' : 'Approved';

                      return (
                        <tr key={req.id} className="border-b border-slate-100">
                          <td className="px-4 py-3 text-slate-700">
                            {new Date(req.createdAt).toLocaleString('en-IN')}
                          </td>
                          <td className="px-4 py-3 text-slate-700">₹{Number(amount || 0).toLocaleString()}</td>
                          <td className="px-4 py-3 text-slate-700">{purpose || '-'}</td>
                          <td className="px-4 py-3 text-slate-700">{remarks || '-'}</td>
                          <td className="px-4 py-3">
                            <span className="px-2 py-1 text-xs rounded font-medium bg-blue-100 text-blue-800">
                              {statusLabel}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
      <FileViewerModal file={viewingFile} onClose={() => setViewingFile(null)} />
    </MainLayout>
  );
}
