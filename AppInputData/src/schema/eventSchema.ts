import { z } from 'zod'

const nullableNumber = z.number().nullable().optional()

const nullableYear = z.number().int().min(-4000, 'Năm không hợp lệ').max(3000, 'Năm không hợp lệ').nullable().optional()
const nullableMonth = z.number().int().min(1, 'Tháng phải từ 1-12').max(12, 'Tháng phải từ 1-12').nullable().optional()
const nullableDay = z.number().int().min(1, 'Ngày phải từ 1-31').max(31, 'Ngày phải từ 1-31').nullable().optional()

const safeUrl = z
  .string()
  .optional()
  .refine((value) => !value || /^https?:\/\//i.test(value), 'URL phải bắt đầu bằng http:// hoặc https://')

const textbookRefSchema = z.object({
  grade: nullableNumber,
  book: z.string().optional(),
  theme: z.string().optional(),
  lesson: z.string().optional(),
  pageStart: nullableNumber,
  pageEnd: nullableNumber,
  excerpt: z.string().optional(),
})

export const requiredFieldPaths = [
  'id',
  'slug',
  'entityType',
  'eventLevel',
  'titles.primary',
  'classification.eventType',
  'classification.eventSubtype',
  'chronology.start.year',
  'chronology.datePrecision',
  'chronology.displayDate',
  'mapData.displayGeometry.geoType',
  'summary.homepageSummary',
  'textbookContent.canonicalSummary',
  'textbookContent.significance',
  'textbookContent.textbookRefs',
  'hierarchy.rootId',
  'hierarchy.level',
  'display.showOnHomepage',
  'display.showOnTimeline',
] as const

export const eventSchema = z.object({
  id: z.string().min(1, 'Vui lòng nhập id'),
  slug: z.string().min(1, 'Vui lòng nhập slug'),
  entityType: z.string().min(1, 'Vui lòng chọn loại thực thể'),
  eventLevel: z.string().min(1, 'Vui lòng chọn cấp sự kiện'),
  titles: z.object({
    primary: z.string().min(1, 'Vui lòng nhập tên chính'),
    short: z.string().optional(),
    alternatives: z.array(z.string()),
  }),
  classification: z.object({
    eventType: z.string().min(1, 'Vui lòng chọn loại sự kiện'),
    eventSubtype: z.string().min(1, 'Vui lòng chọn phân loại chi tiết'),
    tags: z.array(z.string()),
  }),
  coverage: z.object({
    grades: z.array(z.number()),
  }),
  chronology: z.object({
    start: z.object({
      year: nullableYear.refine((value) => value !== null && value !== undefined, 'Vui lòng nhập năm bắt đầu'),
      month: nullableMonth,
      day: nullableDay,
    }),
    end: z.object({
      year: nullableYear,
      month: nullableMonth,
      day: nullableDay,
    }),
    datePrecision: z.string().min(1, 'Vui lòng chọn độ chính xác thời gian'),
    displayDate: z.string().min(1, 'Vui lòng nhập chuỗi hiển thị thời gian'),
    isApproximate: z.boolean(),
  }),
  mapData: z.object({
    displayGeometry: z.object({
      geoType: z.string().min(1, 'Vui lòng chọn kiểu hình học hiển thị'),
      marker: z.object({
        lat: nullableNumber,
        lng: nullableNumber,
        label: z.string().optional(),
      }),
      markers: z.array(
        z.object({
          lat: nullableNumber,
          lng: nullableNumber,
          label: z.string().optional(),
        }),
      ),
      provinceNames: z.array(z.string()),
      gadmRefs: z.array(z.string()),
      historicalLocations: z.array(z.string()),
    }),
    focusGeometry: z.object({
      mode: z.string().optional(),
      center: z.object({
        lat: nullableNumber,
        lng: nullableNumber,
      }),
      zoom: nullableNumber,
      provinceNames: z.array(z.string()),
      gadmRefs: z.array(z.string()),
    }),
  }),
  summary: z.object({
    homepageTitle: z.string().optional(),
    homepageSummary: z.string().min(1, 'Vui lòng nhập mô tả trang chủ'),
    cardSummary: z.string().optional(),
  }),
  textbookContent: z.object({
    canonicalSummary: z.string().min(1, 'Vui lòng nhập tóm tắt chuẩn SGK'),
    detailedNarrative: z.string().optional(),
    significance: z.string().min(1, 'Vui lòng nhập ý nghĩa lịch sử'),
    keyFacts: z.array(z.string()),
    textbookRefs: z.array(textbookRefSchema).min(1, 'Cần ít nhất 1 tài liệu SGK trong textbookRefs'),
  }),
  externalContent: z.object({
    wikipedia: z.object({
      title: z.string().optional(),
      url: safeUrl,
      summary: z.string().optional(),
      content: z.string().optional(),
    }),
    wikidata: z.object({
      id: z.string().optional(),
      url: safeUrl,
    }),
    otherSources: z.array(z.string()),
  }),
  media: z.object({
    thumbnail: safeUrl,
    items: z.array(
      z.object({
        id: z.string().optional(),
        type: z.string().optional(),
        category: z.string().optional(),
        role: z.string().optional(),
        url: safeUrl,
        caption: z.string().optional(),
        alt: z.string().optional(),
        source: z.string().optional(),
        license: z.string().optional(),
        credit: z.string().optional(),
        isPrimary: z.boolean(),
      }),
    ),
  }),
  hierarchy: z.object({
    rootId: z.string().min(1, 'Vui lòng nhập rootId'),
    parentId: z.string().nullable().optional(),
    childIds: z.array(z.string()),
    level: z.number().int().min(0, 'Level phải >= 0'),
    orderInParent: z.number().int().optional(),
  }),
  associations: z.object({
    relatedEventIds: z.array(z.string()),
    relatedFigureIds: z.array(z.string()),
    predecessorEventIds: z.array(z.string()),
    successorEventIds: z.array(z.string()),
  }),
  display: z.object({
    showOnHomepage: z.boolean(),
    showOnTimeline: z.boolean(),
    featured: z.boolean(),
  }),
  sourcePolicy: z.object({
    canonicalSource: z.string().optional(),
    supplementalSources: z.array(z.string()),
  }),
})

export type EventRecord = z.infer<typeof eventSchema>
