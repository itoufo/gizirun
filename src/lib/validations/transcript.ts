import { z } from 'zod'

export const createTranscriptSchema = z.object({
  title: z.string().min(1, 'タイトルは必須です').max(200, 'タイトルは200文字以内です'),
  sourceType: z.enum(['RECORDING', 'UPLOAD', 'MEETING']).optional().default('RECORDING'),
  audioUrl: z.string().url('有効なURLを入力してください').optional(),
  audioKey: z.string().optional(),
  meetingId: z.string().optional(),
})

export const updateTranscriptSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  rawText: z.string().optional(),
})

export type CreateTranscriptInput = z.infer<typeof createTranscriptSchema>
export type UpdateTranscriptInput = z.infer<typeof updateTranscriptSchema>
