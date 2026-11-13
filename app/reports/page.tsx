'use client';

import React, { useEffect, useState } from 'react';
import MainLayout from '@/components/main-layout';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { exportToExcel, requestTrackingColumns, toRequestExportRow } from '@/lib/excel-export';
import { toast } from 'sonner';
import { RequestApprovalDetails } from '@/components/request-approval-details';
import { isReportSubmissionRestricted } from '@/lib/report-access';

interface Report {
  id: string;
  submissionId?: string;
  type: 'report';
  title: string;
  createdBy: string;
  createdByEmployeeId?: string;
  createdByDesignation?: string;
  createdByDepartment?: string;
  createdByPhone?: string;
  createdAt: string;
  status: string;
  remarks?: string;
  payload: {
    [key: string]: any;
    description: string;
    reportFrequency: 'weekly' | 'monthly';
    attachments?: Array<{ name: string; size: number; type: string; base64: string }>;
  };
}

export default function ReportsPage() {
  const { user } = useAuth();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [remarks, setRemarks] = useState('');
  const [reportFrequency, setReportFrequency] = useState<'weekly' | 'monthly'>('weekly');
  const [attachments, setAttachments] = useState<File[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [filter, setFilter] = useState<'all' | 'weekly' | 'monthly'>('all');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchReports();
  }, [user?.id, filter]);

  function handleExport() {
    try {
      exportToExcel(reports.map(toRequestExportRow), requestTrackingColumns, 'my-reports');
    } catch (error) {
      console.error('Report export failed:', error);
      toast.error(error instanceof Error ? error.message : 'Unable to export reports');
    }
  }

  async function fetchReports() {
    setLoading(true);
    try {
      const query = filter !== 'all' ? `?frequency=${filter}` : '';
      const res = await fetch(`/api/reports${query}`, {
        headers: {
          'x-user-role': user?.role || '',
          'x-user-id': user?.id || '',
          'x-user-username': user?.username || '',
        },
      });
      const data = await res.json();
      if (data?.success) {
        setReports(data.reports || []);
      }
    } catch (error) {
      console.error('Error fetching reports:', error);
    } finally {
      setLoading(false);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const list = e.target.files;
    if (list) setAttachments(Array.from(list));
  }

  async function toBase64(file: File) {
    return new Promise<{ name: string; size: number; type: string; base64: string }>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1] || '';
        resolve({ name: file.name, size: file.size, type: file.type, base64 });
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !description.trim() || remarks.trim().length < 5) {
      return alert('Title, description, and remarks of at least five characters are required');
    }

    const encodedAttachments = await Promise.all(attachments.map((f) => toBase64(f)));

    try {
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': user?.role || '',
          'x-user-id': user?.id || '',
          'x-user-username': user?.username || '',
        },
        body: JSON.stringify({
          title,
          description,
          reportFrequency,
          attachments: encodedAttachments,
          remarks,
        }),
      });

      const data = await res.json();
      if (data?.success) {
        setTitle('');
        setDescription('');
        setRemarks('');
        setAttachments([]);
        setReportFrequency('weekly');
        fetchReports();
        alert(`${reportFrequency === 'weekly' ? 'Weekly' : 'Monthly'} report submitted successfully!`);
      } else {
        alert('Failed to submit report: ' + (data?.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Error submitting report:', error);
      alert('Failed to submit report');
    }
  }

  function downloadFile(base64: string, name: string, type = 'application/octet-stream') {
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  const isAuthorized = Boolean(
    user &&
    user.role !== 'managing-partner' &&
    user.role !== 'guest' &&
    !isReportSubmissionRestricted(user.username)
  );

  if (!isAuthorized) {
    return (
      <MainLayout>
        <div className="max-w-2xl p-4">
          <h1 className="text-2xl font-bold mb-4">Reports</h1>
          <p className="text-slate-600">You do not have permission to access this page.</p>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="max-w-5xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold">Submit Report</h1>
          <Button onClick={handleExport} disabled={reports.length === 0}>Export to Excel</Button>
        </div>

        {/* Report Submission Form */}
        <form onSubmit={handleSubmit} className="space-y-4 mb-8 p-4 border rounded bg-slate-50">
          <h2 className="text-lg font-semibold mb-4">Submit New Report</h2>

          <div>
            <label className="block text-sm font-medium text-slate-700">Report Title *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full border rounded p-2 mt-1"
              placeholder="e.g., Weekly Team Status"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">Description *</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full border rounded p-2 mt-1"
              rows={4}
              placeholder="Provide report details..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">Applicant Remarks *</label>
            <textarea
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              className="w-full border rounded p-2 mt-1"
              rows={3}
              minLength={5}
              required
              placeholder="Explain the purpose and context of this report"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">Report Frequency *</label>
            <select
              value={reportFrequency}
              onChange={(e) => setReportFrequency(e.target.value as 'weekly' | 'monthly')}
              className="w-full border rounded p-2 mt-1"
            >
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">Attachments (optional)</label>
            <input
              type="file"
              multiple
              onChange={handleFileChange}
              className="mt-2"
              accept=".pdf,.docx,.xlsx,.jpg,.jpeg,.png"
            />
            {attachments.length > 0 && (
              <div className="mt-2 text-sm text-slate-600">
                {attachments.length} file(s) selected
              </div>
            )}
          </div>

          <div>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded font-medium hover:bg-blue-700"
            >
              Submit Report
            </button>
          </div>
        </form>

        {/* Reports History */}
        <div>
          <h2 className="text-lg font-semibold mb-4">Report History</h2>

          <div className="mb-4 flex gap-2">
            {['all', 'weekly', 'monthly'].map((f) => (
              <button
                key={f}
                onClick={() => {
                  setFilter(f as any);
                }}
                className={`px-3 py-1 rounded text-sm font-medium ${
                  filter === f
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-200 text-slate-700'
                }`}
              >
                {f === 'all' ? 'All' : f === 'weekly' ? 'Weekly' : 'Monthly'}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="text-slate-600">Loading reports...</div>
          ) : reports.length === 0 ? (
            <div className="text-slate-600">No reports submitted yet.</div>
          ) : (
            <div className="space-y-3">
              {reports.map((report) => (
                <div key={report.id} className="p-4 border rounded">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <div className="font-semibold text-lg">{report.title}</div>
                      <div className="text-sm text-slate-600">
                        {report.createdBy} • {new Date(report.createdAt).toLocaleString()}
                      </div>
                      <div className="text-xs text-slate-500">
                        Employee ID: {report.createdByEmployeeId || 'Not Set'}
                        {' · '}{report.createdByDesignation || 'Designation not set'}
                        {' · Team: '}{report.createdByDepartment || 'Not Set'}
                        {' · Phone: '}{report.createdByPhone || 'Not Set'}
                      </div>
                      <div className="mt-1">
                        <span className={`px-2 py-1 text-xs rounded font-medium ${
                          report.payload.reportFrequency === 'weekly'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-purple-100 text-purple-800'
                        }`}>
                          {report.payload.reportFrequency === 'weekly' ? 'Weekly' : 'Monthly'}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 p-2 bg-slate-50 rounded text-sm text-slate-700">
                    {report.payload.description}
                  </div>
                  {report.payload.attachments && report.payload.attachments.length > 0 && (
                    <div className="mt-2">
                      <div className="text-xs font-medium text-slate-600 mb-1">Attachments:</div>
                      <div className="flex flex-wrap gap-2">
                        {report.payload.attachments.map((att: any, idx: number) => (
                          <button
                            key={idx}
                            onClick={() => downloadFile(att.base64, att.name, att.type)}
                            className="px-2 py-1 text-xs bg-white border rounded text-blue-600 hover:bg-blue-50"
                          >
                            📄 {att.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <RequestApprovalDetails request={report} />
                    </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </MainLayout>
  );
}
