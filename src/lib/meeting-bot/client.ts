/**
 * Meeting BaaS Client
 *
 * Meeting BaaS is a service that provides meeting bot functionality
 * for Zoom and Google Meet. This client handles:
 * - Creating bots to join meetings
 * - Managing bot lifecycle
 * - Receiving transcription via webhooks
 *
 * API Documentation: https://docs.meetingbaas.com/
 */

const MEETING_BAAS_API_URL = 'https://api.meetingbaas.com'

interface MeetingBaaSConfig {
  apiKey: string
}

export interface CreateBotParams {
  meetingUrl: string
  botName?: string
  joinAt?: Date
  recordingMode?: 'audio_only' | 'audio_and_video'
  transcriptionEnabled?: boolean
  webhookUrl?: string
}

export interface Bot {
  id: string
  meetingUrl: string
  status: 'queued' | 'joining' | 'in_meeting' | 'leaving' | 'ended' | 'error'
  joinedAt?: string
  endedAt?: string
  errorMessage?: string
  recordingUrl?: string
}

export interface TranscriptSegment {
  speaker: string
  text: string
  startTime: number
  endTime: number
}

function getConfig(): MeetingBaaSConfig {
  const apiKey = process.env.MEETING_BAAS_API_KEY
  if (!apiKey) {
    throw new Error('MEETING_BAAS_API_KEY is not set')
  }
  return { apiKey }
}

async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const config = getConfig()

  const response = await fetch(`${MEETING_BAAS_API_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-meeting-baas-api-key': config.apiKey,
      ...options.headers,
    },
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Meeting BaaS API error: ${response.status} - ${error}`)
  }

  return response.json()
}

/**
 * Create a bot to join a meeting
 */
export async function createBot(params: CreateBotParams): Promise<Bot> {
  const body: Record<string, unknown> = {
    meeting_url: params.meetingUrl,
    bot_name: params.botName || 'Notta Bot',
    recording_mode: params.recordingMode || 'audio_only',
  }

  // Enable speech-to-text transcription
  if (params.transcriptionEnabled !== false) {
    body.speech_to_text = 'Gladia'
  }

  if (params.joinAt) {
    body.start_time = Math.floor(params.joinAt.getTime() / 1000)
  }

  if (params.webhookUrl) {
    body.webhook_url = params.webhookUrl
  }

  return apiRequest<Bot>('/bots', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

/**
 * Get bot status
 */
export async function getBot(botId: string): Promise<Bot> {
  return apiRequest<Bot>(`/bots/${botId}`)
}

/**
 * Leave meeting and end bot
 */
export async function endBot(botId: string): Promise<void> {
  await apiRequest(`/bots/${botId}/leave`, {
    method: 'POST',
  })
}

/**
 * Get transcript from completed meeting
 */
export async function getTranscript(botId: string): Promise<TranscriptSegment[]> {
  return apiRequest<TranscriptSegment[]>(`/bots/${botId}/transcript`)
}

/**
 * Get recording URL
 */
export async function getRecording(botId: string): Promise<{ url: string }> {
  return apiRequest<{ url: string }>(`/bots/${botId}/recording`)
}

/**
 * Webhook event types from Meeting BaaS
 */
export type WebhookEventType =
  | 'bot.joining'
  | 'bot.in_meeting'
  | 'bot.leaving'
  | 'bot.ended'
  | 'bot.error'
  | 'transcript.partial'
  | 'transcript.final'

export interface WebhookEvent {
  event: WebhookEventType
  bot_id: string
  timestamp: string
  data?: {
    transcript?: TranscriptSegment
    error?: string
    recording_url?: string
  }
}

/**
 * Verify webhook signature
 */
export function verifyWebhookSignature(
  payload: string,
  signature: string
): boolean {
  const secret = process.env.MEETING_BAAS_WEBHOOK_SECRET
  if (!secret) {
    console.warn('MEETING_BAAS_WEBHOOK_SECRET is not set, skipping verification')
    return true
  }

  // Simple HMAC verification - actual implementation depends on Meeting BaaS docs
  const crypto = require('crypto')
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex')

  return signature === expectedSignature
}
