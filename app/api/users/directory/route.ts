import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/rbac';
import { getAllUsers } from '@/lib/user-database';

export async function GET(request: NextRequest) {
  const auth = requireRole(request, [
    'founder', 'managing-partner', 'admin', 'employee', 'freelancer', 'senior-freelancer', 'intern', 'project-intern', 'user',
  ]);
  if (auth instanceof NextResponse) return auth;

  const users = getAllUsers()
    .filter((user) => user.status === 'active' && user.role !== 'guest')
    .map(({ id, employeeId, username, fullName, role, designation, department, phone, profilePhoto }) => ({
      id,
      employeeId,
      username,
      fullName,
      role,
      designation,
      department,
      phone,
      profilePhoto,
    }));

  return NextResponse.json({ success: true, users });
}