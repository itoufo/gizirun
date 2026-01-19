import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/db/prisma'

export async function auth() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return null
  }

  // Lazy sync: ensure user exists in Prisma database
  try {
    await prisma.user.upsert({
      where: { id: user.id },
      update: {
        email: user.email,
        name: user.user_metadata?.full_name || user.email,
        image: user.user_metadata?.avatar_url,
        emailVerified: user.email_confirmed_at ? new Date(user.email_confirmed_at) : null,
      },
      create: {
        id: user.id,
        email: user.email,
        name: user.user_metadata?.full_name || user.email,
        image: user.user_metadata?.avatar_url,
        emailVerified: user.email_confirmed_at ? new Date(user.email_confirmed_at) : null,
      },
    })
  } catch (error) {
    console.error('Failed to sync user:', error)
    // Continue even if sync fails - user can still be authenticated
  }

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.user_metadata?.full_name || user.email,
      image: user.user_metadata?.avatar_url,
    }
  }
}

export async function getSession() {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  return session
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
}
