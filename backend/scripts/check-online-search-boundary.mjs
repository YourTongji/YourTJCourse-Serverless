import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))

async function source(relativePath) {
  return readFile(resolve(root, relativePath), 'utf8')
}

const checks = [
  {
    file: 'src/helpers/course-mini-search.ts',
    forbidden: [
      /MiniSearch\.(?:addAll|addAllAsync)\s*\(/,
      /loadMiniSearchDocuments/,
      /\bD1Database\b/
    ],
    message: 'online search helper must not build a full index or depend on D1'
  },
  {
    file: 'src/node.ts',
    forbidden: [/course-search-build/, /MiniSearch\.(?:addAll|addAllAsync)\s*\(/],
    message: 'Node request runtime must not import or build the offline index'
  },
  {
    file: 'src/routes/public.ts',
    forbidden: [
      /executeCourseSearchWithFallback\s*\(\s*c\.env\.DB/s,
      /getMiniSearchCourseCandidates\s*\(\s*c\.env\.DB/s
    ],
    message: 'public search routes must not pass the database into the online index loader'
  }
]

for (const check of checks) {
  const text = await source(check.file)
  for (const pattern of check.forbidden) {
    if (pattern.test(text)) {
      throw new Error(`${check.file}: ${check.message}; matched ${pattern}`)
    }
  }
}

console.log('online search boundary checks passed')
