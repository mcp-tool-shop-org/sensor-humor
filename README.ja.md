<p align="center">
  <a href="README.md">English</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/sensor-humor/readme.png" width="400" alt="sensor-humor" />
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/sensor-humor/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/sensor-humor/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/mcp-tool-shop-org/sensor-humor/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License"></a>
  <a href="https://mcp-tool-shop-org.github.io/sensor-humor/"><img src="https://img.shields.io/badge/landing-page-34d399" alt="Landing Page"></a>
</p>

MCPツール：LLMに、状況に応じて変化するユーモアのセンスを与える機能。感情に基づいた個性、セッション情報を考慮した応答、繰り返されるジョーク、皮肉、挑発、決まり文句など、すべてがPiper TTS（発音を制御）による音声統合で実現されます。

開発者向け：コードの改善点に対するユーモアのある指摘、エラーメッセージを面白おかしく、ビルド失敗時には予測不能な反応をさせることができます。ホストLLMのトーンを上書きすることはありません。呼び出されたときに、独自の音声で応答します。

## 機能

- 6つのモードが搭載されており、すべてが実際の開発セッションで70%以上の精度で動作します。
- セッションの状態：ジョーク、最近の話題のリングバッファ（最大20件）、キャッチフレーズのマップ。
- 9つのツール：mood_set/mood_get、comic_timing、roast、heckle、catchphrase_generate/catchphrase_callback、debug_status、session_reset。
- ローカルのOllamaバックエンド（デフォルトはqwen2.5:7b、`SENSOR_HUMOR_MODEL`で設定可能）。
- 音声の組み合わせ：mcp-voice-soundboardとPiper TTS（発音に関するパラメータ：長さ、ノイズ、ノイズの強さ、音量）。
- 決定論的：JSONスキーマの適用、検証、不正な出力に対する再試行、モードの継承。

## モード

各モードは、モデルを予測可能で高品質な状態に誘導する、穴埋め形式のプロンプトを使用します。

- **dry** — 冷静沈着、ミニマリスト、ありきたり（デフォルト）。
- **roast** — ユーモアを交えた皮肉、評価/診断ラベル。
- **cynic** — 倦怠感、静かなる現実主義（"もちろん：", "予想通り： "）。
- **cheeky** — 遊び心のあるいたずら（"あら、お嬢さん", "大胆な行動"）。
- **chaotic** — 意味のある文、そして突然のナンセンスな展開（"報道によると..."）。
- **zoomer** — インターネット中毒のZ世代スラング（反応、ジョーク、大文字、タグ）。

すべてのモードで、mcp-voice-soundboard（推奨：Piper）を通じて音声と発音を継承します。

## 必要条件

- Node.js 18以上
- ローカルでOllamaが動作しており、`qwen2.5:7b`がインストールされている（または、別のモデルを使用する場合は`SENSOR_HUMOR_MODEL`を設定）。
- mcp-voice-soundboardがインストールされ、動作している（推奨：Piperバックエンド、オプション）。
- @modelcontextprotocol/sdk

## インストール

```bash
npm install sensor-humor
# or link local dev version
npm link /path/to/sensor-humor
```

## クイックスタート

1. Ollamaを起動します。

```bash
ollama pull qwen2.5:7b
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
mood_set(style: "roast")
roast(target: "800-line god function")
```

テキストの「roast」が返されます。もし[mcp-voice-soundboard](https://github.com/mcp-tool-shop-org/mcp-voice-soundboard)も設定されている場合、`voice_speak(mood: "roast")`で、そのモードに合わせたPiperの発音で読み上げられます。

## ツール

すべてのツールは、セッションから現在の感情を継承します。

| ツール | シグネチャ | 説明 |
|------|-----------|-------------|
| `mood_set` | `(style: string)` | 設定可能な雰囲気（ドライ、ロースト、混沌、いたずらっぽい、シニカル、ズーマー） |
| `mood_get` | `()` | 現在の感情とジョークの数 |
| `comic_timing` | `(text, technique?)` | ユーモアのある表現で書き換える（三段構え、ミスディレクション、エスカレーション、コールバック、控えめな表現、自動） |
| `roast` | `(target, context?)` | 現在のモードの音声でユーモアを交えた皮肉を返し、深刻度を1〜5で示します。コンテキスト：コード、エラー、アイデア、状況。 |
| `heckle` | `(target)` | 鋭い一言 |
| `catchphrase_generate` | `(context?)` | 再利用可能なジョークを作成（セッションに保存） |
| `catchphrase_callback` | `()` | 最もよく使われる決まり文句を再利用（またはnull） |
| `debug_status` | `()` | 現在のセッションの状態、モードの設定、音声バックエンドを表示します。 |
| `session_reset` | `()` | すべてのセッションの状態（モード、ジョーク、話題、キャッチフレーズ、ターンカウンター）をリセットします。 |

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
SENSOR_HUMOR_MODEL=qwen2.5:7b         # Ollama model (default: qwen2.5:7b)
OLLAMA_HOST=http://127.0.0.1:11434    # Ollama API host (default: http://127.0.0.1:11434)

# voice integration (in voice-soundboard)
VOICE_SOUNDBOARD_ENGINE=piper          # or kokoro (default)
VOICE_SOUNDBOARD_PIPER_MODEL_DIR=/path/to/piper/models
```

## 監視とデバッグ

- すべてのツールの呼び出しはログに記録されます：送信されたプロンプト、Ollamaからの生の応答、解析された出力、セッションの更新
- 音声：デバッグログには、各感情に適用されるPiperのパラメータが表示されます。
- `SENSOR_HUMOR_DEBUG=true`を設定すると、すべてが表示されます。

## 品質に関する注意点

- コメディの精度：実際の開発セッションで、各モード/ツールで70〜100%（穴埋め形式のプロンプトエンジニアリング）。
- 類似表現/比較フィルター：後処理の正規表現と再試行/フォールバックにより、dry/cheekyモードでの情報漏洩を防ぎます。
- すべてのモードで70%以上の精度。roast/cynic/chaoticモードでは、多くの場合90〜100%。
- 決定論的：JSONスキーマの適用、不正な出力に対する再試行、すべてのツールでモードの継承。
- 音声：Piperが発音の調整（各モードごとに長さ、ノイズ、音量）を行います。Kokoroは速度のみの代替手段です。
- 開発ツール用の補助機能のみ。ユーモアは主観的なものです。必要に応じて、環境変数でモードを無効にするか、プロンプトを調整してください。

## セキュリティと信頼性

- **ローカルのみ** — ローカルホストのOllamaとHTTPで通信し、外部ネットワークへのアクセスはありません。
- **ファイルシステムへのアクセスなし** — ファイルの読み書きは行いません。
- **機密情報の取り扱いなし** — 認証情報（パスワードなど）の読み込み、保存、送信は行いません。
- **テレメトリーなし** — 収集や送信は一切行いません。
- **セッションの状態はメモリ上のみ** — サーバープロセスが停止すると消えます。
- **入力のサニタイズ** — ユーザーが入力したテキストは、プロンプトインジェクションを防ぐために、事前にサニタイズされます（改行の削除、文字数の制限、制御文字の削除）。
- **出力のフィルタリング** — 攻撃的な言葉をフィルタリングします（base64でエンコードされた用語リストを使用）。再試行と安全な代替手段により、不適切な表現がユーザーに届くのを防ぎます。

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
