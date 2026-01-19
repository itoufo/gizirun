import OpenAI from 'openai'

function getOpenAI() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not set')
  }
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  })
}

export interface SummaryResult {
  summary: string
  keyPoints: string[]
  actionItems: string[]
}

export async function summarizeTranscript(transcript: string): Promise<SummaryResult> {
  const openai = getOpenAI()
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `あなたは文字起こしを要約するアシスタントです。以下の形式でJSON形式で回答してください：
{
  "summary": "2-3段落の要約",
  "keyPoints": ["キーポイント1", "キーポイント2", ...],
  "actionItems": ["アクションアイテム1", "アクションアイテム2", ...]
}

要約は日本語で行ってください。アクションアイテムがない場合は空の配列を返してください。`,
      },
      {
        role: 'user',
        content: `以下の文字起こしを要約してください：\n\n${transcript}`,
      },
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
    summary: result.summary || '',
    keyPoints: result.keyPoints || [],
    actionItems: result.actionItems || [],
  }
}
