export const loadExamV2SessionPage = () => import('@/pages/exams/ExamV2SessionPage');

export function preloadExamV2SessionPage(): void {
  void loadExamV2SessionPage();
}
