# Dashboard Prototype Handoff

**Concept C — Balanced Dashboard**
React / Vite + TypeScript + Tailwind CSS v4 + Recharts

Tái tạo prototype này trong một dự án React/Vite mới. File này tự chứa toàn bộ source cần thiết.

---

## Dependencies

```json
{
  "recharts": "^2.x"
}
```

Thêm vào `package.json` và chạy `npm install`.

---

## Design tokens (`src/index.css` hoặc `src/globals.css`)

Dùng Tailwind v4 (`@import "tailwindcss"`). Thêm toàn bộ block này vào file CSS gốc.

```css
@import "tailwindcss";

@theme inline {
  --font-sans: 'Inter', system-ui, sans-serif;
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-border: var(--border);
  --color-ring: var(--ring);
  --color-destructive: var(--destructive);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
}

:root {
  color-scheme: light;
  --background: oklch(0.98 0.003 247);
  --foreground: oklch(0.18 0.015 247);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.18 0.015 247);
  --primary: oklch(0.51 0.22 268);
  --primary-foreground: oklch(0.98 0 0);
  --secondary: oklch(0.95 0.006 247);
  --secondary-foreground: oklch(0.18 0.015 247);
  --muted: oklch(0.95 0.006 247);
  --muted-foreground: oklch(0.52 0.018 247);
  --destructive: oklch(0.62 0.22 27);
  --border: oklch(0.895 0.008 247);
  --ring: oklch(0.51 0.22 268);
}

.dark {
  color-scheme: dark;
  --background: oklch(0.13 0.012 247);
  --foreground: oklch(0.96 0.006 247);
  --card: oklch(0.18 0.012 247);
  --card-foreground: oklch(0.96 0.006 247);
  --primary: oklch(0.65 0.22 268);
  --primary-foreground: oklch(0.13 0.012 247);
  --secondary: oklch(0.24 0.012 247);
  --secondary-foreground: oklch(0.96 0.006 247);
  --muted: oklch(0.24 0.012 247);
  --muted-foreground: oklch(0.62 0.012 247);
  --destructive: oklch(0.7 0.19 22);
  --border: oklch(1 0 0 / 9%);
  --ring: oklch(0.65 0.22 268);
}

@layer base {
  * { box-sizing: border-box; }
  body { background: var(--background); color: var(--foreground); font-family: var(--font-sans); }
}
```

---

## File: `src/lib/dashboard-types.ts`

```ts
export type DashboardState = "loading" | "ready" | "error" | "empty"
export type DataSource = "backend" | "local" | "local-fallback"
export type NoticeType = "info" | "warning" | "error"
export type ConfidenceLevel = "high" | "medium" | "low"
export type TopicStatus = "strength" | "weakness" | "developing" | "insufficient-data"
export type DetailStatus = "full" | "summary-only"
export type QuestionMode = "thi_thu" | "custom_mock"

export interface DashboardScope {
  source: DataSource
  range: "7d" | "30d" | "90d" | "all"
  timezone: string
  isAuthenticated: boolean
  fromDate: string
  toDateExclusive: string
}

export interface DashboardSummary {
  totalAttempts: number
  averageScore: number | null
  highestScore: number | null
  latestScore: number | null
  totalDurationSeconds: number
  activeDays: number
  mcqAccuracy: number | null
  tfStatementAccuracy: number | null
  blankRate: number | null
  tfPartialRate: number | null
}

export interface TopicEvidence {
  accuracy: number
  correctUnits: number
  totalUnits: number
  attemptCount: number
  confidence: ConfidenceLevel
}

export interface Recommendation {
  id: string
  title: string
  reason: string
  actionLabel: string
  actionRoute: string
  priority: "primary" | "secondary"
  topicKey: string | null
  evidence: TopicEvidence | null
}

export interface ScoreTrendPoint {
  attemptId: string
  submittedAt: string
  dateLabel: string
  score: number
  mode: QuestionMode
  title: string
}

export interface ScoreTrend {
  granularity: "attempt"
  isComplete: boolean
  sourceAttemptCount: number
  points: ScoreTrendPoint[]
}

export interface TopicPerformance {
  key: string
  label: string
  status: TopicStatus
  accuracy: number
  correctUnits: number
  totalUnits: number
  attemptCount: number
  confidence: ConfidenceLevel
  practiceRoute: string | null
  summary: string
}

export interface QuestionTypePerformance {
  type: "mcq" | "true_false"
  label: string
  accuracy: number
  correctUnits: number
  answeredUnits: number
  blankUnits: number
  totalUnits: number
  partialQuestionCount: number
  totalQuestionCount: number
  textualSummary: string
}

export interface CognitivePerformance {
  level: "knowledge" | "comprehension" | "application"
  label: string
  accuracy: number
  correctUnits: number
  totalUnits: number
  attemptCount: number
  confidence: ConfidenceLevel
  status: TopicStatus
  textualSummary: string
}

export interface RecentAttempt {
  attemptId: string
  title: string
  mode: QuestionMode
  modeLabel: string
  score: number
  durationSeconds: number
  submittedAt: string
  submittedLabel: string
  totalQuestions: number
  resultRoute: string
  detailStatus: DetailStatus
}

export interface DataCoverage {
  summaryAttemptCount: number
  detailedAttemptCount: number
  totalKnownAttempts: number
  fetchLimit: number | null
  isComplete: boolean
  capturesTimedOriginal: boolean
  capturesCustomMock: boolean
  capturesPractice: boolean
  capturesRetry: boolean
  message: string
}

export interface DashboardNotice {
  id: string
  type: NoticeType
  title: string
  message: string
  actionLabel: string | null
  actionRoute: string | null
}

export interface DashboardViewModel {
  state: DashboardState
  scope: DashboardScope
  summary: DashboardSummary
  recommendations: Recommendation[]
  scoreTrend: ScoreTrend
  strengths: TopicPerformance[]
  weaknesses: TopicPerformance[]
  questionTypePerformance: QuestionTypePerformance[]
  cognitivePerformance: CognitivePerformance[]
  recentAttempts: RecentAttempt[]
  coverage: DataCoverage
  notices: DashboardNotice[]
}
```

---

## File: `src/lib/dashboard-fixtures.ts`

```ts
import type { DashboardViewModel } from "./dashboard-types"

// ─── default ─────────────────────────────────────────────────────────────────
export const fixtureDefault: DashboardViewModel = {
  state: "ready",
  scope: { source: "backend", range: "30d", timezone: "Asia/Ho_Chi_Minh", isAuthenticated: true, fromDate: "2026-06-16", toDateExclusive: "2026-07-16" },
  summary: { totalAttempts: 12, averageScore: 7.32, highestScore: 8.9, latestScore: 7.8, totalDurationSeconds: 19860, activeDays: 8, mcqAccuracy: 77, tfStatementAccuracy: 78.75, blankRate: 6.54, tfPartialRate: 17.5 },
  recommendations: [{ id: "rec-viet-nam-1945", title: "Ôn lại Việt Nam từ 1945 đến 1954", reason: "Độ chính xác 52,5% trên 40 ý trả lời qua 5 bài — đây là chủ đề yếu có đủ mẫu.", actionLabel: "Ôn chủ đề này", actionRoute: "/exams/on-chu-de/viet-nam-1945-1954", priority: "primary", topicKey: "viet-nam-1945-1954", evidence: { accuracy: 52.5, correctUnits: 21, totalUnits: 40, attemptCount: 5, confidence: "medium" } }],
  scoreTrend: { granularity: "attempt", isComplete: false, sourceAttemptCount: 12, points: [
    { attemptId: "s007", submittedAt: "2026-06-19T13:30:00Z", dateLabel: "19/06", score: 6.4, mode: "thi_thu", title: "Đề tham khảo tốt nghiệp THPT môn Lịch sử" },
    { attemptId: "s008", submittedAt: "2026-06-24T08:15:00Z", dateLabel: "24/06", score: 6.9, mode: "custom_mock", title: "Đề tùy chọn: Việt Nam hiện đại" },
    { attemptId: "s009", submittedAt: "2026-06-30T14:05:00Z", dateLabel: "30/06", score: 7.2, mode: "thi_thu", title: "Đề luyện tập tổng hợp số 3" },
    { attemptId: "s010", submittedAt: "2026-07-05T09:20:00Z", dateLabel: "05/07", score: 8.1, mode: "thi_thu", title: "Đề luyện tập tổng hợp số 4" },
    { attemptId: "s011", submittedAt: "2026-07-11T15:10:00Z", dateLabel: "11/07", score: 8.9, mode: "custom_mock", title: "Đề tùy chọn: Lịch sử thế giới" },
    { attemptId: "s012", submittedAt: "2026-07-15T12:40:00Z", dateLabel: "15/07", score: 7.8, mode: "thi_thu", title: "Đề tham khảo tốt nghiệp THPT 2026" },
  ]},
  strengths: [
    { key: "cach-mang-thang-tam", label: "Cách mạng tháng Tám năm 1945", status: "strength", accuracy: 84.38, correctUnits: 27, totalUnits: 32, attemptCount: 4, confidence: "medium", practiceRoute: "/exams/on-chu-de/cach-mang-thang-tam", summary: "84,38% qua 32 ý." },
    { key: "quan-he-quoc-te", label: "Quan hệ quốc tế sau năm 1945", status: "strength", accuracy: 82.76, correctUnits: 24, totalUnits: 29, attemptCount: 3, confidence: "medium", practiceRoute: "/exams/on-chu-de/quan-he-quoc-te-sau-1945", summary: "82,76% qua 29 ý." },
  ],
  weaknesses: [
    { key: "viet-nam-1945-1954", label: "Việt Nam từ năm 1945 đến năm 1954", status: "weakness", accuracy: 52.5, correctUnits: 21, totalUnits: 40, attemptCount: 5, confidence: "medium", practiceRoute: "/exams/on-chu-de/viet-nam-1945-1954", summary: "52,5% qua 40 ý." },
    { key: "phong-trao-cong-nhan", label: "Phong trào công nhân và yêu nước đầu thế kỷ XX", status: "weakness", accuracy: 52.63, correctUnits: 10, totalUnits: 19, attemptCount: 3, confidence: "medium", practiceRoute: "/exams/on-chu-de/phong-trao-cong-nhan-va-yeu-nuoc", summary: "52,63% qua 19 ý." },
    { key: "asean", label: "ASEAN và quá trình hội nhập khu vực", status: "weakness", accuracy: 50, correctUnits: 8, totalUnits: 16, attemptCount: 2, confidence: "low", practiceRoute: "/exams/on-chu-de/asean", summary: "50% qua 16 ý; mẫu ít." },
  ],
  questionTypePerformance: [
    { type: "mcq", label: "Trắc nghiệm", accuracy: 77, correctUnits: 77, answeredUnits: 92, blankUnits: 8, totalUnits: 100, partialQuestionCount: 0, totalQuestionCount: 100, textualSummary: "Đúng 77/100 câu; 8 câu bỏ trống." },
    { type: "true_false", label: "Đúng/Sai theo mệnh đề", accuracy: 78.75, correctUnits: 126, answeredUnits: 151, blankUnits: 9, totalUnits: 160, partialQuestionCount: 7, totalQuestionCount: 40, textualSummary: "Đúng 126/160 mệnh đề; 9 mệnh đề bỏ trống; 7/40 câu làm dở." },
  ],
  cognitivePerformance: [
    { level: "knowledge", label: "Nhận biết", accuracy: 80, correctUnits: 84, totalUnits: 105, attemptCount: 8, confidence: "high", status: "strength", textualSummary: "Đúng 84/105 ý trong 8 bài." },
    { level: "comprehension", label: "Thông hiểu", accuracy: 77.27, correctUnits: 85, totalUnits: 110, attemptCount: 9, confidence: "high", status: "developing", textualSummary: "Đúng 85/110 ý trong 9 bài." },
    { level: "application", label: "Vận dụng", accuracy: 75.56, correctUnits: 34, totalUnits: 45, attemptCount: 5, confidence: "medium", status: "developing", textualSummary: "Đúng 34/45 ý; mẫu nhỏ hơn." },
  ],
  recentAttempts: [
    { attemptId: "s012", title: "Đề tham khảo tốt nghiệp THPT 2026", mode: "thi_thu", modeLabel: "Thi thử nguyên đề", score: 7.8, durationSeconds: 2940, submittedAt: "2026-07-15T12:40:00Z", submittedLabel: "19:40, 15/07/2026", totalQuestions: 28, resultRoute: "/exams/ket-qua/s012", detailStatus: "full" },
    { attemptId: "s011", title: "Đề tùy chọn: Lịch sử thế giới", mode: "custom_mock", modeLabel: "Thi thử tùy chọn", score: 8.9, durationSeconds: 1800, submittedAt: "2026-07-11T15:10:00Z", submittedLabel: "22:10, 11/07/2026", totalQuestions: 20, resultRoute: "/exams/ket-qua/s011", detailStatus: "full" },
    { attemptId: "s010", title: "Đề luyện tập tổng hợp số 4", mode: "thi_thu", modeLabel: "Thi thử nguyên đề", score: 8.1, durationSeconds: 2760, submittedAt: "2026-07-05T09:20:00Z", submittedLabel: "16:20, 05/07/2026", totalQuestions: 28, resultRoute: "/exams/ket-qua/s010", detailStatus: "full" },
    { attemptId: "s009", title: "Đề luyện tập tổng hợp số 3", mode: "thi_thu", modeLabel: "Thi thử nguyên đề", score: 7.2, durationSeconds: 3060, submittedAt: "2026-06-30T14:05:00Z", submittedLabel: "21:05, 30/06/2026", totalQuestions: 28, resultRoute: "/exams/ket-qua/s009", detailStatus: "full" },
    { attemptId: "s008", title: "Đề tùy chọn: Việt Nam hiện đại", mode: "custom_mock", modeLabel: "Thi thử tùy chọn", score: 6.9, durationSeconds: 1620, submittedAt: "2026-06-24T08:15:00Z", submittedLabel: "15:15, 24/06/2026", totalQuestions: 20, resultRoute: "/exams/ket-qua/s008", detailStatus: "full" },
  ],
  coverage: { summaryAttemptCount: 12, detailedAttemptCount: 10, totalKnownAttempts: 12, fetchLimit: 100, isComplete: false, capturesTimedOriginal: true, capturesCustomMock: true, capturesPractice: false, capturesRetry: false, message: "Có dữ liệu tổng quan cho 12 bài và chi tiết cho 10 bài. Chỉ thi thử được ghi nhận." },
  notices: [{ id: "coverage-partial", type: "info", title: "Phạm vi dữ liệu", message: "Các chỉ số chủ đề dựa trên 10/12 bài có dữ liệu chi tiết.", actionLabel: null, actionRoute: null }],
}

// ─── loading ──────────────────────────────────────────────────────────────────
export const fixtureLoading: DashboardViewModel = {
  state: "loading",
  scope: { source: "backend", range: "30d", timezone: "Asia/Ho_Chi_Minh", isAuthenticated: true, fromDate: "2026-06-16", toDateExclusive: "2026-07-16" },
  summary: { totalAttempts: 0, averageScore: null, highestScore: null, latestScore: null, totalDurationSeconds: 0, activeDays: 0, mcqAccuracy: null, tfStatementAccuracy: null, blankRate: null, tfPartialRate: null },
  recommendations: [], scoreTrend: { granularity: "attempt", isComplete: false, sourceAttemptCount: 0, points: [] },
  strengths: [], weaknesses: [], questionTypePerformance: [], cognitivePerformance: [], recentAttempts: [],
  coverage: { summaryAttemptCount: 0, detailedAttemptCount: 0, totalKnownAttempts: 0, fetchLimit: 100, isComplete: false, capturesTimedOriginal: true, capturesCustomMock: true, capturesPractice: false, capturesRetry: false, message: "Đang tải." },
  notices: [],
}

// ─── error ────────────────────────────────────────────────────────────────────
export const fixtureError: DashboardViewModel = {
  state: "error",
  scope: { source: "backend", range: "30d", timezone: "Asia/Ho_Chi_Minh", isAuthenticated: true, fromDate: "2026-06-16", toDateExclusive: "2026-07-16" },
  summary: { totalAttempts: 0, averageScore: null, highestScore: null, latestScore: null, totalDurationSeconds: 0, activeDays: 0, mcqAccuracy: null, tfStatementAccuracy: null, blankRate: null, tfPartialRate: null },
  recommendations: [], scoreTrend: { granularity: "attempt", isComplete: false, sourceAttemptCount: 0, points: [] },
  strengths: [], weaknesses: [], questionTypePerformance: [], cognitivePerformance: [], recentAttempts: [],
  coverage: { summaryAttemptCount: 0, detailedAttemptCount: 0, totalKnownAttempts: 0, fetchLimit: 100, isComplete: false, capturesTimedOriginal: true, capturesCustomMock: true, capturesPractice: false, capturesRetry: false, message: "Lỗi máy chủ." },
  notices: [{ id: "dashboard-unavailable", type: "error", title: "Không thể tải thống kê học tập", message: "Máy chủ đang gặp lỗi và không có dữ liệu cục bộ. Hãy thử lại hoặc chọn một đề thi.", actionLabel: "Xem danh sách đề", actionRoute: "/exams/browse" }],
}

// ─── empty ────────────────────────────────────────────────────────────────────
export const fixtureEmpty: DashboardViewModel = {
  state: "empty",
  scope: { source: "local", range: "30d", timezone: "Asia/Ho_Chi_Minh", isAuthenticated: false, fromDate: "2026-06-16", toDateExclusive: "2026-07-16" },
  summary: { totalAttempts: 0, averageScore: null, highestScore: null, latestScore: null, totalDurationSeconds: 0, activeDays: 0, mcqAccuracy: null, tfStatementAccuracy: null, blankRate: null, tfPartialRate: null },
  recommendations: [{ id: "rec-start", title: "Bắt đầu với một đề thi thử", reason: "Bạn chưa có bài làm.", actionLabel: "Làm đề ngay", actionRoute: "/exams/browse", priority: "primary", topicKey: null, evidence: null }],
  scoreTrend: { granularity: "attempt", isComplete: true, sourceAttemptCount: 0, points: [] },
  strengths: [], weaknesses: [], questionTypePerformance: [], cognitivePerformance: [], recentAttempts: [],
  coverage: { summaryAttemptCount: 0, detailedAttemptCount: 0, totalKnownAttempts: 0, fetchLimit: null, isComplete: true, capturesTimedOriginal: true, capturesCustomMock: true, capturesPractice: false, capturesRetry: false, message: "Chưa có bài thi." },
  notices: [
    { id: "device-only", type: "info", title: "Dữ liệu chỉ lưu trên thiết bị này", message: "Đăng nhập để dùng lịch sử máy chủ.", actionLabel: "Đăng nhập", actionRoute: "/login" },
    { id: "empty-state", type: "info", title: "Chưa có dữ liệu", message: "Hoàn thành một đề thi thử để bắt đầu.", actionLabel: "Làm đề ngay", actionRoute: "/exams/browse" },
  ],
}

export type FixtureKey = "default" | "loading" | "error" | "empty"

export const FIXTURES: Record<FixtureKey, { label: string; sublabel: string; data: DashboardViewModel }> = {
  "default": { label: "Default", sublabel: "12 bài · partial detail", data: fixtureDefault },
  "loading": { label: "Loading", sublabel: "Đang tải", data: fixtureLoading },
  "error":   { label: "Error",   sublabel: "Lỗi máy chủ", data: fixtureError },
  "empty":   { label: "Empty",   sublabel: "Chưa có bài làm", data: fixtureEmpty },
}
```

> **Ghi chú:** File gốc trong prototype có 10 fixtures. File rút gọn ở trên giữ 4 fixture tiêu biểu để handoff không quá dài. Thêm `fixtureOneAttempt`, `fixtureAnonymous`, `fixtureBackendFallback`, `fixturePartialDetails`, `fixtureLongContent`, `fixtureManyAttempts` theo cùng pattern nếu cần.

---

## File: `src/lib/utils.ts`

```ts
import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

> Cần thêm `clsx` và `tailwind-merge` vào dependencies.

---

## File: `src/components/dashboard/shared.tsx`

```tsx
"use client"

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts"
import type {
  DashboardViewModel, TopicPerformance, QuestionTypePerformance,
  CognitivePerformance, RecentAttempt, DashboardNotice, TopicStatus,
} from "@/lib/dashboard-types"
import { cn } from "@/lib/utils"

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function fmtScore(s: number): string {
  return s.toFixed(1).replace(".", ",")
}

export function fmtDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h === 0) return `${m} phút`
  if (m === 0) return `${h} giờ`
  return `${h} giờ ${m} phút`
}

export function confidenceLabel(c: string): string {
  if (c === "high") return "Độ tin cậy cao"
  if (c === "medium") return "Độ tin cậy trung bình"
  return "Mẫu còn ít"
}

export function sourceLabel(source: string): string {
  if (source === "backend") return "Máy chủ"
  if (source === "local") return "Thiết bị"
  if (source === "local-fallback") return "Thiết bị (dự phòng)"
  return source
}

function topicStatusIcon(status: TopicStatus): string {
  if (status === "strength") return "↑"
  if (status === "weakness") return "↓"
  if (status === "insufficient-data") return "?"
  return "→"
}

function topicStatusLabel(status: TopicStatus): string {
  if (status === "strength") return "Điểm mạnh"
  if (status === "weakness") return "Cần cải thiện"
  if (status === "insufficient-data") return "Chưa đủ mẫu"
  return "Đang phát triển"
}

function topicColor(status: TopicStatus): string {
  if (status === "strength") return "#10b981"
  if (status === "weakness") return "#f97316"
  if (status === "insufficient-data") return "#94a3b8"
  return "#6366f1"
}

// ─── NoticeBanner ─────────────────────────────────────────────────────────────

export function NoticeBanner({ notice, onRetry }: { notice: DashboardNotice; onRetry?: () => void }) {
  const colorMap = {
    info:    { wrap: "border-blue-500/25 bg-blue-500/5",   icon: "text-blue-500",   iconChar: "ℹ" },
    warning: { wrap: "border-amber-500/30 bg-amber-500/5", icon: "text-amber-500",  iconChar: "⚠" },
    error:   { wrap: "border-red-500/30 bg-red-500/8",     icon: "text-red-500",    iconChar: "✕" },
  }
  const c = colorMap[notice.type]
  return (
    <div role={notice.type === "error" ? "alert" : "status"} className={cn("rounded-xl border p-4", c.wrap)}>
      <div className="flex items-start gap-3">
        <span className={cn("mt-0.5 shrink-0 text-base font-bold leading-none", c.icon)} aria-hidden="true">{c.iconChar}</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">{notice.title}</p>
          <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">{notice.message}</p>
          {(notice.actionLabel || notice.type === "error") && (
            <div className="flex flex-wrap gap-2 mt-2">
              {notice.type === "error" && onRetry && (
                <button onClick={onRetry} className="text-xs font-medium px-3 py-1.5 rounded-md bg-muted hover:bg-muted/80 text-foreground min-h-[36px]">
                  Thử lại
                </button>
              )}
              {notice.actionLabel && notice.actionRoute && (
                <a href={notice.actionRoute} className="text-xs font-medium px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:opacity-90 min-h-[36px] inline-flex items-center">
                  {notice.actionLabel}
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── SkeletonBlock ────────────────────────────────────────────────────────────

export function SkeletonBlock({ className }: { className?: string }) {
  return <div className={cn("rounded-lg bg-muted/60 animate-pulse", className)} aria-hidden="true" />
}

// ─── TimeRangeFilter ──────────────────────────────────────────────────────────

const RANGE_OPTS = [
  { label: "7 ngày", value: "7d" }, { label: "30 ngày", value: "30d" },
  { label: "90 ngày", value: "90d" }, { label: "Tất cả", value: "all" },
]
export function TimeRangeFilter({ active, onChange }: { active: string; onChange: (r: string) => void }) {
  return (
    <fieldset>
      <legend className="sr-only">Khoảng thời gian thống kê</legend>
      <div role="radiogroup" aria-label="Khoảng thời gian thống kê" className="flex items-center gap-0.5 bg-muted rounded-lg p-1">
        {RANGE_OPTS.map((o) => (
          <button key={o.value} role="radio" aria-checked={active === o.value} onClick={() => onChange(o.value)}
            className={cn("text-xs px-2.5 py-1.5 rounded-md font-medium transition-colors min-h-[36px]",
              active === o.value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
            {o.label}
          </button>
        ))}
      </div>
    </fieldset>
  )
}

// ─── KpiCard ──────────────────────────────────────────────────────────────────

export function KpiCard({ label, value, sub, accent = "default", ariaLabel }: {
  label: string; value: string; sub?: string; accent?: "default" | "emerald" | "amber" | "blue"; ariaLabel?: string
}) {
  const accentClass = { default: "text-foreground", emerald: "text-emerald-500", amber: "text-amber-500", blue: "text-primary" }[accent]
  return (
    <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-1 min-w-0">
      <span className="text-xs text-muted-foreground font-medium leading-snug">{label}</span>
      <span className={cn("text-2xl font-bold leading-none tabular-nums", accentClass)} aria-label={ariaLabel ?? `${label}: ${value}${sub ? " " + sub : ""}`}>
        {value}
      </span>
      {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
    </div>
  )
}

// ─── ScoreTrendChart ──────────────────────────────────────────────────────────

export function ScoreTrendChart({ vm, compact = false }: { vm: DashboardViewModel; compact?: boolean }) {
  const { scoreTrend, summary } = vm
  const points = scoreTrend.points
  const tickInterval = points.length > 20 ? Math.floor(points.length / 8) : 0
  const data = points.map((p) => ({ name: p.dateLabel, score: p.score, title: p.title }))

  if (points.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="font-semibold text-foreground">Xu hướng điểm</h3>
        <div className="flex flex-col items-center justify-center py-8 gap-2 text-center">
          <p className="text-sm text-muted-foreground">Chưa có bài làm để hiển thị xu hướng.</p>
        </div>
      </div>
    )
  }

  if (points.length === 1) {
    const p = points[0]
    return (
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="font-semibold text-foreground">Xu hướng điểm</h3>
        <p className="text-xs text-muted-foreground mt-0.5">Chưa đủ dữ liệu để nhận xét xu hướng.</p>
        <div className="flex items-center gap-3 mt-3 p-3 bg-muted rounded-lg">
          <span className="text-2xl font-bold text-foreground tabular-nums">{fmtScore(p.score)}</span>
          <div>
            <p className="text-sm font-medium text-foreground leading-snug">{p.title}</p>
            <p className="text-xs text-muted-foreground">{p.dateLabel}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-start justify-between gap-2 mb-1 flex-wrap">
        <div>
          <h3 className="font-semibold text-foreground">Xu hướng điểm</h3>
          <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">
            {scoreTrend.isComplete
              ? `Toàn bộ ${scoreTrend.sourceAttemptCount} bài`
              : `${points.length} điểm đại diện từ ${scoreTrend.sourceAttemptCount} bài — chuỗi chưa đầy đủ`}
          </p>
        </div>
        <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full shrink-0">Thang 10</span>
      </div>
      <div className={compact ? "h-40 mt-3" : "h-52 mt-3"} role="img"
        aria-label={`Biểu đồ xu hướng điểm ${points.length} bài; điểm gần nhất ${summary.latestScore != null ? fmtScore(summary.latestScore) : "—"}/10`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 6, bottom: 0, left: -16 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="name" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} interval={tickInterval} />
            <YAxis domain={[4, 10]} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} width={28} />
            <Tooltip
              contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12, maxWidth: 220 }}
              labelStyle={{ color: "var(--foreground)", fontWeight: 600 }}
              formatter={(val: number, _: string, props: { payload?: { title?: string } }) => [`${fmtScore(val)} / 10`, props.payload?.title ?? "Điểm"]}
            />
            <Line type="monotone" dataKey="score" stroke="var(--color-primary)" strokeWidth={2}
              dot={points.length > 20 ? false : { r: 3.5, fill: "var(--color-primary)", strokeWidth: 0 }}
              activeDot={{ r: 5, strokeWidth: 0 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <details className="mt-2">
        <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground rounded">Dữ liệu bảng ({points.length} bài)</summary>
        <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground max-h-40 overflow-y-auto">
          {points.map((p) => <li key={p.attemptId}>{p.dateLabel}: {fmtScore(p.score)}/10 — {p.title}</li>)}
        </ul>
      </details>
    </div>
  )
}

// ─── TopicBar ─────────────────────────────────────────────────────────────────

export function TopicBar({ topic }: { topic: TopicPerformance }) {
  const color = topicColor(topic.status)
  return (
    <div className="py-2.5 border-b border-border last:border-b-0">
      <div className="flex items-start justify-between gap-2 mb-1.5 min-w-0">
        <div className="flex items-start gap-2 min-w-0">
          <span className="mt-0.5 shrink-0 text-xs font-semibold px-1.5 py-0.5 rounded"
            style={{ background: `color-mix(in srgb, ${color} 15%, transparent)`, color }}
            aria-label={topicStatusLabel(topic.status)}>
            {topicStatusIcon(topic.status)}
          </span>
          <span className="text-sm text-foreground leading-snug">{topic.label}</span>
        </div>
        <span className="text-sm font-bold shrink-0 tabular-nums" style={{ color }} aria-label={`${topic.accuracy.toFixed(1)} phần trăm chính xác`}>
          {topic.accuracy.toFixed(1)}%
        </span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden mb-1.5" role="presentation">
        <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(topic.accuracy, 100)}%`, background: color }} />
      </div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
        <span>{topic.correctUnits}/{topic.totalUnits} ý đúng</span>
        <span aria-hidden="true">·</span>
        <span>{topic.attemptCount} bài</span>
        <span aria-hidden="true">·</span>
        <span>{confidenceLabel(topic.confidence)}</span>
        {topic.practiceRoute && (
          <><span aria-hidden="true">·</span>
          <a href={topic.practiceRoute} className="text-primary underline underline-offset-2 hover:opacity-80 min-h-[24px] inline-flex items-center"
            aria-label={`Ôn tập chủ đề ${topic.label}`}>Ôn chủ đề</a></>
        )}
      </div>
    </div>
  )
}

// ─── QuestionTypeSection + CognitiveSectionBars ───────────────────────────────

function HBarRow({ label, accuracy, textualSummary, color, isInsufficient }: {
  label: string; accuracy: number; textualSummary: string; color: string; isInsufficient?: boolean
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1 gap-2 min-w-0">
        <span className="text-sm text-foreground leading-snug min-w-0">{label}</span>
        <span className="text-sm font-semibold shrink-0 tabular-nums" style={{ color: isInsufficient ? undefined : color }}
          aria-label={`${label}: ${accuracy.toFixed(1)} phần trăm`}>
          {isInsufficient ? "—" : `${accuracy.toFixed(1)}%`}
        </span>
      </div>
      <div className="h-2.5 rounded-full bg-muted overflow-hidden" role="presentation">
        <div className="h-full rounded-full" style={{ width: isInsufficient ? "0%" : `${Math.min(accuracy, 100)}%`, background: color }} />
      </div>
      <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{textualSummary}</p>
    </div>
  )
}

export function QuestionTypeSection({ items, blankRate, tfPartialRate }: {
  items: QuestionTypePerformance[]; blankRate: number | null; tfPartialRate: number | null
}) {
  const colors = ["var(--color-primary)", "#14b8a6"]
  return (
    <div className="space-y-4">
      {items.map((q, i) => <HBarRow key={q.type} label={q.label} accuracy={q.accuracy} textualSummary={q.textualSummary} color={colors[i] ?? "#6366f1"} />)}
      {(blankRate != null || tfPartialRate != null) && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 pt-2 border-t border-border text-xs text-muted-foreground">
          {blankRate != null && <span>Bỏ trống: <strong className="text-foreground">{blankRate}%</strong></span>}
          {tfPartialRate != null && <span>Đ/S dở: <strong className="text-foreground">{tfPartialRate}%</strong></span>}
        </div>
      )}
    </div>
  )
}

export function CognitiveSectionBars({ items }: { items: CognitivePerformance[] }) {
  return (
    <div className="space-y-4">
      {items.map((c) => (
        <HBarRow key={c.level} label={c.label} accuracy={c.accuracy} textualSummary={c.textualSummary}
          color={topicColor(c.status)} isInsufficient={c.status === "insufficient-data"} />
      ))}
    </div>
  )
}

// ─── RecommendationCard ───────────────────────────────────────────────────────

export function RecommendationCard({ vm }: { vm: DashboardViewModel }) {
  const rec = vm.recommendations[0]
  if (!rec) return null
  const ev = rec.evidence
  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
        <span className="text-xs font-semibold bg-primary/15 text-primary px-2 py-0.5 rounded-full">Gợi ý ôn tập</span>
        {ev && <span className="text-xs text-muted-foreground shrink-0">{confidenceLabel(ev.confidence)}</span>}
      </div>
      <h2 className="font-semibold text-foreground text-base leading-snug mb-1">{rec.title}</h2>
      <p className="text-sm text-muted-foreground leading-relaxed mb-3">{rec.reason}</p>
      {ev && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground mb-3">
          <span className="font-medium text-orange-500">{ev.accuracy}% chính xác</span>
          <span aria-hidden="true">·</span>
          <span>{ev.correctUnits}/{ev.totalUnits} ý đúng</span>
          <span aria-hidden="true">·</span>
          <span>{ev.attemptCount} bài</span>
        </div>
      )}
      <a href={rec.actionRoute} className="inline-flex items-center gap-1.5 text-sm font-semibold bg-primary hover:opacity-90 text-primary-foreground px-4 py-2 rounded-lg transition-opacity min-h-[44px]"
        aria-label={rec.actionLabel}>
        {rec.actionLabel}<span aria-hidden="true"> →</span>
      </a>
    </div>
  )
}

// ─── AttemptRow ───────────────────────────────────────────────────────────────

function scoreColor(score: number): string {
  if (score >= 8) return "text-emerald-500"
  if (score >= 6.5) return "text-primary"
  return "text-amber-500"
}

export function AttemptRow({ attempt }: { attempt: RecentAttempt }) {
  const mins = Math.round(attempt.durationSeconds / 60)
  return (
    <li className="flex items-start gap-3 py-3 border-b border-border last:border-b-0">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground leading-snug">{attempt.title}</p>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5 text-xs text-muted-foreground">
          <span className="bg-muted px-1.5 py-0.5 rounded">{attempt.modeLabel}</span>
          <span>{attempt.totalQuestions} câu</span>
          <span aria-hidden="true">·</span>
          <span>{mins} phút</span>
          <span aria-hidden="true">·</span>
          <time dateTime={attempt.submittedAt}>{attempt.submittedLabel}</time>
          {attempt.detailStatus === "summary-only" && <span className="text-amber-500 italic">(chỉ tổng quan)</span>}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className={cn("text-lg font-bold tabular-nums", scoreColor(attempt.score))} aria-label={`Điểm ${fmtScore(attempt.score)} trên 10`}>
          {fmtScore(attempt.score)}<span className="text-xs font-normal text-muted-foreground">/10</span>
        </span>
        <a href={attempt.resultRoute} className="text-xs text-primary underline underline-offset-2 hover:opacity-80 whitespace-nowrap min-h-[36px] inline-flex items-center"
          aria-label={`Xem kết quả bài ${attempt.title}`}>Xem lại</a>
      </div>
    </li>
  )
}

// ─── CoverageNotice ───────────────────────────────────────────────────────────

export function CoverageNotice({ vm }: { vm: DashboardViewModel }) {
  const { coverage } = vm
  if (coverage.totalKnownAttempts === 0) return null
  return (
    <div className="rounded-xl border border-border bg-muted/30 p-4">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Phạm vi dữ liệu</p>
      <p className="text-xs text-muted-foreground leading-relaxed">{coverage.message}</p>
      {!coverage.capturesPractice && (
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">Luyện tập tự do chưa được ghi nhận.</p>
      )}
    </div>
  )
}

// ─── SideStats ────────────────────────────────────────────────────────────────

export function SideStats({ vm }: { vm: DashboardViewModel }) {
  const { summary, scope } = vm
  const rows = [
    { label: "Điểm trung bình", value: summary.averageScore != null ? `${fmtScore(summary.averageScore)}/10` : "—", emerald: false },
    { label: "Điểm cao nhất",   value: summary.highestScore != null ? `${fmtScore(summary.highestScore)}/10` : "—", emerald: true },
    { label: "Điểm gần nhất",   value: summary.latestScore != null ? `${fmtScore(summary.latestScore)}/10` : "—", emerald: false },
    { label: "Tổng thời gian",  value: summary.totalDurationSeconds > 0 ? fmtDuration(summary.totalDurationSeconds) : "—", emerald: false },
    { label: "Ngày hoạt động",  value: `${summary.activeDays} ngày`, emerald: false },
  ]
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h3 className="font-semibold text-foreground text-sm mb-3">Tổng quan · <span className="font-normal text-muted-foreground">{summary.totalAttempts} bài</span></h3>
      <dl className="space-y-3">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between gap-2">
            <dt className="text-sm text-muted-foreground">{r.label}</dt>
            <dd className={cn("text-sm font-semibold tabular-nums", r.emerald ? "text-emerald-500" : "text-foreground")}>{r.value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 pt-3 border-t border-border text-xs text-muted-foreground leading-relaxed">
        Nguồn: {sourceLabel(scope.source)} · {scope.fromDate} – {scope.toDateExclusive}
      </p>
    </div>
  )
}

// ─── QuickActions ─────────────────────────────────────────────────────────────

export function QuickActions() {
  const actions = [
    { label: "Làm đề nguyên", href: "/exams/browse", desc: "Thi thử nguyên đề" },
    { label: "Tự chọn đề",    href: "/exams/browse?type=custom", desc: "Chọn chủ đề tùy thích" },
    { label: "Xem tất cả",    href: "/exams/lich-su", desc: "Toàn bộ kết quả đã làm" },
    { label: "Tạo đề riêng",  href: "/exams/tao-de", desc: "Lọc câu theo chủ đề" },
  ]
  return (
    <nav aria-label="Hành động nhanh">
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="font-semibold text-foreground text-sm mb-3">Hành động nhanh</h3>
        <ul className="space-y-1">
          {actions.map((a) => (
            <li key={a.label}>
              <a href={a.href} className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg hover:bg-muted transition-colors group min-h-[44px]">
                <div>
                  <p className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">{a.label}</p>
                  <p className="text-xs text-muted-foreground">{a.desc}</p>
                </div>
                <span className="text-muted-foreground group-hover:text-primary text-xs" aria-hidden="true">→</span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  )
}

// ─── LoadingSkeleton ──────────────────────────────────────────────────────────

export function LoadingSkeleton() {
  return (
    <div aria-live="polite" aria-label="Đang tải thống kê học tập" className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border bg-card p-4 space-y-2">
            <SkeletonBlock className="h-3 w-2/3" />
            <SkeletonBlock className="h-7 w-1/2" />
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-border bg-card p-5 space-y-3">
        <SkeletonBlock className="h-4 w-1/3" />
        <SkeletonBlock className="h-40" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border bg-card p-5 space-y-3">
            <SkeletonBlock className="h-4 w-1/2" />
            {Array.from({ length: 3 }).map((_, j) => <SkeletonBlock key={j} className="h-9" />)}
          </div>
        ))}
      </div>
    </div>
  )
}
```

---

## File: `src/components/dashboard/concept-c.tsx`

```tsx
"use client"

import { useState } from "react"
import type { DashboardViewModel } from "@/lib/dashboard-types"
import {
  RecommendationCard, KpiCard, ScoreTrendChart, TopicBar, AttemptRow,
  CoverageNotice, QuickActions, TimeRangeFilter, SideStats, NoticeBanner,
  QuestionTypeSection, CognitiveSectionBars, LoadingSkeleton,
  fmtScore, sourceLabel,
} from "./shared"
import { cn } from "@/lib/utils"

function Section({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return <section aria-label={label} className={className}>{children}</section>
}

function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("rounded-xl border border-border bg-card", className)}>{children}</div>
}

function PageHeader({ vm, range, onRangeChange }: { vm: DashboardViewModel; range: string; onRangeChange: (r: string) => void }) {
  const { scope } = vm
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-card/95 backdrop-blur-sm">
      <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-3 sm:py-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-bold text-foreground leading-tight">Tổng quan học tập</h1>
            {vm.state !== "loading" && (
              <p className="text-xs text-muted-foreground mt-0.5 truncate">
                Lịch sử · {scope.fromDate} – {scope.toDateExclusive} · {sourceLabel(scope.source)}
                {!scope.isAuthenticated && (
                  <> · <a href="/login" className="text-primary underline underline-offset-2">Đăng nhập</a> để đồng bộ</>
                )}
              </p>
            )}
          </div>
          {vm.state !== "loading" && (
            <div className="shrink-0"><TimeRangeFilter active={range} onChange={onRangeChange} /></div>
          )}
        </div>
      </div>
    </header>
  )
}

function StrengthWeaknessPanel({ vm }: { vm: DashboardViewModel }) {
  const { strengths, weaknesses } = vm
  if (strengths.length === 0 && weaknesses.length === 0) {
    return (
      <Card className="p-5">
        <p className="text-sm font-semibold text-foreground mb-1">Điểm mạnh và điểm yếu</p>
        <p className="text-sm text-muted-foreground leading-relaxed">Cần ít nhất 8 ý trả lời trong ít nhất 2 bài để gắn nhãn.</p>
      </Card>
    )
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <Card className="p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-3">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" aria-hidden="true" />
          <h2 className="font-semibold text-foreground text-sm">Điểm mạnh</h2>
          <span className="text-xs text-muted-foreground">(≥80%)</span>
        </div>
        {strengths.length === 0
          ? <p className="text-sm text-muted-foreground">Chưa có chủ đề nào đạt ngưỡng điểm mạnh.</p>
          : <ul className="divide-y divide-border">{strengths.map((s) => <li key={s.key}><TopicBar topic={s} /></li>)}</ul>}
      </Card>
      <Card className="p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-3">
          <span className="w-2.5 h-2.5 rounded-full bg-orange-500 shrink-0" aria-hidden="true" />
          <h2 className="font-semibold text-foreground text-sm">Cần cải thiện</h2>
          <span className="text-xs text-muted-foreground">{'(<60%)'}</span>
        </div>
        {weaknesses.length === 0
          ? <p className="text-sm text-muted-foreground">Chưa xác định được chủ đề yếu.</p>
          : <ul className="divide-y divide-border">{weaknesses.map((w) => <li key={w.key}><TopicBar topic={w} /></li>)}</ul>}
      </Card>
    </div>
  )
}

function AnalysisPanel({ vm }: { vm: DashboardViewModel }) {
  const { questionTypePerformance, cognitivePerformance, summary } = vm
  if (questionTypePerformance.length === 0 && cognitivePerformance.length === 0) {
    return (
      <Card className="p-5">
        <p className="text-sm font-semibold text-foreground mb-1">Phân tích dạng câu và mức nhận thức</p>
        <p className="text-sm text-muted-foreground leading-relaxed">Dữ liệu chi tiết chưa khả dụng.</p>
      </Card>
    )
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {questionTypePerformance.length > 0 && (
        <Card className="p-4 sm:p-5">
          <h2 className="font-semibold text-foreground text-sm mb-4">Dạng câu hỏi</h2>
          <QuestionTypeSection items={questionTypePerformance} blankRate={summary.blankRate} tfPartialRate={summary.tfPartialRate} />
        </Card>
      )}
      {cognitivePerformance.length > 0 && (
        <Card className="p-4 sm:p-5">
          <h2 className="font-semibold text-foreground text-sm mb-4">Mức nhận thức</h2>
          <CognitiveSectionBars items={cognitivePerformance} />
        </Card>
      )}
    </div>
  )
}

function RecentAttemptsPanel({ vm }: { vm: DashboardViewModel }) {
  const shown = vm.recentAttempts.slice(0, 8)
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-center justify-between mb-1 gap-2 flex-wrap">
        <h2 className="font-semibold text-foreground">Lịch sử gần đây</h2>
        <a href="/exams/lich-su" className="text-xs text-primary underline underline-offset-2 hover:opacity-80 min-h-[36px] inline-flex items-center">Xem tất cả →</a>
      </div>
      <p className="text-xs text-muted-foreground mb-3">{shown.length} bài gần nhất</p>
      {shown.length === 0
        ? <p className="text-sm text-muted-foreground py-4 text-center">Chưa có bài làm nào.</p>
        : <ul aria-label="Danh sách bài thi gần nhất">{shown.map((a) => <AttemptRow key={a.attemptId} attempt={a} />)}</ul>}
      {!vm.coverage.isComplete && vm.coverage.fetchLimit != null && vm.coverage.totalKnownAttempts > vm.coverage.fetchLimit && (
        <p className="text-xs text-muted-foreground mt-3 pt-3 border-t border-border">
          Tổng {vm.coverage.totalKnownAttempts} bài — hiển thị {vm.coverage.fetchLimit} bài gần nhất.{" "}
          <a href="/exams/lich-su" className="text-primary underline underline-offset-2">Xem toàn bộ</a>
        </p>
      )}
    </Card>
  )
}

function SidePanel({ vm }: { vm: DashboardViewModel }) {
  return (
    <div className="space-y-5">
      <SideStats vm={vm} />
      {vm.questionTypePerformance.length > 0 && (
        <Card className="p-4 sm:p-5">
          <h3 className="font-semibold text-foreground text-sm mb-3">Hiệu suất dạng câu</h3>
          <QuestionTypeSection items={vm.questionTypePerformance} blankRate={vm.summary.blankRate} tfPartialRate={vm.summary.tfPartialRate} />
        </Card>
      )}
      <QuickActions />
      <Card className="p-4">
        <p className="text-xs font-semibold text-foreground mb-1.5">Phạm vi dữ liệu</p>
        <dl className="space-y-1 text-xs text-muted-foreground">
          <div className="flex gap-2 justify-between"><dt>Tổng quan</dt><dd className="font-medium text-foreground">{vm.coverage.summaryAttemptCount} bài</dd></div>
          <div className="flex gap-2 justify-between"><dt>Chi tiết</dt><dd className="font-medium text-foreground">{vm.coverage.detailedAttemptCount} bài</dd></div>
        </dl>
      </Card>
    </div>
  )
}

// ─── State variants ───────────────────────────────────────────────────────────

function ConceptCLoading({ vm }: { vm: DashboardViewModel }) {
  return (
    <div className="min-h-screen bg-background">
      <PageHeader vm={vm} range="30d" onRangeChange={() => {}} />
      <main className="max-w-screen-xl mx-auto px-4 sm:px-6 py-8"><LoadingSkeleton /></main>
    </div>
  )
}

function ConceptCError({ vm }: { vm: DashboardViewModel }) {
  const notice = vm.notices.find((n) => n.type === "error") ?? vm.notices[0]
  return (
    <div className="min-h-screen bg-background">
      <PageHeader vm={vm} range="30d" onRangeChange={() => {}} />
      <main className="max-w-screen-xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex flex-col gap-6 max-w-2xl">
          {notice && <NoticeBanner notice={notice} />}
          <Card className="p-6 text-center flex flex-col items-center gap-4">
            <div>
              <p className="text-foreground font-medium mb-1">Không thể hiển thị thống kê học tập</p>
              <p className="text-sm text-muted-foreground leading-relaxed">Hãy thử lại hoặc tiếp tục luyện thi.</p>
            </div>
            <div className="flex flex-wrap gap-3 justify-center">
              <a href="/exams/browse" className="inline-flex items-center text-sm font-semibold bg-primary text-primary-foreground px-4 py-2.5 rounded-lg hover:opacity-90 min-h-[44px]">Chọn đề thi ngay</a>
              <button className="inline-flex items-center text-sm font-medium border border-border bg-muted px-4 py-2.5 rounded-lg hover:bg-muted/80 text-foreground min-h-[44px]">Thử tải lại</button>
            </div>
          </Card>
        </div>
      </main>
    </div>
  )
}

function ConceptCEmpty({ vm }: { vm: DashboardViewModel }) {
  const rec = vm.recommendations[0]
  return (
    <div className="min-h-screen bg-background">
      <PageHeader vm={vm} range="30d" onRangeChange={() => {}} />
      <main className="max-w-screen-xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex flex-col gap-5 max-w-2xl">
          {vm.notices.map((n) => <NoticeBanner key={n.id} notice={n} />)}
          <Card className="p-8 flex flex-col items-center text-center gap-4">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center" aria-hidden="true">
              <span className="text-2xl font-bold text-muted-foreground">—</span>
            </div>
            <div>
              <p className="text-foreground font-semibold text-base mb-1">Chưa có bài làm nào</p>
              <p className="text-sm text-muted-foreground leading-relaxed max-w-sm">Hoàn thành một đề thi thử để bắt đầu theo dõi tiến độ.</p>
            </div>
            {rec && (
              <a href={rec.actionRoute} className="inline-flex items-center text-sm font-semibold bg-primary text-primary-foreground px-5 py-2.5 rounded-lg hover:opacity-90 min-h-[44px]">
                {rec.actionLabel} →
              </a>
            )}
          </Card>
          <QuickActions />
        </div>
      </main>
    </div>
  )
}

function ConceptCReady({ vm, range, onRangeChange }: { vm: DashboardViewModel; range: string; onRangeChange: (r: string) => void }) {
  const { summary, recommendations } = vm
  const errorNotices = vm.notices.filter((n) => n.type === "error")
  const warnNotices = vm.notices.filter((n) => n.type === "warning")
  const infoNotices = vm.notices.filter((n) => n.type === "info" && n.id !== "coverage-partial")

  return (
    <div className="min-h-screen bg-background">
      <PageHeader vm={vm} range={range} onRangeChange={onRangeChange} />
      <main className="max-w-screen-xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {(errorNotices.length > 0 || warnNotices.length > 0) && (
          <div className="mb-5 flex flex-col gap-3">
            {[...errorNotices, ...warnNotices].map((n) => <NoticeBanner key={n.id} notice={n} />)}
          </div>
        )}
        <div className="grid grid-cols-12 gap-5 sm:gap-6">
          <div className="col-span-12 lg:col-span-8 space-y-5 sm:space-y-6">
            {recommendations.length > 0 && (
              <Section label="Gợi ý ôn tập hôm nay"><RecommendationCard vm={vm} /></Section>
            )}
            <Section label="Chỉ số tổng hợp">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <KpiCard label="Số bài đã làm" value={`${summary.totalAttempts}`} sub="bài thi" accent="blue" />
                <KpiCard label="Điểm trung bình" value={summary.averageScore != null ? fmtScore(summary.averageScore) : "—"} sub="/ 10" />
                <KpiCard label="Điểm cao nhất" value={summary.highestScore != null ? fmtScore(summary.highestScore) : "—"} sub="/ 10" accent="emerald" />
                <KpiCard label="Ngày hoạt động" value={`${summary.activeDays}`} sub="ngày" />
              </div>
            </Section>
            <Section label="Xu hướng điểm số"><ScoreTrendChart vm={vm} compact /></Section>
            <Section label="Điểm mạnh và điểm yếu"><StrengthWeaknessPanel vm={vm} /></Section>
            <Section label="Phân tích dạng câu và mức nhận thức"><AnalysisPanel vm={vm} /></Section>
            <Section label="Lịch sử gần đây"><RecentAttemptsPanel vm={vm} /></Section>
            <CoverageNotice vm={vm} />
            {infoNotices.map((n) => <NoticeBanner key={n.id} notice={n} />)}
          </div>
          <aside className="col-span-12 lg:col-span-4" aria-label="Tóm tắt và hành động nhanh">
            <SidePanel vm={vm} />
          </aside>
        </div>
      </main>
    </div>
  )
}

// ─── Entry point ──────────────────────────────────────────────────────────────

export function ConceptC({ vm, range, onRangeChange }: { vm: DashboardViewModel; range: string; onRangeChange: (r: string) => void }) {
  if (vm.state === "loading") return <ConceptCLoading vm={vm} />
  if (vm.state === "error") return <ConceptCError vm={vm} />
  if (vm.state === "empty" || vm.summary.totalAttempts === 0) return <ConceptCEmpty vm={vm} />
  return <ConceptCReady vm={vm} range={range} onRangeChange={onRangeChange} />
}
```

---

## File: `src/App.tsx` (Vite entry)

```tsx
import { useState } from "react"
import { ConceptC } from "./components/dashboard/concept-c"
import { FIXTURES, type FixtureKey } from "./lib/dashboard-fixtures"

const FIXTURE_ORDER: FixtureKey[] = ["default", "loading", "error", "empty"]

export default function App() {
  const [active, setActive] = useState<FixtureKey>("default")
  const [range, setRange] = useState("30d")
  const fixture = FIXTURES[active]

  return (
    <div>
      <nav aria-label="Prototype state switcher" className="sticky top-0 z-50 border-b border-border bg-card/95 backdrop-blur-sm">
        <div className="max-w-screen-xl mx-auto px-4 py-2">
          <div className="flex items-center gap-x-2 gap-y-1 flex-wrap">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mr-1 py-1">Concept C</span>
            {FIXTURE_ORDER.map((key) => {
              const f = FIXTURES[key]
              const isActive = active === key
              return (
                <button key={key} onClick={() => setActive(key)} aria-pressed={isActive}
                  className={`text-[11px] font-medium px-2.5 py-1.5 rounded-md border transition-all leading-none whitespace-nowrap ${
                    isActive ? "border-primary bg-primary/10 text-primary" : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`}>
                  {f.label}
                </button>
              )
            })}
          </div>
          <div className="mt-1 flex items-center gap-2 pb-1">
            <span className="text-[10px] text-muted-foreground bg-muted/60 px-2 py-0.5 rounded">
              state: <strong className="text-foreground">{fixture.data.state}</strong>
            </span>
            <span className="text-[10px] text-muted-foreground truncate">{fixture.sublabel}</span>
          </div>
        </div>
      </nav>
      <ConceptC vm={fixture.data} range={range} onRangeChange={setRange} />
    </div>
  )
}
```

---

## Kiến trúc tổng thể

```
src/
├── lib/
│   ├── dashboard-types.ts    — DashboardViewModel interface (frozen)
│   ├── dashboard-fixtures.ts — 10 fixture objects + FIXTURES registry
│   └── utils.ts              — cn() helper
├── components/dashboard/
│   ├── shared.tsx            — All primitive components
│   └── concept-c.tsx         — ConceptC entry + state routing
├── App.tsx                   — Fixture switcher + ConceptC
└── index.css                 — Design tokens + Tailwind v4
```

### Information hierarchy (ready state)

1. Gợi ý ôn tập (recommendation)
2. KPI 4 chỉ số (số bài, điểm tb, điểm cao, ngày hđ)
3. Xu hướng điểm (line chart, recharts)
4. Điểm mạnh / Điểm yếu (2-col grid)
5. Dạng câu + Mức nhận thức (2-col grid)
6. Lịch sử gần đây (8 bài)
7. Coverage notice + info notices

Side column: SideStats · QuestionTypeMini · QuickActions · Scope detail

### State routing

| `vm.state`    | `totalAttempts` | Renders          |
|---------------|-----------------|------------------|
| `"loading"`   | —               | LoadingSkeleton  |
| `"error"`     | —               | Error + CTA      |
| `"empty"`     | any             | Empty + CTA      |
| `"ready"`     | `=== 0`         | Empty + CTA      |
| `"ready"`     | `> 0`           | Full dashboard   |

### Design tokens

Indigo primary (`oklch(0.51 0.22 268)` light / `oklch(0.65 0.22 268)` dark), slate neutrals, emerald for strengths, orange for weaknesses. Max 5 colors total.

### Accessibility

- Chart: `role="img"` + `<details>` textual table fallback
- Error notices: `role="alert"`, info: `role="status"`
- All interactive targets: min-height 36–44px
- All icon-only elements: `aria-hidden="true"` + visible text or `aria-label`
- `<time dateTime={iso}>` for all dates
- TimeRangeFilter: `role="radiogroup"` + `aria-checked`

### Responsive

- `grid-cols-12` desktop: main `col-span-8`, side `col-span-4`
- Below `lg`: single column, side appended after main
- KPI grid: `grid-cols-2 sm:grid-cols-4`
- Strength/Weakness + Analysis panels: `grid-cols-1 sm:grid-cols-2`
