import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/auth'
import { prisma } from '@/lib/db/prisma'

// セグメント追加 - 直接DBに保存（サーバーレス対応）
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
    const { segment, duration, transcriptId } = body

    // transcriptIdが提供された場合はそれを使用、なければsessionIdから検索
    let targetTranscriptId = transcriptId

    if (!targetTranscriptId) {
      // sessionIdからTranscriptを検索（フォールバック）
      // Note: sessionIdは実際にはこの用途では使用されないが、互換性のため
      console.log(`[Segments] No transcriptId provided, sessionId: ${sessionId}`)
      return NextResponse.json({ error: 'transcriptId is required' }, { status: 400 })
    }

    // Transcriptが存在し、ユーザーのものであることを確認
    const transcript = await prisma.transcript.findFirst({
      where: {
        id: targetTranscriptId,
        userId: session.user.id,
      },
    })

    if (!transcript) {
      return NextResponse.json({ error: 'Transcript not found' }, { status: 404 })
    }

    if (!segment) {
      return NextResponse.json({ error: 'segment is required' }, { status: 400 })
    }

    // 話者を作成/取得
    const speakerLabel = `話者 ${(segment.speaker ?? 0) + 1}`
    let speaker = await prisma.speaker.findFirst({
      where: {
        transcriptId: targetTranscriptId,
        label: speakerLabel,
      },
    })

    if (!speaker) {
      const colors = ['#3B82F6', '#10B981', '#F97316', '#8B5CF6', '#EC4899']
      const existingCount = await prisma.speaker.count({
        where: { transcriptId: targetTranscriptId },
      })
      speaker = await prisma.speaker.create({
        data: {
          transcriptId: targetTranscriptId,
          label: speakerLabel,
          color: colors[existingCount % colors.length],
        },
      })
    }

    // セグメントを直接保存
    await prisma.transcriptSegment.create({
      data: {
        transcriptId: targetTranscriptId,
        speakerId: speaker.id,
        text: segment.text,
        startTime: segment.startTime ?? 0,
        endTime: segment.endTime ?? (segment.startTime ?? 0) + 1,
      },
    })

    // 保存済みセグメント数を取得
    const savedCount = await prisma.transcriptSegment.count({
      where: { transcriptId: targetTranscriptId },
    })

    // Transcriptの録音時間を更新
    if (duration !== undefined) {
      await prisma.transcript.update({
        where: { id: targetTranscriptId },
        data: { duration: Math.ceil(duration) },
      })
    }

    console.log(`[Segments] Saved segment for transcript: ${targetTranscriptId}, total: ${savedCount}`)

    return NextResponse.json({
      success: true,
      saved: true,
      savedSegmentCount: savedCount,
    })
  } catch (error) {
    console.error('Failed to add segment:', error)
    return NextResponse.json(
      { error: 'Failed to add segment' },
      { status: 500 }
    )
  }
}
