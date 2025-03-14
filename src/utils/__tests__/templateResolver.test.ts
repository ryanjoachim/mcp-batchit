import { resolveTemplates, clearTemplateCache } from "../templateResolver.js"
import { resultsCache } from "../resultsCache.js"

describe("templateResolver", () => {
  beforeEach(() => {
    resultsCache.clear()
    clearTemplateCache()
  })

  it("returns args unchanged if no template present", () => {
    const args = { content: "test" }
    expect(resolveTemplates(args)).toEqual(args)
  })

  it("resolves simple templates", () => {
    resultsCache.storeResult("op1", "test value")

    const args = {
      template: "Content: {{results.op1}}"
    }

    expect(resolveTemplates(args)).toEqual({
      content: "Content: test value",
      template: undefined
    })
  })

  it("resolves JSON templates", () => {
    resultsCache.storeResult("op1", { value: "test" })

    const args = {
      template: "{{json results.op1}}"
    }

    expect(resolveTemplates(args)).toEqual({
      content: `{
  "value": "test"
}`,
      template: undefined
    })
  })

  it("resolves now helper", () => {
    const args = {
      template: "Created: {{now}}"
    }

    const result = resolveTemplates(args)
    expect(result.template).toBeUndefined()
    expect(typeof result.content).toBe("string")
    expect(result.content).toMatch(/Created: \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
  })

  it("resolves parseJson helper", () => {
    const args = {
      template: "{{#with (parseJson '{\"key\":\"value\"}')}}{{key}}{{/with}}"
    }

    expect(resolveTemplates(args)).toEqual({
      content: "value",
      template: undefined
    })
  })

  describe("template caching", () => {
    it("caches and reuses compiled templates", () => {
      const args = {
        template: "Value: {{results.op1}}"
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
        template: "Value 1: {{results.op1}}"
      }
      const template2 = {
        template: "Value 2: {{results.op1}}"
      }

      resultsCache.storeResult("op1", "test")

      const result1 = resolveTemplates(template1)
      const result2 = resolveTemplates(template2)

      expect(result1.content).toBe("Value 1: test")
      expect(result2.content).toBe("Value 2: test")
    })

    it("clears template cache", () => {
      const args = {
        template: "Value: {{results.op1}}"
      }

      resultsCache.storeResult("op1", "first")
      resolveTemplates(args) // Cache the template

      clearTemplateCache() // Clear the cache

      resultsCache.storeResult("op1", "second")
      const result = resolveTemplates(args)
      expect(result.content).toBe("Value: second")
    })
  })
})
