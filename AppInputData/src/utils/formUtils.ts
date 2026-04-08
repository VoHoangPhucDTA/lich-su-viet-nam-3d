import cloneDeep from 'lodash-es/cloneDeep'
import get from 'lodash-es/get'

export function slugifyVietnamese(input: string): string {
  const base = input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim()
  return base
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

export function isFilled(value: unknown): boolean {
  if (typeof value === 'string') {
    return value.trim().length > 0
  }
  if (typeof value === 'number') {
    return Number.isFinite(value)
  }
  if (typeof value === 'boolean') {
    return true
  }
  if (Array.isArray(value)) {
    return value.length > 0
  }
  if (value && typeof value === 'object') {
    return Object.keys(value).length > 0
  }
  return value !== null && value !== undefined
}

export function deepMerge<T>(target: T, patch: unknown): T {
  if (Array.isArray(target)) {
    if (Array.isArray(patch)) {
      return patch as T
    }
    return cloneDeep(target)
  }

  if (target && typeof target === 'object') {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
      return cloneDeep(target)
    }
    const output: Record<string, unknown> = {}
    const targetObj = target as Record<string, unknown>
    const patchObj = patch as Record<string, unknown>
    for (const key of Object.keys(targetObj)) {
      output[key] = deepMerge(targetObj[key], patchObj[key])
    }
    return output as T
  }

  return (patch === undefined ? target : patch) as T
}

export function orderByTemplate(template: unknown, data: unknown): unknown {
  if (Array.isArray(template)) {
    if (!Array.isArray(data)) {
      return []
    }
    if (template.length === 0) {
      return data
    }
    return data.map((item) => orderByTemplate(template[0], item))
  }

  if (template && typeof template === 'object') {
    const ordered: Record<string, unknown> = {}
    const templateObj = template as Record<string, unknown>
    const dataObj = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>

    for (const key of Object.keys(templateObj)) {
      ordered[key] = orderByTemplate(templateObj[key], dataObj[key])
    }
    return ordered
  }

  return data ?? template
}

export function toFieldId(path: string): string {
  return `field-${path.replace(/[^a-zA-Z0-9]+/g, '-')}`
}

export function flattenErrors(errorObject: unknown, parent = ''): Array<{ path: string; message: string }> {
  if (!errorObject || typeof errorObject !== 'object') {
    return []
  }

  const result: Array<{ path: string; message: string }> = []
  const obj = errorObject as Record<string, unknown>

  for (const [key, value] of Object.entries(obj)) {
    if (!value) {
      continue
    }
    const nextPath = parent ? `${parent}.${key}` : key

    if (typeof value === 'object' && 'message' in (value as Record<string, unknown>)) {
      result.push({
        path: nextPath,
        message: String((value as Record<string, unknown>).message ?? 'Giá trị không hợp lệ'),
      })
    }

    if (typeof value === 'object') {
      result.push(...flattenErrors(value, nextPath))
    }
  }

  return result
}

export function getFieldCompletion(values: unknown, paths: string[]): { completed: number; total: number } {
  const total = paths.length
  if (total === 0) {
    return { completed: 0, total: 0 }
  }

  const completed = paths.filter((path) => isFilled(get(values, path))).length
  return { completed, total }
}

export function downloadJsonFile(fileName: string, content: string): void {
  const blob = new Blob([content], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
