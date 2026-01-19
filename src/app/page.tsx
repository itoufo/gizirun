import Link from 'next/link'
import { Mic, Upload, Video, Sparkles } from 'lucide-react'

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-primary-50 to-white">
      <header className="container mx-auto px-4 py-6">
        <nav className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-primary-600">Notta</h1>
          <div className="flex gap-4">
            <Link
              href="/login"
              className="text-gray-600 hover:text-gray-900"
            >
              ログイン
            </Link>
            <Link
              href="/login"
              className="rounded-lg bg-primary-600 px-4 py-2 text-white hover:bg-primary-700"
            >
              無料で始める
            </Link>
          </div>
        </nav>
      </header>

      <main className="container mx-auto px-4 py-20">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-5xl font-bold text-gray-900">
            AIで音声を
            <span className="text-primary-600">テキストに</span>
          </h2>
          <p className="mt-6 text-xl text-gray-600">
            リアルタイム文字起こし、話者分離、AI要約。
            Web会議の自動文字起こしも対応。
          </p>
          <div className="mt-10">
            <Link
              href="/login"
              className="inline-block rounded-lg bg-primary-600 px-8 py-4 text-lg font-semibold text-white hover:bg-primary-700"
            >
              無料で始める
            </Link>
          </div>
        </div>

        <div className="mt-24 grid gap-8 md:grid-cols-2 lg:grid-cols-4">
          <FeatureCard
            icon={<Mic className="h-8 w-8" />}
            title="リアルタイム文字起こし"
            description="マイクからの音声をリアルタイムでテキスト化"
          />
          <FeatureCard
            icon={<Upload className="h-8 w-8" />}
            title="ファイルアップロード"
            description="音声・動画ファイルをアップロードして文字起こし"
          />
          <FeatureCard
            icon={<Video className="h-8 w-8" />}
            title="Web会議対応"
            description="Zoom・Google Meetに自動参加して文字起こし"
          />
          <FeatureCard
            icon={<Sparkles className="h-8 w-8" />}
            title="AI要約"
            description="文字起こし結果をAIが要約・キーポイント抽出"
          />
        </div>
      </main>
    </div>
  )
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode
  title: string
  description: string
}) {
  return (
    <div className="rounded-xl bg-white p-6 shadow-lg">
      <div className="mb-4 text-primary-600">{icon}</div>
      <h3 className="mb-2 text-lg font-semibold text-gray-900">{title}</h3>
      <p className="text-gray-600">{description}</p>
    </div>
  )
}
