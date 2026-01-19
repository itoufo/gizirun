import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/auth'
import { prisma } from '@/lib/db/prisma'

export async function GET(
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
        speakers: true,
        summary: true,
      },
    })

    if (!transcript) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    return NextResponse.json(transcript)
  } catch (error) {
    console.error('Failed to fetch transcript:', error)
    return NextResponse.json(
      { error: 'Failed to fetch transcript' },
      { status: 500 }
    )
  }
}

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { title, rawText } = body

    const transcript = await prisma.transcript.updateMany({
      where: {
        id: params.id,
        userId: session.user.id,
      },
      data: {
        title,
        rawText,
        updatedAt: new Date(),
      },
    })

    if (transcript.count === 0) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to update transcript:', error)
    return NextResponse.json(
      { error: 'Failed to update transcript' },
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

    const transcript = await prisma.transcript.deleteMany({
      where: {
        id: params.id,
        userId: session.user.id,
      },
    })

    if (transcript.count === 0) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    // TODO: Delete audio file from S3 if exists

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete transcript:', error)
    return NextResponse.json(
      { error: 'Failed to delete transcript' },
      { status: 500 }
    )
  }
}
