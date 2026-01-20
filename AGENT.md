# Notta - Architecture Specification

## Overview

Nottaはミーティングの文字起こしとノート作成を行うアプリケーション。

### 主要機能
- リアルタイム音声文字起こし
- ファイルアップロード文字起こし
- Web会議自動参加（Zoom/Google Meet）によるボット文字起こし
- AI要約生成

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 14 (App Router) |
| Backend | Next.js API Routes + WebSocket Server (別プロセス) |
| Database | PostgreSQL (Prisma ORM) |
| Authentication | Supabase Auth |
| Storage | Supabase Storage / AWS S3 |
| Transcription (Live) | Deepgram |
| Transcription (Upload) | AssemblyAI |
| AI Summary | OpenAI GPT-4o |
| Meeting Bot | Meeting BaaS |

---

## Architecture Diagram

```
[Browser/Client]
   ├─ Next.js App (UI + API Routes)
   │    ├─ /api/meetings (CRUD + bot scheduling)
   │    ├─ /api/transcripts (CRUD + summary)
   │    └─ /api/upload (presigned + process)
   │
   ├─ WebSocket Client (live audio + realtime display)
   │
[WebSocket Server :3001]
   ├─ Deepgram Live API (real-time transcription)
   ├─ Broadcast to clients
   └─ Receives webhook broadcast (HTTP POST)

[Async/External Services]
   ├─ Meeting BaaS Bot
   │    └─ Webhook → Next.js /api/webhooks
   ├─ AssemblyAI (file upload transcription)
   └─ OpenAI GPT-4o (summaries)

[Data Layer]
   ├─ PostgreSQL (Prisma)
   └─ Supabase Storage / S3
```

---

## Directory Structure

```
src/
├── app/
│   ├── (auth)/           # Login/Register pages
│   ├── (dashboard)/      # Protected pages (meetings, transcripts, settings)
│   ├── api/
│   │   ├── meetings/     # Meeting CRUD, bot scheduling
│   │   ├── transcripts/  # Transcript CRUD, summarization
│   │   ├── upload/       # Presigned URL, file processing
│   │   └── webhooks/     # Meeting BaaS webhooks
│   └── auth/callback/    # OAuth callback
├── lib/
│   ├── auth/             # Supabase auth wrapper
│   ├── db/               # Prisma client
│   ├── meeting-bot/      # Meeting BaaS API client
│   ├── transcription/    # Deepgram, AssemblyAI clients
│   ├── ai/               # OpenAI summarization
│   └── supabase/         # Supabase client
├── hooks/                # Custom React hooks
└── components/           # UI components
server/
└── websocket.ts          # Separate WebSocket server
```

---

## Data Models

### Core Entities

```
User
├── id (UUID)
├── email
├── name
├── transcripts[]
├── meetings[]
└── calendarConnections[]

Transcript
├── id
├── userId → User
├── title
├── sourceType (RECORDING | UPLOAD | MEETING)
├── status (PENDING | PROCESSING | COMPLETED | FAILED)
├── segments[] → TranscriptSegment
├── speakers[] → Speaker
├── summary → Summary
└── meeting → Meeting

Meeting
├── id
├── userId → User
├── title
├── platform (ZOOM | GOOGLE_MEET)
├── meetingUrl
├── scheduledStart
├── status (SCHEDULED | IN_PROGRESS | COMPLETED | CANCELLED)
├── botStatus (SCHEDULED | JOINING | ACTIVE | COMPLETED | FAILED)
├── botInstanceId (Meeting BaaS reference)
└── transcript → Transcript
```

---

## Data Flows

### 1. Real-time Recording Flow
```
Browser Mic → WebSocket Client → server/websocket.ts → Deepgram Live API
                                        ↓
                               Transcript results
                                        ↓
                               WebSocket → Browser (display)
```

### 2. Meeting Bot Flow
```
User schedules meeting → API creates Meeting record
                                    ↓
                         Meeting BaaS creates bot
                                    ↓
                         Bot joins meeting at scheduled time
                                    ↓
                         Webhook → /api/webhooks/meeting-bot
                                    ↓
                         Save transcript segments to DB
                                    ↓
                         HTTP POST → WebSocket /broadcast
                                    ↓
                         Broadcast → Client real-time display
```

### 3. File Upload Flow
```
User uploads file → Presigned URL (S3)
                            ↓
                  Process API → AssemblyAI
                            ↓
                  Save transcript to DB
```

---

## Architecture Review

### Strengths

1. **関心の分離が明確**: Next.js App (UI + API) と WebSocket Server (リアルタイム処理) の分離
2. **プロバイダー特化**: Deepgram (ライブ), AssemblyAI (アップロード) - ユースケースに最適化
3. **認証基盤**: Supabase Auth + Prisma で認証境界とリレーショナルモデルを確保
4. **イベント駆動**: Webhookと非同期処理が問題領域に適合
5. **ストレージ抽象化**: Supabase/S3 で柔軟なデプロイが可能

### Weaknesses

1. **リアルタイムパイプラインの多段ホップ**: Webhook → HTTP POST → WebSocket で遅延とfailure pointが増加
2. **ユーザー同期の遅延更新**: Supabase Auth ↔ Prisma の "lazy upsert" でエッジケースの不整合リスク
3. **WebSocketサーバーの独立運用**: Port 3001で別プロセス、Railway上のヘルスチェック/スケール戦略が不明確
4. **ジョブオーケストレーション不在**: 複数プロバイダーとキューで統一的なリトライ戦略がない
5. **セキュリティ検証**: Webhook署名、Presigned URL、WebSocket認証のゲーティングが不明確

---

## Known Bugs & Issues

### Critical (本番環境で機能しない)

#### BUG-001: Webhook URLが無効
**File**: `src/app/api/meetings/route.ts:70-71`
**Problem**: `VERCEL_URL` にはプロトコルがないため、Meeting BaaSに送信するwebhook URLが無効になる。結果、webhookイベントが届かずリアルタイム文字起こしが動作しない。
**Fix**:
```typescript
// Before
const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL
const webhookUrl = baseUrl ? `${baseUrl}/api/webhooks/meeting-bot` : undefined

// After
const baseUrl = process.env.NEXT_PUBLIC_APP_URL
if (!baseUrl) {
  console.error('NEXT_PUBLIC_APP_URL is required for webhook')
}
const webhookUrl = baseUrl ? new URL('/api/webhooks/meeting-bot', baseUrl).toString() : undefined
```
**Effort**: Quick

#### BUG-002: WS_SERVER_URLがlocalhost固定
**File**: `src/app/api/webhooks/meeting-bot/route.ts:5`
**Problem**: `WS_SERVER_URL` のデフォルトが `http://localhost:3001` で、Railwayの別サービスでは到達できない。Broadcast が全て失敗する。
**Fix**: 環境変数 `WS_SERVER_URL` を本番のWebSocketサービスURLに設定。未設定時はエラーを投げる。
**Effort**: Quick

### High (主要機能に影響)

#### BUG-003: ALLOWED_ORIGINSがlocalhost固定
**File**: `server/websocket.ts:8`
**Problem**: `.env.example` の `ALLOWED_ORIGINS` が `http://localhost:3000` のみ。本番のoriginが拒否されWebSocket接続失敗。
**Fix**: 本番のorigin (`https://your-app.railway.app`) を `ALLOWED_ORIGINS` に追加。
**Effort**: Quick

#### BUG-004: Mixed Content (ws:// on HTTPS)
**File**: `src/app/(dashboard)/meetings/[id]/page.tsx:24`
**Problem**: `NEXT_PUBLIC_WS_URL` のデフォルトが `ws://` で、HTTPSサイトからmixed contentとしてブロックされる。
**Fix**: 本番では `wss://` プロトコルを使用。
```env
NEXT_PUBLIC_WS_URL=wss://your-ws-server.railway.app/api/realtime
```
**Effort**: Quick

#### BUG-005: transcript.final ドロップ (Race Condition)
**File**: `src/app/api/webhooks/meeting-bot/route.ts:130-179`
**Problem**: `transcript.final` イベント受信時に `meeting.transcript` が存在しない場合（`bot.in_meeting` より先に来た場合）、セグメントが保存されずドロップされる。
**Fix**: `transcript.final/partial` ハンドラ内で transcript レコードを作成または取得する。
**Effort**: Short

#### BUG-006: Webhook署名検証がプレースホルダー
**File**: `src/lib/meeting-bot/client.ts:161-179`
**Problem**: `verifyWebhookSignature` 関数が Meeting BaaS の実際の署名フォーマットと一致していない可能性。401エラーで全webhook拒否のリスク。
**Fix**: Meeting BaaS ドキュメントに従って正確な検証ロジックを実装。
**Effort**: Medium

#### BUG-007: BROADCAST_SECRET未文書化
**File**: `server/websocket.ts:42-49`, `.env.example`
**Problem**: WebSocketサーバーは `BROADCAST_SECRET` を検証するが、`.env.example` に記載がない。不一致で401エラー。
**Fix**: `.env.example` に `BROADCAST_SECRET` を追加し、両サービスで同じ値を設定。
**Effort**: Quick

### Medium (信頼性に影響)

#### BUG-008: Broadcastリトライなし
**File**: `src/app/api/webhooks/meeting-bot/route.ts:9-24`
**Problem**: `broadcastToMeeting` が失敗してもリトライしない。一時的なネットワークエラーでリアルタイム更新が欠落。
**Fix**: 最低1回のリトライ + exponential backoff を追加。
**Effort**: Short

#### BUG-009: 遅延参加時のメッセージ欠落
**Behavior Note**: クライアントが購読する前に到着したwebhookイベントはドロップされる。これは現在の設計上の制限。
**Mitigation**: ページ読み込み時にDBから既存セグメントを取得しているため、確定セグメントは表示される。中間結果（partial）のみ欠落。

---

## Improvement Recommendations

### Phase 1: Critical Bug Fixes (即時対応)
**Total Effort: Short (2-4h)**

| Task | Bug ID | File | Effort |
|------|--------|------|--------|
| Webhook URL修正 | BUG-001 | `src/app/api/meetings/route.ts` | Quick |
| WS_SERVER_URL設定 | BUG-002 | `.env` + deploy config | Quick |
| ALLOWED_ORIGINS設定 | BUG-003 | `.env` + WS server | Quick |
| wss:// プロトコル修正 | BUG-004 | `.env` | Quick |
| BROADCAST_SECRET文書化 | BUG-007 | `.env.example` | Quick |

### Phase 2: High Priority Bug Fixes
**Total Effort: Short-Medium (4-8h)**

| Task | Bug ID | File | Effort |
|------|--------|------|--------|
| Race condition修正 | BUG-005 | `src/app/api/webhooks/meeting-bot/route.ts` | Short |
| Webhook署名検証実装 | BUG-006 | `src/lib/meeting-bot/client.ts` | Medium |
| Broadcastリトライ追加 | BUG-008 | `src/app/api/webhooks/meeting-bot/route.ts` | Short |

### Phase 3: Architecture Improvements
**Total Effort: Medium-Large**

#### 3.1 Real-time Broadcast Path Hardening
**Effort: Short (1-4h)**
- Webhook → HTTP POST → /broadcast を Redis Pub/Sub または直接呼び出しに置き換え
- Webhookイベントの構造化リトライとDead Letter Queue追加

#### 3.2 Identity Consistency
**Effort: Short (1-4h)**
- Auth callbackで決定論的ユーザー作成（lazy upsertから移行）
- Supabase User ID ↔ Prisma Userのユニーク制約追加

#### 3.3 Async Job Layer
**Effort: Medium (1-2d)**
- BullMQ/Redis でアップロード文字起こし・要約ジョブを統一管理
- リトライポリシーと失敗可視化の一元化

#### 3.4 WebSocket Auth & Rate Limiting
**Effort: Short (1-4h)**
- WS接続時にSupabase JWT検証
- メッセージとAPIエンドポイントのレート制限

#### 3.5 Deployment Topology (Railway)
**Effort: Short (1-4h)**
- WebSocketサーバーのヘルスチェック定義
- オートスケールまたは再起動ポリシー設定
- ポート公開とサービスディスカバリの文書化

#### 3.6 Observability & Cost Controls
**Effort: Short (1-4h)**
- 文字起こしごとのコストタグ付け（プロバイダー、duration、トークン数）
- キャプチャ → 表示、アップロード → 要約の遅延計測

---

## Environment Variables

### Required for Production

```env
# App URL (CRITICAL: must include protocol)
NEXT_PUBLIC_APP_URL=https://your-app.railway.app

# Database
DATABASE_URL=postgresql://...
DIRECT_URL=postgresql://...

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Transcription
DEEPGRAM_API_KEY=xxx
ASSEMBLYAI_API_KEY=xxx

# AI
OPENAI_API_KEY=sk-xxx

# Meeting Bot
MEETING_BAAS_API_KEY=xxx
MEETING_BAAS_WEBHOOK_SECRET=xxx

# WebSocket (CRITICAL for real-time meeting transcription)
NEXT_PUBLIC_WS_URL=wss://your-ws-server.railway.app/api/realtime  # Client-side (must be wss:// for HTTPS)
WS_SERVER_URL=http://ws-service.railway.internal:3001             # Server-side (internal service URL)
WS_PORT=3001
BROADCAST_SECRET=your-shared-secret                                # Must match between Next.js and WS server
ALLOWED_ORIGINS=https://your-app.railway.app                       # Comma-separated if multiple

# Storage
AWS_ACCESS_KEY_ID=xxx
AWS_SECRET_ACCESS_KEY=xxx
AWS_REGION=ap-northeast-1
S3_BUCKET_NAME=notta-audio
```

### Environment Variable Checklist

| Variable | Service | Required | Notes |
|----------|---------|----------|-------|
| `NEXT_PUBLIC_APP_URL` | Next.js | Yes | Webhook URL生成に必須。プロトコル含む |
| `NEXT_PUBLIC_WS_URL` | Client | Yes | `wss://` for production |
| `WS_SERVER_URL` | Next.js | Yes | Internal service URL |
| `BROADCAST_SECRET` | Both | Yes | Next.js と WS server で同一値 |
| `ALLOWED_ORIGINS` | WS Server | Yes | CORS許可するorigin |

---

## Deployment

- **Platform**: Railway
- **Services**:
  - Next.js App (main)
  - WebSocket Server (separate process)
  - PostgreSQL (managed)

詳細は `DEPLOY.md` を参照。

---

*Last updated: 2025-01-20*
*Reviewed by: Architect & Code Reviewer (Codex)*
*Bug analysis: Meeting Bot real-time transcription flow*
