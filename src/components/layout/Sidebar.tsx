'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils/cn'
import {
  FileText,
  Mic,
  Upload,
  Video,
  Settings,
  PlusCircle,
} from 'lucide-react'

const navigation = [
  { name: '文字起こし一覧', href: '/transcripts', icon: FileText },
  { name: 'リアルタイム録音', href: '/record', icon: Mic },
  { name: 'ファイルアップロード', href: '/upload', icon: Upload },
  { name: 'Web会議', href: '/meetings', icon: Video },
]

const secondaryNavigation = [
  { name: '設定', href: '/settings', icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="fixed left-0 top-16 z-30 h-[calc(100vh-4rem)] w-64 border-r border-gray-200 bg-white">
      <nav className="flex h-full flex-col">
        <div className="flex-1 space-y-1 px-3 py-4">
          <Link
            href="/record"
            className="mb-4 flex items-center justify-center gap-2 rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-700"
          >
            <PlusCircle className="h-4 w-4" />
            新規録音
          </Link>

          {navigation.map((item) => {
            const isActive = pathname.startsWith(item.href)
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary-50 text-primary-600'
                    : 'text-gray-700 hover:bg-gray-50'
                )}
              >
                <item.icon className="h-5 w-5" />
                {item.name}
              </Link>
            )
          })}
        </div>

        <div className="border-t border-gray-200 px-3 py-4">
          {secondaryNavigation.map((item) => {
            const isActive = pathname.startsWith(item.href)
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary-50 text-primary-600'
                    : 'text-gray-700 hover:bg-gray-50'
                )}
              >
                <item.icon className="h-5 w-5" />
                {item.name}
              </Link>
            )
          })}
        </div>
      </nav>
    </aside>
  )
}
