import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/auth'
import { prisma } from '@/lib/db/prisma'
import { summarizeTranscript } from '@/lib/ai/summarize'

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const transcript = await prisma.transcript.findFirst({
      where: {
        id: params.id,
        userId: session.user.id,
      },
      include: {
        segments: {
          include: { speaker: true },
          orderBy: { startTime: 'asc' },
        },
      },
    })

    if (!transcript) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    // Build transcript text with speaker labels
    const fullText = transcript.segments
      .map((s) => {
        const speakerName = s.speaker?.name || s.speaker?.label || 'Unknown'
        return `${speakerName}: ${s.text}`
      })
      .join('\n')

    if (!fullText) {
      return NextResponse.json(
        { error: 'No transcript content to summarize' },
        { status: 400 }
      )
    }

    // Generate summary
    const result = await summarizeTranscript(fullText)

    // Save or update summary
    const summary = await prisma.summary.upsert({
      where: { transcriptId: params.id },
      update: {
        content: result.summary,
        keyPoints: result.keyPoints,
        actionItems: result.actionItems,
        updatedAt: new Date(),
      },
      create: {
        transcriptId: params.id,
        content: result.summary,
        keyPoints: result.keyPoints,
        actionItems: result.actionItems,
      },
    })

    return NextResponse.json(summary)
  } catch (error) {
    console.error('Failed to summarize transcript:', error)
    return NextResponse.json(
      { error: 'Failed to generate summary' },
      { status: 500 }
    )
  }
}
