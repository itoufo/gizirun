'use client'

import { createClient } from '@/lib/supabase/client'
import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'

interface UserSession {
  user: {
    id: string
    email: string | undefined
    name: string | undefined
    image: string | undefined
  } | null
  isLoading: boolean
}

export function useUser(): UserSession {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    // Get initial user
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)
      setIsLoading(false)
    }
    getUser()

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null)
        setIsLoading(false)
      }
    )

    return () => subscription.unsubscribe()
  }, [supabase.auth])

  if (!user) {
    return { user: null, isLoading }
  }

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.user_metadata?.full_name || user.email,
      image: user.user_metadata?.avatar_url,
    },
    isLoading,
  }
}

export async function signOut() {
  const supabase = createClient()
  await supabase.auth.signOut()
  window.location.href = '/'
}
