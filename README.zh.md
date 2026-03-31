<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.md">English</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/sensor-humor/readme.png" width="400" alt="sensor-humor" />
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/sensor-humor/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/sensor-humor/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/mcp-tool-shop-org/sensor-humor/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License"></a>
  <a href="https://mcp-tool-shop-org.github.io/sensor-humor/"><img src="https://img.shields.io/badge/landing-page-34d399" alt="Landing Page"></a>
</p>

MCP 工具，为您的 LLM 提供一个持久的喜剧伙伴：基于情绪的个性，会话感知的回调，持续的笑话，嘲讽，挖苦和口头禅——所有这些都通过 Piper TTS（基于韵律控制的语音合成）集成语音。

专为开发者设计：对代码问题的温和提醒，干巴巴的错误信息，以及构建失败时的混乱场面。它不会覆盖主 LLM 的语气，而是以一种独特的语音在需要时加入。

## 功能

- 6种情绪模式，在实际开发测试中，命中率均达到70%以上。
- 会话状态：包含持续的笑话、最近的段子（最大20个）、以及常用语列表。
- 9个工具：mood_set/mood_get（设置/获取情绪模式）、comic_timing（喜剧节奏）、roast（调侃）、heckle（嘲讽）、catchphrase_generate/catchphrase_callback（生成/回调常用语）、debug_status（调试状态）、session_reset（重置会话）。
- 本地 Ollama 后端（默认使用 qwen2.5:7b 模型，可通过 `SENSOR_HUMOR_MODEL` 变量进行配置）。
- 语音配对：使用 mcp-voice-soundboard 配合 Piper TTS（韵律控制参数：长度比例、噪音比例、噪音权重、音量）。
- 确定性：JSON 模式验证，对无效输出进行重试，强制执行情绪模式继承。

## 情绪模式

每个情绪模式都使用一个填空式的提示语，这会引导模型生成结构清晰、高质量的文本。

- **dry**（冷静）：冷幽默、简约、显而易见（默认）
- **roast**（吐槽）：带有善意的尖锐讽刺，带有“评判/诊断”标签
- **cynic**（愤世嫉俗）：玩世不恭、冷酷的现实主义（常用语：“当然：”，“可预料地：”）
- **cheeky**（俏皮）：充满玩味和恶作剧（常用语：“哦，亲爱的”，“大胆的举动”）
- **chaotic**（混乱）：先给出看似正常的句子，然后突然出现荒谬的转折（常用语：“据报道...”）
- **zoomer**（Z世代）：极具网络攻击性的Z世代风格（常用语：反应、嘲讽、大写字母、标签）

所有情绪模式都通过 mcp-voice-soundboard 继承语音和语调（推荐使用 Piper）。

## 要求

- Node.js 18+
- 本地运行 Ollama，已下载 `qwen2.5:7b` 模型（或通过设置 `SENSOR_HUMOR_MODEL` 变量选择其他模型）。
- 安装并运行 mcp-voice-soundboard（推荐使用 Piper 后端，可选）。
- @modelcontextprotocol/sdk

## 安装

```bash
npm install sensor-humor
# or link local dev version
npm link /path/to/sensor-humor
```

## 快速开始

1. 启动 Ollama：

```bash
ollama pull qwen2.5:7b
```

2. 启动 sensor-humor MCP 服务器（使用 stdio 传输）：

```bash
cd sensor-humor
SENSOR_HUMOR_DEBUG=true npm start
```

3. 启动语音合成器（Piper 模式）：

```bash
cd ../mcp-voice-soundboard
VOICE_SOUNDBOARD_ENGINE=piper VOICE_SOUNDBOARD_PIPER_MODEL_DIR=/path/to/piper/models npm start
```

4. 在您的 MCP 客户端（Claude Code, Cursor 等）：
- 添加两个服务器
- 测试流程：

```
mood_set(style: "roast")
roast(target: "800-line god function")
```

返回调侃文本。如果也配置了 [mcp-voice-soundboard](https://github.com/mcp-tool-shop-org/mcp-voice-soundboard)，则 `voice_speak(mood: "roast")` 会使用与情绪相符的 Piper 韵律朗读该文本。

## 工具

所有工具都继承会话中的当前情绪。

| 工具 | 签名 | 描述 |
|------|-----------|-------------|
| `mood_set` | `(style: string)` | 设置当前情绪模式（dry、roast、chaotic、cheeky、cynic、zoomer）。 |
| `mood_get` | `()` | 当前情绪 + 笑话计数 |
| `comic_timing` | `(text, technique?)` | 使用喜剧风格进行重写（遵循三段式结构，误导，升级，回调，含蓄，自动） |
| `roast` | `(target, context?)` | 以当前情绪模式的语音，进行带有善意的讽刺，并返回严重程度（1-5）。 上下文：代码、错误、想法、情况。 |
| `heckle` | `(target)` | 简短的尖锐评论 |
| `catchphrase_generate` | `(context?)` | 创建可重用的片段（存储在会话中） |
| `catchphrase_callback` | `()` | 重用最常用的口头禅（或 null） |
| `debug_status` | `()` | 导出当前会话状态、情绪配置和语音后端。 |
| `session_reset` | `()` | 重置所有会话状态（情绪、笑话、段子、常用语、回合计数）。 |

## 情绪韵律（Piper 语音）

每种情绪都映射到一种独特的 Piper 语音 + 韵律配置：

| 情绪 | 语音 | length_scale | noise_scale | noise_w_scale | volume | 特点 |
|------|-------|-------------|-------------|---------------|--------|-----------|
| 平淡 | en_GB-alan-medium | 1.15 | 0.3 | 0.3 | 0.9 | 平淡，疲惫，有节奏 |
| 嘲讽 | en_US-ryan-high | 0.95 | 0.667 | 0.8 | 1.0 | 充满自信的讽刺 |
| chaotic | en_US-lessac-high | 0.88 | 0.8 | 0.9 | 1.1 | 新闻主播播报无意义的内容。 |
| cheeky | en_GB-cori-high | 1.05 | 0.5 | 0.6 | 0.95 | 温暖、调皮、充满玩味的眨眼。 |
| cynic | en_GB-alan-medium | 1.25 | 0.2 | 0.2 | 0.8 | 冷淡、平淡、毫无惊喜。 |
| zoomer | en_US-lessac-high | 0.90 | 0.85 | 0.9 | 1.15 | 快速、喧闹、直播主风格。 |

## 环境变量

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

## 可观察性和调试

- 每次工具调用都会记录：发送的提示，原始的 Ollama 响应，解析的输出，会话更新
- 语音：调试日志显示为每种情绪应用了哪些 Piper 参数
- 设置 `SENSOR_HUMOR_DEBUG=true` 以查看所有内容

## 质量说明

- 喜剧命中率：在实际开发过程中，每个情绪模式/工具的命中率在 70-100% 之间（基于骨架的提示工程）。
- 相似/比较过滤器：后验证的正则表达式 + 重试/备用机制，防止 dry/cheeky 模式出现问题。
- 所有情绪模式在实际会话中的命中率均在 70% 以上； roast/cynic/chaotic 模式的命中率通常在 90-100%。
- 确定性：JSON 模式强制执行，对不良输出进行重试，所有工具都强制执行情绪模式继承。
- 语音：Piper 提供语调分离（根据情绪模式调整长度、音调和音量）；Kokoro 作为备用方案，仅提供语速调整。
- 仅为开发工具的辅助功能。 幽默是主观的；如果需要，可以通过环境变量禁用任何情绪模式，或调整提示语。

## 安全与信任

- **仅本地运行** — 通过 HTTP 与本地的 Ollama 进行通信，不涉及任何外部网络连接。
- **不访问文件系统** — 不读取或写入任何文件。
- **不处理敏感信息** — 不读取、存储或传输任何凭据。
- **无数据收集** — 不收集或发送任何数据。
- **会话状态仅保存在内存中** — 当服务器进程停止时，会话状态会丢失。
- **输入净化** — 所有用户提供的文本在提示注入之前都会进行净化（去除换行符，限制长度，移除控制字符）。
- **输出过滤** — 采用严格的语言过滤器（base64 编码的词汇列表），并通过重试和安全回退机制，防止冒犯性词语传递给用户。

## 架构

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

## 开发

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

## 许可证

MIT

---

由 <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a> 构建。
