import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/auth'
import { prisma } from '@/lib/db/prisma'
import {
  getRecordingSession,
  setRecordingSession,
  hasRecordingSession,
  type RecordingSession,
} from '@/lib/recording/session-manager'

// POST: 新規録音セッション開始
export async function POST(request: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { sessionId, title } = body

    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId is required' }, { status: 400 })
    }

    // 既存セッションがあればエラー
    if (hasRecordingSession(sessionId)) {
      return NextResponse.json({ error: 'Session already exists' }, { status: 409 })
    }

    // Transcriptを作成（status: PROCESSING）
    const transcript = await prisma.transcript.create({
      data: {
        userId: session.user.id,
        title: title || `録音 ${new Date().toLocaleString('ja-JP')}`,
        sourceType: 'RECORDING',
        status: 'PROCESSING',
      },
    })

    // セッション状態を初期化
    const recordingSession: RecordingSession = {
      sessionId,
      transcriptId: transcript.id,
      userId: session.user.id,
      pendingSegments: [],
      savedSegmentCount: 0,
      lastSavedAt: Date.now(),
      createdAt: Date.now(),
      duration: 0,
    }

    setRecordingSession(sessionId, recordingSession)

    console.log(`[RecordingSession] New session: ${sessionId}, transcriptId: ${transcript.id}`)

    return NextResponse.json({
      sessionId,
      transcriptId: transcript.id,
    }, { status: 201 })
  } catch (error) {
    console.error('Failed to create recording session:', error)
    return NextResponse.json(
      { error: 'Failed to create recording session' },
      { status: 500 }
    )
  }
}

// GET: セッション状態取得
export async function GET(request: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const sessionId = searchParams.get('sessionId')

    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId is required' }, { status: 400 })
    }

    const recordingSession = getRecordingSession(sessionId)
    if (!recordingSession) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    if (recordingSession.userId !== session.user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    return NextResponse.json({
      sessionId: recordingSession.sessionId,
      transcriptId: recordingSession.transcriptId,
      pendingSegmentsCount: recordingSession.pendingSegments.length,
      savedSegmentCount: recordingSession.savedSegmentCount,
      lastSavedAt: recordingSession.lastSavedAt,
    })
  } catch (error) {
    console.error('Failed to get recording session:', error)
    return NextResponse.json(
      { error: 'Failed to get recording session' },
      { status: 500 }
    )
  }
}
