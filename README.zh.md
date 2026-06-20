<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.md">English</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="logo.png" width="400" alt="sensor-humor" />
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/sensor-humor/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/mcp-tool-shop-org/sensor-humor/ci.yml?branch=main&label=CI" alt="CI"></a>
  <a href="https://github.com/mcp-tool-shop-org/sensor-humor/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License"></a>
  <a href="https://mcp-tool-shop-org.github.io/sensor-humor/"><img src="https://img.shields.io/badge/landing-page-34d399" alt="Landing Page"></a>
</p>

一种 MCP 工具，为您的 LLM 提供一个持久的喜剧搭档：基于情绪的个性、感知会话的回调、持续的笑点、讽刺、挖苦和常用语——所有这些都通过 Piper TTS（控制韵律）进行语音集成。

专为开发者设计：对代码问题的温和批评，平淡无奇的错误信息，构建失败时的混乱升级。绝不会覆盖主机 LLM 的语气——一种独特的语音，在被调用时会适时地加入对话。

## 功能

- 6 种情绪，每种情绪都配备了一个填空式模板提示，以实现可预测的高质量输出。
- 会话状态：持续的笑点、最近的片段环形缓冲区（最多 20 个）、常用语映射——可以选择性地持久保存到磁盘 (`SENSOR_HUMOR_PERSIST`)，以便回调在服务器重启后仍然有效。
- 9 种工具：mood_set/mood_get、comic_timing、roast、heckle、catchphrase_generate/catchphrase_callback、debug_status、session_reset。
- 本地 Ollama 后端（默认 qwen2.5:7b，可通过 `SENSOR_HUMOR_MODEL` 进行配置）。
- 语音配对：mcp-voice-soundboard 与 Piper TTS（韵律旋钮：length_scale、noise_scale、noise_w_scale、volume）配合使用。
- 确定性：JSON 模式强制执行、验证，在输出不良时进行重试，强制执行情绪继承。

## 情绪

每种情绪都使用一个填空式模板提示，迫使模型呈现出可预测的高质量形式。

- **dry（平淡）**——冷静、简约、令人痛苦地显而易见（默认）。
- **roast（讽刺）**——友好的尖锐批评，判决/诊断标签。
- **cynic（愤世嫉俗者）**——玩世不恭、安静的残酷现实主义（“当然：”、“不出所料：”）。
- **cheeky（调皮的）**——俏皮的戏弄（“哦，亲爱的”，“大胆的举动”）。
- **chaotic（混乱的）**——先是正常的句子，然后突然出现荒谬的反转（“据报道……”）。
- **zoomer（Z 世代）**——终极网络上的 Z 世代尖刻评论（反应、嘲讽、大写字母、标签）。

所有情绪都通过 mcp-voice-soundboard 继承语音 + 韵律（推荐使用 Piper）。

## 要求

- Node.js 18+
- 本地运行的 Ollama，并已拉取 `qwen2.5:7b`（或设置 `SENSOR_HUMOR_MODEL` 以使用不同的模型）。
- 已安装并正在运行 mcp-voice-soundboard（推荐 Piper 后端，可选）。
- @modelcontextprotocol/sdk

## 安装

```bash
npm install @mcptoolshop/sensor-humor
# or install a local dev checkout
npm install /path/to/sensor-humor
```

### Docker

每次发布时，都会将容器镜像发布到 GHCR。sensor-humor 通过 stdio 传输 MCP，因此以交互方式运行它并指向一个可访问的 Ollama：

```bash
docker run -i --rm -e OLLAMA_HOST=http://host.docker.internal:11434 \
  ghcr.io/mcp-tool-shop-org/sensor-humor:latest
```

## 快速入门

1. 启动 Ollama：

```bash
ollama pull qwen2.5:7b
```

2. 启动 sensor-humor MCP 服务器（stdio 传输）：

```bash
cd sensor-humor
SENSOR_HUMOR_DEBUG=true npm start
```

3. 启动 voice-soundboard（Piper 模式）：

```bash
cd ../mcp-voice-soundboard
VOICE_SOUNDBOARD_ENGINE=piper VOICE_SOUNDBOARD_PIPER_MODEL_DIR=/path/to/piper/models npm start
```

4. 在您的 MCP 客户端中（Claude Code、Cursor 等）：
- 添加这两个服务器。
- 测试链：

```
mood_set(style: "roast")
roast(target: "800-line god function")
```

返回文本讽刺。如果也配置了 [mcp-voice-soundboard](https://github.com/mcp-tool-shop-org/mcp-voice-soundboard)，`voice_speak(mood: "roast")` 将使用适合当前情绪的 Piper 韵律来朗读它。

## 工具

所有工具都从会话中继承当前的“情绪”。

| 工具 | 签名 | 描述 |
|------|-----------|-------------|
| `mood_set` | `(style: string)` | 设置活动情绪（dry、roast、chaotic、cheeky、cynic、zoomer） |
| `mood_get` | `()` | 当前的情绪 + 笑点计数 |
| `comic_timing` | `(text, technique?)` | 以喜剧的方式重写（三段式结构、误导、升级、回调、低调、自动）。 |
| `roast` | `(target, context?)` | 以当前情绪的语音进行友好的讽刺，返回严重程度 1-5。上下文：代码、错误、想法、情况。 |
| `heckle` | `(target)` | 简短而尖锐的嘲讽。 |
| `catchphrase_generate` | `(context?)` | 创建可重复使用的片段（存储在会话中）。 |
| `catchphrase_callback` | `()` | 重用最常用的常用语（或为空）。 |
| `debug_status` | `()` | 实时后端状态（Ollama 是否可访问、模型是否已拉取）、已解析的配置、回退计数和会话状态。 |
| `session_reset` | `()` | 重置所有会话状态（情绪、笑点、片段、常用语、轮次计数）。 |

**输出质量下降：**当 Ollama 无法访问或模型未拉取时，喜剧工具将返回一种语音提示，并带有 `degraded: true` 和一个 `degraded_reason`（“连接”、“模型未找到”、“超时”、“安全过滤器”等），以便调用者可以区分真实的笑话和回退——真正的模型生成不会包含 `degraded` 标志。调用 `debug_status` 以查看实时可访问性、已解析的模型/主机/超时以及回退计数。`roast` 和 `heckle` 也会回显当前的“情绪”；`catchphrase_generate` 返回 `is_fresh`（“true”=全新， “false”=重用了现有的会话常用语）。

## 情绪韵律（Piper 语音）

每种情绪都映射到一种独特的 Piper 语音 + 韵律配置：

| 情绪 | 语音 | length_scale | noise_scale | noise_w_scale | volume | 特征 |
|------|-------|-------------|-------------|---------------|--------|-----------|
| dry | en_GB-alan-medium | 1.15 | 0.3 | 0.3 | 0.9 | 平淡、疲惫、单调 |
| roast | en_US-ryan-high | 0.95 | 0.667 | 0.8 | 1.0 | 自信的讽刺 |
| chaotic | en_US-lessac-high | 0.88 | 0.8 | 0.9 | 1.1 | 新闻播报员讲述荒谬的事情 |
| cheeky | en_GB-cori-high | 1.05 | 0.5 | 0.6 | 0.95 | 温暖、俏皮、调皮的眨眼 |
| cynic | en_GB-alan-medium | 1.25 | 0.2 | 0.2 | 0.8 | 冷漠、平淡、毫无惊喜 |
| zoomer | en_US-lessac-high | 0.90 | 0.85 | 0.9 | 1.15 | 快速、响亮、直播能量 |

## 环境变量

```bash
# sensor-humor
SENSOR_HUMOR_DEBUG=true                # verbose prompt/response dumps
SENSOR_HUMOR_TIMEOUT_MS=30000          # Ollama call timeout in ms (default: 30000; invalid values fall back to default)
SENSOR_HUMOR_TEMPERATURE=0.55          # generation temperature, clamped 0.0-2.0 (default: 0.55)
SENSOR_HUMOR_PROMPT_VERSION=1          # prompt set version (only v1 ships today; other values fall back to v1)
SENSOR_HUMOR_MODEL=qwen2.5:7b         # Ollama model (default: qwen2.5:7b)
SENSOR_HUMOR_PERSIST=false             # persist session to ~/.sensor-humor/session.json (survives restart; 24h expiry)
SENSOR_HUMOR_SESSION_DIR=              # override the session directory (default: ~/.sensor-humor)
OLLAMA_HOST=http://127.0.0.1:11434    # Ollama API host (default: http://127.0.0.1:11434)
OLLAMA_API_KEY=                        # Bearer token for a remote/cloud Ollama (e.g. https://ollama.com); unset for local

# voice integration (in voice-soundboard)
VOICE_SOUNDBOARD_ENGINE=piper          # or kokoro (default)
VOICE_SOUNDBOARD_PIPER_MODEL_DIR=/path/to/piper/models
```

## 可观察性和调试

- 每次工具调用都会记录：发送的提示、原始 Ollama 响应、解析后的输出、会话更新。
- 语音：调试日志显示应用于每种情绪的 Piper 参数。
- 设置 `SENSOR_HUMOR_DEBUG=true` 以查看所有内容。

## 质量说明

- 喜剧效果源于基于骨架的提示工程，而非单一的模型参数调整——每种情绪都会产生可预测的结果。使用 `scripts/ab-scorecard.ts`（模板位于 SCORECARD.md 中）来衡量您自己的模型/硬件上的命中率。
- 类比/比较过滤器：先进行后验证正则表达式匹配 + 重试，然后如果仍然存在问题，则采用一种情绪化的安全回退方案。
- 粗俗语言过滤器作为终端网关运行，因此即使在后期重试时重新引入了粗俗语言，用户也无法接收到。
- 确定性：强制执行 JSON 模式，对不良输出进行重试，并在所有工具中强制执行情绪继承。
- 语音：Piper 提供韵律分离（每种情绪的长度/噪音/音量）；Kokoro 回退方案仅提供速度调整。
- 仅作为开发工具的辅助组件。幽默感是主观的；如果需要，可以通过环境变量禁用任何情绪或调整提示语。

## 安全与信任

- **默认情况下为本地**——通过 HTTP 与 `localhost` 上的 Ollama 进行通信。`OLLAMA_HOST` 可以指向其他位置（例如远程/云端 Ollama）；这是唯一的外部出口，并且由操作员明确选择。
- **文件系统**——默认情况下不使用。如果设置了 `SENSOR_HUMOR_PERSIST=true`，它将读取/写入一个文件，即 `~/.sensor-humor/session.json`（可以使用 `SENSOR_HUMOR_SESSION_DIR` 覆盖目录），其中仅包含您会话的喜剧状态（段子、笑话、流行语）——不包含任何凭据。该文件将在 24 小时后自动过期。
- **密钥**——默认情况下不使用。如果您将 `OLLAMA_HOST` 指向远程/云端 Ollama，请设置 `OLLAMA_API_KEY`；它将从环境变量中读取，并仅作为 `Bearer` 标头发送到该主机——绝不会记录、持久化或回显（`debug_status` 仅报告是否设置了密钥，而不会显示其值）。
- **无遥测**——不收集或发送任何数据。
- **会话状态默认情况下存储在内存中**——当服务器进程停止时，所有内容都会消失；可以通过 `SENSOR_HUMOR_PERSIST` 选择启用磁盘持久化。
- **输入清理**——在进行提示注入之前，会对所有用户提供的文本进行清理（删除换行符、限制长度、删除控制字符）。
- **输出过滤**——粗俗语言过滤器（base64 编码的术语列表）与重试 + 终端安全回退网关相结合，可以防止粗俗语言到达用户，即使在后期重试或来自包含粗俗语言的输入时也是如此。

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
