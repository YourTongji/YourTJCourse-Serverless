interface ReviewInput {
  id: number
  rating: number
  comment: string
}

interface AiSummaryResult {
  rating_consensus: string
  keywords: string[]
  pros: string[]
  cons: string[]
  representative: { text: string; sentiment: string }[]
}

function buildPrompt(courseName: string, courseCode: string, reviews: ReviewInput[]): string {
  const numbered = reviews.map((r, i) =>
    `${i + 1}. 评分${r.rating}：${r.comment}`
  ).join('\n')

  return `课程名称：${courseName}
课程代码：${courseCode}
评价数量：${reviews.length} 条

各条评价（评分 1-5）：
${numbered}

请生成课程总结 JSON，结构为：
{
  "rating_consensus": "褒贬不一",
  "keywords": ["给分好", "作业多", "有收获"],
  "pros": ["...", "..."],
  "cons": ["...", "..."],
  "representative": [
    {"text": "原文摘录", "sentiment": "👍"}
  ]
}

只输出 JSON，不要额外文字。`
}

const SYSTEM_PROMPT = `你是「选课评课 AI 助手」。你的任务是基于多条学生评价，生成一门课程的结构化总结。
只分析用户提供的评价文本，不添加外部事实。
如果评价之间结论矛盾，要在总结中体现，不要抹平分歧。
使用简体中文。
只返回 JSON 对象，不要返回 Markdown、代码块、解释文字、思考过程或额外字段。

# 输出字段
rating_consensus：对课程整体评分的一致性评价，从以下选一个："一致好评" / "好评居多" / "褒贬不一" / "差评居多" / "数据不足"
keywords：高频关键词，从评价中提取，最多 5 个，每词不超过 6 个字，如 "给分好" "作业多"
pros：学生普遍认可的优点，最多 4 条，每条一句话
cons：学生普遍反馈的缺点/槽点，最多 4 条，每条一句话
representative：代表性评价摘录，最多 3 条，每条需附上原文和对应的情绪标签（"👍" / "😐" / "👎"），优先选择有具体细节的评价

# 内部工作流（不要输出）
1. 统计评分分布：各分段的评价数量和占比。
2. 提取高频主题：从评论文本中提取重复出现的主题词。
3. 分类：区分正面主题和负面主题，按出现频次排序。
4. 选择代表性评价：优先选有具体案例、有细节描述的评价，不要选只说"好/不好"的。
5. 判断评分共识：根据 ratings 分布选择最合适的 rating_consensus。
6. 最终只输出符合约束的 JSON。`

export async function generateSummary(
  env: { AI_SUMMARY_KEY?: string; AI_SUMMARY_MODEL?: string; AI_SUMMARY_BASE_URL?: string },
  courseName: string,
  courseCode: string,
  reviews: ReviewInput[]
): Promise<AiSummaryResult> {
  const apiKey = String(env.AI_SUMMARY_KEY || '').trim()
  if (!apiKey) throw new Error('AI_SUMMARY_KEY not configured')

  const model = String(env.AI_SUMMARY_MODEL || '').trim() || 'openai/gpt-4o-mini'
  const baseUrl = String(env.AI_SUMMARY_BASE_URL || '').trim().replace(/\/+$/, '') || 'https://openrouter.ai/api/v1'
  const url = `${baseUrl}/chat/completions`

  const userContent = buildPrompt(courseName, courseCode, reviews)

  const body = {
    model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userContent }
    ],
    response_format: { type: 'json_object' },
    temperature: 0.3
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify(body)
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`AI summary API error ${res.status}: ${text.slice(0, 500)}`)
  }

  const json: any = await res.json()
  const content = json?.choices?.[0]?.message?.content
  if (!content) throw new Error('AI summary: empty response')

  const parsed = JSON.parse(content)

  // Validate and sanitize output
  return {
    rating_consensus: String(parsed.rating_consensus || '数据不足').slice(0, 20),
    keywords: (Array.isArray(parsed.keywords) ? parsed.keywords : []).slice(0, 5).map(String),
    pros: (Array.isArray(parsed.pros) ? parsed.pros : []).slice(0, 4).map(String),
    cons: (Array.isArray(parsed.cons) ? parsed.cons : []).slice(0, 4).map(String),
    representative: (Array.isArray(parsed.representative) ? parsed.representative : []).slice(0, 3).map((r: any) => ({
      text: String(r.text || '').slice(0, 500),
      sentiment: ['👍', '😐', '👎'].includes(String(r.sentiment || '')) ? String(r.sentiment) : '😐'
    }))
  }
}

export type { AiSummaryResult, ReviewInput }
