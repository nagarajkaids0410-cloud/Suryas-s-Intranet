'use client';

import React, { useEffect, useState } from 'react';
import MainLayout from '@/components/main-layout';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle, XCircle, Clock, Search, Filter, FileDown, Eye, Download } from 'lucide-react';
import { toast } from 'sonner';
import { collectDecisionRemarks } from '@/lib/approval-remarks';
import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';
import FileViewerModal from '@/components/file-viewer-modal';
import { exportToExcel, requestTrackingColumns, toRequestExportRow } from '@/lib/excel-export';
import { RequestApprovalDetails } from '@/components/request-approval-details';
import { isEligibleProjectTeamMember } from '@/lib/project-team';

export default function ProjectApprovals() {
  const { isAuthenticated, user } = useAuth();
  const router = useRouter();
  const [projects, setProjects] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [selectedProject, setSelectedProject] = useState<any | null>(null);
  const [commentText, setCommentText] = useState('');
  const [viewingFile, setViewingFile] = useState<any>(null);
  const [directoryUsers, setDirectoryUsers] = useState<any[]>([]);
  const [teamDrafts, setTeamDrafts] = useState<Record<string, Array<{ userId: string; projectRole: string; responsibility: string }>>>({});
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }

    const fetchRequests = async () => {
      const response = await fetch('/api/requests?target=all');
      if (!response.ok) return;
      const data = await response.json();
      const proposalData = (data.requests || []).filter((req: any) => req.type === 'proposal');
      setProjects(proposalData);
    };

    fetchRequests();
    fetch('/api/users/directory')
      .then(async (response) => {
        if (!response.ok) throw new Error('Unable to load active team members');
        const data = await response.json();
        setDirectoryUsers(data.users || []);
      })
      .catch((error) => {
        console.error('Failed to load project team directory:', error);
        toast.error('Unable to load project team members');
      });
    const interval = setInterval(fetchRequests, 15000);
    return () => clearInterval(interval);
  }, [isAuthenticated, router]);

  const canActOnProject = (project: any) => {
    const chain = project.payload?.approvalChain;
    if (!Array.isArray(chain)) return false;
    const stageIndex = project.status === 'forwarded'
      ? project.payload?.currentApproverIndex
      : project.status === 'pending'
        ? 0
        : -1;
    return Number.isInteger(stageIndex) && chain[stageIndex] === user?.username?.toLowerCase();
  };

  const isFounderFinalApproval = (project: any) => {
    const chain = project.payload?.approvalChain;
    const comments = project.payload?.comments;
    return project.status === 'approved' &&
      Array.isArray(chain) &&
      chain.at(-1) === 'gkbharath' &&
      project.payload?.currentApproverIndex === chain.length - 1 &&
      Array.isArray(comments) &&
      comments[0]?.by === 'gkbharath' &&
      comments[0]?.decision === 'approve';
  };

  const getTeamDraft = (project: any) => teamDrafts[project.id] ??
    (project.payload?.projectTeam || []).map((member: any) => ({
      userId: member.userId,
      projectRole: member.projectRole || '',
      responsibility: member.responsibility || '',
    }));

  const getAvailableTeamMembers = (project: any, memberIndex: number) => {
    const selectedElsewhere = new Set(
      getTeamDraft(project)
        .filter((_: any, index: number) => index !== memberIndex)
        .map((member: any) => member.userId)
        .filter(Boolean)
    );
    return directoryUsers
      .filter((person) => isEligibleProjectTeamMember(person) && !selectedElsewhere.has(person.id))
      .sort((first, second) => first.fullName.localeCompare(second.fullName));
  };

  const getDirectoryUser = (userId: string) => directoryUsers.find((person) => person.id === userId);

  const startTeamEdit = (project: any) => {
    setTeamDrafts((previous) => ({
      ...previous,
      [project.id]: getTeamDraft(project).length
        ? getTeamDraft(project)
        : [{ userId: '', projectRole: '', responsibility: '' }],
    }));
    setEditingTeamId(project.id);
  };

  const updateTeamDraft = (project: any, index: number, updates: Partial<{ userId: string; projectRole: string; responsibility: string }>) => {
    setTeamDrafts((previous) => {
      const drafts = previous[project.id] ?? getTeamDraft(project);
      return {
        ...previous,
        [project.id]: drafts.map((member, memberIndex) => memberIndex === index ? { ...member, ...updates } : member),
      };
    });
  };

  const handleAssignTeam = async (project: any) => {
    const team = getTeamDraft(project);
    if (team.length < 1 || team.length > 4 || team.some((member: any) => !member.userId || !member.projectRole.trim() || !member.responsibility.trim())) {
      toast.error('Assign one to four members, each with a role and responsibility');
      return;
    }
    try {
      const response = await fetch('/api/requests/team-assignment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: project.id, team }),
      });
      const data = await response.json();
      if (!response.ok) {
        toast.error(data.error || 'Unable to assign project team');
        return;
      }
      setProjects((current) => current.map((item) => item.id === project.id ? data.request : item));
      setEditingTeamId(null);
      toast.success('Project team assigned and notified');
    } catch (error) {
      console.error('Project team assignment request failed:', error);
      toast.error('Unable to assign project team. Please try again.');
    }
  };

  const handleApprove = async (id: string) => {
    const comment = collectDecisionRemarks('approve');
    if (!comment) {
      toast.error('Decision remarks must contain at least five characters');
      return;
    }
    const response = await fetch('/api/requests/action', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-role': user?.role || '',
        'x-user-id': user?.id || '',
        'x-user-username': user?.username || user?.fullName || '',
      },
      body: JSON.stringify({ requestId: id, action: 'approve', comment }),
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      toast.error(result.error || 'Unable to approve project');
      return;
    }

    if (result.request) {
      setProjects((current) => current.map((project) =>
        project.id === id ? result.request : project
      ));
    }
    toast.success(result.forwardedTo
      ? `Project forwarded to ${result.forwardedTo}`
      : '✅ Project approved!');
  };

  const handleReject = async (id: string) => {
    const comment = collectDecisionRemarks('reject');
    if (!comment) {
      toast.error('Decision remarks must contain at least five characters');
      return;
    }
    const response = await fetch('/api/requests/action', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-role': user?.role || '',
        'x-user-id': user?.id || '',
        'x-user-username': user?.username || user?.fullName || '',
      },
      body: JSON.stringify({ requestId: id, action: 'reject', comment }),
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      toast.error(result.error || 'Unable to reject project');
      return;
    }

    if (result.request) {
      setProjects((current) => current.map((project) =>
        project.id === id ? result.request : project
      ));
    }
    toast.error('❌ Project rejected!');
  };

  const downloadUploadedFile = (project: any) => {
    if (!project.uploadedFile) {
      toast.error('No file available');
      return;
    }
    const link = document.createElement('a');
    link.href = project.uploadedFile.base64;
    link.download = project.uploadedFile.name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filteredProjects = projects
    .filter((proj) => filterStatus === 'all' || proj.status === filterStatus)
    .filter(
      (proj) =>
        proj.payload?.projectTitle?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        proj.createdBy.toLowerCase().includes(searchTerm.toLowerCase())
    );

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending':
      case 'forwarded':
        return <Clock className="text-yellow-500" size={20} />;
      case 'approved':
        return <CheckCircle className="text-green-500" size={20} />;
      case 'rejected':
        return <XCircle className="text-red-500" size={20} />;
      default:
        return null;
    }
  };

  const handleExportToExcel = () => {
    try {
      if (filteredProjects.length === 0) {
        toast.error('No data to export');
        return;
      }

      const exportData = filteredProjects.map(toRequestExportRow);

      const dateStamp = new Date().toISOString().split('T')[0];
      exportToExcel(exportData, requestTrackingColumns, `Project_Proposals_${dateStamp}`);
      toast.success('✓ Project proposals exported to Excel');
    } catch (error) {
      toast.error('Failed to export data');
      console.error(error);
    }
  };

  return (
    <MainLayout>
      <div className="max-w-7xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">📂 Project Approvals</h1>
          <p className="text-slate-600">Review and approve/reject project submissions</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-3 text-slate-400" size={20} />
            <input
              type="text"
              placeholder="Search by project or submitter..."
              className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <Filter size={20} className="mt-2 text-slate-500" />
            <select
              className="flex-1 px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              <option value="all">All Projects</option>
              <option value="pending">Under Review</option>
              <option value="forwarded">Forwarded</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
          <Button
            onClick={handleExportToExcel}
            className="bg-blue-600 hover:bg-blue-700 text-white"
            disabled={projects.length === 0}
          >
            <Download size={18} className="mr-2" />
            Download Excel
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="bg-yellow-50 p-4 border-l-4 border-yellow-500">
            <p className="text-sm text-slate-600">Under Review</p>
            <p className="text-2xl font-bold text-yellow-600">
              {projects.filter((r) => r.status === 'pending' || r.status === 'forwarded').length}
            </p>
          </Card>
          <Card className="bg-green-50 p-4 border-l-4 border-green-500">
            <p className="text-sm text-slate-600">Approved</p>
            <p className="text-2xl font-bold text-green-600">
              {projects.filter((r) => r.status === 'approved').length}
            </p>
          </Card>
          <Card className="bg-red-50 p-4 border-l-4 border-red-500">
            <p className="text-sm text-slate-600">Rejected</p>
            <p className="text-2xl font-bold text-red-600">
              {projects.filter((r) => r.status === 'rejected').length}
            </p>
          </Card>
          <Card className="bg-blue-50 p-4 border-l-4 border-blue-500">
            <p className="text-sm text-slate-600">Total Projects</p>
            <p className="text-2xl font-bold text-blue-600">{projects.length}</p>
          </Card>
        </div>

        <div className="space-y-4">
          {filteredProjects.length === 0 ? (
            <Card className="p-8 text-center">
              <p className="text-slate-600">No projects found</p>
            </Card>
          ) : (
            filteredProjects.map((project) => (
              <Card
                key={project.id}
                className={`p-6 border-l-4 ${
                  project.status === 'pending' || project.status === 'forwarded'
                    ? 'border-yellow-500 bg-yellow-50'
                    : project.status === 'approved'
                    ? 'border-green-500 bg-green-50'
                    : 'border-red-500 bg-red-50'
                }`}
              >
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-start">
                    <div className="md:col-span-2">
                      <p className="text-xs text-slate-600 mb-1">PROJECT TITLE</p>
                      <p className="text-lg font-bold text-slate-900 mb-2">{project.payload?.projectTitle}</p>
                      <p className="text-xs text-slate-600 mb-1">SUBMITTED BY</p>
                      <p className="text-sm text-slate-700">
                        {project.createdBy} <span className="text-slate-500">- {project.createdByDesignation || 'Employee'}</span>
                      </p>
                      <p className="text-xs text-slate-500">
                        Employee ID: {project.createdByEmployeeId || project.payload?.id || 'Not Set'}
                        {' · Team: '}{project.createdByDepartment || project.payload?.department || 'Not Set'}
                      </p>
                      <p className="text-xs text-slate-500">Phone: {project.createdByPhone || project.payload?.phone || 'Not Set'}</p>
                    </div>

                    <div>
                      <p className="text-xs text-slate-600 mb-1">BUDGET</p>
                      <p className="text-xl font-bold text-slate-900">₹{Number(project.payload?.projectAmount || 0).toLocaleString()}</p>
                    </div>

                    <div>
                      <p className="text-xs text-slate-600 mb-1">SUBMITTED</p>
                      <p className="text-sm text-slate-700 mb-3">{new Date(project.createdAt).toLocaleDateString('en-IN')}</p>
                      <p className="text-xs text-slate-600 mb-1">FORM</p>
                      <p className="text-sm text-slate-700">{project.uploadedFile?.name || project.payload?.abstractFileName || 'Not provided'}</p>
                    </div>

                    <div>
                      <p className="text-xs text-slate-600 mb-1">STATUS</p>
                      <div className="flex items-center gap-2">
                        {getStatusIcon(project.status)}
                        <span
                          className={`text-sm font-semibold ${
                            project.status === 'pending' || project.status === 'forwarded'
                              ? 'text-yellow-600'
                              : project.status === 'approved'
                              ? 'text-green-600'
                              : 'text-red-600'
                          }`}
                        >
                          {project.status === 'pending' || project.status === 'forwarded'
                            ? project.status === 'forwarded'
                              ? `Forwarded to ${project.forwardedTo || 'next approver'}`
                              : 'Under Review'
                            : project.status.charAt(0).toUpperCase() + project.status.slice(1)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-slate-200 pt-4">
                    <p className="text-xs text-slate-600 mb-2">DESCRIPTION</p>
                    <p className="text-sm text-slate-700">{project.payload?.clientOrganization || 'No description provided'}</p>
                  </div>

                  <RequestApprovalDetails request={project} />

                  {canActOnProject(project) && (
                    <div className="border-t border-slate-200 pt-4">
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="md:col-span-2">
                          <textarea
                            placeholder="Add comments or feedback..."
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            rows={2}
                            value={commentText}
                            onChange={(e) => setCommentText(e.target.value)}
                          />
                        </div>
                        <div className="flex flex-col gap-2 md:col-span-2">
                          {project.uploadedFile && (
                            <Button size="sm" variant="outline" onClick={() => setViewingFile(project.uploadedFile)}>
                              <Eye size={14} className="mr-1" /> View Form
                            </Button>
                          )}
                          {project.uploadedFile && (
                            <Button size="sm" variant="outline" onClick={() => downloadUploadedFile(project)}>
                              <FileDown size={14} className="mr-1" /> Download Form
                            </Button>
                          )}
                          <Button
                            size="sm"
                            className="bg-green-500 hover:bg-green-600 text-white"
                            onClick={() => handleApprove(project.id)}
                          >
                            ✓ Approve
                          </Button>
                          <Button
                            size="sm"
                            className="bg-red-500 hover:bg-red-600 text-white"
                            onClick={() => handleReject(project.id)}
                          >
                            ✕ Reject
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                  {!canActOnProject(project) && (
                    <div className="border-t border-slate-200 pt-4">
                      <div className="flex flex-wrap gap-2">
                        {project.uploadedFile && (
                          <Button size="sm" variant="outline" onClick={() => setViewingFile(project.uploadedFile)}>
                            <Eye size={14} className="mr-1" /> View Form
                          </Button>
                        )}
                        {isFounderFinalApproval(project) && user?.role === 'founder' && user?.username?.toLowerCase() === 'gkbharath' && user?.id === 'founder-001' && (
                          <div className="border-t border-slate-200 pt-4">
                            <h3 className="font-semibold text-slate-900 mb-3">Project Team (up to 4 members)</h3>
                            {project.payload?.projectTeam?.length > 0 && editingTeamId !== project.id && (
                              <div className="space-y-2 mb-3">
                                {project.payload.projectTeam.map((member: any) => {
                                  const person = getDirectoryUser(member.userId);
                                  return (
                                    <div key={member.userId} className="flex items-start gap-3 rounded border p-3 text-sm">
                                      {person?.profilePhoto ? (
                                        <img src={person.profilePhoto} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
                                      ) : (
                                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100 font-semibold text-blue-700">
                                          {(member.fullName || '?').charAt(0).toUpperCase()}
                                        </div>
                                      )}
                                      <div>
                                        <p className="font-medium">{member.fullName} ({member.employeeId || 'No Employee ID'}) — {member.projectRole}</p>
                                        {person?.designation && <p className="text-slate-600">{person.designation}</p>}
                                        {person?.department && <p className="text-slate-600">Team: {person.department}</p>}
                                        {person?.phone && <p className="text-slate-600">Phone: {person.phone}</p>}
                                        <p className="text-slate-600">{member.responsibility}</p>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                            {editingTeamId === project.id ? (
                              <div className="space-y-3">
                                {getTeamDraft(project).map((member: any, index: number) => (
                                  <div key={`${project.id}-${index}`} className="grid grid-cols-1 md:grid-cols-3 gap-2 rounded border p-3">
                                    <div className="space-y-2">
                                      <select
                                        className="w-full rounded border px-3 py-2 text-sm"
                                        value={member.userId}
                                        onChange={(event) => updateTeamDraft(project, index, { userId: event.target.value })}
                                      >
                                        <option value="">Select an active portal user</option>
                                        {getAvailableTeamMembers(project, index)
                                          .map((person) => (
                                            <option key={person.id} value={person.id}>
                                              {person.fullName} ({person.employeeId || 'No Employee ID'}) — {person.designation || person.role}{person.department ? ` · ${person.department}` : ''}
                                            </option>
                                          ))}
                                      </select>
                                      {getDirectoryUser(member.userId) && (
                                        <div className="flex items-center gap-2 text-xs text-slate-600">
                                          {getDirectoryUser(member.userId)?.profilePhoto ? (
                                            <img src={getDirectoryUser(member.userId)?.profilePhoto} alt="" className="h-8 w-8 rounded-full object-cover" />
                                          ) : (
                                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 font-semibold text-blue-700">
                                              {(getDirectoryUser(member.userId)?.fullName || '?').charAt(0).toUpperCase()}
                                            </div>
                                          )}
                                          <span>
                                            Employee ID: {getDirectoryUser(member.userId)?.employeeId || 'Not Set'}
                                            {' · '}{getDirectoryUser(member.userId)?.designation || 'Designation not set'}
                                            {' · Team: '}{getDirectoryUser(member.userId)?.department || 'Not Set'}
                                            {' · Phone: '}{getDirectoryUser(member.userId)?.phone || 'Not Set'}
                                          </span>
                                        </div>
                                      )}
                                    </div>
                                    <input
                                      className="rounded border px-3 py-2 text-sm"
                                      placeholder="Project role"
                                      value={member.projectRole}
                                      onChange={(event) => updateTeamDraft(project, index, { projectRole: event.target.value })}
                                    />
                                    <div className="flex gap-2">
                                      <input
                                        className="min-w-0 flex-1 rounded border px-3 py-2 text-sm"
                                        placeholder="Responsibilities"
                                        value={member.responsibility}
                                        onChange={(event) => updateTeamDraft(project, index, { responsibility: event.target.value })}
                                      />
                                      <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => setTeamDrafts((previous) => ({
                                          ...previous,
                                          [project.id]: getTeamDraft(project).filter((_: any, memberIndex: number) => memberIndex !== index),
                                        }))}
                                      >
                                        Remove
                                      </Button>
                                    </div>
                                  </div>
                                ))}
                                {getTeamDraft(project).length < 4 && (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => setTeamDrafts((previous) => ({
                                      ...previous,
                                      [project.id]: [...getTeamDraft(project), { userId: '', projectRole: '', responsibility: '' }],
                                    }))}
                                  >
                                    Add member
                                  </Button>
                                )}
                                <div className="flex gap-2">
                                  <Button type="button" onClick={() => handleAssignTeam(project)}>Save team & notify</Button>
                                  <Button type="button" variant="outline" onClick={() => setEditingTeamId(null)}>Cancel</Button>
                                </div>
                              </div>
                            ) : (
                              <Button type="button" variant="outline" onClick={() => startTeamEdit(project)}>
                                {project.payload?.projectTeam?.length ? 'Edit project team' : 'Assign project team'}
                              </Button>
                            )}
                          </div>
                        )}
                        {project.uploadedFile && (
                          <Button size="sm" variant="outline" onClick={() => downloadUploadedFile(project)}>
                            <FileDown size={14} className="mr-1" /> Download Form
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </Card>
            ))
          )}
        </div>
      </div>

      {selectedProject && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="bg-white w-full max-w-lg p-6 space-y-4">
            <h2 className="text-xl font-bold text-slate-900">Project Details</h2>
            <div className="space-y-2 text-sm text-slate-700">
              <p><strong>Project:</strong> {selectedProject.payload?.projectTitle}</p>
              <p><strong>Submitted By:</strong> {selectedProject.createdBy}</p>
              <p><strong>Status:</strong> {selectedProject.status}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setSelectedProject(null)} className="flex-1">
                Close
              </Button>
            </div>
          </Card>
        </div>
      )}

      <FileViewerModal file={viewingFile} onClose={() => setViewingFile(null)} />
    </MainLayout>
  );
}
