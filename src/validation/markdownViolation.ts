
import { unified } from "unified"
import remarkParse from "remark-parse"
import remarkGfm from "remark-gfm"
import { PathValidationError, PathErrorType } from "./pathValidationError.js"

export interface MarkdownValidationOptions {
    requireHeader?: boolean
    requireContent?: boolean
    customValidators?: Array<(content: string) => Promise<void>>
}

export async function validateMarkdownContent(
    content: string,
    options: MarkdownValidationOptions = {}
): Promise<void> {
    const {
        requireHeader = true,
        requireContent = true,
        customValidators = []
    } = options

    try {
        // Basic structure validation
        const lines = content.split('\n')
        let foundHeader = false
        let foundContent = false

        for (const line of lines) {
            if (!foundHeader && line.trim().startsWith('#')) {
                foundHeader = true
            } else if (foundHeader && line.trim()) {
                foundContent = true
                break
            }
        }

        if (requireHeader && !foundHeader) {
            throw new PathValidationError(
                PathErrorType.MarkdownValidation,
                "Markdown must start with a heading (#)"
            )
        }

        if (requireContent && !foundContent) {
            throw new PathValidationError(
                PathErrorType.MarkdownValidation,
                "Markdown must contain content after heading"
            )
        }

        // Syntax validation using unified/remark
        const processor = unified().use(remarkParse).use(remarkGfm)
        await processor.process(content)

        // Run custom validators
        for (const validator of customValidators) {
            await validator(content)
        }

    } catch (error) {
        if (error instanceof PathValidationError) {
            throw error
        }
        throw new PathValidationError(
            PathErrorType.MarkdownValidation,
            `Invalid markdown content: ${error instanceof Error ? error.message : String(error)}`
        )
    }
}
