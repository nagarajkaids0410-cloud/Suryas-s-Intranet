import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { checkAndSendReminders } from '@/lib/reminders';

/**
 * Endpoint for cron job or scheduled task to check and send reminders.
 * This should ideally be called:
 * - Weekly (Saturdays) for weekly report reminders
 * - Monthly (last day of month) for monthly report reminders
 * 
 * Usage:
 * - Curl: curl -X POST http://localhost:3000/api/cron/check-reminders
 * - Schedule with: external cron service, GitHub Actions, or system cron job
 */
export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get('x-cron-token');
    const validToken = process.env.CRON_TOKEN;
    if (!validToken || !token) {
      return NextResponse.json({ error: 'Cron authorization is not configured' }, { status: 503 });
    }
    const supplied = Buffer.from(token);
    const expected = Buffer.from(validToken);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    checkAndSendReminders();

    return NextResponse.json({
      success: true,
      message: 'Reminders checked and sent if applicable',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error in check-reminders cron:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
