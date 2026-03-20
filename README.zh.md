<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.md">English</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/sensor-humor/readme.png" width="600" alt="sensor-humor" />
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/sensor-humor/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/sensor-humor/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/mcp-tool-shop-org/sensor-humor/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License"></a>
  <a href="https://mcp-tool-shop-org.github.io/sensor-humor/"><img src="https://img.shields.io/badge/landing-page-34d399" alt="Landing Page"></a>
</p>

MCP 工具，为您的 LLM 提供一个持久的喜剧伙伴：基于情绪的个性，会话感知的回调，持续的笑话，嘲讽，挖苦和口头禅——所有这些都通过 Piper TTS（基于韵律控制的语音合成）集成语音。

专为开发者设计：对代码问题的温和提示，干巴巴的错误信息，以及构建失败时的混乱场面。它不会覆盖主 LLM 的语气，而是一个具有独特声音的补充，在被调用时才会发出声音。

## 功能

- 6 种情绪：平淡（默认），嘲讽，荒诞，温馨，讽刺，疯狂
- 会话状态：持续的笑话，最近的片段（最大 20 个），口头禅映射
- 工具：mood.set/get，comic_timing，roast，heckle，catchphrase.generate/callback
- 本地 Ollama 后端（推荐使用 qwen2.5:7b-instruct）
- 语音配对：mcp-voice-soundboard，使用 Piper TTS（韵律参数：length_scale，noise_scale，noise_w_scale，volume）
- 确定性：JSON 模式强制执行，验证，在出现错误输出时重试，调试日志

## 要求

- Node.js 18+
- 运行中的本地 Ollama，已安装 `qwen2.5:7b-instruct`
- 已安装并运行的 mcp-voice-soundboard（推荐使用 Piper 后端）
- @modelcontextprotocol/sdk

## 安装

```bash
npm install @mcp-tool-shop/sensor-humor
# or link local dev version
npm link /path/to/sensor-humor
```

## 快速开始

1. 启动 Ollama：

```bash
ollama run qwen2.5:7b-instruct
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
mood.set(style: "roast")
roast(target: "800-line god function")
```

返回嘲讽文本，然后 `voice_speak(mood: "roast")` 使用 am_eric + 充满自信和讽刺的语气朗读它。

## 工具

所有工具都继承会话中的当前情绪。

| 工具 | 签名 | 描述 |
|------|-----------|-------------|
| `mood.set` | `(style: string)` | 设置活动情绪（平淡，嘲讽，荒诞，温馨，讽刺，疯狂） |
| `mood.get` | `()` | 当前情绪 + 笑话计数 |
| `comic_timing` | `(text, technique?)` | 使用喜剧风格进行重写（三段式，误导，升级，回调，含蓄，自动） |
| `roast` | `(target, context?)` | 带有结论/标签模式的善意嘲讽，返回 1-5 的严重程度。 上下文：代码，错误，想法，情况 |
| `heckle` | `(target)` | 简短的尖锐评论 |
| `catchphrase.generate` | `(context?)` | 创建可重用的片段（存储在会话中） |
| `catchphrase.callback` | `()` | 重用最常用的口头禅（或 null） |

## 情绪韵律（Piper 语音）

每种情绪都映射到一种独特的 Piper 语音 + 韵律配置：

| 情绪 | 语音 | length_scale | noise_scale | noise_w_scale | volume | 性格 |
|------|-------|-------------|-------------|---------------|--------|-----------|
| 平淡 | en_GB-alan-medium | 1.15 | 0.3 | 0.3 | 0.9 | 平淡，疲惫，有节奏 |
| 嘲讽 | en_US-ryan-high | 0.95 | 0.667 | 0.8 | 1.0 | 充满自信的讽刺 |
| 荒诞 | en_US-lessac-high | 0.88 | 0.8 | 0.9 | 1.1 | 古怪，不可预测 |
| 温馨 | en_GB-cori-high | 1.05 | 0.5 | 0.6 | 0.95 | 温暖，温柔的父亲式能量 |
| 讽刺 | en_GB-alan-medium | 1.25 | 0.2 | 0.2 | 0.8 | 疲惫的口音 |
| 疯狂 | en_US-lessac-high | 0.82 | 0.9 | 1.0 | 1.2 | 快速，大声，混乱 |

## 环境变量

```bash
# sensor-humor
SENSOR_HUMOR_DEBUG=true                # verbose prompt/response dumps
SENSOR_HUMOR_OBSERVE=true              # full chain trace (prompt -> text -> piper params)
SENSOR_HUMOR_PROMPT_VERSION=1          # prompt set version (for A/B tuning)

# voice integration (in voice-soundboard)
VOICE_SOUNDBOARD_ENGINE=piper          # or kokoro (default)
VOICE_SOUNDBOARD_PIPER_MODEL_DIR=/path/to/piper/models
```

## 可观察性和调试

- 每次工具调用都会记录：发送的提示，原始的 Ollama 响应，解析的输出，会话更新
- 语音：调试日志显示为每种情绪应用了哪些 Piper 参数
- 设置 `SENSOR_HUMOR_DEBUG=true` 以查看所有内容

## 质量说明

- 喜剧命中率：在实际会话中约为 70-75%（平淡的命中率最高，嘲讽紧随其后）
- 确定性：JSON 模式强制执行，在出现无效输出时重试一次，并在输出后进行验证以检查是否存在禁止的模式
- 语音：Piper 提供了真正的韵律分离（而不仅仅是语速）；Kokoro 作为备用方案仅提供语速调整
- 不适用于生产机器人，仅作为开发工具的辅助
- 幽默是主观的；如果需要，请调整提示。

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
