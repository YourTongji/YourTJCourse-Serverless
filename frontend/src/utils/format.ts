export function formatSemesterLabel(semester: string): string {
  const match = semester.match(/^(\d{4})-(\d{4})-(\d+)$/)
  if (!match) return semester
  const fall = parseInt(match[1])
  const spring = parseInt(match[2])
  const term = parseInt(match[3])
  if (term === 1) return `${fall}年秋`
  if (term === 2) return `${spring}年春`
  if (term === 3) return `${spring}年夏`
  return semester
}

export function semesterLabelScore(s: string): number {
  const match = s.match(/^(\d{4})/)
  if (!match) return 0
  const year = parseInt(match[1])
  if (s.includes('秋') || s.includes('第1学期')) return year * 10 + 1
  if (s.includes('春') || s.includes('第2学期')) return year * 10 + 2
  return year * 10
}
