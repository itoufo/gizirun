import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/auth'
import { prisma } from '@/lib/db/prisma'
import { createBot } from '@/lib/meeting-bot/client'
import { createMeetingSchema } from '@/lib/validations/meeting'
import { ZodError } from 'zod'
import type { Platform } from '@prisma/client'

function detectPlatform(url: string): Platform {
  if (url.includes('zoom.us')) return 'ZOOM'
  return 'GOOGLE_MEET'
}

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const meetings = await prisma.meeting.findMany({
      where: { userId: session.user.id },
      include: {
        transcript: {
          select: { id: true, status: true },
        },
      },
      orderBy: { scheduledStart: 'desc' },
    })

    return NextResponse.json(meetings)
  } catch (error) {
    console.error('Failed to fetch meetings:', error)
    return NextResponse.json(
      { error: 'Failed to fetch meetings' },
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
    const validatedData = createMeetingSchema.parse(body)

    const platform = detectPlatform(validatedData.meetingUrl)

    const meeting = await prisma.meeting.create({
      data: {
        userId: session.user.id,
        title: validatedData.title,
        platform,
        meetingUrl: validatedData.meetingUrl,
        meetingPassword: validatedData.meetingPassword,
        scheduledStart: new Date(validatedData.scheduledStart),
        status: 'SCHEDULED',
        botStatus: 'SCHEDULED',
      },
    })

    // Schedule bot via Meeting BaaS API
    try {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL
      const webhookUrl = baseUrl ? `${baseUrl}/api/webhooks/meeting-bot` : undefined

      const bot = await createBot({
        meetingUrl: validatedData.meetingUrl,
        botName: 'Notta Bot',
        joinAt: new Date(validatedData.scheduledStart),
        transcriptionEnabled: true,
        webhookUrl,
      })

      // Update meeting with bot instance ID
      await prisma.meeting.update({
        where: { id: meeting.id },
        data: { botInstanceId: bot.id },
      })

      console.log('Bot scheduled:', bot.id)
    } catch (botError) {
      // Bot scheduling failed, but meeting is still created
      console.error('Failed to schedule bot:', botError)
      // Update meeting to indicate bot scheduling failed
      await prisma.meeting.update({
        where: { id: meeting.id },
        data: {
          botStatus: 'FAILED',
          errorMessage: 'ボットのスケジュールに失敗しました。Meeting BaaS APIキーを確認してください。',
        },
      })
    }

    return NextResponse.json(meeting, { status: 201 })
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.issues },
        { status: 400 }
      )
    }

    console.error('Failed to create meeting:', error)
    return NextResponse.json(
      { error: 'Failed to create meeting' },
      { status: 500 }
    )
  }
}
