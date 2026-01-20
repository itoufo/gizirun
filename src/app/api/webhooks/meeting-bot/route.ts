import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { verifyWebhookSignature, type WebhookEvent } from '@/lib/meeting-bot/client'
import { topicOrchestrator } from '@/lib/meeting/topic-orchestrator'

// BUG-002 FIX: Warn if WS_SERVER_URL is not configured in production
const WS_SERVER_URL = process.env.WS_SERVER_URL || 'http://localhost:3001'
const BROADCAST_SECRET = process.env.BROADCAST_SECRET
const IS_PRODUCTION = process.env.NODE_ENV === 'production'

if (IS_PRODUCTION && !process.env.WS_SERVER_URL) {
  console.error('WARNING: WS_SERVER_URL is not set in production. Real-time transcription will not work.')
}

// BUG-008 FIX: Add retry logic for broadcast
async function broadcastToMeeting(
  meetingId: string,
  type: string,
  data: unknown,
  retries = 2
): Promise<boolean> {
  // BUG-002 FIX: Skip broadcast entirely in production if WS_SERVER_URL is not configured
  if (IS_PRODUCTION && !process.env.WS_SERVER_URL) {
    console.warn('Skipping broadcast: WS_SERVER_URL not configured in production')
    return false
  }

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(`${WS_SERVER_URL}/broadcast`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(BROADCAST_SECRET ? { 'x-broadcast-secret': BROADCAST_SECRET } : {}),
        },
        body: JSON.stringify({ meetingId, type, data }),
      })

      if (response.ok) {
        return true
      }

      console.error(`Broadcast failed (attempt ${attempt + 1}/${retries + 1}):`, response.status)

      // Don't retry on auth errors
      if (response.status === 401 || response.status === 403) {
        console.error('Broadcast auth failed - check BROADCAST_SECRET configuration')
        return false
      }
    } catch (error) {
      console.error(`Broadcast error (attempt ${attempt + 1}/${retries + 1}):`, error)
    }

    // Wait before retry (exponential backoff)
    if (attempt < retries) {
      await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, attempt)))
    }
  }

  return false
}

// BUG-005 FIX: Helper to ensure transcript exists (atomic upsert for P2002 race condition)
async function ensureTranscript(meeting: { id: string; userId: string; title: string; transcript: { id: string } | null }) {
  if (meeting.transcript) {
    return meeting.transcript
  }

  // Use upsert to handle concurrent webhook requests (prevents P2002)
  const transcript = await prisma.transcript.upsert({
    where: { meetingId: meeting.id },
    update: {}, // No update needed - just return existing
    create: {
      userId: meeting.userId,
      title: meeting.title,
      sourceType: 'MEETING',
      status: 'PROCESSING',
      meetingId: meeting.id,
    },
  })

  console.log('Ensured transcript for meeting:', meeting.id, 'transcript:', transcript.id)
  return transcript
}

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

        // トピックオーケストレーターをクリーンアップ
        await topicOrchestrator.endMeeting(meeting.id)
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
        if (event.data?.transcript) {
          // BUG-005 FIX: Ensure transcript exists (handles race condition)
          const transcript = await ensureTranscript(meeting)
          const segment = event.data.transcript

          // Find or create speaker
          let speaker = await prisma.speaker.findFirst({
            where: {
              transcriptId: transcript.id,
              label: segment.speaker,
            },
          })

          if (!speaker) {
            const speakerColors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6']
            const existingSpeakers = await prisma.speaker.count({
              where: { transcriptId: transcript.id },
            })

            speaker = await prisma.speaker.create({
              data: {
                transcriptId: transcript.id,
                label: segment.speaker,
                color: speakerColors[existingSpeakers % speakerColors.length],
              },
            })
          }

          const createdSegment = await prisma.transcriptSegment.create({
            data: {
              transcriptId: transcript.id,
              speakerId: speaker.id,
              text: segment.text,
              startTime: segment.startTime,
              endTime: segment.endTime,
            },
          })

          // WebSocketでブロードキャスト
          await broadcastToMeeting(meeting.id, 'transcript.final', {
            segment: {
              id: createdSegment.id,
              speaker: segment.speaker,
              speakerColor: speaker.color,
              text: segment.text,
              startTime: segment.startTime,
              endTime: segment.endTime,
            },
          })

          // トピック分析オーケストレーターにセグメントを追加
          await topicOrchestrator.addSegment(meeting.id, {
            speaker: segment.speaker,
            text: segment.text,
            startTime: segment.startTime,
          })
        }
        break

      case 'transcript.partial':
        // リアルタイムで中間結果をブロードキャスト
        if (event.data?.transcript) {
          await broadcastToMeeting(meeting.id, 'transcript.partial', {
            speaker: event.data.transcript.speaker,
            text: event.data.transcript.text,
          })
        }
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
