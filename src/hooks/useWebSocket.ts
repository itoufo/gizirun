'use client'

import { useCallback, useRef, useState, useEffect } from 'react'

export interface TranscriptMessage {
  type: 'transcript'
  text: string
  isFinal: boolean
  speaker: number
  start: number
  duration: number
  confidence: number
}

export interface StatusMessage {
  type: 'status'
  status: 'recording' | 'stopped'
}

export interface ErrorMessage {
  type: 'error'
  error: string
}

export type WebSocketMessage = TranscriptMessage | StatusMessage | ErrorMessage | { type: 'pong' }

interface UseWebSocketOptions {
  url: string
  onMessage?: (message: WebSocketMessage) => void
  onOpen?: () => void
  onClose?: () => void
  onError?: (error: Event) => void
  reconnect?: boolean
  reconnectInterval?: number
}

interface UseWebSocketReturn {
  isConnected: boolean
  connect: () => void
  disconnect: () => void
  send: (data: string | ArrayBuffer) => void
  sendJSON: (data: object) => void
}

export function useWebSocket(options: UseWebSocketOptions): UseWebSocketReturn {
  const [isConnected, setIsConnected] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return
    }

    try {
      const ws = new WebSocket(options.url)
      ws.binaryType = 'arraybuffer'

      ws.onopen = () => {
        console.log('WebSocket connected')
        setIsConnected(true)
        options.onOpen?.()
      }

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as WebSocketMessage
          options.onMessage?.(message)
        } catch (e) {
          console.error('Failed to parse WebSocket message:', e)
        }
      }

      ws.onclose = () => {
        console.log('WebSocket disconnected')
        setIsConnected(false)
        wsRef.current = null
        options.onClose?.()

        // Reconnect if enabled
        if (options.reconnect) {
          reconnectTimeoutRef.current = setTimeout(() => {
            connect()
          }, options.reconnectInterval || 3000)
        }
      }

      ws.onerror = (error) => {
        console.error('WebSocket error:', error)
        options.onError?.(error)
      }

      wsRef.current = ws
    } catch (error) {
      console.error('Failed to create WebSocket:', error)
    }
  }, [options])

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }

    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }

    setIsConnected(false)
  }, [])

  const send = useCallback((data: string | ArrayBuffer) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(data)
    }
  }, [])

  const sendJSON = useCallback((data: object) => {
    send(JSON.stringify(data))
  }, [send])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect()
    }
  }, [disconnect])

  return {
    isConnected,
    connect,
    disconnect,
    send,
    sendJSON,
  }
}
