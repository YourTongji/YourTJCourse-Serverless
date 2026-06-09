export function formatSemesterLabel(semester: string): string {
  const normalized = String(semester || "").trim();
  const match = normalized.match(/^(\d{4})-(\d{4})(?:学年第|[-])(\d+)(?:学期)?$/);
  if (!match) return semester;
  const fall = parseInt(match[1]);
  const spring = parseInt(match[2]);
  const term = parseInt(match[3]);
  if (term === 1) return `${String(fall).slice(-2)}秋`;
  if (term === 2) return `${String(spring).slice(-2)}春`;
  if (term === 3) return `${String(spring).slice(-2)}夏`;
  return semester;
}

export function semesterLabelScore(s: string): number {
  const shortMatch = s.match(/^(\d{2})(春|夏|秋)$/);
  if (shortMatch) {
    const year = 2000 + parseInt(shortMatch[1]);
    const termScore =
      shortMatch[2] === "秋" ? 3 : shortMatch[2] === "夏" ? 2 : 1;
    return year * 10 + termScore;
  }

  const match = s.match(/^(\d{4})/);
  if (!match) return 0;
  const year = parseInt(match[1]);
  if (s.includes("秋") || s.includes("第1学期")) return year * 10 + 3;
  if (s.includes("夏") || s.includes("第3学期")) return year * 10 + 2;
  if (s.includes("春") || s.includes("第2学期")) return year * 10 + 1;
  return year * 10;
}

export function formatRating(rating: number): string {
  return rating.toFixed(1);
}

export function formatCredit(credit: number): string {
  return `${credit.toFixed(1)} 学分`;
}
