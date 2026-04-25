export const PROBLEM_TYPE_PREFIX = 'urn:dialogus:problems:'

export interface ValidationIssue {
  field: string
  message: string
}

export interface ProblemDetails {
  type: `${typeof PROBLEM_TYPE_PREFIX}${string}`
  title: string
  status: number
  detail?: string
  errors?: ValidationIssue[]
}

function capitalize(word: string): string {
  const first = word.charAt(0).toUpperCase()
  return `${first}${word.slice(1)}`
}

function titleFromSlug(slug: string): string {
  const words = slug.split('-').filter((part) => part.length > 0)
  if (words.length === 0) return slug
  return words.map(capitalize).join(' ')
}

export function problemDetails(
  slug: string,
  status: number,
  detail?: string,
  errors?: ValidationIssue[],
): ProblemDetails {
  const result: ProblemDetails = {
    type: `${PROBLEM_TYPE_PREFIX}${slug}`,
    title: titleFromSlug(slug),
    status,
  }
  if (detail !== undefined) result.detail = detail
  if (errors !== undefined) result.errors = errors
  return result
}
