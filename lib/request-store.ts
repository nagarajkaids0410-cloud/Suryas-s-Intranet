export type RequestTarget = 'admin' | 'founder' | 'all';
export type RequestStatus = 'pending' | 'approved' | 'rejected' | 'signed' | 'forwarded' | 'conversation';
export type RequestType = 'leave' | 'ta' | 'proposal' | 'report' | 'attendance-report' | 'certificate' | 'relieving' | 'registration' | 'internal-service';
export const DEFAULT_APPROVAL_CHAIN = ['hareeshv', 'santhanakumarv', 'gkbharath'] as const;
export const ATTENDANCE_APPROVAL_CHAIN = ['hareeshv', 'santhanakumarv', 'gkbharath'] as const;

export function getApprovalChainForUser(username: string, role: string, type?: RequestType, guideUsername?: string): string[] {
  const normalizedUsername = (username || '').toLowerCase();

  const isIntern = role === 'intern' || role === 'project-intern';
  const guide = guideUsername?.trim().toLowerCase();
  if (isIntern && guide) {
    return [guide, ...DEFAULT_APPROVAL_CHAIN];
  }
  if (type === 'attendance-report') {
    const leadershipChain = ATTENDANCE_APPROVAL_CHAIN.filter((approver) => approver !== normalizedUsername);
    return [...leadershipChain];
  }

  if (role === 'founder' || normalizedUsername === 'gkbharath' || normalizedUsername === 'founder') {
    if (type === 'leave' || type === 'ta' || type === 'report') {
      return ['hareeshv', 'santhanakumarv'];
    }
    return [...DEFAULT_APPROVAL_CHAIN];
  }

  if (normalizedUsername === 'hareeshv') {
    return ['santhanakumarv', 'gkbharath'];
  }

  if (normalizedUsername === 'santhanakumarv') {
    return ['hareeshv', 'gkbharath'];
  }

  return [...DEFAULT_APPROVAL_CHAIN];
}

export interface UploadedFile {
  name: string;
  size: number;
  type: string;
  base64: string;
  uploadedAt: string;
}

export interface RequestItem {
  id: string;
  submissionId?: string;
  type: RequestType;
  title: string;
  createdBy: string;
  createdByUsername?: string;
  createdById?: string;
  createdByRole?: string;
  createdByDesignation?: string;
  createdByEmployeeId?: string;
  createdByDepartment?: string;
  createdByPhone?: string;
  payload: Record<string, any>;
  remarks?: string;
  target: RequestTarget;
  status: RequestStatus;
  createdAt: string;
  updatedAt?: string;
  forwardedTo?: string;
  uploadedFile?: UploadedFile;
  signatureFrom?: string;
  signatureStatus?: 'pending' | 'signed' | 'rejected';
  officialDocument?: UploadedFile & { issuedBy: string; issuedAt: string };
  circular?: {
    title: string;
    content: string;
    recipients: string[];
  };
}

const requests: RequestItem[] = [];

export function addRequest(request: RequestItem): RequestItem {
  requests.unshift(request);
  return request;
}

export function getRequestsByTarget(target: RequestTarget): RequestItem[] {
  if (target === 'all') {
    return [...requests];
  }
  return requests.filter((req) => req.target === target);
}

export function getRequestById(id: string): RequestItem | undefined {
  return requests.find((req) => req.id === id);
}

export function updateRequestStatus(id: string, status: RequestStatus, updates?: Partial<RequestItem>): RequestItem | undefined {
  const index = requests.findIndex((req) => req.id === id);
  if (index !== -1) {
    requests[index] = {
      ...requests[index],
      status,
      updatedAt: new Date().toISOString(),
      ...updates,
    };
    return requests[index];
  }
  return undefined;
}
