import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/auth'
import { prisma } from '@/lib/db/prisma'
import {
  getRecordingSession,
  updateRecordingSession,
  AUTO_SAVE_SEGMENT_THRESHOLD,
  AUTO_SAVE_TIME_THRESHOLD,
} from '@/lib/recording/session-manager'

// セグメント追加 & 自動保存
export async function POST(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { sessionId } = await params
    const body = await request.json()
    const { segment, duration } = body

    const recordingSession = getRecordingSession(sessionId)
    if (!recordingSession) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    if (recordingSession.userId !== session.user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // セグメント追加
    if (segment) {
      recordingSession.pendingSegments.push({
        speaker: segment.speaker ?? 0,
        text: segment.text,
        startTime: segment.startTime ?? 0,
        endTime: segment.endTime,
      })
    }

    // 録音時間更新
    if (duration !== undefined) {
      recordingSession.duration = duration
    }

    // 自動保存トリガー判定
    const now = Date.now()
    const timeSinceLastSave = now - recordingSession.lastSavedAt
    const hasEnoughSegments = recordingSession.pendingSegments.length >= AUTO_SAVE_SEGMENT_THRESHOLD
    const isTimePassed = timeSinceLastSave >= AUTO_SAVE_TIME_THRESHOLD && recordingSession.pendingSegments.length > 0

    let saved = false

    if (hasEnoughSegments || isTimePassed) {
      // 自動保存実行
      try {
        await saveSegments(recordingSession)
        saved = true
        console.log(`[RecordingSession] Auto-saved ${recordingSession.pendingSegments.length} segments for session: ${sessionId}`)

        // 保存後の状態更新
        recordingSession.savedSegmentCount += recordingSession.pendingSegments.length
        recordingSession.pendingSegments = []
        recordingSession.lastSavedAt = now
      } catch (saveError) {
        console.error(`[RecordingSession] Auto-save failed for session ${sessionId}:`, saveError)
      }
    }

    updateRecordingSession(sessionId, recordingSession)

    return NextResponse.json({
      success: true,
      saved,
      pendingSegmentsCount: recordingSession.pendingSegments.length,
      savedSegmentCount: recordingSession.savedSegmentCount,
    })
  } catch (error) {
    console.error('Failed to add segment:', error)
    return NextResponse.json(
      { error: 'Failed to add segment' },
      { status: 500 }
    )
  }
}

// セグメントをDBに保存
async function saveSegments(recordingSession: {
  transcriptId: string
  pendingSegments: Array<{
    speaker: number
    text: string
    startTime: number
    endTime?: number
  }>
  duration: number
}) {
  if (recordingSession.pendingSegments.length === 0) return

  // 話者の作成/取得
  const speakerLabels = [...new Set(recordingSession.pendingSegments.map(s => `話者 ${s.speaker + 1}`))]

  // 既存の話者を取得
  const existingSpeakers = await prisma.speaker.findMany({
    where: {
      transcriptId: recordingSession.transcriptId,
      label: { in: speakerLabels },
    },
  })

  const speakerMap = new Map(existingSpeakers.map(s => [s.label, s.id]))

  // 新しい話者を作成
  const newSpeakerLabels = speakerLabels.filter(label => !speakerMap.has(label))
  if (newSpeakerLabels.length > 0) {
    const colors = ['#3B82F6', '#10B981', '#F97316', '#8B5CF6', '#EC4899']
    const newSpeakers = await prisma.$transaction(
      newSpeakerLabels.map((label, index) =>
        prisma.speaker.create({
          data: {
            transcriptId: recordingSession.transcriptId,
            label,
            color: colors[(existingSpeakers.length + index) % colors.length],
          },
        })
      )
    )
    newSpeakers.forEach(s => speakerMap.set(s.label, s.id))
  }

  // セグメントを作成
  const segmentsData = recordingSession.pendingSegments.map(seg => ({
    transcriptId: recordingSession.transcriptId,
    speakerId: speakerMap.get(`話者 ${seg.speaker + 1}`),
    text: seg.text,
    startTime: seg.startTime,
    endTime: seg.endTime ?? seg.startTime + 1,
  }))

  await prisma.transcriptSegment.createMany({
    data: segmentsData,
  })

  // Transcriptのテキストと録音時間を更新
  const allSegments = await prisma.transcriptSegment.findMany({
    where: { transcriptId: recordingSession.transcriptId },
    orderBy: { startTime: 'asc' },
  })

  const rawText = allSegments.map(s => s.text).join('\n')

  await prisma.transcript.update({
    where: { id: recordingSession.transcriptId },
    data: {
      rawText,
      duration: Math.ceil(recordingSession.duration),
    },
  })
}
