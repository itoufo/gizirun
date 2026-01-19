import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/auth'
import { prisma } from '@/lib/db/prisma'
import { createTranscriptSchema } from '@/lib/validations/transcript'
import { ZodError } from 'zod'

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const transcripts = await prisma.transcript.findMany({
      where: { userId: session.user.id },
      include: {
        segments: {
          take: 1,
          orderBy: { startTime: 'asc' },
        },
        speakers: true,
        summary: true,
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json(transcripts)
  } catch (error) {
    console.error('Failed to fetch transcripts:', error)
    return NextResponse.json(
      { error: 'Failed to fetch transcripts' },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()

    // Validate input
    const validatedData = createTranscriptSchema.parse(body)

    const transcript = await prisma.transcript.create({
      data: {
        userId: session.user.id,
        title: validatedData.title,
        sourceType: validatedData.sourceType,
        audioUrl: validatedData.audioUrl,
        audioKey: validatedData.audioKey,
        meetingId: validatedData.meetingId,
        status: 'PENDING',
      },
    })

    return NextResponse.json(transcript, { status: 201 })
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.issues },
        { status: 400 }
      )
    }

    console.error('Failed to create transcript:', error)
    return NextResponse.json(
      { error: 'Failed to create transcript' },
      { status: 500 }
    )
  }
}
