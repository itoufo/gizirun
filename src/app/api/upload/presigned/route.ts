import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/auth'
import { getUploadPresignedUrl, generateFileKey } from '@/lib/storage/s3'

const MAX_FILE_SIZE = 500 * 1024 * 1024 // 500MB

const ALLOWED_TYPES = [
  'audio/mpeg',
  'audio/wav',
  'audio/mp4',
  'audio/x-m4a',
  'audio/ogg',
  'audio/flac',
  'audio/webm',
  'video/mp4',
  'video/quicktime',
  'video/x-msvideo',
  'video/webm',
  'video/x-matroska',
]

export async function POST(request: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { fileName, fileType, fileSize } = body

    if (!fileName || !fileType) {
      return NextResponse.json(
        { error: 'fileName and fileType are required' },
        { status: 400 }
      )
    }

    if (fileSize > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'File size exceeds maximum allowed (500MB)' },
        { status: 400 }
      )
    }

    if (!ALLOWED_TYPES.includes(fileType)) {
      return NextResponse.json(
        { error: 'File type not supported' },
        { status: 400 }
      )
    }

    const key = generateFileKey(session.user.id, fileName)
    const result = await getUploadPresignedUrl(key, fileType)

    return NextResponse.json(result)
  } catch (error) {
    console.error('Failed to generate presigned URL:', error)
    return NextResponse.json(
      { error: 'Failed to generate upload URL' },
      { status: 500 }
    )
  }
}
