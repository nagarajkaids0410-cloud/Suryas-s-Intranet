import { findUserById } from '@/lib/user-database';
import type { RequestItem } from '@/lib/request-store';

export function withCurrentSubmitterProfile<T extends RequestItem>(request: T): T {
  if (!request.createdById) return request;
  const user = findUserById(request.createdById);
  if (!user) return request;

  return {
    ...request,
    createdBy: user.fullName,
    createdByDesignation: user.designation,
    createdByEmployeeId: user.employeeId,
    createdByDepartment: user.department,
    createdByPhone: user.phone,
    payload: {
      ...request.payload,
      id: user.employeeId || request.payload?.id,
      designation: user.designation || request.payload?.designation,
      department: user.department || request.payload?.department,
      phone: user.phone || request.payload?.phone,
    },
  };
}
