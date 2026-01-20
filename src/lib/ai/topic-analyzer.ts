import OpenAI from 'openai'

function getOpenAI() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not set')
  }
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  })
}

export interface TopicAnalysisResult {
  mainTopic: string | null
  currentTopic: string
  driftScore: number // 0-100 (50以上でアラート)
  driftReason: string | null
  suggestedAction: string | null
}

export interface AnalyzeTopicParams {
  recentSegments: Array<{ speaker: string; text: string }>
  previousTopics: string[]
  mainTopic: string | null
  agendaItems: string[]
  isFirstAnalysis: boolean
}

export async function analyzeTopics(params: AnalyzeTopicParams): Promise<TopicAnalysisResult> {
  const openai = getOpenAI()

  const segmentsText = params.recentSegments
    .map((s) => `${s.speaker}: ${s.text}`)
    .join('\n')

  const agendaText = params.agendaItems.length > 0
    ? params.agendaItems.map((item, i) => `${i + 1}. ${item}`).join('\n')
    : 'なし'

  const previousTopicsText = params.previousTopics.length > 0
    ? params.previousTopics.slice(-5).join(' → ')
    : 'なし'

  const systemPrompt = `あなたは会議ファシリテーターのAIアシスタントです。
会議の文字起こしを分析し、トピックの流れを追跡してください。

【分析のポイント】
- メイントピック: 会議の主題（${params.isFirstAnalysis ? '今回検出してください' : '既に検出済みなら維持'}）
- 現在のトピック: 直近の発言で議論されているトピック
- 脱線度(driftScore): 0-100の数値
  - 0-30: メイントピックに沿った議論
  - 30-50: やや関連性が薄いが許容範囲
  - 50-70: 明らかに脱線している
  - 70-100: 完全に無関係な話題

【重要】
- 日本の会議文化を考慮し、雑談や関係構築の会話は過度に厳しく判定しない
- driftScoreが50以上の場合のみ、driftReasonとsuggestedActionを提供
- suggestedActionは具体的かつ丁寧な提案にする

以下のJSON形式で回答してください：
{
  "mainTopic": "会議の主題（初回分析時のみ設定、それ以外はnull）",
  "currentTopic": "現在議論されているトピック",
  "driftScore": 0-100の数値,
  "driftReason": "脱線理由（driftScore >= 50の場合のみ）",
  "suggestedAction": "ファシリテーターとしての提案（driftScore >= 50の場合のみ）"
}`

  const userPrompt = `【メイントピック】: ${params.mainTopic || '未検出'}
【アジェンダ】:
${agendaText}
【直前のトピックの流れ】: ${previousTopicsText}

【最近の発言】:
${segmentsText}

この会議のトピック分析をJSON形式で回答してください。`

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.3,
  })

  const content = response.choices[0].message.content
  if (!content) {
    throw new Error('No response from OpenAI')
  }

  const result = JSON.parse(content)

  return {
    mainTopic: params.isFirstAnalysis ? (result.mainTopic || null) : null,
    currentTopic: result.currentTopic || '不明',
    driftScore: Math.min(100, Math.max(0, Number(result.driftScore) || 0)),
    driftReason: result.driftScore >= 50 ? (result.driftReason || null) : null,
    suggestedAction: result.driftScore >= 50 ? (result.suggestedAction || null) : null,
  }
}

export function generateFacilitatorMessage(result: TopicAnalysisResult): string {
  if (result.driftScore < 50) {
    return ''
  }

  const severity = result.driftScore >= 70 ? '大きく' : '少し'
  let message = `話題が${severity}ズレているようです。`

  if (result.driftReason) {
    message += `\n${result.driftReason}`
  }

  if (result.suggestedAction) {
    message += `\n\n💡 ${result.suggestedAction}`
  }

  return message
}
