import { NextRequest, NextResponse } from 'next/server';
import { getDataAge, getRetentionConfig, getDataRetentionStatus } from '@/lib/data-retention';
import { requireRole } from '@/lib/rbac';

export async function GET(request: NextRequest) {
  const auth = requireRole(request, ['admin', 'founder']);
  if (auth instanceof NextResponse) return auth;

  const action = request.nextUrl.searchParams.get('action');
  
  // Check data retention status
  const age = getDataAge();
  const status = getDataRetentionStatus();
  
  if (action === 'check') {
    return NextResponse.json({
      status: status.status,
      message: status.message,
      daysRemaining: status.daysRemaining,
      dataAge: age,
      notificationSent: false,
      retentionDisabled: true,
    });
  }
  
  if (action === 'status') {
    return NextResponse.json({
      status: status.status,
      message: status.message,
      daysRemaining: status.daysRemaining,
      dataAge: age,
      dataCreatedAt: getRetentionConfig().dataCreatedAt,
      notifications: [],
      retentionDisabled: true,
    });
  }
  
  if (action === 'notifications') {
    return NextResponse.json({
      notifications: [],
      count: 0,
      unreadCount: 0,
    });
  }
  
  return NextResponse.json({
    status: status.status,
    message: status.message,
    daysRemaining: status.daysRemaining,
    age: age,
  });
}
