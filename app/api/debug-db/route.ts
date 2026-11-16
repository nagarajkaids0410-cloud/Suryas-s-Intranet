import { NextRequest, NextResponse } from 'next/server';
import { getPool, initDatabase } from '@/lib/db';

export async function GET(request: NextRequest) {
  const rawUrl = process.env.DATABASE_URL;
  
  if (!rawUrl) {
    return NextResponse.json({
      hasDatabaseUrl: false,
      error: 'DATABASE_URL environment variable is not defined in this runtime',
    });
  }

  // Mask password for safety
  const maskedUrl = rawUrl.replace(/:([^@]+)@/, ':****@');

  try {
    const pool = getPool();
    if (!pool) {
      return NextResponse.json({
        hasDatabaseUrl: true,
        maskedUrl,
        error: 'getPool() returned null',
      });
    }

    const testQuery = await pool.query('SELECT NOW() as current_time, current_database(), current_user;');
    await initDatabase();
    const usersCount = await pool.query('SELECT COUNT(*) FROM users;');

    return NextResponse.json({
      success: true,
      hasDatabaseUrl: true,
      maskedUrl,
      dbTime: testQuery.rows[0],
      usersInDb: usersCount.rows[0]?.count,
    });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      hasDatabaseUrl: true,
      maskedUrl,
      error: error.message || String(error),
      code: error.code,
      stack: error.stack,
    });
  }
}
