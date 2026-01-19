import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
import { WebSocketServer, WebSocket } from 'ws'
import { createServer } from 'http'
import { createLiveTranscriptionConnection, LiveTranscriptionEvents } from '../src/lib/transcription/deepgram'

const wsPort = parseInt(process.env.PORT || process.env.WS_PORT || '3001', 10)
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',').map(o => o.trim()) || []
const allowAllOrigins = allowedOrigins.length === 0 || allowedOrigins.includes('*')

interface ClientConnection {
  ws: WebSocket
  deepgramConnection: ReturnType<typeof createLiveTranscriptionConnection> | null
  isRecording: boolean
  subscribedMeetingId: string | null
}

const clients = new Map<WebSocket, ClientConnection>()
// Meeting ID → 購読しているWebSocket接続のSet
const meetingSubscribers = new Map<string, Set<WebSocket>>()

// HTTP server for health checks and broadcast endpoint
const server = createServer(async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-broadcast-secret')

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ status: 'ok' }))
    return
  }

  // Broadcast endpoint for Webhook → WebSocket
  if (req.url === '/broadcast' && req.method === 'POST') {
    // Simple secret check (optional, for security)
    const secret = req.headers['x-broadcast-secret']
    const expectedSecret = process.env.BROADCAST_SECRET
    if (expectedSecret && secret !== expectedSecret) {
      res.writeHead(401, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Unauthorized' }))
      return
    }

    let body = ''
    req.on('data', chunk => { body += chunk })
    req.on('end', () => {
      try {
        const { meetingId, type, data } = JSON.parse(body)

        if (!meetingId) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'meetingId required' }))
          return
        }

        const subscribers = meetingSubscribers.get(meetingId)
        const count = broadcastToMeeting(meetingId, { type, ...data })

        console.log(`Broadcast to meeting ${meetingId}: ${count} clients, type: ${type}`)

        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ success: true, clientCount: count }))
      } catch (error) {
        console.error('Broadcast error:', error)
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Invalid JSON' }))
      }
    })
    return
  }

  res.writeHead(404)
  res.end()
})

// WebSocket server with CORS validation
const wss = new WebSocketServer({
  server,
  path: '/api/realtime',
  verifyClient: (info, callback) => {
    const origin = info.origin || info.req.headers.origin || ''
    const isAllowed = allowAllOrigins || allowedOrigins.some(allowed => origin === allowed)
    console.log(`WebSocket connection attempt - Origin: ${origin}, Allowed: ${isAllowed}`)
    if (!isAllowed) {
      console.log(`Rejected origin. Allowed origins: ${allowedOrigins.join(', ')}`)
    }
    callback(isAllowed, isAllowed ? undefined : 403, isAllowed ? undefined : 'Forbidden')
  },
})

server.listen(wsPort, () => {
  console.log(`> WebSocket server ready on port ${wsPort}`)
  console.log(`> Health check: /health`)
  console.log(`> WebSocket path: /api/realtime`)
  console.log(`> CORS: ${allowAllOrigins ? 'ALL ORIGINS ALLOWED' : `Allowed: ${allowedOrigins.join(', ')}`}`)
})

wss.on('connection', (ws: WebSocket) => {
    console.log('Client connected')

    const client: ClientConnection = {
      ws,
      deepgramConnection: null,
      isRecording: false,
      subscribedMeetingId: null,
    }
    clients.set(ws, client)

    ws.on('message', async (data: Buffer | string) => {
      try {
        // Check if it's a control message (JSON) or audio data (Buffer)
        if (typeof data === 'string' || (Buffer.isBuffer(data) && data.toString().startsWith('{'))) {
          const message = JSON.parse(data.toString())
          console.log('Control message:', message.type)
          await handleControlMessage(client, message)
        } else if (Buffer.isBuffer(data)) {
          console.log('Audio data received:', data.length, 'bytes, isRecording:', client.isRecording)
          if (client.isRecording && client.deepgramConnection) {
            // Forward audio data to Deepgram - convert Buffer to ArrayBuffer
            const arrayBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
            client.deepgramConnection.send(arrayBuffer)
          }
        }
      } catch (error) {
        console.error('Error processing message:', error)
        sendError(ws, 'Failed to process message')
      }
    })

    ws.on('close', () => {
      console.log('Client disconnected')
      cleanupClient(client)
      clients.delete(ws)
    })

  ws.on('error', (error) => {
    console.error('WebSocket error:', error)
    cleanupClient(client)
  })
})

async function handleControlMessage(
  client: ClientConnection,
  message: { type: string; [key: string]: unknown }
) {
  const { ws } = client

  switch (message.type) {
    case 'start':
      if (client.isRecording) {
        sendError(ws, 'Already recording')
        return
      }

      try {
        const deepgramConnection = createLiveTranscriptionConnection({
          language: (message.language as string) || 'ja',
          diarize: true,
          interimResults: true,
        })

        // Handle Deepgram events
        deepgramConnection.on(LiveTranscriptionEvents.Open, () => {
          console.log('Deepgram connection opened')
          client.isRecording = true
          sendMessage(ws, { type: 'status', status: 'recording' })
        })

        deepgramConnection.on(LiveTranscriptionEvents.Transcript, (data) => {
          const alternative = data.channel?.alternatives?.[0]
          if (alternative) {
            const words = alternative.words || []
            const speaker = words[0]?.speaker ?? 0

            sendMessage(ws, {
              type: 'transcript',
              text: alternative.transcript,
              isFinal: data.is_final,
              speaker: speaker,
              start: data.start,
              duration: data.duration,
              confidence: alternative.confidence,
            })
          }
        })

        deepgramConnection.on(LiveTranscriptionEvents.Error, (error) => {
          console.error('Deepgram error:', error)
          sendError(ws, 'Transcription error')
        })

        deepgramConnection.on(LiveTranscriptionEvents.Close, () => {
          console.log('Deepgram connection closed')
          client.isRecording = false
          client.deepgramConnection = null
        })

        client.deepgramConnection = deepgramConnection
      } catch (error) {
        console.error('Failed to start transcription:', error)
        sendError(ws, 'Failed to start transcription')
      }
      break

    case 'stop':
      if (client.deepgramConnection) {
        client.deepgramConnection.finish()
        client.isRecording = false
        client.deepgramConnection = null
        sendMessage(ws, { type: 'status', status: 'stopped' })
      }
      break

    case 'ping':
      sendMessage(ws, { type: 'pong' })
      break

    case 'subscribe-meeting':
      const meetingId = message.meetingId as string
      if (!meetingId) {
        sendError(ws, 'meetingId required')
        return
      }

      // 以前の購読を解除
      if (client.subscribedMeetingId) {
        unsubscribeFromMeeting(ws, client.subscribedMeetingId)
      }

      // 新しい購読を追加
      if (!meetingSubscribers.has(meetingId)) {
        meetingSubscribers.set(meetingId, new Set())
      }
      meetingSubscribers.get(meetingId)!.add(ws)
      client.subscribedMeetingId = meetingId

      console.log(`Client subscribed to meeting: ${meetingId}`)
      sendMessage(ws, { type: 'subscribed', meetingId })
      break

    case 'unsubscribe-meeting':
      if (client.subscribedMeetingId) {
        unsubscribeFromMeeting(ws, client.subscribedMeetingId)
        client.subscribedMeetingId = null
        sendMessage(ws, { type: 'unsubscribed' })
      }
      break

    default:
      console.warn('Unknown message type:', message.type)
  }
}

function cleanupClient(client: ClientConnection) {
  if (client.deepgramConnection) {
    try {
      client.deepgramConnection.finish()
    } catch (e) {
      // Ignore errors during cleanup
    }
    client.deepgramConnection = null
  }
  client.isRecording = false

  // Meeting購読を解除
  if (client.subscribedMeetingId) {
    unsubscribeFromMeeting(client.ws, client.subscribedMeetingId)
    client.subscribedMeetingId = null
  }
}

function unsubscribeFromMeeting(ws: WebSocket, meetingId: string) {
  const subscribers = meetingSubscribers.get(meetingId)
  if (subscribers) {
    subscribers.delete(ws)
    if (subscribers.size === 0) {
      meetingSubscribers.delete(meetingId)
    }
  }
}

function broadcastToMeeting(meetingId: string, message: object): number {
  const subscribers = meetingSubscribers.get(meetingId)
  if (!subscribers) return 0

  let count = 0
  subscribers.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message))
      count++
    }
  })
  return count
}

function sendMessage(ws: WebSocket, message: object) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message))
  }
}

function sendError(ws: WebSocket, error: string) {
  sendMessage(ws, { type: 'error', error })
}
