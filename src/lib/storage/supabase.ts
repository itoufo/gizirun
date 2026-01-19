import { createClient } from '@/lib/supabase/server'

const BUCKET_NAME = 'audio-files'

export async function getUploadUrl(key: string): Promise<{
  signedUrl: string
  token: string
  key: string
}> {
  const supabase = await createClient()
  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .createSignedUploadUrl(key)

  if (error) {
    throw new Error(`Failed to create upload URL: ${error.message}`)
  }

  return {
    signedUrl: data.signedUrl,
    token: data.token,
    key,
  }
}

export async function getDownloadUrl(
  key: string,
  expiresIn: number = 3600
): Promise<string> {
  const supabase = await createClient()
  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .createSignedUrl(key, expiresIn)

  if (error) {
    throw new Error(`Failed to create download URL: ${error.message}`)
  }

  return data.signedUrl
}

export async function deleteFile(key: string) {
  const supabase = await createClient()
  const { error } = await supabase.storage.from(BUCKET_NAME).remove([key])

  if (error) {
    throw new Error(`Delete failed: ${error.message}`)
  }
}

export function generateFileKey(userId: string, fileName: string): string {
  const timestamp = Date.now()
  const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_')
  return `${userId}/${timestamp}-${sanitizedFileName}`
}

export async function getPublicUrl(key: string): Promise<string> {
  const supabase = await createClient()
  const { data } = supabase.storage.from(BUCKET_NAME).getPublicUrl(key)
  return data.publicUrl
}
