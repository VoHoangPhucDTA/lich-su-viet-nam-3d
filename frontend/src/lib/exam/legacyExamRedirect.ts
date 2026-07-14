export function legacyExamSessionPath(examId?: string): string {
  return examId ? `/exams/de/${examId}` : '/exams/browse';
}
