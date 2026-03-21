<p align="center">
  <a href="README.md">English</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/sensor-humor/readme.png" width="600" alt="sensor-humor" />
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/sensor-humor/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/sensor-humor/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/mcp-tool-shop-org/sensor-humor/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License"></a>
  <a href="https://mcp-tool-shop-org.github.io/sensor-humor/"><img src="https://img.shields.io/badge/landing-page-34d399" alt="Landing Page"></a>
</p>

MCPツール：LLMに、状況に応じて変化するユーモアのセンスを与える機能。感情に基づいた個性、セッション情報を考慮した応答、繰り返されるジョーク、皮肉、挑発、決まり文句など、すべてがPiper TTS（発音を制御）による音声統合で実現されます。

開発者向け：コードの改善点に対するユーモアのある指摘、エラーメッセージを面白おかしく、ビルド失敗時には予測不能な反応をさせることができます。ホストLLMのトーンを上書きすることはありません。呼び出されたときに、独自の音声で応答します。

## 機能

- 6つの感情：ドライ（デフォルト）、皮肉、ナンセンス、誠実、辛辣、予測不能
- セッション状態：繰り返されるジョーク、最近の会話履歴（最大20件）、決まり文句のマップ
- ツール：mood.set/get、comic_timing、roast、heckle、catchphrase.generate/callback
- ローカルのOllamaバックエンド（qwen2.5:7b-instructを推奨）
- 音声設定：mcp-voice-soundboardとPiper TTS（発音の調整項目：length_scale、noise_scale、noise_w_scale、volume）
- 決定論的：JSONスキーマの適用、検証、不正な出力に対する再試行、デバッグログ

## モード

各モードは、モデルを予測可能で高品質な状態に誘導する、穴埋め形式のプロンプトを使用しています。

- **dry**（ドライ）：無感情、ミニマリスト、露骨（デフォルト）
- **roast**（ロースト）：愛情のこもった皮肉、評価/診断ラベル
- **cynic**（シニカル）：倦怠感、静かなる現実主義（"もちろん：", "予想通り："）
- **cheeky**（いたずらっぽい）：遊び心のあるからかい（"あら、お砂糖さん", "大胆な行動ね"）
- **chaotic**（混沌とした）：文脈に沿った文章、その後、突然の奇抜な展開（"によると..."）
- **zoomer**（ズーマー）：インターネット中毒の若者特有の皮肉（反応、ジョーク、大文字、タグ）

すべてのモードは、mcp-voice-soundboard（推奨：Piper）を通じて、声と抑揚を継承します。

## 必要条件

- Node.js 18以上
- ローカルにOllamaがインストールされており、`qwen2.5:7b-instruct`がダウンロードされていること
- mcp-voice-soundboardがインストールされ、実行されていること（Piperバックエンドを推奨）
- @modelcontextprotocol/sdk

## インストール

```bash
npm install @mcp-tool-shop/sensor-humor
# or link local dev version
npm link /path/to/sensor-humor
```

## クイックスタート

1. Ollamaを起動します。

```bash
ollama run qwen2.5:7b-instruct
```

2. sensor-humor MCPサーバーを起動します（stdioトランスポートを使用）。

```bash
cd sensor-humor
SENSOR_HUMOR_DEBUG=true npm start
```

3. voice-soundboardを起動します（Piperモード）。

```bash
cd ../mcp-voice-soundboard
VOICE_SOUNDBOARD_ENGINE=piper VOICE_SOUNDBOARD_PIPER_MODEL_DIR=/path/to/piper/models npm start
```

4. MCPクライアント（Claude Code、Cursorなど）で：
- 両方のサーバーを追加します。
- テスト：

```
mood.set(style: "roast")
roast(target: "800-line god function")
```

皮肉なコメントが返された後、`voice_speak(mood: "roast")`が、自信と皮肉を込めた声でそれを読み上げます。

## ツール

すべてのツールは、セッションから現在の感情を継承します。

| ツール | シグネチャ | 説明 |
|------|-----------|-------------|
| `mood.set` | `(style: string)` | 設定可能な雰囲気（ドライ、ロースト、混沌、いたずらっぽい、シニカル、ズーマー） |
| `mood.get` | `()` | 現在の感情とジョークの数 |
| `comic_timing` | `(text, technique?)` | ユーモアのある表現で書き換える（三段構え、ミスディレクション、エスカレーション、コールバック、控えめな表現、自動） |
| `roast` | `(target, context?)` | 現在のモードの音声で、愛情のこもった皮肉を生成します。重みを1～5で調整できます。コンテキスト：コード、エラー、アイデア、状況 |
| `debug_status` | `()` | 現在のセッションの状態、モードの設定、および音声バックエンドをダンプします。 |
| `heckle` | `(target)` | 鋭い一言 |
| `catchphrase.generate` | `(context?)` | 再利用可能なジョークを作成（セッションに保存） |
| `catchphrase.callback` | `()` | 最もよく使われる決まり文句を再利用（またはnull） |

## 感情ごとの発音（Piper Voice）

各感情は、異なるPiperの声と発音設定にマッピングされています。

| 感情 | 音声 | length_scale | noise_scale | noise_w_scale | volume | 特徴 |
|------|-------|-------------|-------------|---------------|--------|-----------|
| ドライ | en_GB-alan-medium | 1.15 | 0.3 | 0.3 | 0.9 | 平板で、疲れていて、単調 |
| 皮肉 | en_US-ryan-high | 0.95 | 0.667 | 0.8 | 1.0 | 自信のある皮肉 |
| 混沌 | en_US-lessac-high | 0.88 | 0.8 | 0.9 | 1.1 | 意味不明なことを話すニュースキャスター |
| いたずらっぽい | en_GB-cori-high | 1.05 | 0.5 | 0.6 | 0.95 | 温かい、からかうような、遊び心のあるウィンク |
| シニカル | en_GB-alan-medium | 1.25 | 0.2 | 0.2 | 0.8 | 冷たい、平板、全く驚きがない |
| ズーマー | en_US-lessac-high | 0.90 | 0.85 | 0.9 | 1.15 | 速い、騒がしい、ストリーマーのような雰囲気 |

## 環境変数

```bash
# sensor-humor
SENSOR_HUMOR_DEBUG=true                # verbose prompt/response dumps
SENSOR_HUMOR_OBSERVE=true              # full chain trace (prompt -> text -> piper params)
SENSOR_HUMOR_PROMPT_VERSION=1          # prompt set version (for A/B tuning)

# voice integration (in voice-soundboard)
VOICE_SOUNDBOARD_ENGINE=piper          # or kokoro (default)
VOICE_SOUNDBOARD_PIPER_MODEL_DIR=/path/to/piper/models
```

## 監視とデバッグ

- すべてのツールの呼び出しはログに記録されます：送信されたプロンプト、Ollamaからの生の応答、解析された出力、セッションの更新
- 音声：デバッグログには、各感情に適用されるPiperのパラメータが表示されます。
- `SENSOR_HUMOR_DEBUG=true`を設定すると、すべてが表示されます。

## 品質に関する注意点

- コメディの成功率：実際の開発セッションにおいて、各モード/ツールで70～100%（プロンプトエンジニアリング、テンプレートベース）
- 比喩/比較フィルター：後処理の正規表現と再試行/代替により、dry/cheekyモードでの情報漏洩を防ぎます。
- すべてのモードで、実際のセッションで70%以上の成功率。roast/cynic/chaoticモードでは、多くの場合90～100%
- 決定論的：JSONスキーマの適用、不正な出力の場合の再試行、すべてのツールでモードの継承を強制します。
- 音声：Piperは、モードごとに長さ、ノイズ、音量を調整する機能を提供します。Kokoroは、速度のみに特化した代替手段です。
- 開発ツール専用。ユーモアは主観的なものです。必要に応じて、環境変数でモードを無効にするか、プロンプトを調整してください。

## アーキテクチャ

```
Host LLM (Claude, etc.)
  | calls tool
  v
sensor-humor MCP server (TypeScript, stdio)
  | builds mood prompt + session state
  v
Ollama (qwen2.5:7b-instruct, local)
  | returns JSON (schema-enforced)
  v
sensor-humor validates -> updates session -> returns to host
  | host optionally calls
  v
mcp-voice-soundboard (Piper backend)
  | maps mood -> prosody preset
  v
Piper TTS (local ONNX) -> audio
```

## 開発

```bash
# build
npm run build

# watch & rebuild
npm run dev

# run tests
npm test

# run with debug
SENSOR_HUMOR_DEBUG=true npm start
```

## ライセンス

MIT

---

作成者: <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
