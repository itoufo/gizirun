# Notta

AI を活用した会議文字起こし・議事録作成アプリケーション。リアルタイム音声認識、話者識別、AI 要約を提供します。

## 主な機能

- **リアルタイム文字起こし** - マイク入力からリアルタイムで音声をテキスト化（Deepgram）
- **ファイルアップロード** - 音声/動画ファイルのアップロードによる文字起こし（AssemblyAI）
- **会議ボット** - Zoom / Google Meet に自動参加して録音・文字起こし（Meeting BaaS）
- **AI 要約** - GPT-4o による要約・キーポイント・アクションアイテムの自動生成
- **話者識別** - 発話者ごとの自動ラベリング
- **トピック分析** - リアルタイムの話題検出とドリフトアラート
- **ファシリテーター支援** - 議題逸脱の検知とアラート通知

## 技術スタック

| レイヤー | 技術 |
|---------|------|
| フロントエンド | Next.js 14 (App Router), React 18, Tailwind CSS |
| バックエンド | Next.js API Routes, WebSocket サーバー (ws) |
| データベース | PostgreSQL (Prisma ORM) |
| 認証 | Supabase Auth |
| ストレージ | AWS S3 |
| リアルタイム文字起こし | Deepgram Live API |
| ファイル文字起こし | AssemblyAI |
| AI | OpenAI GPT-4o |
| 会議ボット | Meeting BaaS |
| 状態管理 | Zustand, React Query |

## セットアップ

### 前提条件

- Node.js 18+
- PostgreSQL
- 各種 API キー（Supabase, Deepgram, AssemblyAI, OpenAI, AWS）

### インストール

```bash
# 依存パッケージのインストール
npm install

# 環境変数の設定
cp .env.example .env.local
# .env.local を編集して API キーなどを設定

# Prisma クライアントの生成
npm run db:generate

# データベースのマイグレーション
npm run db:push
```

### 開発サーバーの起動

ターミナルを 2 つ使用します。

```bash
# ターミナル 1: Next.js 開発サーバー (port 3000)
npm run dev

# ターミナル 2: WebSocket サーバー (port 3001)
npm run dev:ws
```

アプリケーションは http://localhost:3000 でアクセスできます。

## 環境変数

`.env.example` を参照してください。主な項目:

| 変数 | 説明 |
|------|------|
| `DATABASE_URL` | PostgreSQL 接続文字列 |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase プロジェクト URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase 匿名キー |
| `DEEPGRAM_API_KEY` | Deepgram API キー |
| `ASSEMBLYAI_API_KEY` | AssemblyAI API キー |
| `OPENAI_API_KEY` | OpenAI API キー |
| `NEXT_PUBLIC_WS_URL` | WebSocket 接続先 URL |
| `BROADCAST_SECRET` | Next.js ↔ WebSocket 間の共有シークレット |

## スクリプト一覧

| コマンド | 説明 |
|---------|------|
| `npm run dev` | Next.js 開発サーバー起動 |
| `npm run dev:ws` | WebSocket サーバー起動（ホットリロード） |
| `npm run build` | プロダクションビルド |
| `npm run build:ws` | WebSocket サーバーのビルド |
| `npm run start` | プロダクションサーバー起動 |
| `npm run start:ws` | WebSocket サーバー起動（プロダクション） |
| `npm run db:generate` | Prisma クライアント生成 |
| `npm run db:push` | データベーススキーマ反映 |
| `npm run db:studio` | Prisma Studio 起動 |

## アーキテクチャ

```
ブラウザ (マイク入力)
    │
    ▼
WebSocket クライアント ──── WebSocket サーバー (port 3001)
    │                            │
    │                            ▼
    │                      Deepgram Live API
    │                            │
    ▼                            ▼
Next.js App (port 3000)    リアルタイム文字起こし結果
    │
    ├── API Routes ──── PostgreSQL (Prisma)
    ├── Supabase Auth
    └── OpenAI / AssemblyAI / Meeting BaaS
```

## デプロイ

Vercel（Next.js）+ Railway（WebSocket サーバー）の構成を想定しています。
詳細は [DEPLOY.md](./DEPLOY.md) を参照してください。

## ライセンス

ISC
