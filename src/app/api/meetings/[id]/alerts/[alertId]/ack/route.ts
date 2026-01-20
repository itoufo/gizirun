import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/auth'
import { prisma } from '@/lib/db/prisma'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; alertId: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: meetingId, alertId } = await params

    // Verify the meeting belongs to the user
    const meeting = await prisma.meeting.findFirst({
      where: {
        id: meetingId,
        userId: session.user.id,
      },
    })

    if (!meeting) {
      return NextResponse.json({ error: 'Meeting not found' }, { status: 404 })
    }

    // Update the alert
    const alert = await prisma.facilitatorAlert.update({
      where: {
        id: alertId,
        meetingId: meetingId,
      },
      data: {
        acknowledged: true,
      },
    })

    return NextResponse.json(alert)
  } catch (error) {
    console.error('Failed to acknowledge alert:', error)
    return NextResponse.json(
      { error: 'Failed to acknowledge alert' },
      { status: 500 }
    )
  }
}
