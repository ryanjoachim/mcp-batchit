
import path from "path"
import fs from "fs/promises"
import { Stats } from 'fs'
import { PathValidationError, PathErrorType } from "../validation/pathValidationError.js"
import { validateMarkdownContent } from "../validation/markdownViolation.js"

export interface PathValidationOptions {
    requireAbsolute?: boolean
    rootDirectory?: string
    maxLength?: number
    allowedExtensions?: string[]
    checkSymlinks?: boolean
    validateMarkdown?: boolean
    requireHeader?: boolean
    cacheStats?: boolean
    bypassRootCheck?: boolean
}

export interface ValidatedPath {
    original: string
    normalized: string
    rootRelative?: string
    fileType?: string
    stats?: Stats
}

export function validatePathFormat(
    filePath: string,
    options: Omit<PathValidationOptions, 'checkSymlinks' | 'validateMarkdown'> = {}
): string {
    const {
        requireAbsolute = true,
        rootDirectory,
        maxLength = 260,
        allowedExtensions
    } = options

    if (!filePath) {
        throw new PathValidationError(PathErrorType.InvalidFormat, "Path cannot be empty")
    }

    if (requireAbsolute && !path.isAbsolute(filePath)) {
        throw new PathValidationError(PathErrorType.NotAbsolute, `Path must be absolute: ${filePath}`)
    }

    const normalized = path.normalize(filePath)
    const fileType = path.extname(normalized).toLowerCase()

    if (normalized.includes("..")) {
        throw new PathValidationError(
            PathErrorType.SecurityViolation,
            `Path cannot contain parent directory references (..): ${normalized}`
        )
    }

    if (normalized.length > maxLength) {
        throw new PathValidationError(
            PathErrorType.InvalidFormat,
            `Path exceeds maximum length of ${maxLength} characters: ${normalized}`
        )
    }

    if (allowedExtensions?.length && !allowedExtensions.includes(fileType)) {
        throw new PathValidationError(
            PathErrorType.InvalidFormat,
            `File extension must be one of: ${allowedExtensions.join(", ")}`
        )
    }

    if (rootDirectory && !options.bypassRootCheck) {
        const root = path.normalize(rootDirectory)
        if (!normalized.startsWith(root)) {
            throw new PathValidationError(
                PathErrorType.OutsideRoot,
                `Path must be within root directory ${root}: ${normalized}`
            )
        }
    }

    return normalized
}

export async function validatePath(
    filePath: string,
    options: PathValidationOptions = {}
): Promise<ValidatedPath> {
    const {
        requireAbsolute = true,
        rootDirectory,
        maxLength = 260,
        allowedExtensions,
        checkSymlinks = true,
        validateMarkdown = false,
        requireHeader = false,
        cacheStats = false
    } = options

    const normalized = validatePathFormat(filePath, {
        requireAbsolute,
        rootDirectory,
        maxLength,
        allowedExtensions
    })

    const fileType = path.extname(normalized).toLowerCase()
    let rootRelative: string | undefined

    if (rootDirectory) {
        rootRelative = path.relative(path.normalize(rootDirectory), normalized)
    }

    let stats: Stats | undefined

    try {
        stats = await fs.stat(normalized)

        if (checkSymlinks && stats.isSymbolicLink()) {
            const target = await fs.readlink(normalized)
            const resolvedTarget = path.resolve(path.dirname(normalized), target)

            if (rootDirectory) {
                const root = path.normalize(rootDirectory)
                if (!resolvedTarget.startsWith(root)) {
                    throw new PathValidationError(
                        PathErrorType.SecurityViolation,
                        `Symlink target points outside root directory: ${normalized}`
                    )
                }
            }
        }

        if (validateMarkdown && fileType === '.md') {
            const content = await fs.readFile(normalized, 'utf-8')
            await validateMarkdownContent(content, { requireHeader })
        }

    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
            throw error
        }
    }

    return {
        original: filePath,
        normalized,
        rootRelative,
        fileType,
        stats: cacheStats ? stats : undefined
    }
}
