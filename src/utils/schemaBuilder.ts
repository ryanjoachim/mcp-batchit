import { z } from 'zod';

/**
 * Converts a Zod schema to an MCP-compatible JSON schema
 * @param schema - Zod schema to convert
 * @returns JSON Schema representation of the Zod schema
 */
export function zodToJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  // Handle ZodObject type
  if (schema instanceof z.ZodObject) {
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    // Process each property in the object schema
    Object.entries(schema.shape).forEach(([key, value]) => {
      properties[key] = zodToJsonSchema(value as z.ZodTypeAny);

      // Track required fields (not ZodOptional)
      if (!(value instanceof z.ZodOptional)) {
        required.push(key);
      }
    });

    return {
      type: "object",
      properties,
      required: required.length > 0 ? required : undefined,
      ...(schema.description ? { description: sanitizeDescription(schema.description) } : {})
    };
  }

  // Handle ZodString type
  if (schema instanceof z.ZodString) {
    return {
      type: "string",
      ...(schema.description ? { description: sanitizeDescription(schema.description) } : {})
    };
  }

  // Handle ZodNumber type
  if (schema instanceof z.ZodNumber) {
    return {
      type: "number",
      ...(schema.description ? { description: sanitizeDescription(schema.description) } : {})
    };
  }

  // Handle ZodBoolean type
  if (schema instanceof z.ZodBoolean) {
    return {
      type: "boolean",
      ...(schema.description ? { description: sanitizeDescription(schema.description) } : {})
    };
  }

  // Handle ZodArray type
  if (schema instanceof z.ZodArray) {
    return {
      type: "array",
      items: zodToJsonSchema(schema._def.type),
      ...(schema.description ? { description: sanitizeDescription(schema.description) } : {})
    };
  }

  // Handle ZodEnum type
  if (schema instanceof z.ZodEnum) {
    return {
      type: "string",
      enum: schema._def.values,
      ...(schema.description ? { description: sanitizeDescription(schema.description) } : {})
    };
  }

  // Handle ZodUnion type
  if (schema instanceof z.ZodUnion) {
    const unionTypes = schema._def.options.map((opt: z.ZodTypeAny) => zodToJsonSchema(opt));
    return {
      anyOf: unionTypes,
      ...(schema.description ? { description: sanitizeDescription(schema.description) } : {})
    };
  }

  // Handle ZodNullable type
  if (schema instanceof z.ZodNullable) {
    const innerSchema = zodToJsonSchema(schema._def.innerType);
    return {
      anyOf: [innerSchema, { type: "null" }],
      ...(schema.description ? { description: sanitizeDescription(schema.description) } : {})
    };
  }

  // Handle ZodIntersection type
  if (schema instanceof z.ZodIntersection) {
    return {
      allOf: [
        zodToJsonSchema(schema._def.left),
        zodToJsonSchema(schema._def.right)
      ],
      ...(schema.description ? { description: sanitizeDescription(schema.description) } : {})
    };
  }

  // Handle ZodOptional type
  if (schema instanceof z.ZodOptional) {
    return zodToJsonSchema(schema._def.innerType);
  }

  // Handle ZodDefault type
  if (schema instanceof z.ZodDefault) {
    const innerSchema = zodToJsonSchema(schema._def.innerType);
    return {
      ...innerSchema,
      default: schema._def.defaultValue(),
      ...(schema.description ? { description: sanitizeDescription(schema.description) } : {})
    };
  }

  // Handle ZodLiteral type
  if (schema instanceof z.ZodLiteral) {
    return {
      const: schema._def.value,
      ...(schema.description ? { description: sanitizeDescription(schema.description) } : {})
    };
  }

  // Default fallback
  return {
    type: "unknown",
    ...(schema.description ? { description: sanitizeDescription(schema.description) } : {})
  };
}

/**
 * Sanitizes and validates a schema description
 * @param description - Raw description string
 * @returns Sanitized description string
 */
function sanitizeDescription(description: string): string {
  // Remove any HTML tags
  const sanitized = description.replace(/<[^>]*>/g, '');

  // Ensure first character is uppercase
  const formattedDesc = sanitized.charAt(0).toUpperCase() + sanitized.slice(1);

  // Ensure description ends with proper punctuation
  if (!/[.!?]$/.test(formattedDesc)) {
    return formattedDesc + '.';
  }

  return formattedDesc;
}

/**
 * Adds descriptions to a JSON schema object
 * @param schema - JSON schema object to enhance
 * @param descriptions - Object mapping property names to descriptions
 * @returns Enhanced schema with descriptions
 */
export function addDescriptions(
  schema: Record<string, unknown>,
  descriptions: Record<string, string>
): Record<string, unknown> {
  const result = { ...schema };

  // Add descriptions to properties
  if (schema.properties && typeof schema.properties === 'object') {
    const propertiesWithDescriptions: Record<string, unknown> = {};

    Object.entries(schema.properties as Record<string, unknown>).forEach(([key, value]) => {
      if (typeof value === 'object' && value !== null) {
        // Sanitize description if provided in descriptions object
        const description = descriptions[key] ? sanitizeDescription(descriptions[key]) : undefined;
        propertiesWithDescriptions[key] = {
          ...value,
          description
        };
      } else {
        propertiesWithDescriptions[key] = value;
      }
    });

    result.properties = propertiesWithDescriptions;
  }

  return result;
}
