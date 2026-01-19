'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { FileText, Clock, User, Search, MoreVertical, Trash2 } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { Skeleton } from '@/components/ui/Skeleton'
import { formatDistanceToNow } from 'date-fns'
import { ja } from 'date-fns/locale'
import type { Transcript } from '@/types/transcript'

async function fetchTranscripts(): Promise<Transcript[]> {
  const res = await fetch('/api/transcripts')
  if (!res.ok) throw new Error('Failed to fetch transcripts')
  return res.json()
}

export default function TranscriptsPage() {
  const [searchQuery, setSearchQuery] = useState('')

  const { data: transcripts, isLoading, error } = useQuery({
    queryKey: ['transcripts'],
    queryFn: fetchTranscripts,
  })

  const filteredTranscripts = transcripts?.filter((t) =>
    t.title.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return <Badge variant="success">完了</Badge>
      case 'PROCESSING':
        return <Badge variant="info">処理中</Badge>
      case 'FAILED':
        return <Badge variant="error">失敗</Badge>
      default:
        return <Badge variant="default">保留中</Badge>
    }
  }

  const getSourceIcon = (sourceType: string) => {
    switch (sourceType) {
      case 'RECORDING':
        return '録音'
      case 'UPLOAD':
        return 'アップロード'
      case 'MEETING':
        return '会議'
      default:
        return sourceType
    }
  }

  if (error) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <p className="text-red-500">エラーが発生しました</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">文字起こし一覧</h1>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <Input
          placeholder="検索..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
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
      ) : filteredTranscripts?.length === 0 ? (
        <Card className="p-12 text-center">
          <FileText className="mx-auto h-12 w-12 text-gray-300" />
          <h3 className="mt-4 text-lg font-medium text-gray-900">
            文字起こしがありません
          </h3>
          <p className="mt-2 text-gray-500">
            録音またはファイルをアップロードして始めましょう
          </p>
          <div className="mt-6 flex justify-center gap-4">
            <Link
              href="/record"
              className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
            >
              録音を開始
            </Link>
            <Link
              href="/upload"
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              ファイルをアップロード
            </Link>
          </div>
        </Card>
      ) : (
        <div className="grid gap-4">
          {filteredTranscripts?.map((transcript) => (
            <Link key={transcript.id} href={`/transcripts/${transcript.id}`}>
              <Card className="p-4 transition hover:shadow-md">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary-50">
                      <FileText className="h-6 w-6 text-primary-600" />
                    </div>
                    <div>
                      <h3 className="font-medium text-gray-900">
                        {transcript.title}
                      </h3>
                      <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-gray-500">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" />
                          {formatDistanceToNow(new Date(transcript.createdAt), {
                            addSuffix: true,
                            locale: ja,
                          })}
                        </span>
                        {transcript.duration && (
                          <span>
                            {Math.floor(transcript.duration / 60)}分
                            {transcript.duration % 60}秒
                          </span>
                        )}
                        <span>{getSourceIcon(transcript.sourceType)}</span>
                        {transcript.speakers?.length > 0 && (
                          <span className="flex items-center gap-1">
                            <User className="h-3.5 w-3.5" />
                            {transcript.speakers.length}人
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {getStatusBadge(transcript.status)}
                    <button
                      onClick={(e) => e.preventDefault()}
                      className="rounded p-1 hover:bg-gray-100"
                    >
                      <MoreVertical className="h-4 w-4 text-gray-400" />
                    </button>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
