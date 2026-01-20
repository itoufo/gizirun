import { prisma } from '@/lib/db/prisma'
import { analyzeTopics, generateFacilitatorMessage, type TopicAnalysisResult } from '@/lib/ai/topic-analyzer'
import type { AlertType } from '@prisma/client'

const WS_SERVER_URL = process.env.WS_SERVER_URL || 'http://localhost:3001'
const BROADCAST_SECRET = process.env.BROADCAST_SECRET

// 分析トリガー設定
const MIN_SEGMENTS_FOR_ANALYSIS = 3
const MIN_INTERVAL_MS = 15000 // 15秒
const MAX_INTERVAL_MS = 30000 // 30秒

interface SegmentData {
  speaker: string
  text: string
  startTime: number
}

interface TopicState {
  meetingId: string
  mainTopic: string | null
  currentTopic: string | null
  topicHistory: string[]
  pendingSegments: SegmentData[]
  lastAnalyzedAt: number | null
  driftScore: number
  agendaItems: string[]
  analysisCount: number
}

class TopicOrchestrator {
  private meetingStates: Map<string, TopicState> = new Map()

  async initMeeting(meetingId: string, agendaItems: string[] = []): Promise<void> {
    this.meetingStates.set(meetingId, {
      meetingId,
      mainTopic: null,
      currentTopic: null,
      topicHistory: [],
      pendingSegments: [],
      lastAnalyzedAt: null,
      driftScore: 0,
      agendaItems,
      analysisCount: 0,
    })
    console.log(`[TopicOrchestrator] Initialized meeting: ${meetingId}`)
  }

  async addSegment(meetingId: string, segment: SegmentData): Promise<void> {
    let state = this.meetingStates.get(meetingId)

    // 状態がなければ初期化
    if (!state) {
      // DBからアジェンダを取得
      const meeting = await prisma.meeting.findUnique({
        where: { id: meetingId },
        select: { agendaItems: true },
      })
      await this.initMeeting(meetingId, meeting?.agendaItems || [])
      state = this.meetingStates.get(meetingId)!
    }

    state.pendingSegments.push(segment)

    // 分析トリガー判定
    await this.maybeAnalyze(meetingId)
  }

  private async maybeAnalyze(meetingId: string): Promise<void> {
    const state = this.meetingStates.get(meetingId)
    if (!state) return

    const now = Date.now()
    const timeSinceLastAnalysis = state.lastAnalyzedAt
      ? now - state.lastAnalyzedAt
      : Infinity

    const hasEnoughSegments = state.pendingSegments.length >= MIN_SEGMENTS_FOR_ANALYSIS
    const isMinIntervalPassed = timeSinceLastAnalysis >= MIN_INTERVAL_MS
    const isMaxIntervalPassed = timeSinceLastAnalysis >= MAX_INTERVAL_MS && state.pendingSegments.length > 0

    const shouldAnalyze =
      (hasEnoughSegments && isMinIntervalPassed) || isMaxIntervalPassed

    if (!shouldAnalyze) return

    try {
      console.log(`[TopicOrchestrator] Analyzing meeting: ${meetingId}, segments: ${state.pendingSegments.length}`)

      const result = await analyzeTopics({
        recentSegments: state.pendingSegments,
        previousTopics: state.topicHistory,
        mainTopic: state.mainTopic,
        agendaItems: state.agendaItems,
        isFirstAnalysis: state.analysisCount === 0,
      })

      // 状態を更新
      state.pendingSegments = []
      state.lastAnalyzedAt = now
      state.analysisCount++
      state.driftScore = result.driftScore

      if (result.mainTopic) {
        state.mainTopic = result.mainTopic
      }

      if (result.currentTopic && result.currentTopic !== state.currentTopic) {
        state.currentTopic = result.currentTopic
        state.topicHistory.push(result.currentTopic)

        // 履歴は最新10件まで
        if (state.topicHistory.length > 10) {
          state.topicHistory = state.topicHistory.slice(-10)
        }
      }

      // 結果を処理（DB保存 & ブロードキャスト）
      await this.processResult(meetingId, result)
    } catch (error) {
      console.error(`[TopicOrchestrator] Analysis failed for meeting ${meetingId}:`, error)
      // エラー時はセグメントを保持して次回リトライ
    }
  }

  private async processResult(meetingId: string, result: TopicAnalysisResult): Promise<void> {
    const state = this.meetingStates.get(meetingId)
    if (!state) return

    // トピックをDBに保存
    if (result.mainTopic || result.currentTopic) {
      await prisma.meetingTopic.create({
        data: {
          meetingId,
          topic: result.currentTopic,
          isMainTopic: !!result.mainTopic,
          confidence: 1 - result.driftScore / 100,
          startTime: Date.now() / 1000,
        },
      })
    }

    // トピック更新をブロードキャスト
    await this.broadcast(meetingId, 'topic.update', {
      mainTopic: state.mainTopic,
      currentTopic: result.currentTopic,
      driftScore: result.driftScore,
    })

    // driftScore >= 50 の場合、アラートを生成
    if (result.driftScore >= 50) {
      const message = generateFacilitatorMessage(result)

      const alert = await prisma.facilitatorAlert.create({
        data: {
          meetingId,
          alertType: 'TOPIC_DRIFT' as AlertType,
          message,
          driftScore: result.driftScore,
          fromTopic: state.topicHistory.length > 1
            ? state.topicHistory[state.topicHistory.length - 2]
            : null,
          toTopic: result.currentTopic,
        },
      })

      // アラートをブロードキャスト
      await this.broadcast(meetingId, 'facilitator.alert', {
        alert: {
          id: alert.id,
          alertType: alert.alertType,
          message: alert.message,
          driftScore: result.driftScore,
          fromTopic: alert.fromTopic,
          toTopic: alert.toTopic,
          currentTopic: result.currentTopic,
          mainTopic: state.mainTopic,
          timestamp: alert.createdAt.toISOString(),
        },
      })

      console.log(`[TopicOrchestrator] Alert created for meeting ${meetingId}: driftScore=${result.driftScore}`)
    }
  }

  private async broadcast(meetingId: string, type: string, data: unknown): Promise<boolean> {
    try {
      const response = await fetch(`${WS_SERVER_URL}/broadcast`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(BROADCAST_SECRET ? { 'x-broadcast-secret': BROADCAST_SECRET } : {}),
        },
        body: JSON.stringify({ meetingId, type, data }),
      })

      if (!response.ok) {
        console.error(`[TopicOrchestrator] Broadcast failed: ${response.status}`)
        return false
      }

      return true
    } catch (error) {
      console.error('[TopicOrchestrator] Broadcast error:', error)
      return false
    }
  }

  async endMeeting(meetingId: string): Promise<void> {
    const state = this.meetingStates.get(meetingId)
    if (state) {
      console.log(`[TopicOrchestrator] Ending meeting: ${meetingId}, total analyses: ${state.analysisCount}`)
    }
    this.meetingStates.delete(meetingId)
  }

  // デバッグ用: 現在の状態を取得
  getState(meetingId: string): TopicState | undefined {
    return this.meetingStates.get(meetingId)
  }
}

// シングルトンインスタンス
export const topicOrchestrator = new TopicOrchestrator()
