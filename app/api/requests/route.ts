import { NextRequest, NextResponse } from 'next/server';
import { getApprovalChainForUser, RequestItem, RequestTarget, RequestType, UploadedFile } from '@/lib/request-store';
import { addRequestDB, generateRequestIdentifiers, getRequestsByTargetDB } from '@/lib/request-db';
import { requireRole } from '@/lib/rbac';
import { findUserById } from '@/lib/user-database';
import { addNotificationDB } from '@/lib/notification-db';
import { withCurrentSubmitterProfile } from '@/lib/request-profile';

const approvalAuthorities: Record<string, { id: string; role: string }> = {
  hareeshv: { id: 'user-002', role: 'managing-partner' },
  santhanakumarv: { id: 'user-003', role: 'managing-partner' },
  gkbharath: { id: 'founder-001', role: 'founder' },
};

export async function GET(request: NextRequest) {
  const auth = requireRole(request, [
    'founder',
    'managing-partner',
    'admin',
    'employee',
    'freelancer',
    'senior-freelancer',
    'intern',
    'project-intern',
    'user',
  ]);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const target = (searchParams.get('target') || 'admin') as RequestTarget;
  const authority = approvalAuthorities[auth.username.toLowerCase()];
  const isNamedApprover = !!authority &&
    authority.id === auth.id &&
    authority.role === auth.role;
  const isFounderTeamAssigner = auth.role === 'founder' &&
    auth.username.toLowerCase() === 'gkbharath' &&
    auth.id === 'founder-001';
  const items = getRequestsByTargetDB('all').filter((item) => {
    const chain = item.payload?.approvalChain;
    const stageIndex = item.status === 'forwarded'
      ? item.payload?.currentApproverIndex
      : item.status === 'pending'
        ? 0
        : -1;
    const isCurrentApprover = Array.isArray(chain) &&
      Number.isInteger(stageIndex) &&
      typeof chain[stageIndex] === 'string' &&
      chain[stageIndex].toLowerCase() === auth.username.toLowerCase();
    const isApprovalParticipant = isNamedApprover &&
      Array.isArray(chain) &&
      chain.some((approver) =>
        typeof approver === 'string' &&
        approver.toLowerCase() === auth.username.toLowerCase()
      );
    const isRequester = item.createdById === auth.id;
    const isAssignedProjectMember = item.type === 'proposal' &&
      item.payload?.projectTeam?.some((member: { userId?: string }) => member.userId === auth.id);
    const comments = item.payload?.comments;
    const isFinallyApprovedProject = isFounderTeamAssigner &&
      item.type === 'proposal' &&
      item.status === 'approved' &&
      Array.isArray(chain) &&
      chain.at(-1) === 'gkbharath' &&
      item.payload?.currentApproverIndex === chain.length - 1 &&
      Array.isArray(comments) &&
      comments[0]?.by === 'gkbharath' &&
      comments[0]?.decision === 'approve';
    return isRequester || isCurrentApprover || isApprovalParticipant || isAssignedProjectMember || isFinallyApprovedProject;
  }).filter((item) => target === 'founder' ? true : item.target === target || target === 'all');
  return NextResponse.json({ success: true, requests: items.map(withCurrentSubmitterProfile) });
}

export async function POST(request: NextRequest) {
  try {
    const auth = requireRole(request, [
      'founder',
      'managing-partner',
      'admin',
      'employee',
      'freelancer',
      'senior-freelancer',
      'intern',
      'project-intern',
      'user',
    ]);
    if (auth instanceof NextResponse) return auth;

    const user = findUserById(auth.id);
    if (!user || user.status !== 'active') {
      return NextResponse.json({ error: 'An active account is required' }, { status: 403 });
    }

    const body = await request.json();
    const {
      type,
      title,
      payload,
      remarks,
      uploadedFile,
      signatureFrom,
    } = body as {
      type: RequestType;
      title: string;
      payload: Record<string, any>;
      remarks?: string;
      uploadedFile?: UploadedFile;
      signatureFrom?: string;
    };

    const allowedTypes: RequestType[] = ['leave', 'ta', 'proposal', 'report', 'attendance-report', 'certificate', 'relieving', 'internal-service'];
    if (
      typeof type !== 'string' ||
      !allowedTypes.includes(type as RequestType) ||
      typeof title !== 'string' ||
      !title.trim() ||
      !payload ||
      typeof payload !== 'object' ||
      Array.isArray(payload)
    ) {
      return NextResponse.json({ error: 'Missing request data' }, { status: 400 });
    }

    const effectiveRemarks = typeof remarks === 'string' ? remarks.trim() : typeof payload?.remarks === 'string' ? payload.remarks.trim() : '';
    if (!effectiveRemarks) {
      return NextResponse.json({ error: 'Applicant remarks are required' }, { status: 400 });
    }
    if (type === 'leave') {
      const leaveType = payload.leaveType;
      if (!['casual', 'medical', 'loss-of-pay'].includes(leaveType)) {
        return NextResponse.json({ error: 'Choose Casual Leave, Medical Leave, or Loss of Pay' }, { status: 400 });
      }
      if (leaveType === 'medical') {
        const document = payload.medicalDocument;
        if (
          !document ||
          typeof document.name !== 'string' ||
          !document.name.trim() ||
          typeof document.type !== 'string' ||
          (!document.type.includes('pdf') && !document.type.startsWith('image/')) ||
          typeof document.base64 !== 'string' ||
          !document.base64.startsWith('data:') ||
          typeof document.size !== 'number' ||
          document.size <= 0 ||
          document.size > 10 * 1024 * 1024
        ) {
          return NextResponse.json({ error: 'A medical certificate or prescription (PDF/image, up to 10 MB) is required for Medical Leave' }, { status: 400 });
        }
      }
    }

    if (type === 'certificate') {
      const certificateType = payload.certificateType;
      const employeeCertificateRoles = ['employee', 'freelancer', 'senior-freelancer', 'admin', 'founder', 'managing-partner', 'user'];
      const internCertificateRoles = ['intern', 'project-intern'];
      if (
        !['experience', 'internship', 'completion'].includes(certificateType) ||
        (certificateType === 'experience' && !employeeCertificateRoles.includes(auth.role)) ||
        (['internship', 'completion'].includes(certificateType) && !internCertificateRoles.includes(auth.role))
      ) {
        return NextResponse.json({ error: 'This certificate type is not available for your account' }, { status: 400 });
      }
    }
    if (type === 'relieving' && auth.role === 'guest') {
      return NextResponse.json({ error: 'Relieving requests are not available for this account' }, { status: 400 });
    }
    if (type === 'attendance-report' && (!payload.fromDate || !payload.toDate)) {
      return NextResponse.json({ error: 'Attendance report start and end dates are required' }, { status: 400 });
    }

    let guideUsername: string | undefined;
    if (auth.role === 'intern' || auth.role === 'project-intern') {
      if (!user.guideId) {
        return NextResponse.json({ error: 'An authorized guide must be assigned before submitting requests' }, { status: 409 });
      }
      const guide = findUserById(user.guideId);
      if (!guide || guide.status !== 'active') {
        return NextResponse.json({ error: 'Your assigned guide is unavailable. Contact an administrator.' }, { status: 409 });
      }
      guideUsername = guide.username.toLowerCase();
    }

    const enforcedTarget: RequestTarget = 'admin';
    const normalizedPayload = {
      ...payload,
      remarks: effectiveRemarks,
      ...(guideUsername ? { guideId: user.guideId, guideUsername } : {}),
      approvalChain: getApprovalChainForUser(auth.username, auth.role, type, guideUsername),
      currentApproverIndex: 0,
    };
    const identifiers = generateRequestIdentifiers();

    const newRequest: RequestItem = {
      id: identifiers.id,
      submissionId: identifiers.submissionId,
      type: type as RequestType,
      title: title.trim(),
      createdBy: user.fullName,
      createdByUsername: user.username,
      createdById: user.id,
      createdByRole: user.role,
      createdByDesignation: user.designation,
      createdByEmployeeId: user.employeeId,
      createdByDepartment: user.department,
      createdByPhone: user.phone,
      payload: normalizedPayload,
      remarks: effectiveRemarks,
      target: enforcedTarget,
      status: 'pending',
      createdAt: new Date().toISOString(),
      uploadedFile,
      signatureFrom,
    };

    const saved = addRequestDB(newRequest);
    try {
      const firstApprover = normalizedPayload.approvalChain[0];
      addNotificationDB({
        type: 'request_submitted',
        title: `Request submitted - ${saved.title}`,
        message: `${saved.createdBy} submitted ${saved.title}; it is awaiting your review.`,
        targetUser: firstApprover,
        relatedId: saved.id,
        read: false,
      });
      addNotificationDB({
        type: 'request_submitted',
        title: `Submission received - ${saved.title}`,
        message: `Your request ${saved.title} was submitted for approval.`,
        targetUser: auth.username,
        relatedId: saved.id,
        read: false,
      });
    } catch (error) {
      console.error('Failed to notify request submission', error);
    }

    return NextResponse.json({ success: true, request: saved });
  } catch (error) {
    console.error('Request creation error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
