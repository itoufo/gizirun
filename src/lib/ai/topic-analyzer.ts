import OpenAI from 'openai'

function getOpenAI() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not set')
  }
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  })
}

export interface TokenUsage {
  inputTokens: number
  outputTokens: number
}

export interface TopicAnalysisResult {
  mainTopic: string | null
  currentTopic: string
  driftScore: number // 0-100 (50以上でアラート)
  driftReason: string | null
  suggestedAction: string | null
  usage?: TokenUsage
}

export interface AnalyzeTopicParams {
  recentSegments: Array<{ speaker: string; text: string }>
  previousTopics: string[]
  mainTopic: string | null
  agendaItems: string[]
  isFirstAnalysis: boolean
  conversationSummary?: string | null // 圧縮された過去の会話要約
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

  const contextText = params.conversationSummary
    ? `【これまでの会話の要約】:\n${params.conversationSummary}\n\n`
    : ''

  const userPrompt = `【メイントピック】: ${params.mainTopic || '未検出'}
【アジェンダ】:
${agendaText}
【直前のトピックの流れ】: ${previousTopicsText}
${contextText}
【最近の発言】:
${segmentsText}

この会議のトピック分析をJSON形式で回答してください。`

  const response = await openai.chat.completions.create({
    model: 'gpt-5.2',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'topic_analysis',
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            mainTopic: { type: ['string', 'null'] },
            currentTopic: { type: 'string' },
            driftScore: { type: 'number' },
            driftReason: { type: ['string', 'null'] },
            suggestedAction: { type: ['string', 'null'] },
          },
          required: ['mainTopic', 'currentTopic', 'driftScore', 'driftReason', 'suggestedAction'],
        },
        strict: true,
      },
    },
    reasoning_effort: 'low',
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
    usage: response.usage ? {
      inputTokens: response.usage.prompt_tokens,
      outputTokens: response.usage.completion_tokens,
    } : undefined,
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

// 会話圧縮用インターフェース
export interface CompressConversationParams {
  segments: Array<{ speaker: string; text: string }>
  existingSummary: string | null
}

export interface CompressConversationResult {
  summary: string
  usage?: TokenUsage
}

/**
 * 長時間の会話を圧縮して要約する
 * gpt-4o-miniを使用（コスト効率のため）
 */
export async function compressConversation(
  params: CompressConversationParams
): Promise<CompressConversationResult> {
  const openai = getOpenAI()

  const segmentsText = params.segments
    .map((s) => `${s.speaker}: ${s.text}`)
    .join('\n')

  const systemPrompt = `あなたは会議の要約者です。
会議の発言内容を簡潔に要約してください。

【要約のポイント】
- 主要なトピックと議論の流れを保持
- 重要な決定事項や合意点を含める
- 話者の立場や意見の違いを反映
- 200-300文字程度に圧縮

${params.existingSummary ? `【既存の要約】\n${params.existingSummary}\n\n新しい発言内容を統合して更新してください。` : ''}`

  const userPrompt = `【発言内容】:
${segmentsText}

上記を要約してください。`

  const response = await openai.chat.completions.create({
    model: 'gpt-5-mini', // コスト効率のため
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.3,
    max_tokens: 500,
  })

  const content = response.choices[0].message.content

  return {
    summary: content || '',
    usage: response.usage ? {
      inputTokens: response.usage.prompt_tokens,
      outputTokens: response.usage.completion_tokens,
    } : undefined,
  }
}
