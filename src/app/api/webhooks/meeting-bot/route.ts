import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { verifyWebhookSignature, type WebhookEvent } from '@/lib/meeting-bot/client'

export async function POST(request: Request) {
  try {
    const payload = await request.text()
    const signature = request.headers.get('x-webhook-signature') || ''

    // Verify webhook signature
    if (!verifyWebhookSignature(payload, signature)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    const event: WebhookEvent = JSON.parse(payload)
    console.log('Meeting Bot Webhook:', event.event, event.bot_id)

    // Find the meeting by bot instance ID
    const meeting = await prisma.meeting.findFirst({
      where: { botInstanceId: event.bot_id },
      include: { transcript: true },
    })

    if (!meeting) {
      console.warn('Meeting not found for bot:', event.bot_id)
      return NextResponse.json({ error: 'Meeting not found' }, { status: 404 })
    }

    switch (event.event) {
      case 'bot.joining':
        await prisma.meeting.update({
          where: { id: meeting.id },
          data: {
            botStatus: 'JOINING',
            status: 'IN_PROGRESS',
          },
        })
        break

      case 'bot.in_meeting':
        await prisma.meeting.update({
          where: { id: meeting.id },
          data: {
            botStatus: 'ACTIVE',
            actualStart: new Date(),
          },
        })

        // Create transcript if not exists
        if (!meeting.transcript) {
          await prisma.transcript.create({
            data: {
              userId: meeting.userId,
              title: meeting.title,
              sourceType: 'MEETING',
              status: 'PROCESSING',
              meetingId: meeting.id,
            },
          })
        }
        break

      case 'bot.leaving':
        await prisma.meeting.update({
          where: { id: meeting.id },
          data: { botStatus: 'LEAVING' },
        })
        break

      case 'bot.ended':
        await prisma.meeting.update({
          where: { id: meeting.id },
          data: {
            botStatus: 'COMPLETED',
            status: 'COMPLETED',
            actualEnd: new Date(),
          },
        })

        // Update transcript status
        if (meeting.transcript) {
          await prisma.transcript.update({
            where: { id: meeting.transcript.id },
            data: { status: 'COMPLETED' },
          })
        }
        break

      case 'bot.error':
        await prisma.meeting.update({
          where: { id: meeting.id },
          data: {
            botStatus: 'FAILED',
            status: 'CANCELLED',
            errorMessage: event.data?.error,
          },
        })

        if (meeting.transcript) {
          await prisma.transcript.update({
            where: { id: meeting.transcript.id },
            data: { status: 'FAILED' },
          })
        }
        break

      case 'transcript.final':
        // Add transcript segment
        if (event.data?.transcript && meeting.transcript) {
          const segment = event.data.transcript

          // Find or create speaker
          let speaker = await prisma.speaker.findFirst({
            where: {
              transcriptId: meeting.transcript.id,
              label: segment.speaker,
            },
          })

          if (!speaker) {
            const speakerColors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6']
            const existingSpeakers = await prisma.speaker.count({
              where: { transcriptId: meeting.transcript.id },
            })

            speaker = await prisma.speaker.create({
              data: {
                transcriptId: meeting.transcript.id,
                label: segment.speaker,
                color: speakerColors[existingSpeakers % speakerColors.length],
              },
            })
          }

          await prisma.transcriptSegment.create({
            data: {
              transcriptId: meeting.transcript.id,
              speakerId: speaker.id,
              text: segment.text,
              startTime: segment.startTime,
              endTime: segment.endTime,
            },
          })
        }
        break

      case 'transcript.partial':
        // Partial transcripts are handled in real-time via WebSocket if needed
        // For now, we just log them
        console.log('Partial transcript:', event.data?.transcript?.text)
        break
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Webhook error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
