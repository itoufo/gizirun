import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/auth'
import { prisma } from '@/lib/db/prisma'
import { endBot } from '@/lib/meeting-bot/client'

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const meeting = await prisma.meeting.findFirst({
      where: {
        id: params.id,
        userId: session.user.id,
      },
      include: {
        transcript: {
          include: {
            segments: {
              include: { speaker: true },
              orderBy: { startTime: 'asc' },
            },
            speakers: true,
            summary: true,
          },
        },
      },
    })

    if (!meeting) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    return NextResponse.json(meeting)
  } catch (error) {
    console.error('Failed to fetch meeting:', error)
    return NextResponse.json(
      { error: 'Failed to fetch meeting' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const meeting = await prisma.meeting.findFirst({
      where: {
        id: params.id,
        userId: session.user.id,
      },
    })

    if (!meeting) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    // End bot if still active
    if (meeting.botInstanceId && ['JOINING', 'ACTIVE'].includes(meeting.botStatus || '')) {
      try {
        await endBot(meeting.botInstanceId)
      } catch (e) {
        console.error('Failed to end bot:', e)
      }
    }

    // Delete meeting (cascades to transcript)
    await prisma.meeting.delete({
      where: { id: params.id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete meeting:', error)
    return NextResponse.json(
      { error: 'Failed to delete meeting' },
      { status: 500 }
    )
  }
}
