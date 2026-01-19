# Notta デプロイ手順 (Vercel + Railway)

## アーキテクチャ

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Vercel    │────▶│   Railway   │────▶│  Deepgram   │
│  (Next.js)  │ WS  │ (WebSocket) │     │    API      │
└─────────────┘     └─────────────┘     └─────────────┘
       │                   │
       └───────┬───────────┘
               ▼
       ┌─────────────┐
       │  Supabase   │
       │  (DB/Auth)  │
       └─────────────┘
```

---

## 1. Railway (WebSocketサーバー)

### 1.1 プロジェクト作成

1. [Railway](https://railway.app) にログイン
2. 「New Project」→「Deploy from GitHub repo」
3. このリポジトリを選択

### 1.2 環境変数設定

Railway ダッシュボードで以下を設定:

| 変数名 | 値 |
|--------|-----|
| `WS_PORT` | `3001` (または Railway の `PORT` を使用) |
| `DEEPGRAM_API_KEY` | Deepgram の API キー |
| `ALLOWED_ORIGINS` | `https://your-app.vercel.app` |

> **Note**: Railway は `PORT` 環境変数を自動設定する。`WS_PORT` の代わりに `PORT` を使うよう修正してもOK。

### 1.3 デプロイ設定

`railway.json` が自動検出される。設定内容:
- ビルド: `npm install && npm run build:ws`
- 起動: `npm run start:ws`
- ヘルスチェック: `/health`

### 1.4 ドメイン取得

1. Settings → Networking → Generate Domain
2. 生成された URL をメモ (例: `notta-ws.up.railway.app`)

---

## 2. Vercel (Next.js)

### 2.1 プロジェクト作成

1. [Vercel](https://vercel.com) にログイン
2. 「Add New」→「Project」
3. GitHub リポジトリを選択

### 2.2 環境変数設定

Vercel ダッシュボードで以下を設定:

| 変数名 | 値 |
|--------|-----|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Anon Key |
| `DATABASE_URL` | PostgreSQL 接続文字列 |
| `NEXTAUTH_URL` | `https://your-app.vercel.app` |
| `NEXTAUTH_SECRET` | ランダムな32文字以上の文字列 |
| `DEEPGRAM_API_KEY` | Deepgram API キー |
| `ASSEMBLYAI_API_KEY` | AssemblyAI API キー |
| `OPENAI_API_KEY` | OpenAI API キー |
| `NEXT_PUBLIC_WS_URL` | `wss://notta-ws.up.railway.app/api/realtime` |

> **Important**: WebSocket URL は `wss://` (SSL) を使用

### 2.3 ビルド設定

Framework Preset: Next.js (自動検出)

### 2.4 デプロイ

「Deploy」をクリック

---

## 3. Supabase 設定

### 3.1 認証設定

1. Authentication → URL Configuration
2. Site URL: `https://your-app.vercel.app`
3. Redirect URLs: `https://your-app.vercel.app/auth/callback`

### 3.2 ストレージ設定 (必要に応じて)

1. Storage → New Bucket
2. バケット名: `audio-files`
3. Public: Off

---

## 4. 確認事項

### デプロイ後チェックリスト

- [ ] Vercel: アプリにアクセスできる
- [ ] Railway: `/health` が 200 を返す
- [ ] WebSocket: 録音ページで接続できる
- [ ] 認証: ログイン/登録が動作する
- [ ] 文字起こし: リアルタイムで動作する

### トラブルシューティング

**WebSocket接続エラー**
- Railway の `ALLOWED_ORIGINS` に Vercel ドメインが含まれているか確認
- `wss://` (SSL) を使用しているか確認

**CORS エラー**
- Railway の環境変数を確認
- ブラウザのコンソールでエラー詳細を確認

**認証エラー**
- Supabase の Redirect URLs を確認
- `NEXTAUTH_URL` が正しいか確認

---

## 5. 本番環境の環境変数まとめ

### Railway
```env
WS_PORT=3001
DEEPGRAM_API_KEY=your_deepgram_key
ALLOWED_ORIGINS=https://your-app.vercel.app
```

### Vercel
```env
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
DATABASE_URL=postgresql://...
NEXTAUTH_URL=https://your-app.vercel.app
NEXTAUTH_SECRET=your_secret_key_min_32_chars
DEEPGRAM_API_KEY=your_deepgram_key
ASSEMBLYAI_API_KEY=your_assemblyai_key
OPENAI_API_KEY=your_openai_key
NEXT_PUBLIC_WS_URL=wss://notta-ws.up.railway.app/api/realtime
```
