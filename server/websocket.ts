import { WebSocketServer, WebSocket } from 'ws'
import { createLiveTranscriptionConnection, LiveTranscriptionEvents } from '../src/lib/transcription/deepgram'

const wsPort = parseInt(process.env.WS_PORT || '3001', 10)

interface ClientConnection {
  ws: WebSocket
  deepgramConnection: ReturnType<typeof createLiveTranscriptionConnection> | null
  isRecording: boolean
}

const clients = new Map<WebSocket, ClientConnection>()

// Standalone WebSocket server on separate port
const wss = new WebSocketServer({
  port: wsPort,
  path: '/api/realtime',
})

console.log(`> WebSocket server ready on ws://localhost:${wsPort}/api/realtime`)

wss.on('connection', (ws: WebSocket) => {
    console.log('Client connected')

    const client: ClientConnection = {
      ws,
      deepgramConnection: null,
      isRecording: false,
    }
    clients.set(ws, client)

    ws.on('message', async (data: Buffer | string) => {
      try {
        // Check if it's a control message (JSON) or audio data (Buffer)
        if (typeof data === 'string' || (Buffer.isBuffer(data) && data.toString().startsWith('{'))) {
          const message = JSON.parse(data.toString())
          await handleControlMessage(client, message)
        } else if (Buffer.isBuffer(data) && client.isRecording && client.deepgramConnection) {
          // Forward audio data to Deepgram - convert Buffer to ArrayBuffer
          const arrayBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
          client.deepgramConnection.send(arrayBuffer)
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
}

function sendMessage(ws: WebSocket, message: object) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message))
  }
}

function sendError(ws: WebSocket, error: string) {
  sendMessage(ws, { type: 'error', error })
}
