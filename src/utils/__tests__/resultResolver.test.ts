import { describe, test, expect, beforeEach } from "@jest/globals";
import { resolveResultReferences } from "../resultResolver.js";
import { resultsCache } from "../resultsCache.js";
import { McpError } from "@modelcontextprotocol/sdk/types.js";

describe("resultResolver", () => {
  beforeEach(() => {
    resultsCache.clear();
  });

  test("resolves simple result references", () => {
    resultsCache.storeResult("test1", "hello");

    const args = {
      value: "${results.test1}"
    };

    const resolved = resolveResultReferences(args);
    expect(resolved.value).toBe("hello");
  });

  test("resolves complex result types", () => {
    resultsCache.storeResult("test2", { foo: "bar" });

    const args = {
      value: "${results.test2}"
    };

    const resolved = resolveResultReferences(args);
    expect(resolved.value).toEqual({ foo: "bar" });
  });

  test("resolves embedded result references", () => {
    resultsCache.storeResult("test3", "world");

    const args = {
      value: "hello ${results.test3}!"
    };

    const resolved = resolveResultReferences(args);
    expect(resolved.value).toBe("hello world!");
  });

  test("resolves nested object properties", () => {
    resultsCache.storeResult("test4", "nested");

    const args = {
      top: {
        middle: {
          bottom: "${results.test4}"
        }
      }
    };

    const resolved = resolveResultReferences(args) as {
      top: {
        middle: {
          bottom: string;
        };
      };
    };
    expect(resolved.top.middle.bottom).toBe("nested");
  });

  test("throws error for missing result references", () => {
    const args = {
      value: "${results.missing}"
    };

    expect(() => resolveResultReferences(args)).toThrow(McpError);
  });

  test("preserves non-string values", () => {
    const args = {
      number: 42,
      boolean: true,
      null: null,
      undefined: undefined
    };

    const resolved = resolveResultReferences(args);
    expect(resolved).toEqual(args);
  });

  test("handles real-world file operation chain", () => {
    // Simulate writing and reading a file
    resultsCache.storeResult("write1", "write success");
    resultsCache.storeResult("read1", "file content");

    const operations = [
      {
        tool: "write_file",
        arguments: { path: "/test.txt", content: "initial" },
        id: "write1"
      },
      {
        tool: "read_file",
        arguments: { path: "/test.txt" },
        id: "read1",
        dependsOn: "write1"
      },
      {
        tool: "write_file",
        arguments: {
          path: "/copy.txt",
          content: "${results.read1}"
        },
        id: "write2",
        dependsOn: "read1"
      }
    ];

    const resolvedArgs = resolveResultReferences(operations[2].arguments);
    expect(resolvedArgs).toEqual({
      path: "/copy.txt",
      content: "file content"
    });
  });

  test("resolves references at write time", () => {
    // Initial setup - no result in cache
    const args = {
      path: "/test.txt",
      content: "${results.dynamic}"
    };

    // Store result after creating args but before resolution
    resultsCache.storeResult("dynamic", "updated content");

    // Resolution should happen at write time and get latest value
    const resolved = resolveResultReferences(args);
    expect(resolved).toEqual({
      path: "/test.txt",
      content: "updated content"
    });
  });

  test("resolves nested references in write operations", () => {
    // Set up complex nested results
    resultsCache.storeResult("config", { format: "json" });
    resultsCache.storeResult("data", { key: "value" });

    const args = {
      path: "/test.${results.config.format}",
      content: {
        timestamp: "2025-03-13",
        data: "${results.data}"
      }
    };

    const resolved = resolveResultReferences(args);
    expect(resolved).toEqual({
      path: "/test.json",
      content: {
        timestamp: "2025-03-13",
        data: { key: "value" }
      }
    });
  });

  test("resolves references with delayed result updates", () => {
    const args = {
      path: "/test.txt",
      content: "${results.delayed}"
    };

    // Update cache after args creation but before resolution
    setTimeout(() => {
      resultsCache.storeResult("delayed", "late update");
    }, 0);

    return new Promise(resolve => {
      setTimeout(() => {
        const resolved = resolveResultReferences(args);
        expect(resolved.content).toBe("late update");
        resolve(undefined);
      }, 10);
    });
  });

  test("resolves array type results", () => {
    // Store array results
    resultsCache.storeResult("numbers", [1, 2, 3, 4, 5]);
    resultsCache.storeResult("strings", ["a", "b", "c"]);
    resultsCache.storeResult("mixed", [1, "two", { three: 3 }, [4]]);

    const args = {
      numbers: "${results.numbers}",
      strings: "${results.strings}",
      mixed: "${results.mixed}",
      firstNumber: "${results.firstNumber}",
      secondString: "${results.secondString}"
    };

    // Store individual values for template testing
    resultsCache.storeResult("firstNumber", [1, 2, 3, 4, 5][0]);
    resultsCache.storeResult("secondString", ["a", "b", "c"][1]);

    const resolved = resolveResultReferences(args) as {
      numbers: number[];
      strings: string[];
      mixed: Array<number | string | object | any[]>;
      firstNumber: number;
      secondString: string;
    };

    expect(resolved.numbers).toEqual([1, 2, 3, 4, 5]);
    expect(resolved.strings).toEqual(["a", "b", "c"]);
    expect(resolved.mixed).toEqual([1, "two", { three: 3 }, [4]]);
    expect(resolved.firstNumber).toBe(1);
    expect(resolved.secondString).toBe("b");
  });

  test("resolves date type results", () => {
    const testDate = new Date("2025-03-14T00:00:00Z");
    resultsCache.storeResult("date", testDate);
    resultsCache.storeResult("dateString", testDate.toISOString());

    const args = {
      directDate: "${results.date}",
      dateInObject: {
        value: "${results.date}",
        string: "${results.dateString}"
      }
    };
const resolved = resolveResultReferences(args) as {
  directDate: Date;
  dateInObject: {
    value: Date;
    string: string;
  };
};
expect(resolved.directDate).toEqual(testDate);
expect(resolved.dateInObject.value).toEqual(testDate);
expect(resolved.dateInObject.string).toBe(testDate.toISOString());
});


  test("resolves complex nested objects with mixed types", () => {
    const complexData = {
      number: 42,
      string: "test",
      date: new Date("2025-03-14T00:00:00Z"),
      array: [1, "two", { three: 3 }],
      nested: {
        boolean: true,
        null: null,
        undefined: undefined
      }
    };
    resultsCache.storeResult("complex", complexData);

    const args = {
      direct: "${results.complex}",
      partial: {
        number: "${results.complex.number}",
        nested: "${results.complex.nested}",
        array: "${results.complex.array}",
        date: "${results.complex.date}"
      },
      template: "Number: ${results.complex.number}, String: ${results.complex.string}"
    };

    const resolved = resolveResultReferences(args) as {
      direct: typeof complexData;
      partial: {
        number: number;
        nested: {
          boolean: boolean;
          null: null;
          undefined: undefined;
        };
        array: Array<number | string | { three: number }>;
        date: Date;
      };
      template: string;
    };
    expect(resolved.direct).toEqual(complexData);
    expect(resolved.partial.number).toBe(42);
    expect(resolved.partial.nested).toEqual(complexData.nested);
    expect(resolved.partial.array).toEqual(complexData.array);
    expect(resolved.partial.date).toEqual(complexData.date);
    expect(resolved.template).toBe("Number: 42, String: test");
  });
});
