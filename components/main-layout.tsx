'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { ProfileSetupModal } from '@/components/profile-setup-modal';
import { NotificationBell } from '@/components/notification-bell';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Home,
  FileText,
  DollarSign,
  FolderPlus,
  BarChart3,
  Users,
  Heart,
  LogOut,
  Menu,
  X,
  Clock,
  User,
  Share2,
  CalendarDays,
  ClipboardList,
} from 'lucide-react';
import { toast } from 'sonner';
import { isReportSubmissionRestricted } from '@/lib/report-access';

interface MainLayoutProps {
  children: React.ReactNode;
}

export default function MainLayout({ children }: MainLayoutProps) {
  const router = useRouter();
  const { user, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [showProfileEditor, setShowProfileEditor] = useState(false);

  const isFounder =
    user?.role === 'founder' ||
    user?.username?.toLowerCase() === 'gkbharath' ||
    user?.id === 'founder-001';
  const isAdmin = user?.role === 'admin' || isFounder;
  const isManagingPartner = user?.role === 'managing-partner';
  const isGuest = user?.role === 'guest';
  const isServiceRequestsRestricted = ['hareeshv', 'santhanakumarv', 'gkbharath']
    .includes(user?.username?.toLowerCase() || '');

  React.useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);


  const handleLogout = () => {
    logout();
    toast.success('Logged out successfully');
    router.push('/login');
  };

  if (!user) {
    return <>{children}</>;
  }

  const adminNavItems = [
    { label: 'Dashboard', icon: Home, href: '/admin-dashboard' },
    { label: 'My Requests', icon: Clock, href: '/my-requests' },
    { label: 'Attendance', icon: CalendarDays, href: '/attendance' },
    { label: 'Tasks', icon: ClipboardList, href: '/tasks' },
    { label: 'Approvals', icon: FileText, href: '/admin/approvals' },
    { label: 'User Management', icon: Users, href: '/admin/user-management' },
    { label: 'Submit Report', icon: BarChart3, href: '/reports' },
    { label: 'Internal Requests', icon: FileText, href: '/internal-requests' },
    { label: 'Circulars', icon: FileText, href: '/circulars' },
    // Recruitment and Sponsorship removed per admin request
  ];

  const founderNavItems = [
    ...adminNavItems,
    { label: 'Leave Application', icon: FileText, href: '/leave-form' },
    { label: 'Allowance Claim', icon: DollarSign, href: '/ta-claim' },
  ];

  const guestNavItems: Array<{ label: string; icon: typeof Home; href: string }> = [
    // Guest navigation intentionally left minimal (no recruitment/sponsorship)
  ];

  const managingPartnerNavItems = [
    { label: 'Dashboard', icon: Home, href: '/admin-dashboard' },
    { label: 'My Requests', icon: Clock, href: '/my-requests' },
    { label: 'Attendance', icon: CalendarDays, href: '/attendance' },
    { label: 'Tasks', icon: ClipboardList, href: '/tasks' },
    { label: 'Relieving & Certificates', icon: FileText, href: '/service-requests' },
    { label: 'Approvals', icon: FileText, href: '/admin/approvals' },
    { label: 'Leave Application', icon: FileText, href: '/leave-form' },
    { label: 'Allowance Claim', icon: DollarSign, href: '/ta-claim' },
    { label: 'Project Proposal', icon: FolderPlus, href: '/project-creation' },
    { label: 'Internal Requests', icon: FileText, href: '/internal-requests' },
    { label: 'Circulars', icon: FileText, href: '/circulars' },
  ];

  const employeeNavItems = [
    { label: 'Dashboard', icon: Home, href: '/dashboard' },
    { label: 'My Requests', icon: Clock, href: '/my-requests' },
    { label: 'Approvals', icon: FileText, href: '/admin/approvals' },
    { label: 'Attendance', icon: CalendarDays, href: '/attendance' },
    { label: 'Tasks', icon: ClipboardList, href: '/tasks' },
    { label: 'Relieving & Certificates', icon: FileText, href: '/service-requests' },
    { label: 'Leave Form', icon: FileText, href: '/leave-form' },
    { label: 'Allowance Claim', icon: DollarSign, href: '/ta-claim' },
    { label: 'Proposal', icon: FolderPlus, href: '/project-creation' },
    { label: 'Reports', icon: BarChart3, href: '/reports' },
    { label: 'Internal Requests', icon: FileText, href: '/internal-requests' },
    { label: 'Circulars', icon: FileText, href: '/circulars' },
    // Recruitment and Sponsorship removed from employee sidebar
  ];

  const navItems = (isAdmin
    ? isFounder
      ? founderNavItems
      : adminNavItems
    : isManagingPartner
      ? managingPartnerNavItems
      : isGuest
        ? guestNavItems
        : employeeNavItems).filter(
    (item) =>
      (!isServiceRequestsRestricted || item.href !== '/service-requests') &&
      (!isReportSubmissionRestricted(user?.username) || item.href !== '/reports'),
  );

  const logoImg = '/company-logo.png';

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar */}
      <div
        className={`${
          sidebarOpen ? 'w-64' : 'w-20'
        } bg-gradient-to-b from-slate-900 to-slate-800 text-white transition-all duration-300 fixed h-screen flex flex-col shadow-2xl z-50`}
      >
        {/* Logo Section */}
        <div className="p-4 border-b border-slate-700 flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-3 hover:opacity-80 transition">
            <div className="w-11 h-11 shrink-0 bg-white rounded-lg flex items-center justify-center overflow-hidden p-1">
              <img src={logoImg} alt="SURYAS MiB ENTERPRISES logo" className="w-full h-full object-contain" />
            </div>
            {sidebarOpen && <span className="text-sm font-bold whitespace-nowrap">SURYAS MiB ENTERPRISES</span>}
          </Link>
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-1 hover:bg-slate-700 rounded text-white"
          >
            {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 overflow-y-auto py-4 px-2">
          <div className="space-y-2">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-slate-700 transition text-slate-100 hover:text-white group"
                title={!sidebarOpen ? item.label : ''}
              >
                <item.icon size={20} className="flex-shrink-0 group-hover:text-blue-400" />
                {sidebarOpen && <span className="text-sm">{item.label}</span>}
              </Link>
            ))}
          </div>
        </nav>

        {/* Logout Button */}
        <div className="border-t border-slate-700 p-4">
          <Button
            onClick={handleLogout}
            variant="destructive"
            className="w-full flex items-center justify-center gap-2"
          >
            <LogOut size={18} />
            {sidebarOpen && <span>Logout</span>}
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className={`${sidebarOpen ? 'ml-64' : 'ml-20'} flex-1 flex flex-col transition-all duration-300`}>
        {/* Top Header */}
        <div className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-40">
          <div className="px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <img src={logoImg} alt="SURYAS MiB ENTERPRISES logo" className="h-12 w-36 object-contain" />
              <div className="flex items-center gap-4">
                <Clock size={18} className="text-slate-500" />
                <span className="text-sm text-slate-600">
                  {currentTime.toLocaleString('en-IN', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                </span>
              </div>
            </div>

            {/* User Profile Dropdown */}
            <div className="flex items-center gap-2">
              {/* Notification Bell */}
              {!isGuest && <NotificationBell />}

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="flex items-center gap-3">
                    {isGuest ? (
                      <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center">
                        <User size={20} className="text-white" />
                      </div>
                    ) : isAdmin ? (
                      <img
                        src={user.profilePhoto || '/default-admin.svg'}
                        alt="Admin Profile"
                        className="w-10 h-10 rounded-full object-cover border-2 border-blue-400"
                        style={{ objectPosition: 'center 0%' }}
                      />
                    ) : (
                      <img
                        src={user.profilePhoto || 'https://via.placeholder.com/40'}
                        alt="Profile"
                        className="w-10 h-10 rounded-full object-cover border-2 border-blue-400"
                        style={{ objectPosition: 'center 0%' }}
                      />
                    )}
                    <div className="hidden sm:block text-left">
                      <p className="text-sm font-semibold text-slate-900">{user.fullName || user.username}</p>
                      <p className="text-xs text-slate-500">{isFounder ? 'Founder & Chief Executive Partner' : isAdmin ? 'Administrator' : user.designation}</p>
                    </div>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                  <DropdownMenuLabel>User Profile</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {!isGuest && (
                    <div className="px-4 py-3 text-center mb-2">
                      <img src={logoImg} alt="SURYAS MiB ENTERPRISES logo" className="h-12 w-36 object-contain mx-auto mb-2" />
                      <p className="text-xs text-slate-500">SURYAS MiB ENTERPRISES</p>
                    </div>
                  )}
                  <div className="px-4 py-3 space-y-2">
                    <div>
                      <p className="text-xs text-slate-500">Full Name</p>
                      <p className="text-sm font-semibold">{user.fullName || user.username}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Employee ID</p>
                      <p className="text-sm font-semibold font-mono">{user.employeeId || 'Not Set'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Designation</p>
                      <p className="text-sm font-semibold">{user.designation || 'Not Set'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Team Name</p>
                      <p className="text-sm font-semibold">{user.department || 'Not Set'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Phone</p>
                      <p className="text-sm font-semibold">{user.phone || 'Not Set'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Email</p>
                      <p className="text-sm font-semibold text-blue-600">{user.email}</p>
                    </div>
                  </div>
                  <DropdownMenuSeparator />
                  {!isGuest && (
                    <>
                      <DropdownMenuItem onClick={() => setShowProfileEditor(true)}>
                        <User size={16} className="mr-2" />
                        Edit Profile
                      </DropdownMenuItem>
                      {isAdmin && (
                        <DropdownMenuItem>
                          <Share2 size={16} className="mr-2" />
                          Management Console
                        </DropdownMenuItem>
                      )}
                      {isAdmin && <DropdownMenuSeparator />}
                    </>
                  )}
                  <DropdownMenuItem onClick={handleLogout} className="text-red-600 cursor-pointer">
                    <LogOut size={16} className="mr-2" />
                    Logout
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>

        {/* Page Content */}
        <div className="flex-1 overflow-auto p-6">{children}</div>
      </div>

      <ProfileSetupModal
        isOpen={showProfileEditor}
        onClose={() => setShowProfileEditor(false)}
        mode="edit"
      />
    </div>
  );
}
