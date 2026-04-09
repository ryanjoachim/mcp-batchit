import { hbs } from "./handlebarsInstance.js"

// ============================================================================
// String Helpers
// ============================================================================

hbs.registerHelper("uppercase", (str: string) => {
  if (typeof str !== "string") return ""
  return str.toUpperCase()
})

hbs.registerHelper("lowercase", (str: string) => {
  if (typeof str !== "string") return ""
  return str.toLowerCase()
})

hbs.registerHelper("capitalize", (str: string) => {
  if (typeof str !== "string") return ""
  if (str.length === 0) return ""
  return str.charAt(0).toUpperCase() + str.slice(1)
})

hbs.registerHelper("trim", (str: string) => {
  if (typeof str !== "string") return ""
  return str.trim()
})

hbs.registerHelper("substring", (str: string, start: number, end?: number) => {
  if (typeof str !== "string") return ""
  return str.substring(start, end)
})

hbs.registerHelper(
  "replace",
  (str: string, search: string, replacement: string) => {
    if (typeof str !== "string") return ""
    return str.split(search).join(replacement)
  }
)

hbs.registerHelper("concat", (...args: unknown[]) => {
  args.pop()
  return args.join("")
})

// ============================================================================
// Conditional Helpers
// ============================================================================

hbs.registerHelper("eq", (a: unknown, b: unknown) => a === b)

hbs.registerHelper("ne", (a: unknown, b: unknown) => a !== b)

hbs.registerHelper("lt", (a: number, b: number) => a < b)

hbs.registerHelper("lte", (a: number, b: number) => a <= b)

hbs.registerHelper("gt", (a: number, b: number) => a > b)

hbs.registerHelper("gte", (a: number, b: number) => a >= b)

hbs.registerHelper("and", (...args: unknown[]): boolean => {
  args.pop()
  return args.every(Boolean)
})

hbs.registerHelper("or", (...args: unknown[]): boolean => {
  args.pop()
  return args.some(Boolean)
})

hbs.registerHelper("not", (value: unknown): boolean => !value)

// ============================================================================
// Date/Time Helpers
// ============================================================================

hbs.registerHelper(
  "formatDate",
  (date: Date | string, format?: string): string => {
    const d = typeof date === "string" ? new Date(date) : date

    if (isNaN(d.getTime())) return ""

    if (!format || typeof format !== "string") {
      return d.toISOString()
    }

    const tokens: Record<string, string> = {
      YYYY: d.getFullYear().toString(),
      MM: String(d.getMonth() + 1).padStart(2, "0"),
      DD: String(d.getDate()).padStart(2, "0"),
      HH: String(d.getHours()).padStart(2, "0"),
      mm: String(d.getMinutes()).padStart(2, "0"),
      ss: String(d.getSeconds()).padStart(2, "0"),
    }

    return format.replace(
      /YYYY|MM|DD|HH|mm|ss/g,
      (match) => tokens[match] ?? match
    )
  }
)

hbs.registerHelper("timeAgo", (date: Date | string): string => {
  const d = typeof date === "string" ? new Date(date) : date

  if (isNaN(d.getTime())) return ""

  const seconds = Math.floor((Date.now() - d.getTime()) / 1000)

  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  if (seconds < 2592000) return `${Math.floor(seconds / 86400)}d ago`
  if (seconds < 31536000) return `${Math.floor(seconds / 2592000)}mo ago`
  return `${Math.floor(seconds / 31536000)}y ago`
})

// ============================================================================
// Math Helpers
// ============================================================================

hbs.registerHelper("add", (a: number, b: number): number => a + b)

hbs.registerHelper("subtract", (a: number, b: number): number => a - b)

hbs.registerHelper("multiply", (a: number, b: number): number => a * b)

hbs.registerHelper("divide", (a: number, b: number): number => {
  if (b === 0) return 0
  return a / b
})

hbs.registerHelper("mod", (a: number, b: number): number => {
  if (b === 0) return 0
  return a % b
})

hbs.registerHelper("round", (value: number): number => Math.round(value))

hbs.registerHelper("ceil", (value: number): number => Math.ceil(value))

hbs.registerHelper("floor", (value: number): number => Math.floor(value))

// ============================================================================
// Collection Helpers
// ============================================================================

hbs.registerHelper("length", (arr: unknown[]): number => {
  if (!Array.isArray(arr)) return 0
  return arr.length
})

hbs.registerHelper("first", (arr: unknown[]): unknown => {
  if (!Array.isArray(arr) || arr.length === 0) return undefined
  return arr[0]
})

hbs.registerHelper("last", (arr: unknown[]): unknown => {
  if (!Array.isArray(arr) || arr.length === 0) return undefined
  return arr[arr.length - 1]
})

hbs.registerHelper("join", (arr: unknown[], separator?: string): string => {
  if (!Array.isArray(arr)) return ""
  return arr.join(separator ?? ", ")
})

hbs.registerHelper("includes", (arr: unknown[], value: unknown): boolean => {
  if (!Array.isArray(arr)) return false
  return arr.includes(value)
})
