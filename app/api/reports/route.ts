import { NextRequest, NextResponse } from 'next/server';
import { addRequestDB, getRequestsByTargetDB } from '@/lib/request-db';
import { requireRole } from '@/lib/rbac';
import { RequestItem } from '@/lib/request-store';
import { addNotificationDB } from '@/lib/notification-db';
import { getAllUsers } from '@/lib/user-database';
import { addAuditEntry } from '@/lib/audit-log';
import { getApprovalChainForUser } from '@/lib/request-store';
import { generateRequestIdentifiers } from '@/lib/request-db';
import { findUserById } from '@/lib/user-database';
import { withCurrentSubmitterProfile } from '@/lib/request-profile';
import { isReportSubmissionRestricted } from '@/lib/report-access';

const REPORT_READ_ROLES = [
  'admin', 'founder', 'managing-partner', 'employee', 'freelancer', 'senior-freelancer', 'intern', 'project-intern', 'user',
] as const;
const REPORT_SUBMIT_ROLES = REPORT_READ_ROLES.filter((role) => role !== 'managing-partner');

export async function POST(request: NextRequest) {
  const auth = requireRole(request, [...REPORT_SUBMIT_ROLES]);
  if (auth instanceof NextResponse) return auth;
  if (isReportSubmissionRestricted(auth.username)) {
    return NextResponse.json({ error: 'Report submission is not available for this account' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { title, description, reportFrequency, attachments, remarks } = body as {
      title: string;
      description: string;
      reportFrequency: 'weekly' | 'monthly';
      attachments?: Array<{ name: string; size: number; type: string; base64: string }>;
      remarks: string;
    };

    if (
      typeof title !== 'string' || !title.trim() ||
      typeof description !== 'string' || !description.trim() ||
      !['weekly', 'monthly'].includes(reportFrequency) ||
      typeof remarks !== 'string' || remarks.trim().length < 5
    ) {
      return NextResponse.json(
        { error: 'Valid title, description, report frequency, and remarks of at least five characters are required' },
        { status: 400 }
      );
    }

    const identifiers = generateRequestIdentifiers();
    const submitter = findUserById(auth.id);
    if (!submitter || submitter.status !== 'active') {
      return NextResponse.json({ error: 'An active account is required' }, { status: 403 });
    }
    const guide = submitter.guideId ? findUserById(submitter.guideId) : undefined;
    if ((auth.role === 'intern' || auth.role === 'project-intern') && (!guide || guide.status !== 'active')) {
      return NextResponse.json({ error: 'An authorized guide must be assigned before submitting reports' }, { status: 409 });
    }
    const guideUsername = guide?.username.toLowerCase();
    const approvalChain = getApprovalChainForUser(auth.username, auth.role, 'report', guideUsername);
    const newReport: RequestItem = {
      id: identifiers.id,
      submissionId: identifiers.submissionId,
      type: 'report',
      title: title.trim(),
      createdBy: submitter.fullName,
      createdByUsername: auth.username,
      createdById: auth.id,
      createdByRole: auth.role,
      createdByDesignation: submitter.designation,
      createdByEmployeeId: submitter.employeeId,
      createdByDepartment: submitter.department,
      createdByPhone: submitter.phone,
      payload: {
        description: description.trim(),
        reportFrequency, // 'weekly' or 'monthly'
        attachments: attachments || [],
        ...(guideUsername ? { guideId: guide?.id, guideUsername } : {}),
        approvalChain,
        currentApproverIndex: 0,
      },
      remarks: remarks.trim(),
      target: 'admin',
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    const saved = addRequestDB(newReport);

    addNotificationDB({
      type: 'report-submitted',
      title: `${reportFrequency === 'weekly' ? 'Weekly' : 'Monthly'} Report Submitted`,
      message: `${auth.username} submitted: "${title.trim()}"`,
      targetUser: approvalChain[0],
      relatedId: saved.id,
      read: false,
    });
    addNotificationDB({
      type: 'report-submitted',
      title: `${reportFrequency === 'weekly' ? 'Weekly' : 'Monthly'} Report Received`,
      message: `Your report "${title.trim()}" was submitted for approval.`,
      targetUser: auth.username,
      relatedId: saved.id,
      read: false,
    });

    try {
      addAuditEntry({
        action: 'report:submitted',
        actor: auth.username,
        actorId: auth.id,
        details: { id: saved.id, title: title.trim(), reportFrequency, remarks: remarks.trim() },
      });
    } catch (e) {
      console.error('Audit log failed', e);
    }

    return NextResponse.json({ success: true, report: saved });
  } catch (error) {
    console.error('Report submission error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const auth = requireRole(request, [...REPORT_READ_ROLES]);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const frequency = searchParams.get('frequency') as 'weekly' | 'monthly' | null;

  const allReports = getRequestsByTargetDB('all').filter((r) => r.type === 'report');
  let filtered = allReports.filter((report) => {
    const chain = report.payload?.approvalChain;
    const stage = report.status === 'forwarded'
      ? report.payload?.currentApproverIndex
      : report.status === 'pending'
        ? 0
        : -1;
    return report.createdById === auth.id ||
      (Array.isArray(chain) && Number.isInteger(stage) && chain[stage] === auth.username.toLowerCase());
  });
  if (frequency) {
    filtered = filtered.filter((r) => r.payload?.reportFrequency === frequency);
  }

  return NextResponse.json({ success: true, reports: filtered.map(withCurrentSubmitterProfile) });
}
