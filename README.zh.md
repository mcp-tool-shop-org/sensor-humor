<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.md">English</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="logo.png" width="400" alt="sensor-humor" />
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@mcptoolshop/sensor-humor"><img src="https://img.shields.io/npm/v/@mcptoolshop/sensor-humor?label=npm&color=cb3837" alt="npm version"></a>
  <a href="https://github.com/mcp-tool-shop-org/sensor-humor/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/mcp-tool-shop-org/sensor-humor/ci.yml?branch=main&label=CI" alt="CI"></a>
  <a href="https://github.com/mcp-tool-shop-org/sensor-humor/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License"></a>
  <a href="https://mcp-tool-shop-org.github.io/sensor-humor/"><img src="https://img.shields.io/badge/landing-page-34d399" alt="Landing Page"></a>
</p>

一种 MCP 工具，为您的 LLM 提供一个持久的喜剧搭档：基于情绪的个性、会话感知的回调、持续的笑料、讽刺、挖苦和口头禅——所有这些都通过 Piper TTS（音调控制）进行语音集成。

专为开发者设计：对代码质量问题的温和批评，平淡无奇的错误信息，构建失败时的混乱升级。绝不会覆盖主 LLM 的语气——一种独特的语音，在需要时会适时地加入。

## 功能

- 6 种情绪，每种情绪都配备了一个填空式模板提示，以实现可预测的高质量输出。
- 会话状态：持续的笑料、最近的片段环形缓冲区（最多 20 个）、口头禅映射——可以选择性地持久保存到磁盘 (`SENSOR_HUMOR_PERSIST`)，以便回调在服务器重启后仍然有效。
- 9 种工具：mood_set/mood_get、comic_timing、roast、heckle、catchphrase_generate/catchphrase_callback、debug_status、session_reset。
- 本地 Ollama 后端（默认 qwen2.5:7b，可通过 `SENSOR_HUMOR_MODEL` 进行配置）。
- 语音配对：mcp-voice-soundboard 与 Piper TTS（音调旋钮：length_scale、noise_scale、noise_w_scale、volume）配合使用。
- 确定性：JSON 模式强制执行、验证，在输出不良时进行重试，强制执行情绪继承。

## 情绪

每种情绪都使用一个填空式模板提示，迫使模型呈现出可预测的高质量状态。

- **dry（平淡）**——冷静、简约、令人痛苦地显而易见（默认）。
- **roast（讽刺）**——带有爱意的尖锐批评，判决/诊断标签。
- **cynic（愤世嫉俗者）**——玩世不恭、安静的残酷现实主义（“当然：”、“不出所料：”）。
- **cheeky（调皮的）**——俏皮的戏弄（“哦，亲爱的”，“大胆的举动”）。
- **chaotic（混乱的）**——先是正常的句子，然后突然出现荒谬的反转（“据报道……”）。
- **zoomer（Z 世代）**——终极网络上的 Z 世代刻薄评论（反应、嘲讽、全大写、标签）。

所有情绪都通过 mcp-voice-soundboard 继承语音 + 音调（推荐使用 Piper）。

## 要求

- Node.js 18+。
- 本地运行的 Ollama，并已拉取 `qwen2.5:7b`（或设置 `SENSOR_HUMOR_MODEL` 以使用不同的模型）。
- 已安装并正在运行 mcp-voice-soundboard（推荐 Piper 后端，可选）。
- @modelcontextprotocol/sdk。

## 安装

```bash
npm install @mcptoolshop/sensor-humor
# or install a local dev checkout
npm install /path/to/sensor-humor
```

### Docker

每次发布时，都会将容器镜像发布到 GHCR。sensor-humor 通过 stdio 传输 MCP，因此以交互方式运行它，并将其指向一个可访问的 Ollama：

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

返回文本讽刺内容。如果也配置了 [mcp-voice-soundboard](https://github.com/mcp-tool-shop-org/mcp-voice-soundboard)，`voice_speak(mood: "roast")` 将以适合当前情绪的 Piper 音调进行语音输出。

## 工具

所有工具都从会话中继承当前的“情绪”。

| 工具 | 签名 | 描述 |
|------|-----------|-------------|
| `mood_set` | `(style: string)` | 设置活动情绪（dry、roast、chaotic、cheeky、cynic、zoomer）。 |
| `mood_get` | `()` | 当前的情绪 + 笑料计数。 |
| `comic_timing` | `(text, technique?)` | 以喜剧的方式重写（三段式结构、误导、升级、回调、低调、自动）。 |
| `roast` | `(target, context?)` | 以当前情绪的语音进行带有爱意的讽刺，返回严重程度 1-5。上下文：代码、错误、想法、情况。 |
| `heckle` | `(target)` | 简短而尖锐的嘲讽。 |
| `catchphrase_generate` | `(context?)` | 创建可重用的片段（存储在会话中）。 |
| `catchphrase_callback` | `()` | 重复使用最常用的口头禅（或为空）。 |
| `debug_status` | `()` | 实时后端状态（Ollama 可访问、模型已拉取）、已解析的配置、回退计数和会话状态。 |
| `session_reset` | `()` | 重置所有会话状态（情绪、笑料、片段、口头禅、轮次计数）。 |

**输出降级（文本，可由机器分支）：**当工具无法返回真实的模型生成时，它将返回带有语音的预设语句，以及 `degraded: true` 和一个来自 **封闭集合** 的 `degraded_reason`，消耗代理可以对其进行详尽的分支处理：`safety-filter`（已替换掉冒犯性词语/比喻/元泄漏）、`connection`、`timeout`、`model-not-found`、`auth`、`rate-limit`、`server`、`http`、`json-parse`、`validation`、`exhausted`、`unknown`。真实的生成不包含 `degraded` 标志——它的缺失是积极的信号。**所有**喜剧工具都具有此功能，包括 `catchphrase_callback`（如果进行了安全替换的回调，则会标记，绝不会冒充真实的）。`roast`/`heckle` 也会回显活动“情绪”；`catchphrase_generate` 返回 `is_fresh`（`true` = 新创建的，`false` = 重复使用的现有会话口头禅）。

调用 `debug_status` 以获取一次性健康状态答案：实时可访问性（以及在无法访问时提供的 `unreachable_reason`——`connection` 与 `auth` 或 `timeout`），已解析的模型/主机/超时，生成统计信息，包括后端和 `safety_filter_fires`（安全过滤器替换语句的频率），以及一个 `prompt_fingerprint` + `active_prompt_key`，它将 *活动* 提示文本 + 模型绑定在一起，以便可以将输出漂移归因于提示与模型的更改——并且可以检测到静默的提示版本降级（请求的版本 v2 回退到 v1）。

## 情绪音调（Piper Voice）

每种情绪都映射到不同的 Piper 语音 + 音调配置：

| 情绪 | 语音 | length_scale | noise_scale | noise_w_scale | volume | 特征 |
|------|-------|-------------|-------------|---------------|--------|-----------|
| dry | en_GB-alan-medium | 1.15 | 0.3 | 0.3 | 0.9 | 平淡、疲惫、单调。 |
| roast | en_US-ryan-high | 0.95 | 0.667 | 0.8 | 1.0 | 自信的讽刺。 |
| chaotic | en_US-lessac-high | 0.88 | 0.8 | 0.9 | 1.1 | 新闻播音员讲述荒谬的事情。 |
| cheeky | en_GB-cori-high | 1.05 | 0.5 | 0.6 | 0.95 | 温暖、调皮、俏皮的眨眼 |
| 愤世嫉俗者 | en_GB-alan-medium | 1.25 | 0.2 | 0.2 | 0.8 | 冷淡、平淡、毫无惊喜 |
| Z世代 | en_US-lessac-high | 0.90 | 0.85 | 0.9 | 1.15 | 快速、喧闹、充满活力的直播风格 |

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

- 每次工具调用都会记录：发送的提示语、原始 Ollama 响应、解析后的输出、会话更新
- 语音：调试日志显示每个情绪下应用的 Piper 参数
- 设置 `SENSOR_HUMOR_DEBUG=true` 以查看所有内容

## 质量说明

- 喜剧的质量来自于基于骨架的提示工程，而不是单个模型的调整——每种情绪都会强制产生一种可预测的模式。使用 `scripts/ab-scorecard.ts`（模板在 SCORECARD.md 中）来衡量您自己的模型/硬件上的命中率。
- 提示稳定性回归门控 (v1.2)：v1 版本的各种情绪提示是**冻结**的（由 `tests/scorecard-frozen-prompts.ts` 固定——要更改一个，请升级到 `v2`，切勿直接编辑）。一组确定性的**形式 + 安全性**黄金标准以及统计数据在 `npm test` 中运行（无后端）；`npm run scorecard` 运行实时的统计漂移检查——每种情绪的命中率都受到 Wilson 区间约束，并具有三值 PASS / FAIL / INCONCLUSIVE 的结果和 SPRT 早期停止。它衡量结构一致性 + 安全性，**而不是**趣味性（自动幽默评分不可靠——最佳 LLM 与人类的相关性约为 0.2）
- 类比/比较过滤器：后期验证正则表达式 + 重试，然后是情绪语音的安全回退，如果仍然存在泄漏。
- 粗俗语言过滤器：一个确定性的术语列表正则表达式作为**每个**喜剧工具（包括口头禅）的*终端门控*运行，在每次重试后重新检查，并在应用任何回退之前进行应用。检测路径首先进行解混淆——NFKC + 无宽字符/双向字符去除 + 同形字折叠 + 俚语折叠 + 词内分隔符去除 + 合并标记去除——因此常见的规避手段（无宽字符插入、西里尔字母/希腊字母相似字符、全角字符、`r3tard`、`re-tard`、`retárd`）无法绕过单词边界。这是一个确定性的**下限**，而不是安全保障——有关诚实的上限，请参阅“安全与信任”部分
- 确定性：JSON 模式强制执行，在输出错误时重试，所有工具中都强制执行情绪继承
- 语音：Piper 提供韵律分离（每种情绪的长度/噪音/音量）；Kokoro 回退仅提供速度。
- 仅用于开发工具。幽默是主观的；如果需要，可以通过环境变量禁用任何情绪或调整提示语。

## 安全与信任

- **默认情况下为本地**——通过 HTTP 与 `localhost` 上的 Ollama 通信。`OLLAMA_HOST` 可以指向其他位置（例如远程/云端 Ollama）；这是唯一的外部出口，并且是操作员明确的选择。
- **文件系统**——默认情况下没有。使用 `SENSOR_HUMOR_PERSIST=true` 时，它会读取/写入一个文件，即 `~/.sensor-humor/session.json`（通过 `SENSOR_HUMOR_SESSION_DIR` 覆盖目录），其中仅包含您会话的喜剧状态（片段、笑话、口头禅）——不包含任何凭据。该文件会在 24 小时后自动过期
- **密钥**——默认情况下没有。如果您将 `OLLAMA_HOST` 指向远程/云端 Ollama，请设置 `OLLAMA_API_KEY`；它会从环境变量中读取，并仅作为 `Bearer` 标头发送到该主机——绝不会记录、持久化或回显（`debug_status` 仅报告*是否*设置了密钥，而不会显示其值）。
- **无遥测**——不收集或发送任何数据。
- **会话状态默认情况下存储在内存中**——当服务器进程停止时，它会消失；通过 `SENSOR_HUMOR_PERSIST` 选择启用磁盘持久化。
- **输入清理**——所有用户提供的文本都会在提示注入之前进行规范化和清理：Unicode NFKC 折叠、去除无宽字符/双向字符/格式字符、将常见的同形字折叠为 ASCII、去除换行符、删除控制字符、限制长度。
- **输出过滤（确定性下限 + 诚实的上限）**——一个以 base64 存储的术语列表正则表达式作为每个喜剧工具的安全终端门控运行（在每次重试后重新检查，并在应用任何回退之前进行应用），并且调用者输入的回退会折叠为静态、不包含输入的行，而不是回显被禁止的令牌。检测路径首先进行解混淆，因此可以消除常见的规避手段：无宽字符/双向字符插入、同形字（西里尔字母/希腊字母/全角字符）、俚语 (`r3tard`)、词内分隔符 (`re-tard`, `r.e.t.a.r.d`) 和组合变音符号 (`retárd`)。在加载时，还会从被篡改的/遗留的持久会话中删除脏条目。**它不执行以下操作：**它是一个确定性的术语列表过滤器，而不是学习型分类器——它无法防御列表之外/新颖的侮辱性变体、单字母间距 (`r e t a r d`)、ASCII 艺术/空间混淆、完整的 Unicode 可混淆覆盖或语义/越狱类攻击。将其视为用于本地开发幽默工具的最佳尝试下限，而不是对不受信任的公共输入的审核保证。
- **工具错误形式**——运行时/工具错误返回工作室结构化错误形式 (`{code, message, hint, retryable}`)；请注意，*输入模式*验证错误（例如，无效的 `mood`）在处理程序运行之前由 MCP SDK 捕获，并显示为 SDK 的标准 `InvalidParams` 错误，而不是这种形式。

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

由 <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a> 构建
