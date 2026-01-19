'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Video, Plus, Calendar, Clock, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { Skeleton } from '@/components/ui/Skeleton'
import { formatDistanceToNow } from 'date-fns'
import { ja } from 'date-fns/locale'
import Link from 'next/link'
import type { Meeting, Platform, MeetingStatus, BotStatus } from '@/types/transcript'

async function fetchMeetings(): Promise<Meeting[]> {
  const res = await fetch('/api/meetings')
  if (!res.ok) throw new Error('Failed to fetch meetings')
  return res.json()
}

export default function MeetingsPage() {
  const queryClient = useQueryClient()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [meetingUrl, setMeetingUrl] = useState('')
  const [title, setTitle] = useState('')
  const [scheduledStart, setScheduledStart] = useState('')

  const { data: meetings, isLoading } = useQuery({
    queryKey: ['meetings'],
    queryFn: fetchMeetings,
  })

  const createMutation = useMutation({
    mutationFn: async (data: { title: string; meetingUrl: string; scheduledStart: string }) => {
      const res = await fetch('/api/meetings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error('Failed to create meeting')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meetings'] })
      setIsModalOpen(false)
      setMeetingUrl('')
      setTitle('')
      setScheduledStart('')
    },
  })

  const detectPlatform = (url: string): Platform | null => {
    if (url.includes('zoom.us')) return 'ZOOM'
    if (url.includes('meet.google.com')) return 'GOOGLE_MEET'
    return null
  }

  const getStatusBadge = (status: MeetingStatus, botStatus?: BotStatus | null) => {
    if (botStatus === 'ACTIVE') {
      return <Badge variant="success">録音中</Badge>
    }
    if (botStatus === 'JOINING') {
      return <Badge variant="info">参加中</Badge>
    }
    switch (status) {
      case 'SCHEDULED':
        return <Badge variant="default">予定</Badge>
      case 'IN_PROGRESS':
        return <Badge variant="info">進行中</Badge>
      case 'COMPLETED':
        return <Badge variant="success">完了</Badge>
      case 'CANCELLED':
        return <Badge variant="error">キャンセル</Badge>
      default:
        return null
    }
  }

  const getPlatformIcon = (platform: Platform) => {
    return platform === 'ZOOM' ? 'Zoom' : 'Google Meet'
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const platform = detectPlatform(meetingUrl)
    if (!platform) {
      alert('ZoomまたはGoogle MeetのURLを入力してください')
      return
    }
    createMutation.mutate({
      title,
      meetingUrl,
      scheduledStart: new Date(scheduledStart).toISOString(),
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Web会議</h1>
        <Button onClick={() => setIsModalOpen(true)}>
          <Plus className="h-4 w-4" />
          会議を追加
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-4">
          {[...Array(3)].map((_, i) => (
            <Card key={i} className="p-4">
              <div className="flex items-center gap-4">
                <Skeleton className="h-12 w-12 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="h-3 w-1/4" />
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : meetings?.length === 0 ? (
        <Card className="p-12 text-center">
          <Video className="mx-auto h-12 w-12 text-gray-300" />
          <h3 className="mt-4 text-lg font-medium text-gray-900">
            会議がありません
          </h3>
          <p className="mt-2 text-gray-500">
            ZoomまたはGoogle Meetの会議を追加して、自動文字起こしを始めましょう
          </p>
          <Button className="mt-6" onClick={() => setIsModalOpen(true)}>
            <Plus className="h-4 w-4" />
            会議を追加
          </Button>
        </Card>
      ) : (
        <div className="grid gap-4">
          {meetings?.map((meeting) => (
            <Link key={meeting.id} href={`/meetings/${meeting.id}`}>
              <Card className="p-4 transition hover:shadow-md">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary-50">
                      <Video className="h-6 w-6 text-primary-600" />
                    </div>
                    <div>
                      <h3 className="font-medium text-gray-900">
                        {meeting.title}
                      </h3>
                      <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-gray-500">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5" />
                          {new Date(meeting.scheduledStart).toLocaleDateString('ja-JP')}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" />
                          {new Date(meeting.scheduledStart).toLocaleTimeString('ja-JP', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                        <span>{getPlatformIcon(meeting.platform)}</span>
                      </div>
                    </div>
                  </div>
                  {getStatusBadge(meeting.status, meeting.botStatus)}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {/* Add Meeting Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <Card className="w-full max-w-md p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              会議を追加
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                label="タイトル"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="ミーティングのタイトル"
                required
              />
              <Input
                label="会議URL"
                value={meetingUrl}
                onChange={(e) => setMeetingUrl(e.target.value)}
                placeholder="https://zoom.us/j/... または https://meet.google.com/..."
                required
              />
              <Input
                label="開始日時"
                type="datetime-local"
                value={scheduledStart}
                onChange={(e) => setScheduledStart(e.target.value)}
                required
              />
              <div className="flex justify-end gap-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsModalOpen(false)}
                >
                  キャンセル
                </Button>
                <Button
                  type="submit"
                  isLoading={createMutation.isPending}
                >
                  追加
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  )
}
