import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/auth'
import { prisma } from '@/lib/db/prisma'

// 録音完了 - 直接DB更新（サーバーレス対応）
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
    const { duration, title, transcriptId } = body

    // transcriptIdが必須
    if (!transcriptId) {
      console.log(`[Complete] No transcriptId provided, sessionId: ${sessionId}`)
      return NextResponse.json({ error: 'transcriptId is required' }, { status: 400 })
    }

    // Transcriptが存在し、ユーザーのものであることを確認
    const transcript = await prisma.transcript.findFirst({
      where: {
        id: transcriptId,
        userId: session.user.id,
      },
    })

    if (!transcript) {
      return NextResponse.json({ error: 'Transcript not found' }, { status: 404 })
    }

    // Transcriptを完了に更新
    const updateData: {
      status: 'COMPLETED'
      duration?: number
      title?: string
      rawText?: string
    } = {
      status: 'COMPLETED',
    }

    if (duration !== undefined) {
      updateData.duration = Math.ceil(duration)
    }

    if (title) {
      updateData.title = title
    }

    // rawTextを全セグメントから生成
    const allSegments = await prisma.transcriptSegment.findMany({
      where: { transcriptId },
      orderBy: { startTime: 'asc' },
    })

    if (allSegments.length > 0) {
      updateData.rawText = allSegments.map(s => s.text).join('\n')
    }

    const updatedTranscript = await prisma.transcript.update({
      where: { id: transcriptId },
      data: updateData,
    })

    console.log(`[Complete] Session completed: ${sessionId}, transcriptId: ${transcriptId}, segments: ${allSegments.length}`)

    return NextResponse.json({
      success: true,
      transcriptId: updatedTranscript.id,
    })
  } catch (error) {
    console.error('Failed to complete recording session:', error)
    return NextResponse.json(
      { error: 'Failed to complete recording session' },
      { status: 500 }
    )
  }
}
