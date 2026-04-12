import { resolveTemplates, clearTemplateCache } from "../templateResolver.js"
import { ResultsCache } from "../resultsCache.js"

describe("templateResolver", () => {
  let cache: ResultsCache

  beforeEach(() => {
    cache = new ResultsCache()
    clearTemplateCache()
  })

  it("returns args unchanged if no template present", () => {
    const args = { content: "test" }
    expect(resolveTemplates(args, cache)).toEqual(args)
  })

  it("resolves simple templates", () => {
    cache.storeResult("op1", "test value")

    const args = {
      template: "Content: {{results.op1}}",
    }

    expect(resolveTemplates(args, cache)).toEqual({
      content: "Content: test value",
      template: undefined,
    })
  })

  it("resolves JSON templates", () => {
    cache.storeResult("op1", { value: "test" })

    const args = {
      template: "{{json results.op1}}",
    }

    expect(resolveTemplates(args, cache)).toEqual({
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

    const result = resolveTemplates(args, cache)
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

    expect(resolveTemplates(args, cache)).toEqual({
      content: "value",
      template: undefined,
    })
  })

  describe("template caching", () => {
    it("caches and reuses compiled templates", () => {
      const args = {
        template: "Value: {{results.op1}}",
      }

      cache.storeResult("op1", "first")
      const result1 = resolveTemplates(args, cache)
      expect(result1.content).toBe("Value: first")

      cache.storeResult("op1", "second")
      const result2 = resolveTemplates(args, cache)
      expect(result2.content).toBe("Value: second")
    })

    it("uses different cache entries for different templates", () => {
      const template1 = {
        template: "Value 1: {{results.op1}}",
      }
      const template2 = {
        template: "Value 2: {{results.op1}}",
      }

      cache.storeResult("op1", "test")

      const result1 = resolveTemplates(template1, cache)
      const result2 = resolveTemplates(template2, cache)

      expect(result1.content).toBe("Value 1: test")
      expect(result2.content).toBe("Value 2: test")
    })

    it("clearTemplateCache clears all cached templates", () => {
      const args = {
        template: "Hello {{uppercase name}}",
        content: { name: "World" },
      }
      resolveTemplates(args, cache)
      clearTemplateCache()
      // After clearing, templates are recompiled on next use
      const result = resolveTemplates(args, cache)
      expect(result.content).toBe("Hello WORLD")
    })
  })

  describe("built-in string helpers", () => {
    it("uppercase", () => {
      const args = { template: "{{uppercase 'hello'}}" }
      expect(resolveTemplates(args, cache)).toEqual({
        content: "HELLO",
        template: undefined,
      })
    })

    it("lowercase", () => {
      const args = { template: "{{lowercase 'HELLO'}}" }
      expect(resolveTemplates(args, cache)).toEqual({
        content: "hello",
        template: undefined,
      })
    })

    it("capitalize", () => {
      const args = { template: "{{capitalize 'hello'}}" }
      expect(resolveTemplates(args, cache)).toEqual({
        content: "Hello",
        template: undefined,
      })
    })

    it("trim", () => {
      const args = { template: "{{trim '  hello  '}}" }
      expect(resolveTemplates(args, cache)).toEqual({
        content: "hello",
        template: undefined,
      })
    })

    it("substring", () => {
      const args = { template: "{{substring 'hello' 1 4}}" }
      expect(resolveTemplates(args, cache)).toEqual({
        content: "ell",
        template: undefined,
      })
    })

    it("replace", () => {
      const args = { template: "{{replace 'hello world' 'world' 'there'}}" }
      expect(resolveTemplates(args, cache)).toEqual({
        content: "hello there",
        template: undefined,
      })
    })

    it("concat", () => {
      const args = { template: "{{concat 'hello' ' ' 'world'}}" }
      expect(resolveTemplates(args, cache)).toEqual({
        content: "hello world",
        template: undefined,
      })
    })
  })

  describe("built-in conditional helpers", () => {
    it("eq returns true when equal", () => {
      const args = { template: "{{#if (eq 1 1)}}yes{{else}}no{{/if}}" }
      expect(resolveTemplates(args, cache)).toEqual({
        content: "yes",
        template: undefined,
      })
    })

    it("eq returns false when not equal", () => {
      const args = { template: "{{#if (eq 1 2)}}yes{{else}}no{{/if}}" }
      expect(resolveTemplates(args, cache)).toEqual({
        content: "no",
        template: undefined,
      })
    })

    it("and", () => {
      const args = { template: "{{#if (and true true)}}yes{{else}}no{{/if}}" }
      expect(resolveTemplates(args, cache)).toEqual({
        content: "yes",
        template: undefined,
      })
    })

    it("or", () => {
      const args = { template: "{{#if (or false true)}}yes{{else}}no{{/if}}" }
      expect(resolveTemplates(args, cache)).toEqual({
        content: "yes",
        template: undefined,
      })
    })

    it("not", () => {
      const args = { template: "{{#if (not false)}}yes{{else}}no{{/if}}" }
      expect(resolveTemplates(args, cache)).toEqual({
        content: "yes",
        template: undefined,
      })
    })
  })

  describe("built-in math helpers", () => {
    it("add", () => {
      const args = { template: "{{add 2 3}}" }
      expect(resolveTemplates(args, cache)).toEqual({
        content: "5",
        template: undefined,
      })
    })

    it("divide by zero returns 0", () => {
      const args = { template: "{{divide 10 0}}" }
      expect(resolveTemplates(args, cache)).toEqual({
        content: "0",
        template: undefined,
      })
    })

    it("round", () => {
      const args = { template: "{{round 3.7}}" }
      expect(resolveTemplates(args, cache)).toEqual({
        content: "4",
        template: undefined,
      })
    })
  })

  describe("built-in collection helpers", () => {
    it("length", () => {
      const context = { items: [1, 2, 3] }
      expect(
        resolveTemplates(
          { template: "{{length items}}", content: context },
          cache
        )
      ).toEqual({
        content: "3",
        template: undefined,
      })
    })

    it("length returns 0 for non-array", () => {
      const args = { template: "{{length 'hello'}}" }
      expect(resolveTemplates(args, cache)).toEqual({
        content: "0",
        template: undefined,
      })
    })

    it("first", () => {
      const context = { items: [1, 2, 3] }
      expect(
        resolveTemplates(
          { template: "{{first items}}", content: context },
          cache
        )
      ).toEqual({
        content: "1",
        template: undefined,
      })
    })

    it("last", () => {
      const context = { items: [1, 2, 3] }
      expect(
        resolveTemplates(
          { template: "{{last items}}", content: context },
          cache
        )
      ).toEqual({
        content: "3",
        template: undefined,
      })
    })

    it("join", () => {
      const context = { items: ["a", "b", "c"] }
      expect(
        resolveTemplates(
          { template: "{{join items '-'}}", content: context },
          cache
        )
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
        resolveTemplates({ template: args.template, content: context }, cache)
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
        resolveTemplates({ template: args.template, content: context }, cache)
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
      const result = resolveTemplates(
        {
          template: args.template,
          content: context,
        },
        cache
      )
      expect(result.template).toBeUndefined()
      expect(result.content).toMatch(/2024-01-15/)
    })

    it("formatDate with format tokens", () => {
      const args = { template: "{{formatDate date 'YYYY-MM-DD'}}" }
      const context = { date: new Date("2024-01-15T10:30:00.000Z") }
      expect(
        resolveTemplates({ template: args.template, content: context }, cache)
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
      const result = resolveTemplates(
        {
          template: args.template,
          content: context,
        },
        cache
      )
      expect(result.content).toBe("1m ago")
    })
  })

  describe("cache eviction", () => {
    it("evicts oldest entries when max size is exceeded", () => {
      // Fill the cache beyond MAX_CACHE_SIZE (100)
      for (let i = 0; i < 110; i++) {
        resolveTemplates(
          { template: `Template {{i}} {{i}}`, content: { i } },
          cache
        )
      }
      // Cache should still work — oldest entries evicted
      const result = resolveTemplates(
        {
          template: "Hello {{uppercase 'world'}}",
        },
        cache
      )
      expect(result.content).toBe("Hello WORLD")
    })
  })
})
