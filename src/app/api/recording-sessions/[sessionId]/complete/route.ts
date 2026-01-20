import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/auth'
import { prisma } from '@/lib/db/prisma'
import {
  getRecordingSession,
  deleteRecordingSession,
} from '@/lib/recording/session-manager'

// 録音完了
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
    const body = await request.json().catch(() => ({}))
    const { duration, title } = body

    const recordingSession = getRecordingSession(sessionId)
    if (!recordingSession) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    if (recordingSession.userId !== session.user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // 残りのセグメントを保存
    if (recordingSession.pendingSegments.length > 0) {
      await saveRemainingSegments(recordingSession)
      console.log(`[RecordingSession] Saved remaining ${recordingSession.pendingSegments.length} segments for session: ${sessionId}`)
    }

    // Transcriptを完了に更新
    const updateData: {
      status: 'COMPLETED'
      duration?: number
      title?: string
    } = {
      status: 'COMPLETED',
    }

    if (duration !== undefined) {
      updateData.duration = Math.ceil(duration)
    }

    if (title) {
      updateData.title = title
    }

    const transcript = await prisma.transcript.update({
      where: { id: recordingSession.transcriptId },
      data: updateData,
    })

    // セッションをクリーンアップ
    deleteRecordingSession(sessionId)

    console.log(`[RecordingSession] Session completed: ${sessionId}, transcriptId: ${transcript.id}`)

    return NextResponse.json({
      success: true,
      transcriptId: transcript.id,
    })
  } catch (error) {
    console.error('Failed to complete recording session:', error)
    return NextResponse.json(
      { error: 'Failed to complete recording session' },
      { status: 500 }
    )
  }
}

// 残りのセグメントをDBに保存
async function saveRemainingSegments(recordingSession: {
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

  // Transcriptのテキストを更新
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
