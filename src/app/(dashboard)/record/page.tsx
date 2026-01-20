'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useMutation } from '@tanstack/react-query'
import { Mic, Square, Pause, Play, Save, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { cn } from '@/lib/utils/cn'
import { useAudioRecorder } from '@/hooks/useAudioRecorder'
import { useWebSocket, type TranscriptMessage } from '@/hooks/useWebSocket'
import { FacilitatorPanel, type FacilitatorAlert, type TopicState } from '@/components/meeting/FacilitatorPanel'

interface TranscriptSegment {
  id: string
  speaker: number
  text: string
  startTime: number
  isFinal: boolean
}

export default function RecordPage() {
  const router = useRouter()
  const [duration, setDuration] = useState(0)
  const [title, setTitle] = useState('')
  const [segments, setSegments] = useState<TranscriptSegment[]>([])
  const [interimText, setInterimText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const transcriptRef = useRef<HTMLDivElement>(null)
  const segmentIdCounter = useRef(0)

  // Topic analysis state
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [topicState, setTopicState] = useState<TopicState | null>(null)
  const [facilitatorAlerts, setFacilitatorAlerts] = useState<FacilitatorAlert[]>([])
  const sessionIdRef = useRef<string | null>(null)

  // Refs to track latest state for callbacks
  const isConnectedRef = useRef(false)
  const isPausedRef = useRef(false)

  // Determine WebSocket URL (Railway in production, localhost in dev)
  const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001/api/realtime'

  // WebSocket connection
  const {
    isConnected,
    connect,
    disconnect,
    send,
    sendJSON,
  } = useWebSocket({
    url: wsUrl,
    onMessage: (message) => {
      if (message.type === 'transcript') {
        handleTranscript(message as TranscriptMessage)
      } else if (message.type === 'error') {
        setError(message.error)
      } else if (message.type === 'status') {
        console.log('Status:', message.status)
      }
    },
    onError: () => {
      setError('接続エラーが発生しました')
    },
  })

  // Keep refs in sync with state
  useEffect(() => {
    isConnectedRef.current = isConnected
  }, [isConnected])

  // Audio recorder
  const {
    isRecording,
    isPaused,
    audioLevel,
    startRecording: startAudio,
    stopRecording: stopAudio,
    pauseRecording,
    resumeRecording,
  } = useAudioRecorder({
    onAudioData: (data) => {
      // Use refs to get the latest values
      if (isConnectedRef.current && !isPausedRef.current) {
        send(data)
      }
    },
    onError: (err) => {
      setError(`マイクエラー: ${err.message}`)
    },
  })

  // Keep isPaused ref in sync
  useEffect(() => {
    isPausedRef.current = isPaused
  }, [isPaused])

  // Keep sessionId ref in sync
  useEffect(() => {
    sessionIdRef.current = sessionId
  }, [sessionId])

  // Topic analysis function
  const analyzeTopicSegment = useCallback(async (segment: { speaker: string; text: string; startTime: number }) => {
    const currentSessionId = sessionIdRef.current
    if (!currentSessionId) return

    try {
      const response = await fetch('/api/topic-analysis/segment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: currentSessionId,
          segment,
        }),
      })

      if (response.ok) {
        const data = await response.json()
        if (data.topicState) {
          setTopicState(data.topicState)
        }
        if (data.alerts) {
          setFacilitatorAlerts(data.alerts.map((a: FacilitatorAlert) => ({
            ...a,
            // Ensure all required fields are present
            currentTopic: a.currentTopic || data.topicState?.currentTopic || '',
          })))
        }
      }
    } catch (err) {
      console.error('Topic analysis failed:', err)
    }
  }, [])

  // End topic session
  const endTopicSession = useCallback(async () => {
    const currentSessionId = sessionIdRef.current
    if (!currentSessionId) return

    try {
      await fetch('/api/topic-analysis/segment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: currentSessionId,
          action: 'end',
        }),
      })
    } catch (err) {
      console.error('Failed to end topic session:', err)
    }
  }, [])

  const handleTranscript = useCallback((data: TranscriptMessage) => {
    if (data.isFinal && data.text.trim()) {
      // Add final segment
      const newSegment: TranscriptSegment = {
        id: `seg-${segmentIdCounter.current++}`,
        speaker: data.speaker,
        text: data.text,
        startTime: data.start,
        isFinal: true,
      }
      setSegments((prev) => [...prev, newSegment])
      setInterimText('')

      // Send to topic analysis
      analyzeTopicSegment({
        speaker: `話者 ${data.speaker + 1}`,
        text: data.text,
        startTime: data.start,
      })
    } else if (!data.isFinal) {
      // Update interim text
      setInterimText(data.text)
    }
  }, [analyzeTopicSegment])

  // Auto-scroll transcript
  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight
    }
  }, [segments, interimText])

  // Duration timer
  useEffect(() => {
    if (isRecording && !isPaused) {
      intervalRef.current = setInterval(() => {
        setDuration((prev) => prev + 1)
      }, 1000)
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [isRecording, isPaused])

  const startRecording = useCallback(async () => {
    try {
      setError(null)
      setDuration(0)
      setSegments([])
      setInterimText('')
      segmentIdCounter.current = 0

      // Generate session ID for topic analysis
      const newSessionId = `rec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      setSessionId(newSessionId)
      sessionIdRef.current = newSessionId
      setTopicState(null)
      setFacilitatorAlerts([])

      // Connect WebSocket first
      connect()

      // Wait for connection
      await new Promise((resolve) => setTimeout(resolve, 500))

      // Start audio capture
      await startAudio()

      // Tell server to start transcription
      sendJSON({ type: 'start', language: 'ja' })
    } catch (err) {
      setError('録音の開始に失敗しました')
      console.error(err)
    }
  }, [connect, startAudio, sendJSON])

  const stopRecording = useCallback(() => {
    // Stop audio
    stopAudio()

    // Tell server to stop
    sendJSON({ type: 'stop' })

    // End topic analysis session
    endTopicSession()

    // Disconnect WebSocket
    setTimeout(() => {
      disconnect()
    }, 500)
  }, [stopAudio, sendJSON, disconnect, endTopicSession])

  const togglePause = useCallback(() => {
    if (isPaused) {
      resumeRecording()
    } else {
      pauseRecording()
    }
  }, [isPaused, resumeRecording, pauseRecording])

  // Save transcript
  const saveMutation = useMutation({
    mutationFn: async () => {
      const fullText = segments.map((s) => s.text).join('\n')

      const res = await fetch('/api/transcripts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title || `録音 ${new Date().toLocaleString('ja-JP')}`,
          sourceType: 'RECORDING',
          rawText: fullText,
        }),
      })

      if (!res.ok) throw new Error('Failed to save')
      return res.json()
    },
    onSuccess: (data) => {
      router.push(`/transcripts/${data.id}`)
    },
    onError: () => {
      setError('保存に失敗しました')
    },
  })

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  const getSpeakerColor = (speaker: number) => {
    const colors = [
      'text-blue-600',
      'text-green-600',
      'text-orange-600',
      'text-purple-600',
      'text-pink-600',
    ]
    return colors[speaker % colors.length]
  }

  // Handle alert acknowledgment (local only for recording)
  const handleAcknowledgeAlert = useCallback((alertId: string) => {
    setFacilitatorAlerts((prev) =>
      prev.map((a) => (a.id === alertId ? { ...a, acknowledged: true } : a))
    )
  }, [])

  return (
    <div className="flex gap-6">
      {/* Main content */}
      <div className="flex-1 max-w-4xl space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">リアルタイム録音</h1>

        {error && (
          <div className="flex items-center gap-2 rounded-lg bg-red-50 p-4 text-red-600">
            <AlertCircle className="h-5 w-5" />
            <span>{error}</span>
          </div>
        )}

        <Card className="p-8">
          <div className="flex flex-col items-center space-y-8">
            {/* Recording status */}
            <div className="text-center">
              <div
                className={cn(
                  'mx-auto mb-4 flex h-32 w-32 items-center justify-center rounded-full transition-all',
                  isRecording
                    ? isPaused
                      ? 'bg-yellow-100'
                      : 'bg-red-100'
                    : 'bg-gray-100'
                )}
                style={{
                  transform: isRecording && !isPaused ? `scale(${1 + audioLevel * 0.3})` : 'scale(1)',
                }}
              >
                <Mic
                  className={cn(
                    'h-16 w-16 transition-all',
                    isRecording
                      ? isPaused
                        ? 'text-yellow-600'
                        : 'text-red-600'
                      : 'text-gray-400'
                  )}
                />
              </div>
              <p className="text-4xl font-mono font-bold text-gray-900">
                {formatTime(duration)}
              </p>
              <p className="mt-2 text-gray-500">
                {isRecording
                  ? isPaused
                    ? '一時停止中'
                    : isConnected
                      ? '録音中...'
                      : '接続中...'
                  : '録音を開始してください'}
              </p>
            </div>

            {/* Controls */}
            <div className="flex items-center gap-4">
              {!isRecording ? (
                <Button
                  size="lg"
                  onClick={startRecording}
                  className="h-14 w-14 rounded-full p-0"
                >
                  <Mic className="h-6 w-6" />
                </Button>
              ) : (
                <>
                  <Button
                    variant="outline"
                    size="lg"
                    onClick={togglePause}
                    className="h-14 w-14 rounded-full p-0"
                  >
                    {isPaused ? (
                      <Play className="h-6 w-6" />
                    ) : (
                      <Pause className="h-6 w-6" />
                    )}
                  </Button>
                  <Button
                    variant="destructive"
                    size="lg"
                    onClick={stopRecording}
                    className="h-14 w-14 rounded-full p-0"
                  >
                    <Square className="h-6 w-6" />
                  </Button>
                </>
              )}
            </div>
          </div>
        </Card>

        {/* Live transcript */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">
              リアルタイム文字起こし
            </h2>
            {segments.length > 0 && !isRecording && (
              <div className="flex items-center gap-2">
                <Input
                  placeholder="タイトル（任意）"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-48"
                />
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => saveMutation.mutate()}
                  isLoading={saveMutation.isPending}
                >
                  <Save className="h-4 w-4 mr-2" />
                  保存
                </Button>
              </div>
            )}
          </div>

          <div
            ref={transcriptRef}
            className="min-h-[300px] max-h-[400px] overflow-y-auto rounded-lg bg-gray-50 p-4"
          >
            {segments.length === 0 && !interimText ? (
              <p className="text-center text-gray-400">
                {isRecording
                  ? '話し始めると文字起こしが表示されます...'
                  : '録音を開始すると文字起こしが表示されます'}
              </p>
            ) : (
              <div className="space-y-3">
                {segments.map((segment) => (
                  <div key={segment.id} className="flex gap-3">
                    <span
                      className={cn(
                        'text-sm font-medium w-20 flex-shrink-0',
                        getSpeakerColor(segment.speaker)
                      )}
                    >
                      話者 {segment.speaker + 1}
                    </span>
                    <span className="text-gray-700">{segment.text}</span>
                  </div>
                ))}
                {interimText && (
                  <div className="flex gap-3 opacity-60">
                    <span className="text-sm font-medium w-20 flex-shrink-0 text-gray-400">
                      ...
                    </span>
                    <span className="text-gray-500 italic">{interimText}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </Card>

        <p className="text-sm text-gray-500 text-center">
          録音はブラウザ上で処理され、Deepgram APIを使用してリアルタイムで文字起こしされます。
          <br />
          WebSocketサーバーが必要です: <code className="bg-gray-100 px-1 rounded">npm run dev:ws</code>
        </p>
      </div>

      {/* Facilitator Panel - shown when recording */}
      {isRecording && (
        <div className="w-80 flex-shrink-0">
          <div className="sticky top-6">
            <FacilitatorPanel
              topicState={topicState}
              alerts={facilitatorAlerts}
              onAcknowledgeAlert={handleAcknowledgeAlert}
              isConnected={isConnected}
            />
          </div>
        </div>
      )}
    </div>
  )
}
