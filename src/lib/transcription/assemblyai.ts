import { AssemblyAI, TranscriptUtterance } from 'assemblyai'

const client = new AssemblyAI({
  apiKey: process.env.ASSEMBLYAI_API_KEY!,
})

export interface TranscriptionResult {
  text: string
  utterances: Array<{
    speaker: string
    text: string
    start: number
    end: number
    confidence: number
  }>
  speakers: string[]
  duration: number
}

export async function transcribeAudio(audioUrl: string): Promise<TranscriptionResult> {
  const transcript = await client.transcripts.transcribe({
    audio_url: audioUrl,
    speaker_labels: true,
    language_code: 'ja',
  })

  if (transcript.status === 'error') {
    throw new Error(transcript.error || 'Transcription failed')
  }

  const utterances = transcript.utterances?.map((u: TranscriptUtterance) => ({
    speaker: `Speaker ${u.speaker}`,
    text: u.text,
    start: u.start / 1000, // Convert to seconds
    end: u.end / 1000,
    confidence: u.confidence,
  })) || []

  const speakers = [...new Set(utterances.map((u) => u.speaker))]

  return {
    text: transcript.text || '',
    utterances,
    speakers,
    duration: (transcript.audio_duration || 0),
  }
}

export async function getTranscriptStatus(transcriptId: string) {
  const transcript = await client.transcripts.get(transcriptId)
  return {
    status: transcript.status,
    error: transcript.error,
  }
}
