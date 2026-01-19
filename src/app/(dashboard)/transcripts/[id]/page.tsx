'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, useRouter } from 'next/navigation'
import { useState } from 'react'
import {
  ArrowLeft,
  Clock,
  User,
  Sparkles,
  Download,
  Trash2,
  Edit2,
  Check,
  X,
  Loader2,
} from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Skeleton'
import { cn } from '@/lib/utils/cn'
import type { Transcript } from '@/types/transcript'

async function fetchTranscript(id: string): Promise<Transcript> {
  const res = await fetch(`/api/transcripts/${id}`)
  if (!res.ok) throw new Error('Failed to fetch transcript')
  return res.json()
}

export default function TranscriptDetailPage() {
  const params = useParams()
  const router = useRouter()
  const queryClient = useQueryClient()
  const [editingSpeaker, setEditingSpeaker] = useState<string | null>(null)
  const [speakerName, setSpeakerName] = useState('')

  const { data: transcript, isLoading, error } = useQuery({
    queryKey: ['transcript', params.id],
    queryFn: () => fetchTranscript(params.id as string),
  })

  const summarizeMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/transcripts/${params.id}/summarize`, {
        method: 'POST',
      })
      if (!res.ok) throw new Error('Failed to summarize')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transcript', params.id] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/transcripts/${params.id}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error('Failed to delete')
      return res.json()
    },
    onSuccess: () => {
      router.push('/transcripts')
    },
  })

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  const getSpeakerColor = (speakerId: string | null) => {
    const speaker = transcript?.speakers.find((s) => s.id === speakerId)
    return speaker?.color || '#6B7280'
  }

  const handleExport = (format: 'txt' | 'srt') => {
    if (!transcript) return

    let content = ''
    if (format === 'txt') {
      content = transcript.segments
        .map((s) => {
          const speaker = transcript.speakers.find((sp) => sp.id === s.speakerId)
          return `[${formatTime(s.startTime)}] ${speaker?.name || speaker?.label || 'Unknown'}: ${s.text}`
        })
        .join('\n\n')
    } else if (format === 'srt') {
      content = transcript.segments
        .map((s, i) => {
          const speaker = transcript.speakers.find((sp) => sp.id === s.speakerId)
          const formatSrtTime = (sec: number) => {
            const h = Math.floor(sec / 3600)
            const m = Math.floor((sec % 3600) / 60)
            const secs = Math.floor(sec % 60)
            const ms = Math.floor((sec % 1) * 1000)
            return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`
          }
          return `${i + 1}\n${formatSrtTime(s.startTime)} --> ${formatSrtTime(s.endTime)}\n${speaker?.name || speaker?.label || ''}: ${s.text}`
        })
        .join('\n\n')
    }

    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${transcript.title}.${format}`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Card className="p-6">
          <Skeleton className="h-6 w-48 mb-4" />
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </Card>
      </div>
    )
  }

  if (error || !transcript) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <p className="text-red-500">文字起こしが見つかりません</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <Link
            href="/transcripts"
            className="mb-2 flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
          >
            <ArrowLeft className="h-4 w-4" />
            一覧に戻る
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">{transcript.title}</h1>
          <div className="mt-2 flex items-center gap-4 text-sm text-gray-500">
            {transcript.duration && (
              <span className="flex items-center gap-1">
                <Clock className="h-4 w-4" />
                {Math.floor(transcript.duration / 60)}分{transcript.duration % 60}秒
              </span>
            )}
            <span className="flex items-center gap-1">
              <User className="h-4 w-4" />
              {transcript.speakers.length}人
            </span>
            <Badge
              variant={
                transcript.status === 'COMPLETED'
                  ? 'success'
                  : transcript.status === 'PROCESSING'
                  ? 'info'
                  : 'default'
              }
            >
              {transcript.status === 'COMPLETED' ? '完了' : transcript.status === 'PROCESSING' ? '処理中' : '保留中'}
            </Badge>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleExport('txt')}
          >
            <Download className="h-4 w-4" />
            TXT
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleExport('srt')}
          >
            <Download className="h-4 w-4" />
            SRT
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => {
              if (confirm('この文字起こしを削除しますか？')) {
                deleteMutation.mutate()
              }
            }}
            isLoading={deleteMutation.isPending}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Transcript content */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>文字起こし</CardTitle>
          </CardHeader>
          <CardContent>
            {transcript.segments.length === 0 ? (
              <p className="text-center text-gray-500 py-8">
                {transcript.status === 'PROCESSING'
                  ? '処理中です...'
                  : '文字起こしがありません'}
              </p>
            ) : (
              <div className="space-y-4">
                {transcript.segments.map((segment) => {
                  const speaker = transcript.speakers.find(
                    (s) => s.id === segment.speakerId
                  )
                  return (
                    <div key={segment.id} className="flex gap-3">
                      <span className="w-14 flex-shrink-0 text-xs text-gray-400 font-mono pt-1">
                        {formatTime(segment.startTime)}
                      </span>
                      <div className="flex-1">
                        <span
                          className="text-sm font-medium"
                          style={{ color: speaker?.color || '#6B7280' }}
                        >
                          {speaker?.name || speaker?.label || 'Unknown'}
                        </span>
                        <p className="text-gray-700 mt-0.5">{segment.text}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Speakers */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">話者</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {transcript.speakers.map((speaker) => (
                  <div
                    key={speaker.id}
                    className="flex items-center justify-between py-1"
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: speaker.color || '#6B7280' }}
                      />
                      <span className="text-sm">
                        {speaker.name || speaker.label}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
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
                disabled={summarizeMutation.isPending || transcript.status !== 'COMPLETED'}
              >
                {summarizeMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                {transcript.summary ? '再生成' : '生成'}
              </Button>
            </CardHeader>
            <CardContent>
              {transcript.summary ? (
                <div className="space-y-4">
                  <div>
                    <h4 className="text-sm font-medium text-gray-900 mb-2">
                      要約
                    </h4>
                    <p className="text-sm text-gray-600">
                      {transcript.summary.content}
                    </p>
                  </div>
                  {(transcript.summary.keyPoints as string[]).length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium text-gray-900 mb-2">
                        キーポイント
                      </h4>
                      <ul className="list-disc list-inside space-y-1">
                        {(transcript.summary.keyPoints as string[]).map(
                          (point, i) => (
                            <li key={i} className="text-sm text-gray-600">
                              {point}
                            </li>
                          )
                        )}
                      </ul>
                    </div>
                  )}
                  {(transcript.summary.actionItems as string[]).length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium text-gray-900 mb-2">
                        アクションアイテム
                      </h4>
                      <ul className="list-disc list-inside space-y-1">
                        {(transcript.summary.actionItems as string[]).map(
                          (item, i) => (
                            <li key={i} className="text-sm text-gray-600">
                              {item}
                            </li>
                          )
                        )}
                      </ul>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-gray-500 text-center py-4">
                  {transcript.status === 'COMPLETED'
                    ? '「生成」をクリックしてAI要約を作成'
                    : '文字起こし完了後に利用可能'}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
