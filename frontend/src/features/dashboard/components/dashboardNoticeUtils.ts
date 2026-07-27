import type {
  DashboardNotice,
  DashboardNoticeId,
  PersonalLearningDashboardViewModel,
} from '../dashboardTypes';

const SECONDARY_NOTICE_IDS = new Set<DashboardNoticeId>([
  'device-only-local-analytics',
  'device-unscoped-excluded',
  'local-coverage-partial',
  'pending-recovery',
  'future-timestamp-dropped',
  'excluded-invalid-attempts',
  'partial-detail',
  'unsupported-detail',
  'legacy-summary',
  'no-detailed-analytics',
]);

export function splitReadyNotices(vm: PersonalLearningDashboardViewModel) {
  const primary: DashboardNotice[] = [];
  const secondary: DashboardNotice[] = [];
  for (const notice of vm.notices) {
    (SECONDARY_NOTICE_IDS.has(notice.id) ? secondary : primary).push(notice);
  }
  return { primary, secondary };
}
