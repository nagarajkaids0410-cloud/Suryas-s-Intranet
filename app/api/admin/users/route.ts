import { NextRequest, NextResponse } from 'next/server';
import { findUserById, getAllUsers, updateUserById } from '@/lib/user-database';
import { requireRole } from '@/lib/rbac';
import { updateUserInDB } from '@/lib/user-db';

export async function GET(request: NextRequest) {
  const auth = requireRole(request, ['admin', 'founder']);
  if (auth instanceof NextResponse) return auth;

  const users = getAllUsers().map(({ passwordHash, verificationToken, resetToken, resetTokenExpiresAt, ...rest }) => rest);
  return NextResponse.json({ success: true, users });
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = requireRole(request, ['admin', 'founder']);
    if (auth instanceof NextResponse) return auth;

    const body = await request.json();
    const { userId, updates } = body as { userId: string; updates: Record<string, unknown> };

    if (typeof userId !== 'string' || !userId || !updates || typeof updates !== 'object' || Array.isArray(updates)) {
      return NextResponse.json({ error: 'userId and updates are required' }, { status: 400 });
    }

    const editableFields = new Set([
      'fullName',
      'phone',
      'designation',
      'employmentType',
      'profilePhoto',
      'profilePictureUploaded',
      'isProfileCompleted',
      'guideId',
      'role',
      'status',
    ]);
    const updateKeys = Object.keys(updates);
    if (updateKeys.length === 0 || updateKeys.some((key) => !editableFields.has(key))) {
      return NextResponse.json({ error: 'Updates contain unsupported fields' }, { status: 400 });
    }

    const changesAccess = 'role' in updates || 'status' in updates;
    const changesGuide = 'guideId' in updates;
    if (changesGuide && auth.role !== 'founder') {
      return NextResponse.json({ error: 'Only the authorized final approver may assign intern guides' }, { status: 403 });
    }
    if (changesAccess && auth.role !== 'founder') {
      return NextResponse.json({ error: 'Only the Founder can change roles or account status' }, { status: 403 });
    }
    if (changesAccess && userId === auth.id) {
      return NextResponse.json({ error: 'You cannot change your own role or account status' }, { status: 403 });
    }

    const validRoles = ['founder', 'managing-partner', 'admin', 'employee', 'freelancer', 'senior-freelancer', 'intern', 'project-intern', 'guest', 'user'];
    const validStatuses = ['active', 'suspended'];
    if (typeof updates.role === 'string' && !validRoles.includes(updates.role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    }
    if (typeof updates.status === 'string' && !validStatuses.includes(updates.status)) {
      return NextResponse.json({ error: 'Invalid account status' }, { status: 400 });
    }

    const targetUser = findUserById(userId);
    if (!targetUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    let safeUpdates: Record<string, unknown> = changesAccess
      ? { ...updates, sessionVersion: (targetUser.sessionVersion ?? 0) + 1 }
      : updates;
    if (changesGuide) {
      const guideId = updates.guideId;
      const guide = typeof guideId === 'string' ? findUserById(guideId) : undefined;
      if (
        targetUser.status !== 'active' ||
        !['intern', 'project-intern'].includes(targetUser.role) ||
        !guide ||
        guide.id === targetUser.id ||
        guide.status !== 'active' ||
        !['employee', 'admin', 'managing-partner', 'founder'].includes(guide.role)
      ) {
        return NextResponse.json({ error: 'Choose an active intern and a different active, eligible guide' }, { status: 400 });
      }
      safeUpdates = { ...safeUpdates, guideId: guide.id, guideName: guide.fullName };
    }
    if (targetUser.status === 'pending_approval' && 'status' in updates) {
      return NextResponse.json(
        { error: 'Pending registrations must be approved or rejected through the sequential registration workflow' },
        { status: 403 }
      );
    }
    if (
      updates.status === 'active' &&
      targetUser.status !== 'active' &&
      targetUser.status !== 'suspended' &&
      !targetUser.approvedAt
    ) {
      return NextResponse.json(
        { error: 'New accounts must complete the sequential registration approval workflow before activation' },
        { status: 403 }
      );
    }
    const updated = updateUserById(userId, safeUpdates);
    if (!updated) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    if (!updateUserInDB(userId, safeUpdates)) {
      return NextResponse.json({ error: 'Unable to persist user update' }, { status: 500 });
    }

    try {
      const { addAuditEntry } = await import('@/lib/audit-log');
      addAuditEntry({
        action: 'user:updated',
        actor: auth.username,
        actorId: auth.id,
        details: { targetUserId: userId, updatedFields: updateKeys },
      });
    } catch (e) {
      console.error('Failed to write audit entry for user update', e);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('User update error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
