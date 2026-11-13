"use client";

import React, { useEffect, useState } from 'react';
import MainLayout from '@/components/main-layout';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';
import { RequestApprovalDetails } from '@/components/request-approval-details';
import FileViewerModal from '@/components/file-viewer-modal';

export default function ApprovalsPage() {
  const { isAuthenticated, user } = useAuth();
  const router = useRouter();
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [comments, setComments] = useState<Record<string, string>>({});
  const [documents, setDocuments] = useState<Record<string, File | undefined>>({});
  const [viewingFile, setViewingFile] = useState<{ name: string; type: string; base64: string }>();
  const [registrations, setRegistrations] = useState<any[]>([]);
  const [guideCandidates, setGuideCandidates] = useState<any[]>([]);
  const [guideSelections, setGuideSelections] = useState<Record<string, string>>({});
  const [directoryNames, setDirectoryNames] = useState<Record<string, string>>({});
  const [requestView, setRequestView] = useState<'pending' | 'history'>('pending');
  const isRegistrationApprover = ['hareeshv', 'santhanakumarv', 'gkbharath'].includes(user?.username?.toLowerCase() || '');
  const isFinalRegistrationApprover = user?.username?.toLowerCase() === 'gkbharath' && user?.role === 'founder';

  const canActOnRequest = (request: any) => {
    const chain = request.payload?.approvalChain;
    if (!Array.isArray(chain)) return false;
    const index = request.status === 'forwarded'
      ? request.payload?.currentApproverIndex
      : request.status === 'pending'
        ? 0
        : -1;
    return Number.isInteger(index) &&
      typeof chain[index] === 'string' &&
      chain[index].toLowerCase() === user?.username?.toLowerCase();
  };
  const pendingRequests = requests.filter((request) =>
    (request.status === 'pending' || request.status === 'forwarded') &&
    canActOnRequest(request)
  );
  const visibleRequests = requestView === 'pending'
    ? pendingRequests
    : requests.slice().sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime());

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }

    const fetchRequests = async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/requests?target=all');
        if (!res.ok) return;
        const data = await res.json();
        setRequests(data.requests || []);
      } catch (e) {
        console.error('Failed to load approvals', e);
      } finally {
        setLoading(false);
      }
    };

    const fetchRegistrations = async () => {
      if (!isRegistrationApprover) return;
      try {
        const response = await fetch('/api/admin/access-requests');
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Unable to load registrations');
        setRegistrations(data.requests || []);
      } catch (error) {
        console.error('Registration queue fetch failed:', error);
        toast.error(error instanceof Error ? error.message : 'Unable to load registrations');
      }
    };

    const fetchGuides = async () => {
      if (!isFinalRegistrationApprover) return;
      try {
        const response = await fetch('/api/admin/users');
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Unable to load guide list');
        setGuideCandidates((data.users || []).filter((candidate: any) =>
          candidate.status === 'active' &&
          ['employee', 'admin', 'managing-partner', 'founder'].includes(candidate.role)
        ));
      } catch (error) {
        console.error('Guide list fetch failed:', error);
        toast.error(error instanceof Error ? error.message : 'Unable to load guide list');
      }
    };

    fetchRequests();
    fetchRegistrations();
    fetchGuides();
    fetch('/api/users/directory')
      .then(async (response) => {
        if (!response.ok) throw new Error('Unable to load approver names');
        const data = await response.json();
        setDirectoryNames(Object.fromEntries(
          (data.users || []).map((candidate: any) => [
            candidate.username.toLowerCase(),
            candidate.fullName || candidate.designation || candidate.username,
          ])
        ));
      })
      .catch((error) => console.error('Approval name lookup failed:', error));
    const i = setInterval(() => {
      fetchRequests();
      fetchRegistrations();
    }, 10000);
    return () => clearInterval(i);
  }, [isAuthenticated, router, isRegistrationApprover, isFinalRegistrationApprover]);

  const approverName = (username?: string) => {
    if (!username) return 'the next authorized approver';
    const fallback: Record<string, string> = {
      hareeshv: 'Hareesh V',
      santhanakumarv: 'Santhana Kumar V',
      gkbharath: 'G. K. Bharath',
    };
    return directoryNames[username.toLowerCase()] || fallback[username.toLowerCase()] || username;
  };

  const decideRegistration = async (registration: any, action: 'approve' | 'deny') => {
    const remarks = comments[registration.id]?.trim() || '';
    if (remarks.length < 5) {
      toast.error('Decision remarks must contain at least five characters');
      return;
    }
    const needsGuide = action === 'approve' && ['intern', 'project-intern'].includes(registration.role);
    const guideId = guideSelections[registration.id];
    if (needsGuide && isFinalRegistrationApprover && !guideId) {
      toast.error('Assign a guide before final intern approval');
      return;
    }
    const response = await fetch('/api/admin/access-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action,
        userId: registration.id,
        remarks,
        ...(guideId ? { guideId } : {}),
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      toast.error(data.error || 'Unable to update registration');
      return;
    }
    setRegistrations((current) => current.filter((item) => item.id !== registration.id));
    setComments((current) => ({ ...current, [registration.id]: '' }));
    toast.success(data.forwardedTo ? `Registration forwarded to ${data.forwardedTo}` : `Registration ${action === 'approve' ? 'approved' : 'denied'}`);
  };

  const performAction = async (id: string, action: 'approve' | 'reject' | 'recommend' | 'issue', comment?: string) => {
    if (!comment?.trim() || comment.trim().length < 5) {
      toast.error('Decision remarks must contain at least five characters');
      return;
    }
    const document = documents[id];
    if (action === 'issue' && (!document || document.type !== 'application/pdf' || document.size > 10 * 1024 * 1024)) {
      toast.error('Select an official PDF document up to 10 MB to issue');
      return;
    }
    const officialDocument = action === 'issue' && document
      ? await new Promise<{ name: string; size: number; type: string; base64: string }>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve({
            name: document.name,
            size: document.size,
            type: document.type,
            base64: String(reader.result),
          });
          reader.onerror = () => reject(reader.error || new Error('Unable to read document'));
          reader.readAsDataURL(document);
        }).catch((error) => {
          console.error('Unable to read issued document:', error);
          toast.error('Unable to read the selected document');
          return undefined;
        })
      : undefined;
    if (action === 'issue' && !officialDocument) return;
    const res = await fetch('/api/requests/action', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-role': user?.role || '',
        'x-user-id': user?.id || '',
        'x-user-username': user?.username || user?.fullName || '',
      },
      body: JSON.stringify({ requestId: id, action, comment, ...(officialDocument ? { officialDocument } : {}) }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error || 'Action failed');
      return;
    }
    const data = await res.json();
    if (data.request) {
      setRequests((current) => current.map((request) =>
        request.id === id ? data.request : request
      ));
    }
    toast.success(data.forwardedTo
      ? `Request forwarded to ${data.forwardedTo}`
      : 'Request action completed');
  };

  return (
    <MainLayout>
      <div className="max-w-6xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">📝 Request Approvals</h1>
          <p className="text-slate-600">All requests in your approval workflow, including forwarded requests and decision history.</p>
        </div>

        <div className="space-y-4">
          {isRegistrationApprover && (
            <section className="space-y-3">
              <h2 className="text-xl font-semibold text-slate-900">Registration approvals</h2>
              {registrations.length === 0 && <Card className="p-5 text-slate-600">No registrations awaiting your decision.</Card>}
              {registrations.map((registration) => (
                <Card key={registration.id} className="space-y-3 border-l-4 border-blue-400 p-5">
                  <div>
                    <p className="font-semibold text-slate-900">{registration.fullName} · {registration.role}</p>
                    <p className="text-sm text-slate-600">{registration.email} · Employee ID: {registration.employeeId || 'Not assigned'}</p>
                    <p className="text-xs text-slate-500">Registration stage {Number(registration.approvalStage) + 1} of 3 · Submitted {new Date(registration.requestedAt).toLocaleString('en-IN')}</p>
                    {registration.approvalHistory?.map((entry: any, index: number) => (
                      <p key={`${registration.id}-history-${index}`} className="mt-1 text-sm text-slate-600">
                        {entry.actorUsername}: {entry.decision} · {entry.remarks}
                      </p>
                    ))}
                  </div>
                  {isFinalRegistrationApprover && ['intern', 'project-intern'].includes(registration.role) && (
                    <label className="block text-sm text-slate-700">
                      Assign intern guide before approval
                      <select
                        className="mt-1 block w-full rounded-md border p-2"
                        value={guideSelections[registration.id] || ''}
                        onChange={(event) => setGuideSelections((current) => ({ ...current, [registration.id]: event.target.value }))}
                      >
                        <option value="">Select active guide</option>
                        {guideCandidates.filter((candidate) => candidate.id !== registration.id).map((candidate) => (
                          <option key={candidate.id} value={candidate.id}>{candidate.fullName} ({candidate.role})</option>
                        ))}
                      </select>
                    </label>
                  )}
                  <textarea
                    className="w-full rounded-md border p-2 text-sm"
                    rows={2}
                    minLength={5}
                    placeholder="Decision remarks (minimum five characters)"
                    value={comments[registration.id] || ''}
                    onChange={(event) => setComments((current) => ({ ...current, [registration.id]: event.target.value }))}
                  />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => decideRegistration(registration, 'approve')}>Approve / Forward</Button>
                    <Button size="sm" variant="destructive" onClick={() => decideRegistration(registration, 'deny')}>Reject</Button>
                  </div>
                </Card>
              ))}
            </section>
          )}
          <div className="flex gap-2">
            <Button variant={requestView === 'pending' ? 'default' : 'outline'} onClick={() => setRequestView('pending')}>
              Awaiting my action ({pendingRequests.length})
            </Button>
            <Button variant={requestView === 'history' ? 'default' : 'outline'} onClick={() => setRequestView('history')}>
              All request history ({requests.length})
            </Button>
          </div>
          {loading && <Card className="p-4">Loading...</Card>}
          {!loading && visibleRequests.length === 0 && <Card className="p-8 text-center">{requestView === 'pending' ? 'No pending requests assigned to you' : 'No request history available'}</Card>}

          {visibleRequests.map((req) => {
            const stageIndex = req.status === 'forwarded' ? req.payload?.currentApproverIndex : 0;
            const isGuide = stageIndex === 0 && req.payload?.guideId === user?.id;
            const isDocumentRequest = req.type === 'certificate' || req.type === 'relieving';
            const isFinalStage = stageIndex === req.payload?.approvalChain?.length - 1;
            const internApprovalRoute = ['intern', 'project-intern'].includes(req.createdByRole)
              ? (req.payload?.approvalChain || []).slice(1).map((approver: string) => approverName(approver)).join(' → ')
              : '';
            return (
            <Card key={req.id} className={`p-4 ${req.status === 'pending' || req.status === 'forwarded' ? 'border-l-4 border-yellow-400' : ''}`}>
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm text-slate-600">{req.type.replace('-', ' ').toUpperCase()}</p>
                  <p className="text-lg font-bold text-slate-900">{req.title}</p>
                  <p className="text-sm text-slate-600">Submitted by: {req.createdBy} ({req.createdByDesignation || req.createdByRole || 'N/A'})</p>
                  <p className="text-xs text-slate-500">
                    Employee ID: {req.createdByEmployeeId || req.payload?.id || 'Not Set'}
                    {' · Team: '}{req.createdByDepartment || req.payload?.department || 'Not Set'}
                    {' · Phone: '}{req.createdByPhone || req.payload?.phone || 'Not Set'}
                  </p>
                  <p className="mt-1 text-sm font-medium text-slate-700">
                    Status: {req.status === 'forwarded' ? `Forwarded to ${approverName(req.forwardedTo)}` : req.status}
                  </p>
                </div>
                {requestView === 'pending' && canActOnRequest(req) && (
                  <div className="flex gap-2">
                    {isGuide ? (
                        <div className="flex flex-col items-end gap-1">
                          <span className="text-xs text-slate-600">
                            Guide recommendation is required first. It will then be forwarded through: {internApprovalRoute}.
                          </span>
                          <Button size="sm" className="bg-blue-600" onClick={() => performAction(req.id, 'recommend', comments[req.id] || '')}>Recommend & Forward</Button>
                        </div>
                    ) : isDocumentRequest && isFinalStage ? (
                      <>
                        <label className="flex items-center text-xs">
                          <span className="sr-only">Official PDF</span>
                          <input type="file" accept="application/pdf,.pdf" onChange={(event) => setDocuments((current) => ({ ...current, [req.id]: event.target.files?.[0] }))} />
                        </label>
                        <Button size="sm" className="bg-blue-600" onClick={() => performAction(req.id, 'issue', comments[req.id] || '')}>Issue & Approve</Button>
                        <Button size="sm" className="bg-red-500" onClick={() => performAction(req.id, 'reject', comments[req.id] || '')}>Reject</Button>
                      </>
                    ) : (
                      <>
                        <Button size="sm" className="bg-blue-600" onClick={() => performAction(req.id, 'approve', comments[req.id] || '')}>Approve / Forward</Button>
                        <Button size="sm" className="bg-red-500" onClick={() => performAction(req.id, 'reject', comments[req.id] || '')}>Reject</Button>
                      </>
                    )}
                  </div>
                )}
              </div>
              {req.type === 'leave' && (
                <div className="mt-3 rounded-md border border-blue-200 bg-blue-50 p-3">
                  <h3 className="font-semibold text-slate-900">Leave request details</h3>
                  <div className="mt-2 grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
                    <p><strong>Leave type:</strong> {req.payload?.leaveType || 'Not specified'}</p>
                    <p><strong>Dates:</strong> {req.payload?.fromDate || 'Not specified'} – {req.payload?.toDate || 'Not specified'}</p>
                    <p><strong>Past-date request:</strong> {req.payload?.isPastDateRequest ? 'Yes' : 'No'}</p>
                    <p><strong>Reason:</strong> {req.payload?.reason || '—'}</p>
                    <p className="sm:col-span-2"><strong>Applicant remarks:</strong> {req.payload?.remarks || req.remarks || '—'}</p>
                    {req.payload?.medicalDocument?.base64 && (
                      <div className="sm:col-span-2">
                        <p><strong>Medical document:</strong> {req.payload.medicalDocument.name}</p>
                        <Button
                          size="sm"
                          variant="outline"
                          className="mt-1"
                          onClick={() => setViewingFile(req.payload.medicalDocument)}
                        >
                          View medical document
                        </Button>
                      </div>
                    )}
                    {req.uploadedFile?.base64 && (
                      <div className="sm:col-span-2">
                        <p><strong>Uploaded leave form:</strong> {req.uploadedFile.name}</p>
                        <Button
                          size="sm"
                          variant="outline"
                          className="mt-1"
                          onClick={() => setViewingFile(req.uploadedFile)}
                        >
                          View leave form
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="mt-3">
                {requestView === 'pending' && canActOnRequest(req) && (
                  <>
                    <label className="block text-xs text-slate-500 mb-1">Comment / Notes</label>
                    <textarea
                      value={comments[req.id] || ''}
                      onChange={(e) => setComments((p) => ({ ...p, [req.id]: e.target.value }))}
                      className="w-full p-2 border rounded text-sm"
                      rows={2}
                      placeholder="Add an approval note"
                    />
                  </>
                )}
                <RequestApprovalDetails request={req} />
                {/* Show previous comments/signatures */}
                {req.payload?.comments && req.payload.comments.length > 0 && (
                  <div className="mt-2 text-sm text-slate-600">
                    <p className="font-semibold">History:</p>
                    <ul className="list-disc pl-5">
                      {req.payload.comments.map((c: any, i: number) => (
                        <li key={i}>{c.by} ({new Date(c.at).toLocaleString()}): {c.comment}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {req.payload?.signatures && req.payload.signatures.length > 0 && (
                  <div className="mt-2 text-sm text-slate-600">
                    <p className="font-semibold">Signatures:</p>
                    <ul className="list-disc pl-5">
                      {req.payload.signatures.map((s: any, i: number) => (
                        <li key={i}>{s.by} ({new Date(s.at).toLocaleString()}): {s.note}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </Card>
            );
          })}
        </div>
      </div>
      <FileViewerModal file={viewingFile} onClose={() => setViewingFile(undefined)} />
    </MainLayout>
  );
}
