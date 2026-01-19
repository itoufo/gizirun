import { z } from 'zod'

const meetingUrlSchema = z.string().url('有効なURLを入力してください').refine(
  (url) => url.includes('zoom.us') || url.includes('meet.google.com'),
  { message: 'ZoomまたはGoogle MeetのURLのみ対応しています' }
)

export const createMeetingSchema = z.object({
  title: z.string().min(1, 'タイトルは必須です').max(200, 'タイトルは200文字以内です'),
  meetingUrl: meetingUrlSchema,
  scheduledStart: z.string().datetime({ message: '有効な日時を入力してください' }),
  meetingPassword: z.string().max(100).optional(),
})

export const updateMeetingSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  status: z.enum(['SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).optional(),
})

export type CreateMeetingInput = z.infer<typeof createMeetingSchema>
export type UpdateMeetingInput = z.infer<typeof updateMeetingSchema>
