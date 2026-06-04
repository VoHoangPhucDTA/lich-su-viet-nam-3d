import * as XLSX from 'xlsx'
import set from 'lodash-es/set'
import { isFilled } from './formUtils'

export interface ExcelImportResult {
  validEvents: any[]
  skippedRows: Array<{ row: number; id: string; reason: string }>
  totalRows: number
  headers: string[]
}

/**
 * Parses a flat object from Excel into a nested structure.
 * Handles paths like 'titles.primary' -> { titles: { primary: ... } }
 * Also handles basic array parsing.
 */
export function parseExcelRowToNested(row: Record<string, any>): any {
  const result: any = {}
  
  for (const [key, value] of Object.entries(row)) {
    if (value === null || value === undefined || value === '') continue
    
    // Clean string values
    let processedValue = value
    if (typeof value === 'string') {
      processedValue = value.trim()
      if (processedValue === '') continue
    }

    // Attempt to parse special types based on field paths
    processedValue = attemptParseSpecialTypes(key, processedValue)

    // Set nested value
    set(result, key, processedValue)
  }

  return result
}

function attemptParseSpecialTypes(path: string, value: any): any {
  // If it's already not a string, return as is
  if (typeof value !== 'string') return value

  // List of fields that SHOULD be arrays
  const arrayPaths = [
    'coverage.grades',
    'classification.tags',
    'textbookContent.keyFacts',
    'hierarchy.childIds',
    'associations.relatedEventIds',
    'associations.relatedFigureIds',
    'associations.predecessorEventIds',
    'associations.successorEventIds',
    'mapData.displayGeometry.provinceNames',
    'mapData.displayGeometry.gadmRefs',
    'mapData.displayGeometry.historicalLocations',
    'mapData.focusGeometry.provinceNames',
    'mapData.focusGeometry.gadmRefs',
    'titles.alternatives',
    'coverage.grades'
  ]

  // List of fields that SHOULD be numbers
  const numberPaths = [
    'chronology.start.year',
    'chronology.start.month',
    'chronology.start.day',
    'chronology.end.year',
    'chronology.end.month',
    'chronology.end.day',
    'mapData.displayGeometry.marker.lat',
    'mapData.displayGeometry.marker.lng',
    'mapData.focusGeometry.center.lat',
    'mapData.focusGeometry.center.lng',
    'mapData.focusGeometry.zoom',
    'hierarchy.level',
    'hierarchy.orderInParent'
  ]

  // List of fields that SHOULD be booleans
  const booleanPaths = [
    'chronology.isApproximate',
    'display.showOnHomepage',
    'display.showOnTimeline',
    'display.featured'
  ]

  // Handle Arrays
  if (arrayPaths.some(p => path.startsWith(p))) {
    // Try JSON parse first
    if (value.startsWith('[') && value.endsWith(']')) {
      try {
        return JSON.parse(value)
      } catch {
        // Fallback to split
      }
    }
    // Split by | or ,
    return value.split(/[|,]/).map(s => s.trim()).filter(s => s.length > 0).map(item => {
        // Try to convert to number if it looks like one (e.g. grades)
        if (/^\d+$/.test(item)) return parseInt(item, 10)
        return item
    })
  }

  // Handle Numbers
  if (numberPaths.some(p => path === p || path.startsWith(p))) {
    const parsed = parseFloat(value)
    return isNaN(parsed) ? value : parsed
  }

  // Handle Booleans
  if (booleanPaths.some(p => path === p)) {
    const lower = value.toLowerCase()
    if (lower === 'true' || lower === 'yes' || lower === '1' || value === true) return true
    if (lower === 'false' || lower === 'no' || lower === '0' || value === false) return false
    return value
  }

  // Special handling for media.items (JSON string expected)
  if (path.startsWith('media.items')) {
    try {
      return JSON.parse(value)
    } catch {
      return value
    }
  }

  return value
}

export async function processExcelFile(file: File): Promise<ExcelImportResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer)
        const workbook = XLSX.read(data, { type: 'array' })
        
        const sheetName = 'Master_Events'
        const worksheet = workbook.Sheets[sheetName]
        
        if (!worksheet) {
          throw new Error(`Không tìm thấy sheet "${sheetName}" trong file Excel.`)
        }

        const rawRows = XLSX.utils.sheet_to_json(worksheet) as Record<string, any>[]
        const result: ExcelImportResult = {
          validEvents: [],
          skippedRows: [],
          totalRows: rawRows.length,
          headers: []
        }

        if (rawRows.length > 0) {
          result.headers = Object.keys(rawRows[0])
        }

        rawRows.forEach((row, index) => {
          const rowIndex = index + 2 // 1-based + header
          const id = row['id']
          const title = row['titles.primary']
          const gradesRaw = row['coverage.grades']

          // Validation
          if (!isFilled(id)) {
            result.skippedRows.push({ row: rowIndex, id: 'N/A', reason: 'Thiếu id' })
            return
          }

          if (!isFilled(title)) {
            result.skippedRows.push({ row: rowIndex, id: String(id), reason: 'Thiếu titles.primary' })
            return
          }

          if (!isFilled(gradesRaw)) {
             result.skippedRows.push({ row: rowIndex, id: String(id), reason: 'Thiếu coverage.grades' })
             return
          }

          try {
            const nested = parseExcelRowToNested(row)
            
            // Final check on nested grades
            if (!Array.isArray(nested.coverage?.grades) || nested.coverage.grades.length === 0) {
                 result.skippedRows.push({ row: rowIndex, id: String(id), reason: 'coverage.grades không hợp lệ' })
                 return
            }

            result.validEvents.push(nested)
          } catch (err) {
            result.skippedRows.push({ row: rowIndex, id: String(id), reason: `Lỗi parse: ${(err as Error).message}` })
          }
        })

        resolve(result)
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = () => reject(new Error('Lỗi đọc file'))
    reader.readAsArrayBuffer(file)
  })
}
