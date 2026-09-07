<p align="center">
  <a href="README.md">English</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/sensor-humor/readme.png" width="400" alt="sensor-humor" />
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@mcptoolshop/sensor-humor"><img src="https://img.shields.io/npm/v/@mcptoolshop/sensor-humor?label=npm&color=cb3837" alt="npm version"></a>
  <a href="https://github.com/mcp-tool-shop-org/sensor-humor/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/mcp-tool-shop-org/sensor-humor/ci.yml?branch=main&label=CI" alt="CI"></a>
  <a href="https://github.com/mcp-tool-shop-org/sensor-humor/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License"></a>
  <a href="https://mcp-tool-shop-org.github.io/sensor-humor/"><img src="https://img.shields.io/badge/landing-page-34d399" alt="Landing Page"></a>
</p>

大規模言語モデルに、ユーモラスな相棒のような役割を与える MCP ツールです。感情に基づいた個性、セッションを意識したコールバック、繰り返されるジョーク、皮肉、からかい、お決まりのフレーズなど、さまざまな機能があり、Piper TTS（抑揚制御）を通じて音声統合も可能です。

開発者向けに設計されており、コードの問題点に対する穏やかな批判、簡潔で冷静なエラーメッセージ、ビルド失敗時の混沌としたエスカレーションを行います。ホストの大規模言語モデルのトーンを上書きすることはありません。呼び出されたときに、独特の声で応答します。

## 機能

- 6つの感情があり、それぞれ予測可能で高品質な出力を得るために、穴埋め形式のテンプレートプロンプトで調整されています。
- セッション状態：繰り返されるジョーク、最近のジョークのリングバッファ（最大20）、お決まりのフレーズマップ。オプションでディスクに保存（`SENSOR_HUMOR_PERSIST`）することで、サーバーの再起動後もコールバックが維持されます。
- 11のツール：mood_set/mood_get、comic_timing、roast、heckle、catchphrase_generate/catchphrase_callback、running_gag、debug_status、debug_chain、session_reset
- ローカルのOllamaバックエンド（デフォルトはqwen2.5:7b、`SENSOR_HUMOR_MODEL`で設定可能）
- 音声ペアリング：mcp-voice-soundboardとPiper TTS（抑揚調整：length_scale、noise_scale、noise_w_scale、volume）
- 決定性：JSONスキーマの強制、検証、不良出力時の再試行、感情の継承

## 感情

各感情は、モデルを予測可能で高品質な状態に導く、穴埋め形式のテンプレートプロンプトを使用します。

- **dry** — 冷静で、ミニマリスト、痛いほど明白（デフォルト）
- **roast** — 友好的な皮肉、評価/診断ラベル
- **cynic** — 倦怠感、静かな悪意のあるリアリズム（「もちろん」、「予想通り」）
- **cheeky** — 遊び心のあるいたずら（「あら、まあ」、「大胆な行動」）
- **chaotic** — 根拠のある文、そして突然の不条理な展開（「報告によると…」）
- **zoomer** — 終末的なオンライン中毒のZ世代のスラング（反応、ジョーク、大文字、タグ）

すべての感情は、mcp-voice-soundboard（Piperを推奨）を通じて、音声と抑揚を継承します。

## 要件

- Node.js 18+
- ローカルで実行されているOllama（`qwen2.5:7b`をダウンロード済み、または異なるモデルの場合は`SENSOR_HUMOR_MODEL`を設定）
- インストールおよび実行されているmcp-voice-soundboard（Piperバックエンドを推奨、オプション）
- @modelcontextprotocol/sdk

## インストール

```bash
npm install @mcptoolshop/sensor-humor
# or install a local dev checkout
npm install /path/to/sensor-humor
```

### Docker

コンテナイメージは、各リリース時にGHCRに公開されます。sensor-humorは、標準出力経由でMCPと通信するため、対話的に実行し、アクセス可能なOllamaに接続します。

```bash
docker run -i --rm -e OLLAMA_HOST=http://host.docker.internal:11434 \
  ghcr.io/mcp-tool-shop-org/sensor-humor:latest
```

### MCPクライアントの設定

クライアントのMCP構成で、sensor-humorを標準出力サーバーとして登録します。Claude Code / Claude Desktop（`claude_desktop_config.json`）または、`mcpServers`形式の構成の場合：

```json
{
  "mcpServers": {
    "sensor-humor": {
      "command": "npx",
      "args": ["-y", "@mcptoolshop/sensor-humor"],
      "env": {
        "SENSOR_HUMOR_MODEL": "qwen2.5:7b",
        "OLLAMA_HOST": "http://127.0.0.1:11434"
      }
    }
  }
}
```

サーバーは、この`env`ブロック（またはサーバーを起動するシェル）から構成を読み込みます。`.env`ファイルを自動的にロードすることはありません。サポートされているすべての変数については、[`.env.example`](.env.example)を参照してください。パッケージをグローバルにインストールした場合は、`"command": "sensor-humor"`を使用し、`args`は不要です。

## クイックスタート

1. Ollamaを起動します。

```bash
ollama pull qwen2.5:7b
```

2. sensor-humor MCPサーバー（標準出力トランスポート）を起動します。

```bash
cd sensor-humor
SENSOR_HUMOR_DEBUG=true npm start
```

3. voice-soundboard（Piperモード）を起動します。

```bash
cd ../mcp-voice-soundboard
VOICE_SOUNDBOARD_ENGINE=piper VOICE_SOUNDBOARD_PIPER_MODEL_DIR=/path/to/piper/models npm start
```

4. MCPクライアント（Claude Code、Cursorなど）で：
- 両方のサーバーを追加します。
- テストチェーン：

```
mood_set(style: "roast")
roast(target: "800-line god function")
```

テキストの皮肉が返されます。また、[mcp-voice-soundboard](https://github.com/mcp-tool-shop-org/mcp-voice-soundboard)も設定されている場合、`voice_speak(mood: "roast")`が適切な感情のPiperの抑揚でそれを読み上げます。

## ツール

すべてのツールは、セッションから現在の感情を継承します。

| ツール | シグネチャ | 説明 |
|------|-----------|-------------|
| `mood_set` | `(style: string)` | アクティブな感情を設定します（dry、roast、chaotic、cheeky、cynic、zoomer） |
| `mood_get` | `()` | 現在の感情 + ジョークの回数 + `allowed_techniques`（アクティブな感情用） |
| `comic_timing` | `(text, technique?)` | コメディタッチで書き換えます（三段論法、注意の逸らし、エスカレーション、コールバック、控えめな表現、自動） |
| `roast` | `(target, context?, technique?)` | 現在の感情の声で、友好的な皮肉を言います。深刻度は1〜5で、コンテキストはコード、エラー、アイデア、状況です。オプションのテクニックのオーバーレイは、現在の感情に対して有効である必要があります（無効な組み合わせは拒否されます）。 |
| `heckle` | `(target, technique?)` | 短い皮肉。オプションのテクニックのオーバーレイ。roastと同じ感情×テクニックのマトリックスです。 |
| `catchphrase_generate` | `(context?)` | 再利用可能なジョークを作成します（セッションに保存されます）。 |
| `catchphrase_callback` | `()` | 最も頻繁に使用されるお決まりのフレーズを再利用します（またはnull）。 |
| `running_gag` | `(setup, tag)` | 相棒が後で呼び出すことができる、繰り返されるジョークを仕込みます（安全対策）。`SENSOR_HUMOR_GAG_MIN_DISTANCE`回経過すると、コールバック候補になり、`SENSOR_HUMOR_GAG_MAX_FIRES`回経過すると廃止されます。 |
| `debug_status` | `()` | ライブバックエンドの状態（Ollamaにアクセス可能か、モデルがダウンロードされているか）、解決された構成、フォールバック/レートのカウント、セッション状態。 |
| `debug_chain` | `(limit?)` | 最後のN回の呼び出しごとのトレース（ツール、感情、入力、プロンプトのフィンガープリント、再試行、トリガーされたバリデーター、レイテンシー）。1回の呼び出しで、生成パイプライン全体を再構築できます。 |
| `session_reset` | `()` | セッションの状態をすべてリセットします（感情、ジョーク、ジョーク、お決まりのフレーズ、トレース、ターンカウンター）。 |

**出力の低下（テキスト、機械的に分岐可能）：** ツールが実際のモデル生成を返すことができない場合、音声でのお決まりのフレーズと、消費エージェントが網羅的に分岐できる**閉じたセット**からの`degraded: true`と`degraded_reason`を返します：`safety-filter`（スラング/比喩/メタリークが置き換えられた）· `language`（モデルがラテン文字から切り替わり、英語の行が置き換えられた — 安全上の問題ではなく、コンプライアンスの問題）· `connection` · `timeout` · `model-not-found` · `auth` · `rate-limit` · `server` · `http` · `json-parse` · `validation` · `exhausted` · `unknown`。実際の生成には**`degraded`フラグは含まれません** — その不在が肯定的なシグナルです。**すべての**コメディツールにこのフラグが含まれます。これには、`catchphrase_callback`（安全対策として置き換えられたリコールはフラグが付けられ、実際の生成であるかのように装うことはありません）も含まれます。`roast`/`heckle`も、アクティブな`mood`をエコーします。`catchphrase_generate`は`is_fresh`を返します（`true` = 新規作成、`false` = 既存のセッションのお決まりのフレーズを再利用）。

一度の操作で解決できる健康に関する質問には、`debug_status`にご連絡ください。リアルタイムでの接続状況（接続できない場合は`unreachable_reason`、接続できる場合は`connection`、`auth`、`timeout`）、解決されたモデル/ホスト/タイムアウト、両方の`fallback_calls`（バックエンド）**および**`safety_filter_fires`（安全基準がどの程度、特定のフレーズを置き換えたか）を含む生成統計、そして、*アクティブ*なプロンプトテキストとモデルを関連付ける`prompt_fingerprint` + `active_prompt_key`により、出力のずれはプロンプトとモデルの変更に起因すると判断できます。また、プロンプトのバージョンが自動的にダウングレードされる状況（リクエストされたv2がv1に切り替わる）も確認できます。

## ムードとプロソディ（パイパーボイス）

各ムードは、特定のパイパーボイスとプロソディ設定に対応します。

| ムード | ボイス | length_scale | noise_scale | noise_w_scale | volume | キャラクター |
|------|-------|-------------|-------------|---------------|--------|-----------|
| dry | en_GB-alan-medium | 1.15 | 0.3 | 0.3 | 0.9 | 平板で、疲れていて、単調 |
| roast | en_US-ryan-high | 0.95 | 0.667 | 0.8 | 1.0 | 自信に満ちた皮肉 |
| chaotic | en_US-lessac-high | 0.88 | 0.8 | 0.9 | 1.1 | 意味不明なことを話すニュースキャスター |
| cheeky | en_GB-cori-high | 1.05 | 0.5 | 0.6 | 0.95 | 温かく、からかい、いたずらっぽい笑顔 |
| cynic | en_GB-alan-medium | 1.25 | 0.2 | 0.2 | 0.8 | 冷たく、平板で、驚きがない |
| zoomer | en_US-lessac-high | 0.90 | 0.85 | 0.9 | 1.15 | 速く、大きく、ストリーマーのようなエネルギー |

## 環境変数

```bash
# sensor-humor
SENSOR_HUMOR_DEBUG=true                # verbose prompt/response dumps
SENSOR_HUMOR_TIMEOUT_MS=30000          # Ollama call timeout in ms (default: 30000; invalid values fall back to default)
SENSOR_HUMOR_TEMPERATURE=0.55          # generation temperature, clamped 0.0-2.0 (default: 0.55)
SENSOR_HUMOR_PROMPT_VERSION=1          # prompt set version (dry.v2 is the exemplar; set 2 to load v2 where it exists, else per-mood v1 fallback)
SENSOR_HUMOR_MODEL=qwen2.5:7b         # Ollama model (default: qwen2.5:7b)
SENSOR_HUMOR_PERSIST=false             # persist session to ~/.sensor-humor/session.json (survives restart; 24h expiry)
SENSOR_HUMOR_SESSION_DIR=              # override the session directory (default: ~/.sensor-humor)
SENSOR_HUMOR_MAX_RETRIES=1             # Ollama generation retries on bad output (0-3; default: 1)
SENSOR_HUMOR_GAG_MIN_DISTANCE=2        # turns before a planted running_gag is callback-eligible (default: 2)
SENSOR_HUMOR_GAG_MAX_FIRES=3           # times a running gag fires before it retires (default: 3)
SENSOR_HUMOR_FULL_TRACE=false          # debug_chain also captures full prompt/raw/parsed text (default: false)
OLLAMA_HOST=http://127.0.0.1:11434    # Ollama API host (default: http://127.0.0.1:11434)
OLLAMA_API_KEY=                        # Bearer token for a remote/cloud Ollama (e.g. https://ollama.com); unset for local

# voice integration (in voice-soundboard)
VOICE_SOUNDBOARD_ENGINE=piper          # or kokoro (default)
VOICE_SOUNDBOARD_PIPER_MODEL_DIR=/path/to/piper/models
```

## 可視性とデバッグ

- すべてのツール呼び出しは、送信されたプロンプト、生のOllamaレスポンス、解析された出力、セッションの更新をログに記録します。
- ボイス：デバッグログには、各ムードに適用されたパイパーパラメータが表示されます。
- `SENSOR_HUMOR_DEBUG=true`を設定すると、すべての情報が表示されます。

## 品質に関する注意点

- コメディの品質は、単一のモデルパラメータではなく、骨格に基づいたプロンプトエンジニアリングによって決まります。各ムードは、予測可能なパターンを強制します。独自のモデル/ハードウェアで、`scripts/ab-scorecard.ts`（SCORECARD.mdのテンプレート）を使用して、ヒット率を測定してください。
- プロンプトの安定性に関する回帰ゲート（v1.2）：v1のムードプロンプトは**固定**されています（`tests/scorecard-frozen-prompts.test.ts`によって固定されており、変更するには`v2`に更新し、その場で編集することはできません）。決定的な**形式 + 安全性**のゴールデンセットと統計が`npm test`（バックエンドなし）で実行されます。`npm run scorecard`は、リアルタイムの統計的ドリフトチェックを実行します。各ムードのヒット率は、3値のPASS / FAIL / INCONCLUSIVEの判定とSPRTによる早期停止を備えたウィルソンの区間によって制御されます。これは、構造的な適合性と安全性を測定するものであり、面白さを測定するものではありません（自動化されたユーモアのスコアリングは信頼性が低い。最高のLLMと人間の相関関係は約0.2）。
- 類似/比較フィルター：ポストバリデーション正規表現 + 再試行、その後、リークが続く場合は、ムードに応じた安全なフォールバック。
- 言語適合性フィルター：コメディは英語であるため、ラテン文字以外のスクリプトゲート（連続する外国語の単語のシーケンス**または**高いラテン文字以外の文字の比率。文字のみで計算）は、コードが切り替わった出力をフラグします。例：`qwen2.5:7b`が途中で中国語に切り替わる。ポストバリデーション + 英語のみでの1回の再試行、その後、入力なしの英語フォールバック（`degraded_reason: language`、*適合性*の低下。`safety-filter`とは異なり、安全フィルターのカウントには含まれません）。検出のみ。アクセント付きのラテン語の借用語（`café`、`résumé`）、句読点、数字、絵文字は、このフィルターには引っかかりません。
- 攻撃的な言葉のフィルター：決定的な用語リストの正規表現が、すべてのコメディツール（キャッチフレーズを含む）に対して*最終的なゲート*として実行され、各再試行後に再チェックされ、フォールバックが適用される前に適用されます。検出パスは、最初に難読化を解除します。NFKC + ゼロ幅/双方向ストリップ + ホモグラフフォールド + 難読化された文字のフォールド + 単語内の区切り文字のストリップ + 結合マークのストリップ。これにより、一般的な回避策（ゼロ幅挿入、キリル/ギリシャの類似文字、全角文字、`r3tard`、`re-tard`、`retárd`）によって、単語の境界を越えて侮辱的な言葉が紛れ込むのを防ぎます。これは、ガードレールではなく、決定的な**基準**です。セキュリティと信頼に関するセクションを参照して、実際の制限を確認してください。
- 決定論的：JSONスキーマの強制、不良出力時の再試行、すべてのツールにわたるムードの継承の強制。
- ボイス：パイパーは、プロソディの分離（各ムードごとの長さ/ノイズ/音量）を提供します。ココロのフォールバックは、速度のみです。
- 開発ツールのサイドキックとしてのみ使用します。ユーモアは主観的なものです。必要に応じて、環境変数を使用してムードを無効にするか、プロンプトを調整してください。

## セキュリティと信頼

- **デフォルトではローカル** — `localhost`経由でHTTPを使用してOllamaと通信します。`OLLAMA_HOST`は別の場所（例：リモート/クラウドのOllama）を指す場合があります。これが唯一の外部への通信経路であり、これはオペレーターが明示的に選択します。
- **ファイルシステム** — デフォルトでは使用しません。`SENSOR_HUMOR_PERSIST=true`を使用すると、1つのファイル（`~/.sensor-humor/session.json`、`SENSOR_HUMOR_SESSION_DIR`でディレクトリを上書き）を読み書きします。このファイルには、セッションのコメディ状態（ジョーク、ギャグ、キャッチフレーズ）のみが含まれ、認証情報は含まれません。ファイルは24時間後に自動的に期限切れになります。
- **機密情報** — デフォルトでは使用しません。`OLLAMA_HOST`をリモート/クラウドのOllamaに設定する場合は、`OLLAMA_API_KEY`を設定します。これは環境から読み取られ、そのホストに`Bearer`ヘッダーとしてのみ送信されます。ログに記録、保存、またはエコーバックされることはありません（`debug_status`は、キーが設定されているかどうかのみを報告し、その値は報告しません）。
- **テレメトリーなし** — 何も収集または送信されません。
- **セッション状態はデフォルトではメモリ内** — サーバープロセスが停止すると消えます。ディスクへの永続化を有効にするには、`SENSOR_HUMOR_PERSIST`を使用します。
- **入力のサニタイズ** — ユーザーが提供したすべてのテキストは、プロンプトインジェクションの前に正規化およびサニタイズされます。Unicode NFKCフォールド、ゼロ幅/双方向/フォーマット文字の削除、一般的な同字異形文字をASCIIに変換、改行の削除、制御文字の削除、長さの制限。
- **出力フィルタリング（決定的な下限 + 正直な上限）** — base64で保存された用語リストの正規表現が、すべてのコメディツールの終端セーフティゲートとして実行されます（各再試行後に再チェックされ、フォールバックの前に適用されます）。また、呼び出し元からの入力フォールバックは、禁止されたトークンをエコーバックするのではなく、静的で入力のない行に折りたたまれます。検出パスは最初に難読化を解除するため、一般的な回避策は効果がありません。ゼロ幅/双方向挿入、同字異形文字（キリル文字/ギリシャ文字/全角文字）、leet speak（`r3tard`）、単語内の区切り文字（`re-tard`、`r.e.t.a.r.d`）、および結合ダイアクリティカルマーク（`retárd`）。不正なエントリは、ロード時に改ざんまたはレガシーの永続化セッションからも削除されます。**これを行いません**：これは学習された分類器ではなく、決定的な用語リストフィルターです。リストにない/新しい侮辱的なバリアント、1文字のスペース（`r e t a r d`）、ASCIIアート/空間的な難読化、完全なUnicodeの混同可能性、または意味/脱獄クラスの攻撃に対しては防御しません。ローカル開発用コメディツールの可能な限り最高の安全策として扱い、信頼できないパブリック入力に対するモデレーションの保証としては扱わないでください。
- **ツールエラーの形式** — 実行時/ツールのエラーは、スタジオの構造化エラー形式（`{code, message, hint, retryable}`）を返します。*入力スキーマ*の検証エラー（例：無効な`mood`）は、ハンドラーが実行される前にMCP SDKによってキャッチされ、SDKの標準の`InvalidParams`エラーとして表示されます。この形式ではありません。

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

MCP Tool Shopによって作成されました。
