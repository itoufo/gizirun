import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/auth'
import { analyzeTopics, generateFacilitatorMessage, type TopicAnalysisResult } from '@/lib/ai/topic-analyzer'

// 録音セッション用のトピック状態（メモリ内管理）
interface RecordingTopicState {
  sessionId: string
  mainTopic: string | null
  currentTopic: string | null
  topicHistory: string[]
  pendingSegments: Array<{ speaker: string; text: string; startTime: number }>
  lastAnalyzedAt: number | null
  driftScore: number
  analysisCount: number
  alerts: Array<{
    id: string
    alertType: 'TOPIC_DRIFT' | 'RETURNING' | 'NEW_TOPIC'
    message: string
    driftScore: number
    fromTopic: string | null
    toTopic: string | null
    currentTopic: string
    mainTopic: string | null
    timestamp: string
  }>
}

// セッションごとの状態を保持
const recordingStates = new Map<string, RecordingTopicState>()

// 設定
const MIN_SEGMENTS_FOR_ANALYSIS = 3
const MIN_INTERVAL_MS = 15000 // 15秒
const MAX_INTERVAL_MS = 30000 // 30秒
const SESSION_TIMEOUT_MS = 60 * 60 * 1000 // 1時間で自動クリーンアップ

// 古いセッションの定期クリーンアップ
setInterval(() => {
  const now = Date.now()
  for (const [sessionId, state] of recordingStates.entries()) {
    const lastActivity = state.lastAnalyzedAt || 0
    if (now - lastActivity > SESSION_TIMEOUT_MS) {
      recordingStates.delete(sessionId)
      console.log(`[TopicAnalysis] Cleaned up stale session: ${sessionId}`)
    }
  }
}, 5 * 60 * 1000) // 5分ごとにチェック

export async function POST(request: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { sessionId, segment, action } = body

    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId is required' }, { status: 400 })
    }

    // セッション終了
    if (action === 'end') {
      recordingStates.delete(sessionId)
      console.log(`[TopicAnalysis] Session ended: ${sessionId}`)
      return NextResponse.json({ success: true })
    }

    // セッション状態取得または初期化
    let state = recordingStates.get(sessionId)
    if (!state) {
      state = {
        sessionId,
        mainTopic: null,
        currentTopic: null,
        topicHistory: [],
        pendingSegments: [],
        lastAnalyzedAt: null,
        driftScore: 0,
        analysisCount: 0,
        alerts: [],
      }
      recordingStates.set(sessionId, state)
      console.log(`[TopicAnalysis] New session: ${sessionId}`)
    }

    // セグメントが提供された場合、追加
    if (segment) {
      state.pendingSegments.push({
        speaker: segment.speaker || '話者',
        text: segment.text,
        startTime: segment.startTime || 0,
      })
    }

    // 分析トリガー判定
    const now = Date.now()
    const timeSinceLastAnalysis = state.lastAnalyzedAt
      ? now - state.lastAnalyzedAt
      : Infinity

    const hasEnoughSegments = state.pendingSegments.length >= MIN_SEGMENTS_FOR_ANALYSIS
    const isMinIntervalPassed = timeSinceLastAnalysis >= MIN_INTERVAL_MS
    const isMaxIntervalPassed = timeSinceLastAnalysis >= MAX_INTERVAL_MS && state.pendingSegments.length > 0

    const shouldAnalyze =
      (hasEnoughSegments && isMinIntervalPassed) || isMaxIntervalPassed

    let analysisResult: TopicAnalysisResult | null = null
    let newAlert: RecordingTopicState['alerts'][0] | null = null

    if (shouldAnalyze) {
      console.log(`[TopicAnalysis] Analyzing session: ${sessionId}, segments: ${state.pendingSegments.length}`)

      try {
        analysisResult = await analyzeTopics({
          recentSegments: state.pendingSegments,
          previousTopics: state.topicHistory,
          mainTopic: state.mainTopic,
          agendaItems: [],
          isFirstAnalysis: state.analysisCount === 0,
        })

        // 状態更新
        state.pendingSegments = []
        state.lastAnalyzedAt = now
        state.analysisCount++
        state.driftScore = analysisResult.driftScore

        if (analysisResult.mainTopic) {
          state.mainTopic = analysisResult.mainTopic
        }

        if (analysisResult.currentTopic && analysisResult.currentTopic !== state.currentTopic) {
          const previousTopic = state.currentTopic
          state.currentTopic = analysisResult.currentTopic
          state.topicHistory.push(analysisResult.currentTopic)

          if (state.topicHistory.length > 10) {
            state.topicHistory = state.topicHistory.slice(-10)
          }

          // driftScore >= 50 の場合、アラート生成
          if (analysisResult.driftScore >= 50) {
            const message = generateFacilitatorMessage(analysisResult)
            newAlert = {
              id: `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              alertType: 'TOPIC_DRIFT',
              message,
              driftScore: analysisResult.driftScore,
              fromTopic: previousTopic,
              toTopic: analysisResult.currentTopic,
              currentTopic: analysisResult.currentTopic,
              mainTopic: state.mainTopic,
              timestamp: new Date().toISOString(),
            }
            state.alerts.unshift(newAlert)

            // アラートは最新10件まで
            if (state.alerts.length > 10) {
              state.alerts = state.alerts.slice(0, 10)
            }

            console.log(`[TopicAnalysis] Alert created: driftScore=${analysisResult.driftScore}`)
          }
        }
      } catch (error) {
        console.error(`[TopicAnalysis] Analysis failed for session ${sessionId}:`, error)
      }
    }

    return NextResponse.json({
      topicState: {
        mainTopic: state.mainTopic,
        currentTopic: state.currentTopic,
        driftScore: state.driftScore,
      },
      alerts: state.alerts,
      newAlert,
      analysisResult,
      pendingSegments: state.pendingSegments.length,
    })
  } catch (error) {
    console.error('Topic analysis error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
