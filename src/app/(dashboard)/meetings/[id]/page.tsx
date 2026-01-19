'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  Video,
  Clock,
  Calendar,
  ExternalLink,
  Trash2,
  Sparkles,
  Loader2,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Skeleton'
import { cn } from '@/lib/utils/cn'
import type { Meeting, BotStatus, MeetingStatus } from '@/types/transcript'

interface MeetingWithTranscript extends Omit<Meeting, 'transcript'> {
  transcript?: {
    id: string
    status: string
    segments: Array<{
      id: string
      text: string
      startTime: number
      speaker?: { label: string; name?: string; color?: string }
    }>
    speakers: Array<{ id: string; label: string; name?: string; color?: string }>
    summary?: { content: string; keyPoints: string[]; actionItems: string[] }
  }
}

async function fetchMeeting(id: string): Promise<MeetingWithTranscript> {
  const res = await fetch(`/api/meetings/${id}`)
  if (!res.ok) throw new Error('Failed to fetch meeting')
  return res.json()
}

export default function MeetingDetailPage() {
  const params = useParams()
  const router = useRouter()
  const queryClient = useQueryClient()

  const { data: meeting, isLoading, error } = useQuery({
    queryKey: ['meeting', params.id],
    queryFn: () => fetchMeeting(params.id as string),
    refetchInterval: (query) => {
      // Refetch every 5 seconds if meeting is in progress
      const data = query.state.data
      if (data?.botStatus === 'ACTIVE' || data?.botStatus === 'JOINING') {
        return 5000
      }
      return false
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/meetings/${params.id}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error('Failed to delete')
      return res.json()
    },
    onSuccess: () => {
      router.push('/meetings')
    },
  })

  const summarizeMutation = useMutation({
    mutationFn: async () => {
      if (!meeting?.transcript?.id) throw new Error('No transcript')
      const res = await fetch(`/api/transcripts/${meeting.transcript.id}/summarize`, {
        method: 'POST',
      })
      if (!res.ok) throw new Error('Failed to summarize')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meeting', params.id] })
    },
  })

  const getBotStatusBadge = (botStatus?: BotStatus | null, status?: MeetingStatus) => {
    if (botStatus === 'ACTIVE') {
      return <Badge variant="success">録音中</Badge>
    }
    if (botStatus === 'JOINING') {
      return <Badge variant="info">参加中</Badge>
    }
    if (botStatus === 'FAILED') {
      return <Badge variant="error">エラー</Badge>
    }
    if (botStatus === 'COMPLETED' || status === 'COMPLETED') {
      return <Badge variant="success">完了</Badge>
    }
    if (status === 'SCHEDULED') {
      return <Badge variant="default">予定</Badge>
    }
    return null
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Card className="p-6">
          <Skeleton className="h-6 w-48 mb-4" />
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </Card>
      </div>
    )
  }

  if (error || !meeting) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <p className="text-red-500">会議が見つかりません</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <Link
            href="/meetings"
            className="mb-2 flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
          >
            <ArrowLeft className="h-4 w-4" />
            一覧に戻る
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">{meeting.title}</h1>
          <div className="mt-2 flex items-center gap-4 text-sm text-gray-500">
            <span className="flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              {new Date(meeting.scheduledStart).toLocaleDateString('ja-JP')}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              {new Date(meeting.scheduledStart).toLocaleTimeString('ja-JP', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
            <span>{meeting.platform === 'ZOOM' ? 'Zoom' : 'Google Meet'}</span>
            {getBotStatusBadge(meeting.botStatus, meeting.status)}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={meeting.meetingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            <ExternalLink className="h-4 w-4" />
            会議に参加
          </a>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => {
              if (confirm('この会議を削除しますか？')) {
                deleteMutation.mutate()
              }
            }}
            isLoading={deleteMutation.isPending}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Error message */}
      {meeting.errorMessage && (
        <Card className="border-red-200 bg-red-50 p-4">
          <p className="text-red-600">{meeting.errorMessage}</p>
        </Card>
      )}

      {/* Bot status */}
      {meeting.botStatus === 'ACTIVE' && (
        <Card className="border-green-200 bg-green-50 p-4">
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 animate-pulse rounded-full bg-green-500" />
            <p className="text-green-700">ボットが会議に参加して録音中です</p>
          </div>
        </Card>
      )}

      {meeting.botStatus === 'JOINING' && (
        <Card className="border-blue-200 bg-blue-50 p-4">
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
            <p className="text-blue-700">ボットが会議に参加しています...</p>
          </div>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Transcript */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>文字起こし</CardTitle>
          </CardHeader>
          <CardContent>
            {!meeting.transcript ? (
              <p className="text-center text-gray-500 py-8">
                {meeting.botStatus === 'SCHEDULED'
                  ? '会議開始後に文字起こしが表示されます'
                  : meeting.botStatus === 'JOINING' || meeting.botStatus === 'ACTIVE'
                  ? '文字起こしを取得中...'
                  : '文字起こしがありません'}
              </p>
            ) : meeting.transcript.segments.length === 0 ? (
              <p className="text-center text-gray-500 py-8">
                {meeting.transcript.status === 'PROCESSING'
                  ? '処理中...'
                  : '文字起こしがありません'}
              </p>
            ) : (
              <div className="space-y-4 max-h-[500px] overflow-y-auto">
                {meeting.transcript.segments.map((segment) => (
                  <div key={segment.id} className="flex gap-3">
                    <span className="w-14 flex-shrink-0 text-xs text-gray-400 font-mono pt-1">
                      {formatTime(segment.startTime)}
                    </span>
                    <div className="flex-1">
                      <span
                        className="text-sm font-medium"
                        style={{ color: segment.speaker?.color || '#6B7280' }}
                      >
                        {segment.speaker?.name || segment.speaker?.label || 'Unknown'}
                      </span>
                      <p className="text-gray-700 mt-0.5">{segment.text}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Summary */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">AI要約</CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => summarizeMutation.mutate()}
              disabled={
                summarizeMutation.isPending ||
                !meeting.transcript ||
                meeting.transcript.segments.length === 0
              }
            >
              {summarizeMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {meeting.transcript?.summary ? '再生成' : '生成'}
            </Button>
          </CardHeader>
          <CardContent>
            {meeting.transcript?.summary ? (
              <div className="space-y-4">
                <div>
                  <h4 className="text-sm font-medium text-gray-900 mb-2">要約</h4>
                  <p className="text-sm text-gray-600">
                    {meeting.transcript.summary.content}
                  </p>
                </div>
                {meeting.transcript.summary.keyPoints.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-gray-900 mb-2">
                      キーポイント
                    </h4>
                    <ul className="list-disc list-inside space-y-1">
                      {meeting.transcript.summary.keyPoints.map((point, i) => (
                        <li key={i} className="text-sm text-gray-600">
                          {point}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {meeting.transcript.summary.actionItems.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-gray-900 mb-2">
                      アクションアイテム
                    </h4>
                    <ul className="list-disc list-inside space-y-1">
                      {meeting.transcript.summary.actionItems.map((item, i) => (
                        <li key={i} className="text-sm text-gray-600">
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-gray-500 text-center py-4">
                {meeting.transcript && meeting.transcript.segments.length > 0
                  ? '「生成」をクリックしてAI要約を作成'
                  : '文字起こし完了後に利用可能'}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
