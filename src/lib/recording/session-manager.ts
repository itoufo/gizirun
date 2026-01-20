// 録音セッション状態管理（インメモリ）

// 自動保存設定
export const AUTO_SAVE_SEGMENT_THRESHOLD = 5   // 5セグメントごと
export const AUTO_SAVE_TIME_THRESHOLD = 30000  // または30秒ごと
const SESSION_TIMEOUT_MS = 60 * 60 * 1000 // 1時間で自動クリーンアップ

// 録音セッション状態
export interface RecordingSession {
  sessionId: string
  transcriptId: string
  userId: string
  pendingSegments: Array<{
    speaker: number
    text: string
    startTime: number
    endTime?: number
  }>
  savedSegmentCount: number
  lastSavedAt: number
  createdAt: number
  duration: number
}

// セッションごとの状態を保持（メモリ内）
const recordingSessions = new Map<string, RecordingSession>()

// セッション操作関数
export function getRecordingSession(sessionId: string): RecordingSession | undefined {
  return recordingSessions.get(sessionId)
}

export function setRecordingSession(sessionId: string, session: RecordingSession): void {
  recordingSessions.set(sessionId, session)
}

export function updateRecordingSession(sessionId: string, updates: Partial<RecordingSession>): void {
  const session = recordingSessions.get(sessionId)
  if (session) {
    recordingSessions.set(sessionId, { ...session, ...updates })
  }
}

export function deleteRecordingSession(sessionId: string): void {
  recordingSessions.delete(sessionId)
}

export function hasRecordingSession(sessionId: string): boolean {
  return recordingSessions.has(sessionId)
}

// 古いセッションの定期クリーンアップ
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now()
    for (const [sessionId, session] of recordingSessions.entries()) {
      if (now - session.createdAt > SESSION_TIMEOUT_MS) {
        recordingSessions.delete(sessionId)
        console.log(`[RecordingSession] Cleaned up stale session: ${sessionId}`)
      }
    }
  }, 5 * 60 * 1000) // 5分ごとにチェック
}
