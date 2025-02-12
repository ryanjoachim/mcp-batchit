import path from "path"
import fs from "fs/promises"
import { PathValidationError } from "../validation/pathValidationError.js"

export interface ValidatedPath {
    original: string
    normalized: string
    rootRelative?: string
}

export interface PathValidationOptions {
    requireAbsolute?: boolean
    rootDirectory?: string
    maxLength?: number
    allowedExtensions?: string[]
    checkSymlinks?: boolean
}

/**
 * Validates and normalizes a file path according to specified options
 * Returns a ValidatedPath object containing the original, normalized, and root-relative paths
 */
export async function validatePath(
    filePath: string,
    options: PathValidationOptions = {}
): Promise<ValidatedPath> {
    const {
        requireAbsolute = true,
        rootDirectory,
        maxLength = 260,
        allowedExtensions,
        checkSymlinks = true
    } = options

    if (!filePath) {
        throw PathValidationError.invalidFormat(filePath, "Path cannot be empty")
    }

    // Basic path validation
    if (requireAbsolute && !path.isAbsolute(filePath)) {
        throw PathValidationError.notAbsolute(filePath)
    }

    const normalized = path.normalize(filePath)

    // Security checks
    if (normalized.includes("..")) {
        throw PathValidationError.securityViolation(
            normalized,
            "Path cannot contain parent directory references (..)"
        )
    }

    // Length validation
    if (normalized.length > maxLength) {
        throw PathValidationError.invalidFormat(
            normalized,
            `Path exceeds maximum length of ${maxLength} characters`
        )
    }

    // Extension validation
    if (allowedExtensions?.length) {
        const ext = path.extname(normalized).toLowerCase()
        if (!allowedExtensions.includes(ext)) {
            throw PathValidationError.invalidFormat(
                normalized,
                `File extension must be one of: ${allowedExtensions.join(", ")}`
            )
        }
    }

    // Root directory containment
    let rootRelative: string | undefined
    if (rootDirectory) {
        const root = path.normalize(rootDirectory)
        if (!normalized.startsWith(root)) {
            throw PathValidationError.outsideRoot(normalized, root)
        }
        rootRelative = path.relative(root, normalized)
    }

    // Symlink validation
    if (checkSymlinks) {
        try {
            const stats = await fs.lstat(normalized)
            if (stats.isSymbolicLink()) {
                const target = await fs.readlink(normalized)
                const resolvedTarget = path.resolve(path.dirname(normalized), target)

                if (rootDirectory) {
                    const root = path.normalize(rootDirectory)
                    if (!resolvedTarget.startsWith(root)) {
                        throw PathValidationError.securityViolation(
                            normalized,
                            "Symlink target points outside root directory"
                        )
                    }
                }
            }
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
                throw error
            }
        }
    }

    return {
        original: filePath,
        normalized,
        rootRelative
    }
}

/**
 * Synchronous path format validation
 * Use this for quick format checks without full validation
 */
export function validatePathFormat(
    filePath: string,
    options: Omit<PathValidationOptions, 'checkSymlinks'> = {}
): string {
    const {
        requireAbsolute = true,
        rootDirectory,
        maxLength = 260,
        allowedExtensions
    } = options

    if (!filePath) {
        throw PathValidationError.invalidFormat(filePath, "Path cannot be empty")
    }

    if (requireAbsolute && !path.isAbsolute(filePath)) {
        throw PathValidationError.notAbsolute(filePath)
    }

    const normalized = path.normalize(filePath)

    if (normalized.includes("..")) {
        throw PathValidationError.securityViolation(
            normalized,
            "Path cannot contain parent directory references (..)"
        )
    }

    if (normalized.length > maxLength) {
        throw PathValidationError.invalidFormat(
            normalized,
            `Path exceeds maximum length of ${maxLength} characters`
        )
    }

    if (allowedExtensions?.length) {
        const ext = path.extname(normalized).toLowerCase()
        if (!allowedExtensions.includes(ext)) {
            throw PathValidationError.invalidFormat(
                normalized,
                `File extension must be one of: ${allowedExtensions.join(", ")}`
            )
        }
    }

    if (rootDirectory) {
        const root = path.normalize(rootDirectory)
        if (!normalized.startsWith(root)) {
            throw PathValidationError.outsideRoot(normalized, root)
        }
    }

    return normalized
}
