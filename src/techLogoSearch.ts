/** Tech logo catalogue type and search. Pure: the data table itself (techLogoData.ts, generated from Simple Icons) is passed in, so the app can load it lazily. */

export type TechLogo = {
  /** Simple Icons slug; the id stored in saved files. */
  slug: string
  title: string
  /** Brand colour, #rrggbb. */
  hex: string
  /** SVG path data in a 24 x 24 view box. */
  path: string
  /** Lower-case, space-separated search words (the title is included). */
  keywords: string
  /** Present only when the artwork is not CC0 (a permissive licence such as Apache-2.0). */
  license?: string
}

/** Slugs kept by the file format, also when this build does not know them. */
export const LOGO_SLUG_PATTERN = /^[a-z0-9][a-z0-9.+-]{0,63}$/
export const isLogoSlug = (value: unknown): value is string => typeof value === 'string' && LOGO_SLUG_PATTERN.test(value)

const words = (text: string): string[] => text.toLowerCase().split(/[^a-z0-9.+#]+/).filter(Boolean)

/** One query token against one logo: 0 exact title or slug, 1 title or slug prefix, 2 a whole word of the title or keywords, 3 a word prefix, 4 any substring; Infinity when nothing matches. */
function tokenRank(token: string, logo: TechLogo): number {
  const title = logo.title.toLowerCase()
  const slug = logo.slug
  if (title === token || slug === token) return 0
  if (title.startsWith(token) || slug.startsWith(token)) return 1
  const all = words(`${logo.title} ${logo.keywords}`)
  if (all.includes(token)) return 2
  if (all.some((word) => word.startsWith(token))) return 3
  if (title.includes(token) || slug.includes(token) || logo.keywords.includes(token)) return 4
  return Infinity
}

/**
 * Logos matching `query`, best first (ties keep the table order, which is alphabetical). Every space-separated word of the query must match; a logo's rank is its worst word.
 * An empty query returns every logo in table order. `limit` caps the result.
 */
export function searchTechLogos(query: string, logos: readonly TechLogo[], limit = Infinity): TechLogo[] {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return logos.slice(0, limit)
  const scored: Array<{ logo: TechLogo; rank: number; order: number }> = []
  logos.forEach((logo, order) => {
    let rank = 0
    for (const token of tokens) {
      rank = Math.max(rank, tokenRank(token, logo))
      if (rank === Infinity) return
    }
    scored.push({ logo, rank, order })
  })
  scored.sort((a, b) => a.rank - b.rank || a.order - b.order)
  return scored.slice(0, limit).map((entry) => entry.logo)
}
