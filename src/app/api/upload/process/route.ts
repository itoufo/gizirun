import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/auth'
import { prisma } from '@/lib/db/prisma'
import { transcribeAudio } from '@/lib/transcription/assemblyai'

export async function POST(request: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { title, audioUrl, audioKey } = body

    if (!title || !audioUrl) {
      return NextResponse.json(
        { error: 'title and audioUrl are required' },
        { status: 400 }
      )
    }

    // Create transcript record
    const transcript = await prisma.transcript.create({
      data: {
        userId: session.user.id,
        title,
        sourceType: 'UPLOAD',
        audioUrl,
        audioKey,
        status: 'PROCESSING',
      },
    })

    // Start transcription (async)
    processTranscription(transcript.id, audioUrl).catch((error) => {
      console.error('Transcription processing failed:', error)
    })

    return NextResponse.json(transcript, { status: 201 })
  } catch (error) {
    console.error('Failed to process upload:', error)
    return NextResponse.json(
      { error: 'Failed to process upload' },
      { status: 500 }
    )
  }
}

async function processTranscription(transcriptId: string, audioUrl: string) {
  try {
    // Call AssemblyAI
    const result = await transcribeAudio(audioUrl)

    // Create speakers
    const speakerColors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6']
    const speakers = await Promise.all(
      result.speakers.map((label, index) =>
        prisma.speaker.create({
          data: {
            transcriptId,
            label,
            color: speakerColors[index % speakerColors.length],
          },
        })
      )
    )

    const speakerMap = new Map(speakers.map((s) => [s.label, s.id]))

    // Create segments
    await prisma.transcriptSegment.createMany({
      data: result.utterances.map((u) => ({
        transcriptId,
        speakerId: speakerMap.get(u.speaker) || null,
        text: u.text,
        startTime: u.start,
        endTime: u.end,
        confidence: u.confidence,
      })),
    })

    // Update transcript status
    await prisma.transcript.update({
      where: { id: transcriptId },
      data: {
        status: 'COMPLETED',
        rawText: result.text,
        duration: Math.round(result.duration),
      },
    })
  } catch (error) {
    console.error('Transcription failed:', error)
    await prisma.transcript.update({
      where: { id: transcriptId },
      data: { status: 'FAILED' },
    })
  }
}
