'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import MainLayout from '@/components/main-layout';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useAuth } from '@/lib/auth-context';
import { toast } from 'sonner';

export default function ServiceRequestsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const isRestrictedUser = ['hareeshv', 'santhanakumarv', 'gkbharath']
    .includes(user?.username?.toLowerCase() || '');
  const isIntern = user?.role === 'intern' || user?.role === 'project-intern';
  const [type, setType] = useState<'relieving' | 'certificate'>('certificate');
  const [certificateType, setCertificateType] = useState(isIntern ? 'internship' : 'experience');
  const [purpose, setPurpose] = useState('');
  const [remarks, setRemarks] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isRestrictedUser) router.replace('/admin-dashboard');
  }, [isRestrictedUser, router]);

  if (isRestrictedUser) return null;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      const title = type === 'relieving'
        ? 'Relieving letter request'
        : `${certificateType.charAt(0).toUpperCase()}${certificateType.slice(1)} certificate request`;
      const response = await fetch('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          title,
          remarks,
          payload: {
            ...(type === 'certificate' ? { certificateType } : {}),
            purpose: purpose.trim(),
          },
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to submit request');
      setPurpose('');
      setRemarks('');
      toast.success('Request submitted. Track its approval history in My Requests.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to submit request');
    } finally {
      setBusy(false);
    }
  };

  return (
    <MainLayout>
      <div className="mx-auto max-w-3xl space-y-6">
        <header>
          <h1 className="text-3xl font-bold text-slate-900">Relieving & Certificate Requests</h1>
          <p className="mt-1 text-slate-600">Submit a request, track remarks and approval history, and download the official document after issuance.</p>
        </header>
        <Card className="p-6">
          <form onSubmit={submit} className="space-y-4">
            <label className="block text-sm font-medium text-slate-700">Request type
              <select className="mt-1 block w-full rounded-md border p-2" value={type} onChange={(event) => setType(event.target.value as 'relieving' | 'certificate')}>
                <option value="certificate">Certificate</option>
                <option value="relieving">Relieving letter</option>
              </select>
            </label>
            {type === 'certificate' && (
              <label className="block text-sm font-medium text-slate-700">Certificate
                <select className="mt-1 block w-full rounded-md border p-2" value={certificateType} onChange={(event) => setCertificateType(event.target.value)}>
                  {isIntern ? (
                    <>
                      <option value="internship">Internship certificate</option>
                      <option value="completion">Internship completion certificate</option>
                    </>
                  ) : (
                    <option value="experience">Experience certificate</option>
                  )}
                </select>
              </label>
            )}
            <label className="block text-sm font-medium text-slate-700">Purpose and relevant details
              <textarea className="mt-1 block w-full rounded-md border p-2" rows={3} value={purpose} onChange={(event) => setPurpose(event.target.value)} placeholder="Include dates or details relevant to this request" />
            </label>
            <label className="block text-sm font-medium text-slate-700">Applicant remarks
              <textarea required minLength={5} className="mt-1 block w-full rounded-md border p-2" rows={2} value={remarks} onChange={(event) => setRemarks(event.target.value)} />
            </label>
            <Button type="submit" disabled={busy}>{busy ? 'Submitting...' : 'Submit request'}</Button>
          </form>
        </Card>
      </div>
    </MainLayout>
  );
}
