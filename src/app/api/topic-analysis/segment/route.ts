import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/auth'
import { prisma } from '@/lib/db/prisma'
import { analyzeTopics, generateFacilitatorMessage, compressConversation, type TopicAnalysisResult, type TokenUsage } from '@/lib/ai/topic-analyzer'

// モデル別料金（USD per 1M tokens）
const MODEL_PRICING = {
  'gpt-5.2': { inputPer1M: 2.50, outputPer1M: 10.00 },
  'gpt-5-mini': { inputPer1M: 0.15, outputPer1M: 0.60 },
}
const USD_TO_JPY = 150

// コスト計算
function calculateCost(
  usage: TokenUsage,
  model: 'gpt-5.2' | 'gpt-5-mini' = 'gpt-5.2'
): number {
  const pricing = MODEL_PRICING[model]
  const inputCost = (usage.inputTokens / 1_000_000) * pricing.inputPer1M
  const outputCost = (usage.outputTokens / 1_000_000) * pricing.outputPer1M
  return inputCost + outputCost
}

// 圧縮設定
const COMPRESSION_THRESHOLD = 20  // セグメント数閾値
const SEGMENTS_TO_KEEP_RAW = 10   // 直近で生のまま保持する数

// 使用統計
interface UsageStats {
  totalInputTokens: number
  totalOutputTokens: number
  totalCost: number  // USD
  callCount: number
}

// アラート型
interface Alert {
  id: string
  alertType: 'TOPIC_DRIFT' | 'RETURNING' | 'NEW_TOPIC'
  message: string
  driftScore: number
  fromTopic: string | null
  toTopic: string | null
  currentTopic: string
  mainTopic: string | null
  timestamp: string
}

// 設定
const MIN_SEGMENTS_FOR_ANALYSIS = 3
const MIN_INTERVAL_MS = 15000 // 15秒
const MAX_INTERVAL_MS = 30000 // 30秒

// DB からセッション状態を取得（なければ作成）
async function getOrCreateState(sessionId: string) {
  const existing = await prisma.topicAnalysisState.findUnique({
    where: { id: sessionId },
  })

  if (existing) {
    return {
      sessionId: existing.id,
      mainTopic: existing.mainTopic,
      currentTopic: existing.currentTopic,
      topicHistory: existing.topicHistory,
      pendingSegments: existing.pendingSegments as unknown as Array<{ speaker: string; text: string; startTime: number }>,
      lastAnalyzedAt: existing.lastAnalyzedAt ? existing.lastAnalyzedAt.getTime() : null,
      driftScore: existing.driftScore,
      analysisCount: existing.analysisCount,
      alerts: existing.alerts as unknown as Alert[],
      usageStats: existing.usageStats as unknown as UsageStats,
      conversationSummary: existing.conversationSummary,
      allProcessedSegments: existing.allProcessedSegments as unknown as Array<{ speaker: string; text: string }>,
    }
  }

  // 新規作成
  const defaultUsageStats: UsageStats = {
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCost: 0,
    callCount: 0,
  }

  await prisma.topicAnalysisState.create({
    data: {
      id: sessionId,
      pendingSegments: [],
      alerts: [],
      usageStats: defaultUsageStats as unknown as import('@prisma/client').Prisma.InputJsonValue,
      allProcessedSegments: [],
    },
  })

  console.log(`[TopicAnalysis] New session: ${sessionId}`)

  return {
    sessionId,
    mainTopic: null as string | null,
    currentTopic: null as string | null,
    topicHistory: [] as string[],
    pendingSegments: [] as Array<{ speaker: string; text: string; startTime: number }>,
    lastAnalyzedAt: null as number | null,
    driftScore: 0,
    analysisCount: 0,
    alerts: [] as Alert[],
    usageStats: defaultUsageStats,
    conversationSummary: null as string | null,
    allProcessedSegments: [] as Array<{ speaker: string; text: string }>,
  }
}

// DB にセッション状態を保存
async function saveState(state: Awaited<ReturnType<typeof getOrCreateState>>) {
  await prisma.topicAnalysisState.update({
    where: { id: state.sessionId },
    data: {
      mainTopic: state.mainTopic,
      currentTopic: state.currentTopic,
      topicHistory: state.topicHistory,
      pendingSegments: state.pendingSegments as unknown as import('@prisma/client').Prisma.InputJsonValue,
      lastAnalyzedAt: state.lastAnalyzedAt ? new Date(state.lastAnalyzedAt) : null,
      driftScore: state.driftScore,
      analysisCount: state.analysisCount,
      alerts: state.alerts as unknown as import('@prisma/client').Prisma.InputJsonValue,
      usageStats: state.usageStats as unknown as import('@prisma/client').Prisma.InputJsonValue,
      conversationSummary: state.conversationSummary,
      allProcessedSegments: state.allProcessedSegments as unknown as import('@prisma/client').Prisma.InputJsonValue,
    },
  })
}

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
      await prisma.topicAnalysisState.deleteMany({
        where: { id: sessionId },
      })
      console.log(`[TopicAnalysis] Session ended: ${sessionId}`)
      return NextResponse.json({ success: true })
    }

    // セッション状態取得または初期化
    const state = await getOrCreateState(sessionId)

    // セグメントが提供された場合、追加
    if (segment) {
      const segmentData = {
        speaker: segment.speaker || '話者',
        text: segment.text,
        startTime: segment.startTime || 0,
      }
      state.pendingSegments.push(segmentData)
      // 圧縮用に全セグメント追跡
      state.allProcessedSegments.push({
        speaker: segmentData.speaker,
        text: segmentData.text,
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
    let newAlert: Alert | null = null

    if (shouldAnalyze) {
      console.log(`[TopicAnalysis] Analyzing session: ${sessionId}, segments: ${state.pendingSegments.length}`)

      try {
        // 圧縮チェック: セグメント数が閾値を超えたら古いものを圧縮
        if (
          state.allProcessedSegments.length >= COMPRESSION_THRESHOLD &&
          state.allProcessedSegments.length > SEGMENTS_TO_KEEP_RAW
        ) {
          const segmentsToCompress = state.allProcessedSegments.slice(
            0,
            state.allProcessedSegments.length - SEGMENTS_TO_KEEP_RAW
          )

          console.log(`[TopicAnalysis] Compressing ${segmentsToCompress.length} segments`)

          const compressionResult = await compressConversation({
            segments: segmentsToCompress,
            existingSummary: state.conversationSummary,
          })

          state.conversationSummary = compressionResult.summary

          // 圧縮後は直近セグメントのみ保持
          state.allProcessedSegments = state.allProcessedSegments.slice(-SEGMENTS_TO_KEEP_RAW)

          // 圧縮コストを追跡
          if (compressionResult.usage) {
            const compressionCost = calculateCost(compressionResult.usage, 'gpt-5-mini')
            state.usageStats.totalInputTokens += compressionResult.usage.inputTokens
            state.usageStats.totalOutputTokens += compressionResult.usage.outputTokens
            state.usageStats.totalCost += compressionCost
            state.usageStats.callCount++
          }
        }

        analysisResult = await analyzeTopics({
          recentSegments: state.pendingSegments,
          previousTopics: state.topicHistory,
          mainTopic: state.mainTopic,
          agendaItems: [],
          isFirstAnalysis: state.analysisCount === 0,
          conversationSummary: state.conversationSummary,
        })

        // 使用統計を追跡
        if (analysisResult.usage) {
          const analysisCost = calculateCost(analysisResult.usage, 'gpt-5.2')
          state.usageStats.totalInputTokens += analysisResult.usage.inputTokens
          state.usageStats.totalOutputTokens += analysisResult.usage.outputTokens
          state.usageStats.totalCost += analysisCost
          state.usageStats.callCount++
        }

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

    // DB に状態を保存
    await saveState(state)

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
      usageStats: {
        totalInputTokens: state.usageStats.totalInputTokens,
        totalOutputTokens: state.usageStats.totalOutputTokens,
        totalCost: state.usageStats.totalCost,
        totalCostJPY: Math.ceil(state.usageStats.totalCost * USD_TO_JPY),
        callCount: state.usageStats.callCount,
      },
    })
  } catch (error) {
    console.error('Topic analysis error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
