'use client'

import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { useMutation } from '@tanstack/react-query'
import { Upload, File, X, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { cn } from '@/lib/utils/cn'
import { useRouter } from 'next/navigation'

const ACCEPTED_FILE_TYPES = {
  'audio/*': ['.mp3', '.wav', '.m4a', '.ogg', '.flac', '.webm'],
  'video/*': ['.mp4', '.mov', '.avi', '.webm', '.mkv'],
}

const MAX_FILE_SIZE = 500 * 1024 * 1024 // 500MB

export default function UploadPage() {
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [uploadProgress, setUploadProgress] = useState(0)

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      // 1. Get presigned URL
      const presignedRes = await fetch('/api/upload/presigned', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: file.name,
          fileType: file.type,
          fileSize: file.size,
        }),
      })

      if (!presignedRes.ok) throw new Error('Failed to get upload URL')
      const { uploadUrl, key, publicUrl } = await presignedRes.json()

      // 2. Upload to S3
      const uploadRes = await fetch(uploadUrl, {
        method: 'PUT',
        body: file,
        headers: {
          'Content-Type': file.type,
        },
      })

      if (!uploadRes.ok) throw new Error('Failed to upload file')

      // 3. Trigger transcription
      const processRes = await fetch('/api/upload/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title || file.name.replace(/\.[^/.]+$/, ''),
          audioUrl: publicUrl,
          audioKey: key,
        }),
      })

      if (!processRes.ok) throw new Error('Failed to start transcription')
      return processRes.json()
    },
    onSuccess: (data) => {
      router.push(`/transcripts/${data.id}`)
    },
    onError: (error) => {
      console.error('Upload failed:', error)
      alert('アップロードに失敗しました。もう一度お試しください。')
    },
  })

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const selectedFile = acceptedFiles[0]
    if (selectedFile) {
      setFile(selectedFile)
      if (!title) {
        setTitle(selectedFile.name.replace(/\.[^/.]+$/, ''))
      }
    }
  }, [title])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED_FILE_TYPES,
    maxSize: MAX_FILE_SIZE,
    maxFiles: 1,
  })

  const handleUpload = () => {
    if (!file) return
    uploadMutation.mutate(file)
  }

  const removeFile = () => {
    setFile(null)
    setTitle('')
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">
        ファイルアップロード
      </h1>

      <Card className="p-6">
        {!file ? (
          <div
            {...getRootProps()}
            className={cn(
              'flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-12 transition',
              isDragActive
                ? 'border-primary-500 bg-primary-50'
                : 'border-gray-300 hover:border-gray-400'
            )}
          >
            <input {...getInputProps()} />
            <Upload
              className={cn(
                'h-12 w-12',
                isDragActive ? 'text-primary-500' : 'text-gray-400'
              )}
            />
            <p className="mt-4 text-center text-gray-600">
              {isDragActive
                ? 'ファイルをドロップしてください'
                : 'ファイルをドラッグ&ドロップ、またはクリックして選択'}
            </p>
            <p className="mt-2 text-sm text-gray-400">
              対応形式: MP3, WAV, M4A, MP4, MOV など (最大500MB)
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-lg bg-gray-50 p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-100">
                  <File className="h-5 w-5 text-primary-600" />
                </div>
                <div>
                  <p className="font-medium text-gray-900">{file.name}</p>
                  <p className="text-sm text-gray-500">
                    {formatFileSize(file.size)}
                  </p>
                </div>
              </div>
              <button
                onClick={removeFile}
                className="rounded p-1 hover:bg-gray-200"
                disabled={uploadMutation.isPending}
              >
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>

            <Input
              label="タイトル"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="文字起こしのタイトル"
            />

            {uploadMutation.isPending && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">処理中...</span>
                  <span className="text-gray-500">{uploadProgress}%</span>
                </div>
                <div className="h-2 rounded-full bg-gray-200">
                  <div
                    className="h-2 rounded-full bg-primary-600 transition-all"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            )}

            <Button
              className="w-full"
              onClick={handleUpload}
              disabled={uploadMutation.isPending || !title}
              isLoading={uploadMutation.isPending}
            >
              {uploadMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  処理中...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" />
                  アップロードして文字起こし
                </>
              )}
            </Button>
          </div>
        )}
      </Card>

      <p className="text-sm text-gray-500 text-center">
        アップロードされたファイルはAssemblyAI APIを使用して文字起こしされます。
        話者分離も自動的に行われます。
      </p>
    </div>
  )
}
