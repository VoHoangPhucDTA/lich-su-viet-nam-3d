import { createContext, useContext, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import {
  Alert,
  Badge,
  Button,
  Card,
  Collapse,
  Divider,
  Form,
  Input,
  InputNumber,
  Layout,
  List,
  Select,
  Space,
  Switch,
  Tag,
  Typography,
  message,
  Modal,
  Table,
} from 'antd'
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  ColumnWidthOutlined,
  CopyOutlined,
  DeleteOutlined,
  DownloadOutlined,
  EyeInvisibleOutlined,
  EyeOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  PlusOutlined,
  SearchOutlined,
  UploadOutlined,
  FileExcelOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons'
import { Controller, useFieldArray, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import get from 'lodash-es/get'
import { allFieldMetas, fieldMetaMap, sections } from './config/fieldMeta'
import { defaultEventTemplate } from './data/defaultEvent'
import { eventSchema, requiredFieldPaths } from './schema/eventSchema'
import {
  deepMerge,
  downloadJsonFile,
  flattenErrors,
  getFieldCompletion,
  isFilled,
  orderByTemplate,
  slugifyVietnamese,
  toFieldId,
} from './utils/formUtils'
import { processExcelFile, type ExcelImportResult } from './utils/excelUtils'

const { Header, Sider, Content } = Layout
const { Title, Text } = Typography

const DRAFT_KEY = 'history-event-editor-draft-v1'

const eventTypeOptions = ['military', 'political', 'diplomatic', 'economic', 'cultural']
const eventSubtypeOptions = [
  'abdication',
  'administrative_establishment',
  'administrative_reform',
  'agricultural_rite',
  'analysis_topic',
  'anti_colonial_war',
  'archaeological_culture',
  'architecture',
  'autonomy_establishment',
  'battle',
  'battle_and_state_foundation',
  'battle_failed',
  'bourgeois_revolution',
  'campaign',
  'campaign_phase',
  'capital_fortification',
  'capital_relocation',
  'capital_site',
  'civilization',
  'collection_overview',
  'colonial_administration',
  'colonial_conquest',
  'colonial_invasion',
  'comprehensive_reform',
  'conference',
  'congress',
  'craft_village',
  'cultural_reform',
  'decisive_battle',
  'declaration',
  'diplomatic_agreement',
  'diplomatic_document',
  'documented_sovereignty',
  'dyke_construction',
  'dynastic_change',
  'dynasty_decline',
  'dynasty_foundation',
  'economic_cultural_reform',
  'economic_social_reform',
  'education_institution',
  'election',
  'examination',
  'examination_title',
  'geopolitical_analysis',
  'heritage_policy',
  'heritage_site',
  'historical_document',
  'historical_phase',
  'historiography',
  'independence_declaration',
  'independence_war',
  'institutional_structure',
  'intangible_heritage',
  'international_law',
  'law_code',
  'legislation',
  'liberation',
  'liberation_movement',
  'liberation_war',
  'maritime_agreement',
  'membership',
  'memorial_stele',
  'milestone',
  'modernization_reform',
  'monetary_reform',
  'organization_founding',
  'port_town',
  'protectorate_treaty',
  'recognition',
  'reform',
  'regional_declaration',
  'religious_flourishing',
  'renaming_state',
  'resolution',
  'revolution',
  'script',
  'socialist_revolution',
  'sovereignty_establishment',
  'sovereignty_management',
  'sovereignty_overview',
  'sovereignty_transfer',
  'state_dissolution',
  'state_formation',
  'territorial_conflict',
  'territorial_defense',
  'territorial_expansion',
  'treaty',
  'unesco_recognition',
  'uprising',
  'uprising_phase',
  'uprising_state',
  'urban_commerce',
  'urban_trade_center',
  'war',
  'war_failed',
  'war_phase',
  'war_series'
]

const datePrecisionOptions = ['day', 'month', 'year', 'period', 'approximate']
const geoTypeOptions = ['point', 'multi_point', 'polygon', 'multi_polygon', 'nationwide', 'no_location', 'mixed']
const focusModeOptions = ['auto', 'marker', 'polygon', 'bounds', 'center']
const mediaTypeOptions = ['image', 'video', 'audio', 'document']
const mediaCategoryOptions = ['illustration', 'artifact', 'map', 'portrait', 'timeline']
const mediaRoleOptions = ['hero', 'gallery', 'supporting', 'reference']
const canonicalSourceOptions = ['textbook', 'wikipedia', 'wikidata', 'other']

const FieldUiContext = createContext({ showFieldHelp: true })

type PrimitiveArrayFieldProps = {
  control: any
  getValues: any
  name: string
  help: string
  placeholder: string
  type?: 'string' | 'number'
}

function FieldHeader({ path, forceRequired }: { path: string; forceRequired?: boolean }) {
  const { showFieldHelp } = useContext(FieldUiContext)
  const meta = fieldMetaMap[path]
  const required = forceRequired ?? Boolean(meta?.required)

  return (
    <div className="field-header" id={toFieldId(path)}>
      <Space size={6} wrap>
        <Text strong>{meta?.key ?? path}</Text>
        <Text>- {meta?.viLabel ?? path}</Text>
        {required ? <Tag color="red">Bắt buộc</Tag> : <Tag>Tùy chọn</Tag>}
      </Space>
      {showFieldHelp && <Text type="secondary">{meta?.help ?? 'Không có mô tả bổ sung'}</Text>}
    </div>
  )
}

function PrimitiveArrayField({ control, getValues, name, help, placeholder, type = 'string' }: PrimitiveArrayFieldProps) {
  const { showFieldHelp } = useContext(FieldUiContext)
  const { fields, append, remove, move, insert } = useFieldArray({
    control,
    name: name as never,
  })

  return (
    <Card size="small" className="array-card" title={<FieldHeader path={name} />}>
      {showFieldHelp && <Text type="secondary">{help}</Text>}
      <Space direction="vertical" style={{ width: '100%', marginTop: 12 }}>
        {fields.map((field, index) => (
          <Space key={field.id} align="start" wrap>
            <Controller
              control={control}
              name={`${name}.${index}` as never}
              render={({ field: cField }) =>
                type === 'number' ? (
                  <InputNumber
                    value={typeof cField.value === 'number' ? cField.value : null}
                    onChange={(value) => cField.onChange(value ?? null)}
                    placeholder={placeholder}
                  />
                ) : (
                  <Input
                    value={typeof cField.value === 'string' ? cField.value : ''}
                    onChange={(event) => cField.onChange(event.target.value)}
                    placeholder={placeholder}
                    style={{ width: 280 }}
                  />
                )
              }
            />
            <Button icon={<ArrowUpOutlined />} onClick={() => index > 0 && move(index, index - 1)} />
            <Button icon={<ArrowDownOutlined />} onClick={() => index < fields.length - 1 && move(index, index + 1)} />
            <Button
              icon={<CopyOutlined />}
              onClick={() => {
                const currentArray = (get(getValues(), name) as unknown[]) ?? []
                insert(index + 1, currentArray[index] as never)
              }}
            >
              Nhân bản
            </Button>
            <Button danger icon={<DeleteOutlined />} onClick={() => remove(index)}>
              Xóa
            </Button>
          </Space>
        ))}
        <Button type="dashed" icon={<PlusOutlined />} onClick={() => append((type === 'number' ? null : '') as never)}>
          Thêm mục
        </Button>
      </Space>
    </Card>
  )
}

function App() {
  const [api, contextHolder] = message.useMessage()
  const [prettyJson, setPrettyJson] = useState(true)
  const [showLeftNav, setShowLeftNav] = useState(true)
  const [showPreviewPanel, setShowPreviewPanel] = useState(true)
  const [twoColumnMode, setTwoColumnMode] = useState(false)
  const [showFieldHelp, setShowFieldHelp] = useState(true)
  const [headerVisible, setHeaderVisible] = useState(true)
  const [searchText, setSearchText] = useState('')
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false)
  const [hydrated, setHydrated] = useState(false)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const templateRef = useRef<unknown>(defaultEventTemplate)
  const lastScrollYRef = useRef(0)
  const excelInputRef = useRef<HTMLInputElement | null>(null)
  const [excelImportResult, setExcelImportResult] = useState<ExcelImportResult | null>(null)
  const [showExcelModal, setShowExcelModal] = useState(false)

  const {
    control,
    setValue,
    handleSubmit,
    formState,
    getValues,
    trigger,
    reset,
    clearErrors,
  } = useForm({
    resolver: zodResolver(eventSchema) as any,
    mode: 'onBlur',
    defaultValues: defaultEventTemplate as any,
  })

  const watchedValues = useWatch({ control })
  const primaryTitle = useWatch({ control, name: 'titles.primary' })

  const markersArray = useFieldArray({ control, name: 'mapData.displayGeometry.markers' })
  const textbookRefsArray = useFieldArray({ control, name: 'textbookContent.textbookRefs' })
  const mediaItemsArray = useFieldArray({ control, name: 'media.items' })

  useEffect(() => {
    const loadInitialData = async () => {
      let initialData: any = defaultEventTemplate

      try {
        const response = await fetch('/docs/event-template.json')
        if (response.ok) {
          const remoteTemplate = (await response.json()) as any
          templateRef.current = remoteTemplate
          initialData = remoteTemplate
        }
      } catch {
        templateRef.current = defaultEventTemplate
      }

      const rawDraft = localStorage.getItem(DRAFT_KEY)
      if (rawDraft) {
        try {
          const parsedDraft = JSON.parse(rawDraft) as unknown
          initialData = deepMerge(initialData, parsedDraft)
          api.info('Đã khôi phục bản nháp local.')
        } catch {
          api.warning('Không đọc được bản nháp local. Đã dùng mẫu mặc định.')
        }
      }

      reset(initialData)
      setHydrated(true)
    }

    void loadInitialData()
  }, [api, reset])

  useEffect(() => {
    if (!hydrated) {
      return
    }
    const timer = window.setTimeout(() => {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(watchedValues))
      setHasUnsavedChanges(true)
    }, 400)

    return () => window.clearTimeout(timer)
  }, [hydrated, watchedValues])

  useEffect(() => {
    if (slugManuallyEdited) {
      return
    }
    setValue('slug', slugifyVietnamese(primaryTitle ?? ''), { shouldDirty: true })
  }, [primaryTitle, setValue, slugManuallyEdited])

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasUnsavedChanges) {
        return
      }
      event.preventDefault()
      event.returnValue = ''
    }

    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [hasUnsavedChanges])

  useEffect(() => {
    const handleScroll = () => {
      const currentY = window.scrollY
      const previousY = lastScrollYRef.current

      if (Math.abs(currentY - previousY) < 8) {
        return
      }

      if (currentY < 80 || currentY < previousY) {
        setHeaderVisible(true)
      } else {
        setHeaderVisible(false)
      }

      lastScrollYRef.current = currentY
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const validationItems = useMemo(() => flattenErrors(formState.errors), [formState.errors])

  const jsonPreview = useMemo(() => {
    const ordered = orderByTemplate(templateRef.current, watchedValues)
    return JSON.stringify(ordered, null, prettyJson ? 2 : 0)
  }, [prettyJson, watchedValues])

  const sectionCompletion = useMemo(() => {
    const valueSource = watchedValues as unknown
    return sections.reduce<Record<string, { completed: number; total: number; hasError: boolean }>>((acc, section) => {
      const requiredInSection = requiredFieldPaths.filter((path) => section.fields.includes(path))
      const completion = getFieldCompletion(valueSource, requiredInSection as string[])
      const hasError = validationItems.some((item) => item.path.startsWith(section.fields[0] ?? section.id))
      acc[section.id] = {
        ...completion,
        hasError,
      }
      return acc
    }, {})
  }, [validationItems, watchedValues])

  const filteredMeta = useMemo(() => {
    const term = searchText.trim().toLowerCase()
    if (!term) {
      return []
    }
    return allFieldMetas.filter((item) => {
      return (
        item.path.toLowerCase().includes(term) ||
        item.key.toLowerCase().includes(term) ||
        item.viLabel.toLowerCase().includes(term) ||
        item.help.toLowerCase().includes(term)
      )
    })
  }, [searchText])

  const scrollToField = (path: string) => {
    const fieldElement = document.getElementById(toFieldId(path))
    fieldElement?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  const onImportJson = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    try {
      const content = await file.text()
      const parsed = JSON.parse(content) as unknown
      const merged = deepMerge(templateRef.current as any, parsed)
      reset(merged)
      setSlugManuallyEdited(isFilled(get(parsed, 'slug')))
      clearErrors()
      void trigger()
      api.success('Import JSON thành công và đã nạp dữ liệu vào form.')
    } catch (error) {
      api.error(`Import thất bại: ${(error as Error).message}`)
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const onImportExcel = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      api.loading({ content: 'Đang xử lý Excel (sheet Master_Events)...', key: 'excel-import' })
      const result = await processExcelFile(file)
      setExcelImportResult(result)
      setShowExcelModal(true)
      api.success({ content: `Đã nạp ${result.validEvents.length} sự kiện từ Excel.`, key: 'excel-import' })
    } catch (error) {
      api.error({ content: `Lỗi import Excel: ${(error as Error).message}`, key: 'excel-import' })
    }

    if (excelInputRef.current) excelInputRef.current.value = ''
  }

  const exportExcelToJsonZip = async () => {
    if (!excelImportResult || excelImportResult.validEvents.length === 0) return

    try {
      const JSZip = (await import('jszip')).default
      const zip = new JSZip()
      
      const counts = { 10: 0, 11: 0, 12: 0 }
      const outputFolders = {
        10: zip.folder('json10'),
        11: zip.folder('json11'),
        12: zip.folder('json12')
      }
      
      excelImportResult.validEvents.forEach(event => {
        const content = JSON.stringify(event, null, 2)
        const fileName = `${event.id}.json`
        const grades = event.coverage?.grades || []
        
        // Export to each folder corresponding to grades
        grades.forEach((grade: number) => {
          if (grade === 10 || grade === 11 || grade === 12) {
            outputFolders[grade]?.file(fileName, content)
            counts[grade as keyof typeof counts]++
          }
        })
      })

      const blob = await zip.generateAsync({ type: 'blob' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `history_events_export_${new Date().toISOString().replace(/[:.]/g, '-')}.zip`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)

      api.success(`Xuất ZIP thành công! Đã tạo ${excelImportResult.validEvents.length} file JSON chia vào các thư mục json10, json11, json12.`)
    } catch (error) {
      api.error(`Lỗi xuất ZIP: ${(error as Error).message}`)
    }
  }

  const validateBeforeExport = async (): Promise<boolean> => {
    const isValid = await trigger()
    if (isValid) {
      api.success('Dữ liệu hợp lệ, sẵn sàng xuất file.')
      return true
    }

    const forceExport = window.confirm('Dữ liệu còn lỗi. Bạn có muốn xuất JSON dù chưa hợp lệ không?')
    return forceExport
  }

  const exportJson = async () => {
    const canExport = await validateBeforeExport()
    if (!canExport) {
      return
    }

    const ordered = orderByTemplate(templateRef.current, getValues())
    const content = JSON.stringify(ordered, null, 2)
    const id = getValues('id') || 'event'
    downloadJsonFile(`${id}.json`, content)
    setHasUnsavedChanges(false)
    api.success('Đã tải JSON về máy.')
  }

  const copyJson = async () => {
    const canExport = await validateBeforeExport()
    if (!canExport) {
      return
    }

    const ordered = orderByTemplate(templateRef.current, getValues())
    const content = JSON.stringify(ordered, null, prettyJson ? 2 : 0)
    await navigator.clipboard.writeText(content)
    api.success('Đã copy JSON vào clipboard.')
  }

  const resetForm = () => {
    const confirmed = window.confirm('Bạn có chắc muốn xóa toàn bộ dữ liệu form và bản nháp local?')
    if (!confirmed) {
      return
    }

    reset(defaultEventTemplate)
    localStorage.removeItem(DRAFT_KEY)
    setSlugManuallyEdited(false)
    setHasUnsavedChanges(false)
    api.success('Đã reset form về mẫu mặc định.')
  }

  return (
    <Layout className="app-layout">
      {contextHolder}
      <Header className={`app-header ${headerVisible ? '' : 'app-header-hidden'}`}>
        <div>
          <Title level={4} className="app-title">
            Event JSON Editor
          </Title>
          <Text type="secondary" style={{ fontSize: '12px' }}>Local-first • Schema check • Import/Export</Text>
        </div>
        <Space wrap size="small" style={{ marginLeft: 'auto' }}>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            className="hidden-file-input"
            aria-label="Chọn file JSON để import"
            onChange={onImportJson}
          />
          <input
            ref={excelInputRef}
            type="file"
            accept=".xlsx, .xls"
            className="hidden-file-input"
            onChange={onImportExcel}
          />
          <Button size="small" icon={<FileExcelOutlined />} onClick={() => excelInputRef.current?.click()}>Import Excel</Button>
          <Button size="small" icon={<UploadOutlined />} onClick={() => fileInputRef.current?.click()}>Import JSON</Button>
          <Button size="small" icon={<CopyOutlined />} onClick={() => void copyJson()}>Copy</Button>
          <Button type="primary" size="small" icon={<DownloadOutlined />} onClick={() => void exportJson()}>Download</Button>
          <Button size="small" danger onClick={resetForm}>Reset</Button>
          <Button
            size="small"
            type={showLeftNav ? 'primary' : 'default'}
            icon={showLeftNav ? <MenuFoldOutlined /> : <MenuUnfoldOutlined />}
            onClick={() => setShowLeftNav((value) => !value)}
            title="Hiện/ẩn điều hướng"
          />
          <Button
            size="small"
            type={showPreviewPanel ? 'primary' : 'default'}
            icon={showPreviewPanel ? <MenuFoldOutlined /> : <MenuUnfoldOutlined />}
            onClick={() => setShowPreviewPanel((value) => !value)}
            title="Hiện/ẩn preview JSON"
          />
          <Button
            size="small"
            type={twoColumnMode ? 'primary' : 'default'}
            icon={<ColumnWidthOutlined />}
            onClick={() => setTwoColumnMode((value) => !value)}
            title="Bật/tắt 2 cột"
          />
          <Button
            size="small"
            type={showFieldHelp ? 'default' : 'primary'}
            icon={showFieldHelp ? <EyeInvisibleOutlined /> : <EyeOutlined />}
            onClick={() => setShowFieldHelp((value) => !value)}
            title="Bật/tắt mô tả field"
          />
        </Space>
      </Header>

      <FieldUiContext.Provider value={{ showFieldHelp }}>
      <Layout>
        {showLeftNav && <Sider width={320} className="left-nav" theme="light">
          <Card size="small" title="Tìm field" className="search-card">
            <Input
              prefix={<SearchOutlined />}
              placeholder="Tìm theo path / tên tiếng Việt"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
            />
            {filteredMeta.length > 0 && (
              <List
                size="small"
                className="search-results"
                dataSource={filteredMeta}
                renderItem={(item) => (
                  <List.Item className="search-item" onClick={() => scrollToField(item.path)}>
                    <div>
                      <Text strong>{item.key}</Text>
                      <Text> - {item.viLabel}</Text>
                      <div>
                        <Text type="secondary">{item.path}</Text>
                      </div>
                    </div>
                  </List.Item>
                )}
              />
            )}
          </Card>

          <Card size="small" title="Điều hướng section" className="section-card">
            <List
              size="small"
              dataSource={sections}
              renderItem={(section) => {
                const completion = sectionCompletion[section.id]
                return (
                  <List.Item
                    className="section-item"
                    onClick={() => document.getElementById(`section-${section.id}`)?.scrollIntoView({ behavior: 'smooth' })}
                  >
                    <div className="section-item-content">
                      <Text strong>{section.title}</Text>
                      <Text type="secondary">{section.description}</Text>
                      {completion?.total ? (
                        <Text>
                          {completion.completed}/{completion.total} bắt buộc
                        </Text>
                      ) : (
                        <Text type="secondary">Không có field bắt buộc riêng</Text>
                      )}
                    </div>
                    {completion?.hasError ? <Badge status="error" text="Lỗi" /> : <Badge status="success" text="OK" />}
                  </List.Item>
                )
              }}
            />
          </Card>

          <Card size="small" title="Trạng thái" className="status-card">
            <Space direction="vertical">
              <Tag color={validationItems.length === 0 ? 'green' : 'red'}>
                {validationItems.length === 0 ? 'Valid' : `Invalid (${validationItems.length} lỗi)`}
              </Tag>
              <Text>{hasUnsavedChanges ? 'Có thay đổi chưa xuất' : 'Đã đồng bộ với bản xuất gần nhất'}</Text>
            </Space>
          </Card>
        </Sider>}
        
        <Modal
          title="Kết quả Import Excel (Sheet: Master_Events)"
          open={showExcelModal}
          onCancel={() => setShowExcelModal(false)}
          width={900}
          footer={[
            <Button key="close" onClick={() => setShowExcelModal(false)}>Đóng</Button>,
            <Button 
              key="export" 
              type="primary" 
              icon={<DownloadOutlined />} 
              onClick={exportExcelToJsonZip}
              disabled={!excelImportResult || excelImportResult.validEvents.length === 0}
            >
              Export JSON (ZIP folders)
            </Button>
          ]}
        >
          {excelImportResult && (
            <Space direction="vertical" style={{ width: '100%' }} size="large">
              <div style={{ display: 'flex', gap: '20px' }}>
                <Card size="small" style={{ flex: 1 }}>
                  <Space>
                    <CheckCircleOutlined style={{ color: '#52c41a', fontSize: '24px' }} />
                    <div>
                      <div style={{ fontSize: '12px', color: '#8c8c8c' }}>Hợp lệ</div>
                      <div style={{ fontSize: '20px', fontWeight: 'bold' }}>{excelImportResult.validEvents.length} rows</div>
                    </div>
                  </Space>
                </Card>
                <Card size="small" style={{ flex: 1 }}>
                  <Space>
                    <ExclamationCircleOutlined style={{ color: '#ff4d4f', fontSize: '24px' }} />
                    <div>
                      <div style={{ fontSize: '12px', color: '#8c8c8c' }}>Bị bỏ qua / Lỗi</div>
                      <div style={{ fontSize: '20px', fontWeight: 'bold' }}>{excelImportResult.skippedRows.length} rows</div>
                    </div>
                  </Space>
                </Card>
              </div>

              {excelImportResult.skippedRows.length > 0 && (
                <Collapse ghost>
                  <Collapse.Panel header={`Chi tiết lỗi (${excelImportResult.skippedRows.length} dòng)`} key="errors">
                    <Table 
                      size="small" 
                      dataSource={excelImportResult.skippedRows} 
                      pagination={{ pageSize: 5 }}
                      columns={[
                        { title: 'Dòng', dataIndex: 'row', key: 'row', width: 80 },
                        { title: 'ID', dataIndex: 'id', key: 'id', width: 200 },
                        { title: 'Lý do', dataIndex: 'reason', key: 'reason' },
                      ]}
                    />
                  </Collapse.Panel>
                </Collapse>
              )}

              <div>
                <Text strong>Xem trước JSON mẫu (Dòng đầu tiên):</Text>
                <pre style={{ 
                  background: '#f5f5f5', 
                  padding: '10px', 
                  borderRadius: '4px', 
                  maxHeight: '200px', 
                  overflow: 'auto',
                  marginTop: '8px',
                  fontSize: '12px'
                }}>
                  {JSON.stringify(excelImportResult.validEvents[0], null, 2)}
                </pre>
              </div>

              <Alert 
                type="info" 
                showIcon 
                message="Quy trình xuất" 
                description="Khi nhấn Export, app sẽ tạo 1 file ZIP chứa 3 thư mục json10, json11, json12. Các sự kiện sẽ được phân loại vào đúng thư mục dựa trên trường coverage.grades."
              />
            </Space>
          )}
        </Modal>

        <Content className="main-content">
          <Layout className="editor-layout" style={{ marginRight: showPreviewPanel ? 520 : 0 }}>
            <Content className="form-content">
              {validationItems.length > 0 && (
                <Alert
                  type="error"
                  showIcon
                  message="Có lỗi kiểm tra dữ liệu"
                  description={
                    <List
                      size="small"
                      dataSource={validationItems.slice(0, 20)}
                      renderItem={(item) => (
                        <List.Item onClick={() => scrollToField(item.path)} className="error-item">
                          <Text strong>{item.path}</Text>
                          <Text type="danger">{item.message}</Text>
                        </List.Item>
                      )}
                    />
                  }
                />
              )}

              <Form
                layout="vertical"
                className={`event-form ${twoColumnMode ? 'form-two-cols' : ''}`}
                onFinish={handleSubmit(() => void exportJson())}
              >
                <Collapse defaultActiveKey={['basic-info', 'titles', 'classification', 'chronology', 'textbook-content']} ghost>
                  <Collapse.Panel header="1. Thông tin cơ bản" key="basic-info" id="section-basic-info">
                    <Controller
                      control={control}
                      name="id"
                      render={({ field, fieldState }) => (
                        <Form.Item label={<FieldHeader path="id" />} validateStatus={fieldState.error ? 'error' : ''} help={fieldState.error?.message}>
                          <Input {...field} placeholder="Ví dụ: bach-dang-938" />
                        </Form.Item>
                      )}
                    />

                    <Controller
                      control={control}
                      name="slug"
                      render={({ field, fieldState }) => (
                        <Form.Item label={<FieldHeader path="slug" />} validateStatus={fieldState.error ? 'error' : ''} help={fieldState.error?.message}>
                          <Input
                            {...field}
                            placeholder="Ví dụ: tran-bach-dang-938"
                            onChange={(event) => {
                              setSlugManuallyEdited(true)
                              field.onChange(event.target.value)
                            }}
                          />
                        </Form.Item>
                      )}
                    />

                    <Controller
                      control={control}
                      name="entityType"
                      render={({ field, fieldState }) => (
                        <Form.Item label={<FieldHeader path="entityType" />} validateStatus={fieldState.error ? 'error' : ''} help={fieldState.error?.message}>
                          <Select
                            value={field.value}
                            options={[
                              { value: 'event', label: 'event' },
                              { value: 'figure', label: 'figure' },
                              { value: 'dynasty', label: 'dynasty' },
                            ]}
                            onChange={(value) => field.onChange(value)}
                          />
                        </Form.Item>
                      )}
                    />

                    <Controller
                      control={control}
                      name="eventLevel"
                      render={({ field, fieldState }) => (
                        <Form.Item label={<FieldHeader path="eventLevel" />} validateStatus={fieldState.error ? 'error' : ''} help={fieldState.error?.message}>
                          <Select
                            value={field.value}
                            options={[
                              { value: 'atomic', label: 'atomic' },
                              { value: 'collection', label: 'collection' },
                            ]}
                            onChange={(value) => field.onChange(value)}
                          />
                        </Form.Item>
                      )}
                    />
                  </Collapse.Panel>

                  <Collapse.Panel header="2. Tiêu đề" key="titles" id="section-titles">
                    <Controller
                      control={control}
                      name="titles.primary"
                      render={({ field, fieldState }) => (
                        <Form.Item
                          label={<FieldHeader path="titles.primary" />}
                          validateStatus={fieldState.error ? 'error' : ''}
                          help={fieldState.error?.message}
                        >
                          <Input {...field} placeholder="Ví dụ: Trận Bạch Đằng năm 938" />
                        </Form.Item>
                      )}
                    />

                    <Controller
                      control={control}
                      name="titles.short"
                      render={({ field, fieldState }) => (
                        <Form.Item label={<FieldHeader path="titles.short" />} validateStatus={fieldState.error ? 'error' : ''} help={fieldState.error?.message}>
                          <Input {...field} placeholder="Ví dụ: Bạch Đằng 938" />
                        </Form.Item>
                      )}
                    />

                    <PrimitiveArrayField
                      control={control}
                      getValues={getValues}
                      name="titles.alternatives"
                      help="Tên gọi khác của sự kiện để hỗ trợ tìm kiếm và mapping dữ liệu"
                      placeholder="Nhập tên thay thế"
                    />
                  </Collapse.Panel>

                  <Collapse.Panel header="3. Phân loại" key="classification" id="section-classification">
                    <Controller
                      control={control}
                      name="classification.eventType"
                      render={({ field, fieldState }) => (
                        <Form.Item
                          label={<FieldHeader path="classification.eventType" />}
                          validateStatus={fieldState.error ? 'error' : ''}
                          help={fieldState.error?.message}
                        >
                          <Select
                            value={field.value}
                            options={eventTypeOptions.map((value) => ({ value, label: value }))}
                            onChange={(value) => field.onChange(value)}
                          />
                        </Form.Item>
                      )}
                    />

                    <Controller
                      control={control}
                      name="classification.eventSubtype"
                      render={({ field, fieldState }) => (
                        <Form.Item
                          label={<FieldHeader path="classification.eventSubtype" />}
                          validateStatus={fieldState.error ? 'error' : ''}
                          help={fieldState.error?.message}
                        >
                          <Select
                            value={field.value}
                            options={eventSubtypeOptions.map((value) => ({ value, label: value }))}
                            onChange={(value) => field.onChange(value)}
                          />
                        </Form.Item>
                      )}
                    />

                    <PrimitiveArrayField
                      control={control}
                      getValues={getValues}
                      name="classification.tags"
                      help="Từ khóa dùng cho tìm kiếm và filter"
                      placeholder="Ví dụ: Ngô Quyền"
                    />
                  </Collapse.Panel>

                  <Collapse.Panel header="4. Coverage" key="coverage" id="section-coverage">
                    <PrimitiveArrayField
                      control={control}
                      getValues={getValues}
                      name="coverage.grades"
                      help="Sự kiện được nhắc trong SGK lớp nào"
                      placeholder="Ví dụ: 10"
                      type="number"
                    />
                  </Collapse.Panel>

                  <Collapse.Panel header="5. Thời gian" key="chronology" id="section-chronology">
                    <Divider>Mốc bắt đầu</Divider>
                    <Controller
                      control={control}
                      name="chronology.start.year"
                      render={({ field, fieldState }) => (
                        <Form.Item
                          label={<FieldHeader path="chronology.start.year" />}
                          validateStatus={fieldState.error ? 'error' : ''}
                          help={fieldState.error?.message}
                        >
                          <InputNumber value={field.value} onChange={(value) => field.onChange(value ?? null)} placeholder="938" />
                        </Form.Item>
                      )}
                    />
                    <Controller
                      control={control}
                      name="chronology.start.month"
                      render={({ field }) => (
                        <Form.Item label={<FieldHeader path="chronology.start.month" />}>
                          <InputNumber value={field.value} onChange={(value) => field.onChange(value ?? null)} placeholder="3" />
                        </Form.Item>
                      )}
                    />
                    <Controller
                      control={control}
                      name="chronology.start.day"
                      render={({ field }) => (
                        <Form.Item label={<FieldHeader path="chronology.start.day" />}>
                          <InputNumber value={field.value} onChange={(value) => field.onChange(value ?? null)} placeholder="13" />
                        </Form.Item>
                      )}
                    />

                    <Divider>Mốc kết thúc</Divider>
                    <Controller
                      control={control}
                      name="chronology.end.year"
                      render={({ field }) => (
                        <Form.Item label={<FieldHeader path="chronology.end.year" />}>
                          <InputNumber value={field.value} onChange={(value) => field.onChange(value ?? null)} placeholder="938" />
                        </Form.Item>
                      )}
                    />
                    <Controller
                      control={control}
                      name="chronology.end.month"
                      render={({ field }) => (
                        <Form.Item label={<FieldHeader path="chronology.end.month" />}>
                          <InputNumber value={field.value} onChange={(value) => field.onChange(value ?? null)} placeholder="5" />
                        </Form.Item>
                      )}
                    />
                    <Controller
                      control={control}
                      name="chronology.end.day"
                      render={({ field }) => (
                        <Form.Item label={<FieldHeader path="chronology.end.day" />}>
                          <InputNumber value={field.value} onChange={(value) => field.onChange(value ?? null)} placeholder="7" />
                        </Form.Item>
                      )}
                    />

                    <Controller
                      control={control}
                      name="chronology.datePrecision"
                      render={({ field, fieldState }) => (
                        <Form.Item
                          label={<FieldHeader path="chronology.datePrecision" />}
                          validateStatus={fieldState.error ? 'error' : ''}
                          help={fieldState.error?.message}
                        >
                          <Select
                            value={field.value}
                            options={datePrecisionOptions.map((value) => ({ value, label: value }))}
                            onChange={(value) => field.onChange(value)}
                          />
                        </Form.Item>
                      )}
                    />

                    <Controller
                      control={control}
                      name="chronology.displayDate"
                      render={({ field, fieldState }) => (
                        <Form.Item
                          label={<FieldHeader path="chronology.displayDate" />}
                          validateStatus={fieldState.error ? 'error' : ''}
                          help={fieldState.error?.message}
                        >
                          <Input {...field} placeholder="Ví dụ: Năm 938" />
                        </Form.Item>
                      )}
                    />

                    <Controller
                      control={control}
                      name="chronology.isApproximate"
                      render={({ field }) => (
                        <Form.Item label={<FieldHeader path="chronology.isApproximate" />}>
                          <Switch checked={field.value} onChange={field.onChange} />
                        </Form.Item>
                      )}
                    />
                  </Collapse.Panel>

                  <Collapse.Panel header="6. Dữ liệu bản đồ" key="map-data" id="section-map-data">
                    <Controller
                      control={control}
                      name="mapData.displayGeometry.geoType"
                      render={({ field, fieldState }) => (
                        <Form.Item
                          label={<FieldHeader path="mapData.displayGeometry.geoType" />}
                          validateStatus={fieldState.error ? 'error' : ''}
                          help={fieldState.error?.message}
                        >
                          <Select
                            value={field.value}
                            options={geoTypeOptions.map((value) => ({ value, label: value }))}
                            onChange={(value) => field.onChange(value)}
                          />
                        </Form.Item>
                      )}
                    />

                    <Divider>Marker chính</Divider>
                    <Controller
                      control={control}
                      name="mapData.displayGeometry.marker.lat"
                      render={({ field }) => (
                        <Form.Item label="lat - Vĩ độ (tọa độ chính)">
                          <InputNumber value={field.value} onChange={(value) => field.onChange(value ?? null)} placeholder="20.95" />
                        </Form.Item>
                      )}
                    />
                    <Controller
                      control={control}
                      name="mapData.displayGeometry.marker.lng"
                      render={({ field }) => (
                        <Form.Item label="lng - Kinh độ (tọa độ chính)">
                          <InputNumber value={field.value} onChange={(value) => field.onChange(value ?? null)} placeholder="106.82" />
                        </Form.Item>
                      )}
                    />
                    <Controller
                      control={control}
                      name="mapData.displayGeometry.marker.label"
                      render={({ field }) => (
                        <Form.Item label="label - Nhãn marker chính">
                          <Input {...field} placeholder="Ví dụ: Sông Bạch Đằng" />
                        </Form.Item>
                      )}
                    />

                    <Card
                      size="small"
                      title="markers - Danh sách marker phụ (nhiều điểm)"
                      extra={
                        <Button
                          type="dashed"
                          icon={<PlusOutlined />}
                          onClick={() => markersArray.append({ lat: null, lng: null, label: '' })}
                        >
                          Thêm marker
                        </Button>
                      }
                    >
                      <Space direction="vertical" style={{ width: '100%' }}>
                        {markersArray.fields.map((fieldItem, index) => (
                          <Card
                            key={fieldItem.id}
                            size="small"
                            title={`marker[${index}]`}
                            extra={
                              <Space>
                                <Button icon={<ArrowUpOutlined />} onClick={() => index > 0 && markersArray.move(index, index - 1)} />
                                <Button
                                  icon={<ArrowDownOutlined />}
                                  onClick={() => index < markersArray.fields.length - 1 && markersArray.move(index, index + 1)}
                                />
                                <Button
                                  icon={<CopyOutlined />}
                                  onClick={() => {
                                    const current = getValues(`mapData.displayGeometry.markers.${index}`)
                                    markersArray.insert(index + 1, current)
                                  }}
                                />
                                <Button danger icon={<DeleteOutlined />} onClick={() => markersArray.remove(index)} />
                              </Space>
                            }
                          >
                            <Controller
                              control={control}
                              name={`mapData.displayGeometry.markers.${index}.lat`}
                              render={({ field }) => <InputNumber value={field.value} onChange={(value) => field.onChange(value ?? null)} placeholder="lat" />}
                            />
                            <Controller
                              control={control}
                              name={`mapData.displayGeometry.markers.${index}.lng`}
                              render={({ field }) => <InputNumber value={field.value} onChange={(value) => field.onChange(value ?? null)} placeholder="lng" />}
                            />
                            <Controller
                              control={control}
                              name={`mapData.displayGeometry.markers.${index}.label`}
                              render={({ field }) => <Input {...field} placeholder="label" style={{ marginTop: 8 }} />}
                            />
                          </Card>
                        ))}
                      </Space>
                    </Card>

                    <PrimitiveArrayField
                      control={control}
                      getValues={getValues}
                      name="mapData.displayGeometry.provinceNames"
                      help="Tên tỉnh/thành hiện đại"
                      placeholder="Ví dụ: Hải Phòng"
                    />
                    <PrimitiveArrayField
                      control={control}
                      getValues={getValues}
                      name="mapData.displayGeometry.gadmRefs"
                      help="Mã GADM tương ứng"
                      placeholder="Ví dụ: VNM.20_1"
                    />
                    <PrimitiveArrayField
                      control={control}
                      getValues={getValues}
                      name="mapData.displayGeometry.historicalLocations"
                      help="Địa danh lịch sử theo SGK"
                      placeholder="Ví dụ: Sông Bạch Đằng"
                    />

                    <Divider>Focus geometry</Divider>
                    <Controller
                      control={control}
                      name="mapData.focusGeometry.mode"
                      render={({ field }) => (
                        <Form.Item label="mode - Chế độ focus camera">
                          <Select
                            value={field.value}
                            options={focusModeOptions.map((value) => ({ value, label: value }))}
                            onChange={(value) => field.onChange(value)}
                          />
                        </Form.Item>
                      )}
                    />
                    <Controller
                      control={control}
                      name="mapData.focusGeometry.center.lat"
                      render={({ field }) => (
                        <Form.Item label="center.lat - Vĩ độ tâm camera">
                          <InputNumber value={field.value} onChange={(value) => field.onChange(value ?? null)} />
                        </Form.Item>
                      )}
                    />
                    <Controller
                      control={control}
                      name="mapData.focusGeometry.center.lng"
                      render={({ field }) => (
                        <Form.Item label="center.lng - Kinh độ tâm camera">
                          <InputNumber value={field.value} onChange={(value) => field.onChange(value ?? null)} />
                        </Form.Item>
                      )}
                    />
                    <Controller
                      control={control}
                      name="mapData.focusGeometry.zoom"
                      render={({ field }) => (
                        <Form.Item label="zoom - Mức zoom khi focus">
                          <InputNumber value={field.value} onChange={(value) => field.onChange(value ?? null)} />
                        </Form.Item>
                      )}
                    />
                    <PrimitiveArrayField
                      control={control}
                      getValues={getValues}
                      name="mapData.focusGeometry.provinceNames"
                      help="Tỉnh/thành để fit camera"
                      placeholder="Nhập tên tỉnh"
                    />
                    <PrimitiveArrayField
                      control={control}
                      getValues={getValues}
                      name="mapData.focusGeometry.gadmRefs"
                      help="Mã GADM để fit camera"
                      placeholder="Nhập mã GADM"
                    />
                  </Collapse.Panel>

                  <Collapse.Panel header="7. Tóm tắt" key="summary" id="section-summary">
                    <Controller
                      control={control}
                      name="summary.homepageTitle"
                      render={({ field }) => (
                        <Form.Item label="homepageTitle - Tiêu đề trang chủ">
                          <Input {...field} />
                        </Form.Item>
                      )}
                    />
                    <Controller
                      control={control}
                      name="summary.homepageSummary"
                      render={({ field, fieldState }) => (
                        <Form.Item
                          label={<FieldHeader path="summary.homepageSummary" />}
                          validateStatus={fieldState.error ? 'error' : ''}
                          help={fieldState.error?.message}
                        >
                          <Input.TextArea {...field} rows={3} />
                        </Form.Item>
                      )}
                    />
                    <Controller
                      control={control}
                      name="summary.cardSummary"
                      render={({ field }) => (
                        <Form.Item label="cardSummary - Tóm tắt cho card/list">
                          <Input.TextArea {...field} rows={2} />
                        </Form.Item>
                      )}
                    />
                  </Collapse.Panel>

                  <Collapse.Panel header="8. Nội dung SGK" key="textbook-content" id="section-textbook-content">
                    <Controller
                      control={control}
                      name="textbookContent.canonicalSummary"
                      render={({ field, fieldState }) => (
                        <Form.Item
                          label={<FieldHeader path="textbookContent.canonicalSummary" />}
                          validateStatus={fieldState.error ? 'error' : ''}
                          help={fieldState.error?.message}
                        >
                          <Input.TextArea {...field} rows={4} />
                        </Form.Item>
                      )}
                    />
                    <Controller
                      control={control}
                      name="textbookContent.detailedNarrative"
                      render={({ field }) => (
                        <Form.Item label="detailedNarrative - Tường thuật chi tiết theo SGK">
                          <Input.TextArea {...field} rows={4} />
                        </Form.Item>
                      )}
                    />
                    <Controller
                      control={control}
                      name="textbookContent.significance"
                      render={({ field, fieldState }) => (
                        <Form.Item
                          label={<FieldHeader path="textbookContent.significance" />}
                          validateStatus={fieldState.error ? 'error' : ''}
                          help={fieldState.error?.message}
                        >
                          <Input.TextArea {...field} rows={4} />
                        </Form.Item>
                      )}
                    />

                    <PrimitiveArrayField
                      control={control}
                      getValues={getValues}
                      name="textbookContent.keyFacts"
                      help="Các ý chính cần nhớ"
                      placeholder="Nhập ý chính"
                    />

                    <Card
                      size="small"
                      title={<FieldHeader path="textbookContent.textbookRefs" forceRequired />}
                      extra={
                        <Button
                          type="dashed"
                          icon={<PlusOutlined />}
                          onClick={() =>
                            textbookRefsArray.append({
                              grade: null,
                              book: '',
                              theme: '',
                              lesson: '',
                              pageStart: null,
                              pageEnd: null,
                              excerpt: '',
                            })
                          }
                        >
                          Thêm nguồn SGK
                        </Button>
                      }
                    >
                      <Space direction="vertical" style={{ width: '100%' }}>
                        {textbookRefsArray.fields.map((fieldItem, index) => (
                          <Card
                            size="small"
                            key={fieldItem.id}
                            title={`textbookRefs[${index}]`}
                            extra={
                              <Space>
                                <Button icon={<ArrowUpOutlined />} onClick={() => index > 0 && textbookRefsArray.move(index, index - 1)} />
                                <Button
                                  icon={<ArrowDownOutlined />}
                                  onClick={() => index < textbookRefsArray.fields.length - 1 && textbookRefsArray.move(index, index + 1)}
                                />
                                <Button
                                  icon={<CopyOutlined />}
                                  onClick={() => {
                                    const current = getValues(`textbookContent.textbookRefs.${index}`)
                                    textbookRefsArray.insert(index + 1, current)
                                  }}
                                />
                                <Button danger icon={<DeleteOutlined />} onClick={() => textbookRefsArray.remove(index)} />
                              </Space>
                            }
                          >
                            <Controller
                              control={control}
                              name={`textbookContent.textbookRefs.${index}.grade`}
                              render={({ field }) => <InputNumber value={field.value} onChange={(value) => field.onChange(value ?? null)} placeholder="grade" />}
                            />
                            <Controller
                              control={control}
                              name={`textbookContent.textbookRefs.${index}.book`}
                              render={({ field }) => <Input {...field} placeholder="book" style={{ marginTop: 8 }} />}
                            />
                            <Controller
                              control={control}
                              name={`textbookContent.textbookRefs.${index}.theme`}
                              render={({ field }) => <Input {...field} placeholder="theme" style={{ marginTop: 8 }} />}
                            />
                            <Controller
                              control={control}
                              name={`textbookContent.textbookRefs.${index}.lesson`}
                              render={({ field }) => <Input {...field} placeholder="lesson" style={{ marginTop: 8 }} />}
                            />
                            <Controller
                              control={control}
                              name={`textbookContent.textbookRefs.${index}.pageStart`}
                              render={({ field }) => (
                                <InputNumber
                                  value={field.value}
                                  onChange={(value) => field.onChange(value ?? null)}
                                  placeholder="pageStart"
                                  style={{ marginTop: 8 }}
                                />
                              )}
                            />
                            <Controller
                              control={control}
                              name={`textbookContent.textbookRefs.${index}.pageEnd`}
                              render={({ field }) => (
                                <InputNumber
                                  value={field.value}
                                  onChange={(value) => field.onChange(value ?? null)}
                                  placeholder="pageEnd"
                                  style={{ marginTop: 8 }}
                                />
                              )}
                            />
                            <Controller
                              control={control}
                              name={`textbookContent.textbookRefs.${index}.excerpt`}
                              render={({ field }) => <Input.TextArea {...field} placeholder="excerpt" rows={2} style={{ marginTop: 8 }} />}
                            />
                          </Card>
                        ))}
                      </Space>
                    </Card>
                  </Collapse.Panel>

                  <Collapse.Panel header="9. Nguồn bổ sung" key="external-content" id="section-external-content">
                    <Controller
                      control={control}
                      name="externalContent.wikipedia.title"
                      render={({ field }) => (
                        <Form.Item label="title - Tiêu đề Wikipedia">
                          <Input {...field} />
                        </Form.Item>
                      )}
                    />
                    <Controller
                      control={control}
                      name="externalContent.wikipedia.url"
                      render={({ field, fieldState }) => (
                        <Form.Item label="url - Link Wikipedia" validateStatus={fieldState.error ? 'error' : ''} help={fieldState.error?.message}>
                          <Input {...field} placeholder="https://..." />
                        </Form.Item>
                      )}
                    />
                    <Controller
                      control={control}
                      name="externalContent.wikipedia.summary"
                      render={({ field }) => (
                        <Form.Item label="summary - Tóm tắt Wikipedia">
                          <Input.TextArea {...field} rows={3} />
                        </Form.Item>
                      )}
                    />
                    <Controller
                      control={control}
                      name="externalContent.wikipedia.content"
                      render={({ field }) => (
                        <Form.Item label="content - Nội dung chi tiết Wikipedia">
                          <Input.TextArea {...field} rows={4} />
                        </Form.Item>
                      )}
                    />
                    <Controller
                      control={control}
                      name="externalContent.wikidata.id"
                      render={({ field }) => (
                        <Form.Item label="id - Mã Wikidata">
                          <Input {...field} />
                        </Form.Item>
                      )}
                    />
                    <Controller
                      control={control}
                      name="externalContent.wikidata.url"
                      render={({ field, fieldState }) => (
                        <Form.Item label="url - Link Wikidata" validateStatus={fieldState.error ? 'error' : ''} help={fieldState.error?.message}>
                          <Input {...field} />
                        </Form.Item>
                      )}
                    />
                    <PrimitiveArrayField
                      control={control}
                      getValues={getValues}
                      name="externalContent.otherSources"
                      help="Danh sách nguồn bổ sung khác"
                      placeholder="https://..."
                    />
                  </Collapse.Panel>

                  <Collapse.Panel header="10. Media" key="media" id="section-media">
                    <Controller
                      control={control}
                      name="media.thumbnail"
                      render={({ field, fieldState }) => (
                        <Form.Item label="thumbnail - Ảnh đại diện" validateStatus={fieldState.error ? 'error' : ''} help={fieldState.error?.message}>
                          <Input {...field} placeholder="https://..." />
                        </Form.Item>
                      )}
                    />

                    <Card
                      size="small"
                      title="items - Danh sách media"
                      extra={
                        <Button
                          type="dashed"
                          icon={<PlusOutlined />}
                          onClick={() =>
                            mediaItemsArray.append({
                              id: '',
                              type: 'image',
                              category: '',
                              role: '',
                              url: '',
                              caption: '',
                              alt: '',
                              source: '',
                              license: '',
                              credit: '',
                              isPrimary: false,
                            })
                          }
                        >
                          Thêm media
                        </Button>
                      }
                    >
                      <Space direction="vertical" style={{ width: '100%' }}>
                        {mediaItemsArray.fields.map((fieldItem, index) => (
                          <Card
                            size="small"
                            key={fieldItem.id}
                            title={`media.items[${index}]`}
                            extra={
                              <Space>
                                <Button icon={<ArrowUpOutlined />} onClick={() => index > 0 && mediaItemsArray.move(index, index - 1)} />
                                <Button icon={<ArrowDownOutlined />} onClick={() => index < mediaItemsArray.fields.length - 1 && mediaItemsArray.move(index, index + 1)} />
                                <Button
                                  icon={<CopyOutlined />}
                                  onClick={() => {
                                    const current = getValues(`media.items.${index}`)
                                    mediaItemsArray.insert(index + 1, current)
                                  }}
                                />
                                <Button danger icon={<DeleteOutlined />} onClick={() => mediaItemsArray.remove(index)} />
                              </Space>
                            }
                          >
                            <Controller control={control} name={`media.items.${index}.id`} render={({ field }) => <Input {...field} placeholder="id" />} />
                            <Controller
                              control={control}
                              name={`media.items.${index}.type`}
                              render={({ field }) => (
                                <Select
                                  value={field.value}
                                  options={mediaTypeOptions.map((value) => ({ value, label: value }))}
                                  onChange={(value) => field.onChange(value)}
                                  style={{ marginTop: 8 }}
                                />
                              )}
                            />
                            <Controller
                              control={control}
                              name={`media.items.${index}.category`}
                              render={({ field }) => (
                                <Select
                                  value={field.value}
                                  options={mediaCategoryOptions.map((value) => ({ value, label: value }))}
                                  onChange={(value) => field.onChange(value)}
                                  style={{ marginTop: 8 }}
                                />
                              )}
                            />
                            <Controller
                              control={control}
                              name={`media.items.${index}.role`}
                              render={({ field }) => (
                                <Select
                                  value={field.value}
                                  options={mediaRoleOptions.map((value) => ({ value, label: value }))}
                                  onChange={(value) => field.onChange(value)}
                                  style={{ marginTop: 8 }}
                                />
                              )}
                            />
                            <Controller control={control} name={`media.items.${index}.url`} render={({ field }) => <Input {...field} placeholder="url" style={{ marginTop: 8 }} />} />
                            <Controller
                              control={control}
                              name={`media.items.${index}.caption`}
                              render={({ field }) => <Input {...field} placeholder="caption" style={{ marginTop: 8 }} />}
                            />
                            <Controller control={control} name={`media.items.${index}.alt`} render={({ field }) => <Input {...field} placeholder="alt" style={{ marginTop: 8 }} />} />
                            <Controller
                              control={control}
                              name={`media.items.${index}.source`}
                              render={({ field }) => <Input {...field} placeholder="source" style={{ marginTop: 8 }} />}
                            />
                            <Controller
                              control={control}
                              name={`media.items.${index}.license`}
                              render={({ field }) => <Input {...field} placeholder="license" style={{ marginTop: 8 }} />}
                            />
                            <Controller
                              control={control}
                              name={`media.items.${index}.credit`}
                              render={({ field }) => <Input {...field} placeholder="credit" style={{ marginTop: 8 }} />}
                            />
                            <Controller
                              control={control}
                              name={`media.items.${index}.isPrimary`}
                              render={({ field }) => (
                                <div className="switch-block">
                                  <Text>isPrimary - Media chính</Text>
                                  <div>
                                    <Switch checked={field.value} onChange={field.onChange} />
                                  </div>
                                </div>
                              )}
                            />
                          </Card>
                        ))}
                      </Space>
                    </Card>
                  </Collapse.Panel>

                  <Collapse.Panel header="11. Phân cấp" key="hierarchy" id="section-hierarchy">
                    <Controller
                      control={control}
                      name="hierarchy.rootId"
                      render={({ field, fieldState }) => (
                        <Form.Item label={<FieldHeader path="hierarchy.rootId" />} validateStatus={fieldState.error ? 'error' : ''} help={fieldState.error?.message}>
                          <Input {...field} />
                        </Form.Item>
                      )}
                    />
                    <Controller
                      control={control}
                      name="hierarchy.parentId"
                      render={({ field }) => (
                        <Form.Item label="parentId - ID cha (nếu có)">
                          <Input value={field.value ?? ''} onChange={(event) => field.onChange(event.target.value || null)} />
                        </Form.Item>
                      )}
                    />
                    <PrimitiveArrayField
                      control={control}
                      getValues={getValues}
                      name="hierarchy.childIds"
                      help="Danh sách ID sự kiện con"
                      placeholder="Nhập child id"
                    />
                    <Controller
                      control={control}
                      name="hierarchy.level"
                      render={({ field, fieldState }) => (
                        <Form.Item label={<FieldHeader path="hierarchy.level" />} validateStatus={fieldState.error ? 'error' : ''} help={fieldState.error?.message}>
                          <InputNumber value={field.value} onChange={(value) => field.onChange(value ?? 0)} />
                        </Form.Item>
                      )}
                    />
                    <Controller
                      control={control}
                      name="hierarchy.orderInParent"
                      render={({ field }) => (
                        <Form.Item label="orderInParent - Thứ tự trong nhóm cha">
                          <InputNumber value={field.value} onChange={(value) => field.onChange(value ?? 0)} />
                        </Form.Item>
                      )}
                    />
                  </Collapse.Panel>

                  <Collapse.Panel header="12. Liên kết" key="associations" id="section-associations">
                    <PrimitiveArrayField
                      control={control}
                      getValues={getValues}
                      name="associations.relatedEventIds"
                      help="ID các sự kiện liên quan"
                      placeholder="Nhập event id"
                    />
                    <PrimitiveArrayField
                      control={control}
                      getValues={getValues}
                      name="associations.relatedFigureIds"
                      help="ID các nhân vật liên quan"
                      placeholder="Nhập figure id"
                    />
                    <PrimitiveArrayField
                      control={control}
                      getValues={getValues}
                      name="associations.predecessorEventIds"
                      help="ID các sự kiện tiền nhiệm"
                      placeholder="Nhập predecessor id"
                    />
                    <PrimitiveArrayField
                      control={control}
                      getValues={getValues}
                      name="associations.successorEventIds"
                      help="ID các sự kiện kế tiếp"
                      placeholder="Nhập successor id"
                    />
                  </Collapse.Panel>

                  <Collapse.Panel header="13. Hiển thị" key="display" id="section-display">
                    <Controller
                      control={control}
                      name="display.showOnHomepage"
                      render={({ field }) => (
                        <Form.Item label={<FieldHeader path="display.showOnHomepage" />}>
                          <Switch checked={field.value} onChange={field.onChange} />
                        </Form.Item>
                      )}
                    />
                    <Controller
                      control={control}
                      name="display.showOnTimeline"
                      render={({ field }) => (
                        <Form.Item label={<FieldHeader path="display.showOnTimeline" />}>
                          <Switch checked={field.value} onChange={field.onChange} />
                        </Form.Item>
                      )}
                    />
                    <Controller
                      control={control}
                      name="display.featured"
                      render={({ field }) => (
                        <Form.Item label="featured - Đánh dấu nổi bật">
                          <Switch checked={field.value} onChange={field.onChange} />
                        </Form.Item>
                      )}
                    />
                  </Collapse.Panel>

                  <Collapse.Panel header="14. Chính sách nguồn" key="source-policy" id="section-source-policy">
                    <Controller
                      control={control}
                      name="sourcePolicy.canonicalSource"
                      render={({ field }) => (
                        <Form.Item label="canonicalSource - Nguồn chính thức">
                          <Select
                            value={field.value}
                            options={canonicalSourceOptions.map((value) => ({ value, label: value }))}
                            onChange={(value) => field.onChange(value)}
                          />
                        </Form.Item>
                      )}
                    />
                    <PrimitiveArrayField
                      control={control}
                      getValues={getValues}
                      name="sourcePolicy.supplementalSources"
                      help="Danh sách nguồn bổ sung"
                      placeholder="Ví dụ: wikipedia"
                    />
                  </Collapse.Panel>

                  {'curation' in (templateRef.current as Record<string, unknown>) && (
                    <Collapse.Panel header="15. Curation (tùy chọn)" key="curation" id="section-curation">
                      <Alert
                        type="info"
                        showIcon
                        message="Section curation được hiển thị vì có trong schema nguồn"
                        description="Bạn có thể mở rộng thêm field curation.status, curation.notes theo nhu cầu đội nhập liệu."
                      />
                    </Collapse.Panel>
                  )}
                </Collapse>

                <Divider />
                <Space>
                  <Button type="primary" htmlType="submit" icon={<DownloadOutlined />}>
                    Validate và Download
                  </Button>
                  <Button onClick={() => void trigger()}>Kiểm tra lỗi</Button>
                  <Button onClick={() => setPrettyJson((value) => !value)}>
                    Preview: {prettyJson ? 'Pretty' : 'Minified'}
                  </Button>
                </Space>
              </Form>
            </Content>

            {showPreviewPanel && <div className="preview-panel" style={{ width: 520 }}>
              <Card
                title="JSON Preview trực tiếp"
                extra={<Button size="small" onClick={() => setPrettyJson((value) => !value)}>{prettyJson ? 'Minified' : 'Pretty'}</Button>}
              >
                <pre className="json-preview">{jsonPreview}</pre>
              </Card>
            </div>}
          </Layout>
        </Content>
      </Layout>

      </FieldUiContext.Provider>
    </Layout>
  )
}

export default App
