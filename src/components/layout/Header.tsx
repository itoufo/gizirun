'use client'

import { useUser, signOut } from '@/hooks/useUser'
import Link from 'next/link'
import Image from 'next/image'
import { LogOut, Settings, User } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'

export function Header() {
  const { user } = useUser()
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <header className="sticky top-0 z-40 border-b border-gray-200 bg-white">
      <div className="flex h-16 items-center justify-between px-6">
        <Link href="/transcripts" className="text-xl font-bold text-primary-600">
          Notta
        </Link>

        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="flex items-center gap-2 rounded-full p-1 hover:bg-gray-100"
          >
            {user?.image ? (
              <Image
                src={user.image}
                alt={user.name || 'User'}
                width={32}
                height={32}
                className="rounded-full"
              />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-100 text-primary-600">
                <User className="h-4 w-4" />
              </div>
            )}
          </button>

          {isMenuOpen && (
            <div className="absolute right-0 mt-2 w-56 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
              <div className="border-b border-gray-100 px-4 py-3">
                <p className="text-sm font-medium text-gray-900">
                  {user?.name}
                </p>
                <p className="truncate text-sm text-gray-500">
                  {user?.email}
                </p>
              </div>
              <Link
                href="/settings"
                className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                onClick={() => setIsMenuOpen(false)}
              >
                <Settings className="h-4 w-4" />
                設定
              </Link>
              <button
                onClick={() => signOut()}
                className="flex w-full items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-gray-50"
              >
                <LogOut className="h-4 w-4" />
                ログアウト
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
