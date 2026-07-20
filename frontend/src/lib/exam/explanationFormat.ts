const ANSWER_INTRO_PATTERN = /^((?:Câu|Cau)\s+\d+[.:]?\s+(?:Đáp án|Dap an)\s*:?[ \t]*[A-D])[ \t]+/iu;
const SECTION_MARKER_PATTERN = /[ \t]+([a-d]\))[ \t]+/giu;
const LABELED_DETAIL_PATTERN = /[ \t]+((?:Đáp án|Dap an|Giải thích|Giai thich):)[ \t]+/giu;

/** Normalize imported explanations for readable, plain-text rendering. */
export function formatExamExplanation(explanation: string): string {
  return explanation
    .replace(/\r\n?/g, '\n')
    .trim()
    .replace(ANSWER_INTRO_PATTERN, '$1\n')
    .replace(/[ \t]*(?:\n[ \t]*)?•[ \t]*/g, '\n• ')
    .replace(SECTION_MARKER_PATTERN, '\n$1 ')
    .replace(LABELED_DETAIL_PATTERN, '\n$1 ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
