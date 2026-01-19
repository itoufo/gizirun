import { createClient, LiveTranscriptionEvents } from '@deepgram/sdk'

export interface TranscriptResult {
  text: string
  isFinal: boolean
  speaker?: number
  start: number
  end: number
  confidence: number
}

export function getDeepgramClient() {
  if (!process.env.DEEPGRAM_API_KEY) {
    throw new Error('DEEPGRAM_API_KEY is not set')
  }
  return createClient(process.env.DEEPGRAM_API_KEY)
}

export interface DeepgramLiveOptions {
  language?: string
  model?: string
  punctuate?: boolean
  diarize?: boolean
  interimResults?: boolean
}

export const defaultLiveOptions: DeepgramLiveOptions = {
  language: 'ja',
  model: 'nova-2',
  punctuate: true,
  diarize: true,
  interimResults: true,
}

export function createLiveTranscriptionConnection(
  options: DeepgramLiveOptions = defaultLiveOptions
) {
  const deepgram = getDeepgramClient()

  const connection = deepgram.listen.live({
    model: options.model || 'nova-2',
    language: options.language || 'ja',
    smart_format: true,
    punctuate: options.punctuate ?? true,
    diarize: options.diarize ?? true,
    interim_results: options.interimResults ?? true,
    encoding: 'linear16',
    sample_rate: 16000,
    channels: 1,
  })

  return connection
}

export { LiveTranscriptionEvents }
