export type SourceType = 'RECORDING' | 'UPLOAD' | 'MEETING'
export type TranscriptStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED'
export type Platform = 'ZOOM' | 'GOOGLE_MEET'
export type MeetingStatus = 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'
export type BotStatus = 'SCHEDULED' | 'JOINING' | 'ACTIVE' | 'LEAVING' | 'COMPLETED' | 'FAILED'

export interface Speaker {
  id: string
  transcriptId: string
  label: string
  name: string | null
  color: string | null
}

export interface TranscriptSegment {
  id: string
  transcriptId: string
  speakerId: string | null
  speaker?: Speaker
  text: string
  startTime: number
  endTime: number
  confidence: number | null
}

export interface Summary {
  id: string
  transcriptId: string
  content: string
  keyPoints: string[]
  actionItems: string[]
}

export interface Transcript {
  id: string
  userId: string
  title: string
  sourceType: SourceType
  status: TranscriptStatus
  duration: number | null
  audioUrl: string | null
  rawText: string | null
  segments: TranscriptSegment[]
  speakers: Speaker[]
  summary: Summary | null
  meetingId: string | null
  createdAt: Date
  updatedAt: Date
}

export interface Meeting {
  id: string
  userId: string
  title: string
  platform: Platform
  meetingUrl: string
  meetingPassword: string | null
  scheduledStart: Date
  actualStart: Date | null
  actualEnd: Date | null
  status: MeetingStatus
  botStatus: BotStatus | null
  botInstanceId: string | null
  errorMessage: string | null
  transcript: Transcript | null
  createdAt: Date
}
