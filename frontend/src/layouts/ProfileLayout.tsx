import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import UserAvatar from '../components/profile/UserAvatar';

const PROFILE_NAV_ITEMS = [
  { to: '/profile/dashboard', label: 'Tổng quan' },
  { to: '/profile/settings', label: 'Cài đặt' },
] as const;

function getGradeLabel(grade: string | undefined): string | null {
  if (!grade) return null;
  return grade === 'other' ? 'Khác' : `Lớp ${grade}`;
}

export default function ProfileLayout({ children }: { children: ReactNode }) {
  const { currentUser } = useAuth();
  const name = currentUser?.fullName ?? 'Học sinh';
  const gradeLabel = getGradeLabel(currentUser?.grade);
  const identityMeta = [gradeLabel, currentUser?.school].filter(Boolean).join(' · ');

  return (
    <div className="profile-shell min-h-[calc(100dvh-5rem)] bg-stone-50">
      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
        <header className="border-b border-stone-200 pb-6">
          <div className="flex min-w-0 items-center gap-3 sm:gap-4" aria-label="Thông tin hồ sơ">
            <UserAvatar
              fullName={name}
              avatarUrl={currentUser?.avatarUrl}
              size="lg"
            />
            <div className="min-w-0">
              <p className="break-words text-base font-bold text-stone-900 sm:text-lg">{name}</p>
              {identityMeta && (
                <p className="mt-1 break-words text-sm text-stone-500">{identityMeta}</p>
              )}
            </div>
          </div>

          <nav
            aria-label="Điều hướng hồ sơ"
            className="mt-5 grid w-full grid-cols-2 gap-1 rounded-xl border border-stone-200 bg-white p-1 sm:flex sm:w-fit"
          >
            {PROFILE_NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end
                className="profile-subnav-link flex min-h-11 min-w-0 items-center justify-center rounded-lg px-3 text-sm font-semibold no-underline sm:px-4"
              >
                <span>{item.label}</span>
              </NavLink>
            ))}
          </nav>
        </header>

        <main className="min-w-0 pt-6 sm:pt-8">
          {children}
        </main>
      </div>
    </div>
  );
}
