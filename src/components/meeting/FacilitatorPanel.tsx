'use client'

import { useState } from 'react'
import { AlertTriangle, Check, MessageSquare, Target, TrendingDown } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { cn } from '@/lib/utils/cn'

export interface FacilitatorAlert {
  id: string
  alertType: 'TOPIC_DRIFT' | 'RETURNING' | 'NEW_TOPIC'
  message: string
  driftScore: number
  fromTopic?: string | null
  toTopic?: string | null
  currentTopic: string
  mainTopic?: string | null
  timestamp: string
  acknowledged?: boolean
}

export interface TopicState {
  mainTopic: string | null
  currentTopic: string | null
  driftScore: number
}

interface FacilitatorPanelProps {
  topicState: TopicState | null
  alerts: FacilitatorAlert[]
  onAcknowledgeAlert?: (alertId: string) => void
  isConnected?: boolean
}

export function FacilitatorPanel({
  topicState,
  alerts,
  onAcknowledgeAlert,
  isConnected = false,
}: FacilitatorPanelProps) {
  const [expandedAlerts, setExpandedAlerts] = useState<Set<string>>(new Set())

  const getDriftColor = (score: number) => {
    if (score < 30) return 'bg-green-500'
    if (score < 50) return 'bg-yellow-500'
    if (score < 70) return 'bg-orange-500'
    return 'bg-red-500'
  }

  const getDriftLabel = (score: number) => {
    if (score < 30) return '集中'
    if (score < 50) return '良好'
    if (score < 70) return '注意'
    return '脱線'
  }

  const toggleAlert = (alertId: string) => {
    setExpandedAlerts((prev) => {
      const next = new Set(prev)
      if (next.has(alertId)) {
        next.delete(alertId)
      } else {
        next.add(alertId)
      }
      return next
    })
  }

  const unacknowledgedAlerts = alerts.filter((a) => !a.acknowledged)
  const acknowledgedAlerts = alerts.filter((a) => a.acknowledged)

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            AIファシリテーター
          </CardTitle>
          {isConnected && (
            <div className="flex items-center gap-1">
              <div className="h-2 w-2 animate-pulse rounded-full bg-green-500" />
              <span className="text-xs text-gray-500">分析中</span>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Topic Display */}
        {topicState ? (
          <div className="space-y-3">
            {/* Main Topic */}
            {topicState.mainTopic && (
              <div className="flex items-start gap-2">
                <Target className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
                <div>
                  <span className="text-xs text-gray-500">メイントピック</span>
                  <p className="text-sm font-medium text-gray-900">
                    {topicState.mainTopic}
                  </p>
                </div>
              </div>
            )}

            {/* Current Topic */}
            {topicState.currentTopic && (
              <div className="flex items-start gap-2">
                <MessageSquare className="h-4 w-4 text-purple-500 mt-0.5 flex-shrink-0" />
                <div>
                  <span className="text-xs text-gray-500">現在のトピック</span>
                  <p className="text-sm font-medium text-gray-900">
                    {topicState.currentTopic}
                  </p>
                </div>
              </div>
            )}

            {/* Drift Score Meter */}
            <div className="pt-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-gray-500">集中度</span>
                <Badge
                  variant={topicState.driftScore < 50 ? 'success' : 'error'}
                  className="text-xs"
                >
                  {getDriftLabel(topicState.driftScore)}
                </Badge>
              </div>
              <div className="h-2 w-full bg-gray-200 rounded-full overflow-hidden">
                <div
                  className={cn(
                    'h-full transition-all duration-500',
                    getDriftColor(topicState.driftScore)
                  )}
                  style={{ width: `${100 - topicState.driftScore}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-gray-400 mt-1">
                <span>脱線</span>
                <span>集中</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-4">
            <p className="text-sm text-gray-500">
              会議開始後にトピック分析が開始されます
            </p>
          </div>
        )}

        {/* Alerts Section */}
        {unacknowledgedAlerts.length > 0 && (
          <div className="border-t pt-4">
            <h4 className="text-sm font-medium text-gray-900 mb-2 flex items-center gap-1">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              アラート ({unacknowledgedAlerts.length})
            </h4>
            <div className="space-y-2">
              {unacknowledgedAlerts.map((alert) => (
                <div
                  key={alert.id}
                  className={cn(
                    'rounded-lg border p-3 transition-colors',
                    alert.driftScore >= 70
                      ? 'border-red-200 bg-red-50'
                      : 'border-amber-200 bg-amber-50'
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-800 whitespace-pre-line">
                        {alert.message}
                      </p>
                      {alert.fromTopic && alert.toTopic && (
                        <p className="text-xs text-gray-500 mt-1">
                          「{alert.fromTopic}」→「{alert.toTopic}」
                        </p>
                      )}
                      <p className="text-xs text-gray-400 mt-1">
                        {new Date(alert.timestamp).toLocaleTimeString('ja-JP')}
                      </p>
                    </div>
                    {onAcknowledgeAlert && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onAcknowledgeAlert(alert.id)}
                        className="flex-shrink-0"
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Acknowledged Alerts (collapsed) */}
        {acknowledgedAlerts.length > 0 && (
          <div className="border-t pt-4">
            <button
              onClick={() => {
                const allIds = acknowledgedAlerts.map((a) => a.id)
                setExpandedAlerts((prev) => {
                  const hasAny = allIds.some((id) => prev.has(id))
                  if (hasAny) {
                    const next = new Set(prev)
                    allIds.forEach((id) => next.delete(id))
                    return next
                  }
                  return new Set([...prev, ...allIds])
                })
              }}
              className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
            >
              <TrendingDown className="h-3 w-3" />
              過去のアラート ({acknowledgedAlerts.length})
            </button>
            {expandedAlerts.size > 0 && (
              <div className="mt-2 space-y-2">
                {acknowledgedAlerts
                  .filter((a) => expandedAlerts.has(a.id))
                  .map((alert) => (
                    <div
                      key={alert.id}
                      className="rounded-lg border border-gray-200 bg-gray-50 p-2 opacity-60"
                    >
                      <p className="text-xs text-gray-600">{alert.message}</p>
                      <p className="text-xs text-gray-400 mt-1">
                        {new Date(alert.timestamp).toLocaleTimeString('ja-JP')}
                      </p>
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}

        {/* No alerts state */}
        {alerts.length === 0 && topicState && (
          <div className="border-t pt-4">
            <p className="text-sm text-gray-500 text-center">
              アラートはありません
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
