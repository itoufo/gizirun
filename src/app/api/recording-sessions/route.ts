import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/auth'
import { prisma } from '@/lib/db/prisma'

// POST: 新規録音セッション開始（Transcript作成）
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

    // Transcriptを作成（status: PROCESSING）
    const transcript = await prisma.transcript.create({
      data: {
        userId: session.user.id,
        title: title || `録音 ${new Date().toLocaleString('ja-JP')}`,
        sourceType: 'RECORDING',
        status: 'PROCESSING',
      },
    })

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
