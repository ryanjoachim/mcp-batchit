import {
  resolveTemplates,
  clearTemplateCache,
  configureTemplateResolution,
  validateTemplate,
} from "../templateResolver.js"
import { resultsCache } from "../resultsCache.js"
import { TemplateCache } from "../templateCache.js"

describe("templateResolver", () => {
  beforeEach(() => {
    resultsCache.clear()
    clearTemplateCache()
    configureTemplateResolution({ validateBeforeExecution: false })
  })

  it("returns args unchanged if no template present", () => {
    const args = { content: "test" }
    expect(resolveTemplates(args)).toEqual(args)
  })

  it("resolves simple templates", () => {
    resultsCache.storeResult("op1", "test value")

    const args = {
      template: "Content: {{results.op1}}",
    }

    expect(resolveTemplates(args)).toEqual({
      content: "Content: test value",
      template: undefined,
    })
  })

  it("resolves JSON templates", () => {
    resultsCache.storeResult("op1", { value: "test" })

    const args = {
      template: "{{json results.op1}}",
    }

    expect(resolveTemplates(args)).toEqual({
      content: `{
  "value": "test"
}`,
      template: undefined,
    })
  })

  it("resolves now helper", () => {
    const args = {
      template: "Created: {{now}}",
    }

    const result = resolveTemplates(args)
    expect(result.template).toBeUndefined()
    expect(typeof result.content).toBe("string")
    expect(result.content).toMatch(
      /Created: \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/
    )
  })

  it("resolves parseJson helper", () => {
    const args = {
      template: '{{#with (parseJson \'{"key":"value"}\')}}{{key}}{{/with}}',
    }

    expect(resolveTemplates(args)).toEqual({
      content: "value",
      template: undefined,
    })
  })

  describe("template caching", () => {
    it("caches and reuses compiled templates", () => {
      const args = {
        template: "Value: {{results.op1}}",
      }

      resultsCache.storeResult("op1", "first")
      const result1 = resolveTemplates(args)
      expect(result1.content).toBe("Value: first")

      resultsCache.storeResult("op1", "second")
      const result2 = resolveTemplates(args)
      expect(result2.content).toBe("Value: second")
    })

    it("uses different cache entries for different templates", () => {
      const template1 = {
        template: "Value 1: {{results.op1}}",
      }
      const template2 = {
        template: "Value 2: {{results.op1}}",
      }

      resultsCache.storeResult("op1", "test")

      const result1 = resolveTemplates(template1)
      const result2 = resolveTemplates(template2)

      expect(result1.content).toBe("Value 1: test")
      expect(result2.content).toBe("Value 2: test")
    })
  })

  describe("built-in string helpers", () => {
    it("uppercase", () => {
      const args = { template: "{{uppercase 'hello'}}" }
      expect(resolveTemplates(args)).toEqual({
        content: "HELLO",
        template: undefined,
      })
    })

    it("lowercase", () => {
      const args = { template: "{{lowercase 'HELLO'}}" }
      expect(resolveTemplates(args)).toEqual({
        content: "hello",
        template: undefined,
      })
    })

    it("capitalize", () => {
      const args = { template: "{{capitalize 'hello'}}" }
      expect(resolveTemplates(args)).toEqual({
        content: "Hello",
        template: undefined,
      })
    })

    it("trim", () => {
      const args = { template: "{{trim '  hello  '}}" }
      expect(resolveTemplates(args)).toEqual({
        content: "hello",
        template: undefined,
      })
    })

    it("substring", () => {
      const args = { template: "{{substring 'hello' 1 4}}" }
      expect(resolveTemplates(args)).toEqual({
        content: "ell",
        template: undefined,
      })
    })

    it("replace", () => {
      const args = { template: "{{replace 'hello world' 'world' 'there'}}" }
      expect(resolveTemplates(args)).toEqual({
        content: "hello there",
        template: undefined,
      })
    })

    it("concat", () => {
      const args = { template: "{{concat 'hello' ' ' 'world'}}" }
      expect(resolveTemplates(args)).toEqual({
        content: "hello world",
        template: undefined,
      })
    })
  })

  describe("built-in conditional helpers", () => {
    it("eq returns true when equal", () => {
      const args = { template: "{{#if (eq 1 1)}}yes{{else}}no{{/if}}" }
      expect(resolveTemplates(args)).toEqual({
        content: "yes",
        template: undefined,
      })
    })

    it("eq returns false when not equal", () => {
      const args = { template: "{{#if (eq 1 2)}}yes{{else}}no{{/if}}" }
      expect(resolveTemplates(args)).toEqual({
        content: "no",
        template: undefined,
      })
    })

    it("and", () => {
      const args = { template: "{{#if (and true true)}}yes{{else}}no{{/if}}" }
      expect(resolveTemplates(args)).toEqual({
        content: "yes",
        template: undefined,
      })
    })

    it("or", () => {
      const args = { template: "{{#if (or false true)}}yes{{else}}no{{/if}}" }
      expect(resolveTemplates(args)).toEqual({
        content: "yes",
        template: undefined,
      })
    })

    it("not", () => {
      const args = { template: "{{#if (not false)}}yes{{else}}no{{/if}}" }
      expect(resolveTemplates(args)).toEqual({
        content: "yes",
        template: undefined,
      })
    })
  })

  describe("built-in math helpers", () => {
    it("add", () => {
      const args = { template: "{{add 2 3}}" }
      expect(resolveTemplates(args)).toEqual({
        content: "5",
        template: undefined,
      })
    })

    it("divide by zero returns 0", () => {
      const args = { template: "{{divide 10 0}}" }
      expect(resolveTemplates(args)).toEqual({
        content: "0",
        template: undefined,
      })
    })

    it("round", () => {
      const args = { template: "{{round 3.7}}" }
      expect(resolveTemplates(args)).toEqual({
        content: "4",
        template: undefined,
      })
    })
  })

  describe("built-in collection helpers", () => {
    it("length", () => {
      const context = { items: [1, 2, 3] }
      expect(
        resolveTemplates({ template: "{{length items}}", content: context })
      ).toEqual({
        content: "3",
        template: undefined,
      })
    })

    it("length returns 0 for non-array", () => {
      const args = { template: "{{length 'hello'}}" }
      expect(resolveTemplates(args)).toEqual({
        content: "0",
        template: undefined,
      })
    })

    it("first", () => {
      const context = { items: [1, 2, 3] }
      expect(
        resolveTemplates({ template: "{{first items}}", content: context })
      ).toEqual({
        content: "1",
        template: undefined,
      })
    })

    it("last", () => {
      const context = { items: [1, 2, 3] }
      expect(
        resolveTemplates({ template: "{{last items}}", content: context })
      ).toEqual({
        content: "3",
        template: undefined,
      })
    })

    it("join", () => {
      const context = { items: ["a", "b", "c"] }
      expect(
        resolveTemplates({ template: "{{join items '-'}}", content: context })
      ).toEqual({
        content: "a-b-c",
        template: undefined,
      })
    })

    it("includes true", () => {
      const args = {
        template: "{{#if (includes items 'b')}}found{{else}}not found{{/if}}",
      }
      const context = { items: ["a", "b", "c"] }
      expect(
        resolveTemplates({ template: args.template, content: context })
      ).toEqual({
        content: "found",
        template: undefined,
      })
    })

    it("includes false", () => {
      const args = {
        template: "{{#if (includes items 'd')}}found{{else}}not found{{/if}}",
      }
      const context = { items: ["a", "b", "c"] }
      expect(
        resolveTemplates({ template: args.template, content: context })
      ).toEqual({
        content: "not found",
        template: undefined,
      })
    })
  })

  describe("built-in date/time helpers", () => {
    it("formatDate without format returns ISO string", () => {
      const args = { template: "{{formatDate date}}" }
      const context = { date: new Date("2024-01-15T10:30:00.000Z") }
      const result = resolveTemplates({
        template: args.template,
        content: context,
      })
      expect(result.template).toBeUndefined()
      expect(result.content).toMatch(/2024-01-15/)
    })

    it("formatDate with format tokens", () => {
      const args = { template: "{{formatDate date 'YYYY-MM-DD'}}" }
      const context = { date: new Date("2024-01-15T10:30:00.000Z") }
      expect(
        resolveTemplates({ template: args.template, content: context })
      ).toEqual({
        content: "2024-01-15",
        template: undefined,
      })
    })

    it("timeAgo", () => {
      const now = new Date()
      const past = new Date(now.getTime() - 60000) // 60 seconds ago
      const args = { template: "{{timeAgo date}}" }
      const context = { date: past }
      const result = resolveTemplates({
        template: args.template,
        content: context,
      })
      expect(result.content).toBe("1m ago")
    })
  })

  describe("cache eviction", () => {
    it("evicts oldest entries when max size is exceeded", () => {
      const cache = new TemplateCache({ maxSize: 5 })

      // Fill to capacity
      cache.set("a", (() => null) as any)
      cache.set("b", (() => null) as any)
      cache.set("c", (() => null) as any)
      cache.set("d", (() => null) as any)
      cache.set("e", (() => null) as any)

      expect(cache.size()).toBe(5)

      // Add new entry — should evict oldest ('a')
      cache.set("f", (() => null) as any)

      // 'a' should be evicted (first inserted)
      expect(cache.get("a")).toBeUndefined()
      // remaining entries should still be there
      expect(cache.get("b")).toBeDefined()
      expect(cache.get("c")).toBeDefined()
      expect(cache.get("d")).toBeDefined()
      expect(cache.get("e")).toBeDefined()
      expect(cache.get("f")).toBeDefined()
    })
  })

  describe("template validation", () => {
    it("validates syntactically correct template with known helpers", () => {
      const result = validateTemplate("Hello {{uppercase name}}", {
        checkHelpers: true,
      })
      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it("detects syntax errors", () => {
      const result = validateTemplate("Hello {{error")
      expect(result.valid).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
      expect(result.errors[0].type).toBe("syntax")
    })

    it("extracts line number from syntax error", () => {
      const result = validateTemplate("Line 1\nLine 2\n{{error")
      expect(result.valid).toBe(false)
      expect(result.errors[0].line).toBeDefined()
    })
  })

  describe("validateBeforeExecution option", () => {
    it("throws on invalid template when validation enabled", () => {
      configureTemplateResolution({ validateBeforeExecution: true })
      const args = { template: "Hello {{name" } // syntax error
      expect(() => resolveTemplates(args)).toThrow()
      configureTemplateResolution({ validateBeforeExecution: false })
    })

    it("succeeds on valid template when validation enabled", () => {
      configureTemplateResolution({ validateBeforeExecution: true })
      const args = {
        template: "Hello {{uppercase name}}",
        content: { name: "World" },
      }
      const result = resolveTemplates(args)
      expect(result.content).toBe("Hello WORLD")
      configureTemplateResolution({ validateBeforeExecution: false })
    })
  })
})
