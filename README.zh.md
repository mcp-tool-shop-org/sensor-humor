<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.md">English</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
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

一种 MCP 工具，为您的 LLM 提供一个持久的幽默伙伴：基于情绪的个性、感知会话的回复、持续的笑话、嘲讽、挖苦和口头禅——所有这些都通过 Piper TTS（具有韵律控制）进行语音集成。

专为开发者设计：对代码异味进行温和的批评，提供平淡无奇的错误消息，并在构建失败时进行混乱的升级。绝不会覆盖主 LLM 的语气——一种独特的语音，在需要时会适时地加入。

## 功能

- 6 种情绪，每种情绪都经过调整，并配有填空式骨架提示，以实现可预测的高质量输出。
- 会话状态：持续的笑话、最近的片段环形缓冲区（最多 20 个）、口头禅映射——可以选择性地持久保存到磁盘（`SENSOR_HUMOR_PERSIST`），以便回复在服务器重启后仍然有效。
- 11 种工具：mood_set/mood_get、comic_timing、roast、heckle、catchphrase_generate/catchphrase_callback、running_gag、debug_status、debug_chain、session_reset。
- 本地 Ollama 后端（qwen2.5:7b 默认，可通过 `SENSOR_HUMOR_MODEL` 进行配置）。
- 语音配对：mcp-voice-soundboard 与 Piper TTS（韵律旋钮：length_scale、noise_scale、noise_w_scale、volume）。
- 确定性：JSON 模式强制执行、验证、对不良输出进行重试、强制执行情绪继承。

## 情绪

每种情绪都使用填空式骨架提示，迫使模型呈现出可预测的高质量形式。

- **dry**（平淡）——冷静、简约、令人痛苦地显而易见（默认）。
- **roast**（嘲讽）——带有爱意的尖锐批评，判决/诊断标签。
- **cynic**（愤世嫉俗）——玩世不恭、安静而恶毒的现实主义（“当然：”、“不出所料：”）。
- **cheeky**（调皮）——顽皮的戏弄（“哦，亲爱的”、“大胆的举动”）。
- **chaotic**（混乱）——先是正常的句子，然后突然出现荒谬的转折（“据报道……”）。
- **zoomer**（Z 世代）——终极网络上的 Z 世代尖刻（反应、嘲讽、大写字母、标签）。

所有情绪都通过 mcp-voice-soundboard 继承语音 + 韵律（推荐使用 Piper）。

## 要求

- Node.js 18+
- 本地运行的 Ollama，并已拉取 `qwen2.5:7b`（或设置 `SENSOR_HUMOR_MODEL` 以使用不同的模型）。
- 已安装并运行 mcp-voice-soundboard（推荐使用 Piper 后端，可选）。
- @modelcontextprotocol/sdk

## 安装

```bash
npm install @mcptoolshop/sensor-humor
# or install a local dev checkout
npm install /path/to/sensor-humor
```

### Docker

每次发布时，都会将容器镜像发布到 GHCR。sensor-humor 通过 stdio 传输 MCP，因此以交互方式运行它，并将其指向可访问的 Ollama：

```bash
docker run -i --rm -e OLLAMA_HOST=http://host.docker.internal:11434 \
  ghcr.io/mcp-tool-shop-org/sensor-humor:latest
```

### 配置您的 MCP 客户端

在客户端的 MCP 配置中，将 sensor-humor 注册为 stdio 服务器。对于 Claude Code / Claude Desktop（`claude_desktop_config.json`）或任何 `mcpServers` 格式的配置：

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

服务器从此 `env` 块（或启动它的 shell）读取其配置——它不会自动加载 `.env` 文件。有关所有受支持的变量，请参见 [`.env.example`](.env.example)。如果您已全局安装该软件包，请使用 `"command": "sensor-humor"`，无需 `args`。

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

4. 在您的 MCP 客户端（Claude Code、Cursor 等）中：
- 添加这两个服务器
- 测试链：

```
mood_set(style: "roast")
roast(target: "800-line god function")
```

返回文本嘲讽。如果也配置了 [mcp-voice-soundboard](https://github.com/mcp-tool-shop-org/mcp-voice-soundboard)，则 `voice_speak(mood: "roast")` 会以适合当前情绪的 Piper 韵律进行语音朗读。

## 工具

所有工具都继承会话中的当前情绪。

| 工具 | 签名 | 描述 |
|------|-----------|-------------|
| `mood_set` | `(style: string)` | 设置活动情绪（dry、roast、chaotic、cheeky、cynic、zoomer） |
| `mood_get` | `()` | 当前情绪 + 笑话计数 + `allowed_techniques`，用于显示活动情绪。 |
| `comic_timing` | `(text, technique?)` | 以幽默的方式重写（三段式、误导、升级、回调、低调、自动）。 |
| `roast` | `(target, context?, technique?)` | 以当前情绪的语音进行带有爱意的嘲讽，返回严重程度 1-5。上下文：代码、错误、想法、情况。可选的技术叠加必须对当前情绪有效（无效的组合将被拒绝）。 |
| `heckle` | `(target, technique?)` | 简短的尖锐嘲讽。可选的技术叠加，与 roast 具有相同的情绪×技术矩阵。 |
| `catchphrase_generate` | `(context?)` | 创建可重复使用的片段（存储在会话中）。 |
| `catchphrase_callback` | `()` | 重用最常用的口头禅（或为空）。 |
| `running_gag` | `(setup, tag)` | 插入一个持续的片段，以便助手稍后可以回忆起来（具有安全保护）。在 `SENSOR_HUMOR_GAG_MIN_DISTANCE` 次之后，它会成为一个回调候选对象；在 `SENSOR_HUMOR_GAG_MAX_FIRES` 次之后，它会停止使用。 |
| `debug_status` | `()` | 实时后端运行状况（Ollama 可访问、模型已拉取）、已解析的配置、回退/速率计数以及会话状态。 |
| `debug_chain` | `(limit?)` | 上次 N 个逐次跟踪（工具、情绪、输入、提示指纹、重试次数、已触发的验证器、延迟）——一次调用可以重建生成流水线。 |
| `session_reset` | `()` | 重置所有会话状态（情绪、笑话、片段、口头禅、跟踪、计数器）。 |

**降级输出（已键入、机器可分支）：**当工具无法返回真实的 LLM 生成时，它会返回带有语音的预设语句，以及 `degraded: true` 和来自**封闭集合**的 `degraded_reason`，从而使消耗代理可以对其进行详尽的分支：`safety-filter`（已替换为俚语/比喻/元泄漏）· `language`（模型切换为非拉丁字母，并替换为英语语句——这是一种符合性降级，而不是安全降级）· `connection` · `timeout` · `model-not-found` · `auth` · `rate-limit` · `server` · `http` · `json-parse` · `validation` · `exhausted` · `unknown`。真实的生成**不**包含 `degraded` 标志——其不存在是积极的信号。**所有**喜剧工具都包含此标志，包括 `catchphrase_callback`（安全替换的回忆将被标记，绝不会冒充真实的）。`roast`/`heckle` 也回显活动的 `mood`；`catchphrase_generate` 返回 `is_fresh`（`true` = 刚刚创建，`false` = 重用了现有的会话口头禅）。

请拨打`debug_status`，即可获得一站式健康解答：实时可用性（如果不可用，则加 `unreachable_reason` — `connection` 与 `auth` 与 `timeout` 的对比），已解决的模型/主机/超时问题，生成统计信息，包括 `fallback_calls`（后端）**和** `safety_filter_fires`（安全机制替换文本的频率），以及 `prompt_fingerprint` + `active_prompt_key`，它们将*活动*提示文本与模型绑定，以便输出偏差可归因于提示与模型的更改——并且可以观察到无声的提示版本降级（请求的 v2 版本回退到 v1 版本）。

## 情绪语调（Piper 语音）

每种情绪都对应于一种独特的 Piper 语音 + 语调配置：

| 情绪 | 语音 | length_scale | noise_scale | noise_w_scale | volume | 角色 |
|------|-------|-------------|-------------|---------------|--------|-----------|
| dry | en_GB-alan-medium | 1.15 | 0.3 | 0.3 | 0.9 | 平淡、疲惫、单调 |
| roast | en_US-ryan-high | 0.95 | 0.667 | 0.8 | 1.0 | 自信的讽刺 |
| chaotic | en_US-lessac-high | 0.88 | 0.8 | 0.9 | 1.1 | 播音员播报胡说八道 |
| cheeky | en_GB-cori-high | 1.05 | 0.5 | 0.6 | 0.95 | 温暖、调皮、俏皮的眨眼 |
| cynic | en_GB-alan-medium | 1.25 | 0.2 | 0.2 | 0.8 | 冷漠、平淡、毫无惊喜 |
| zoomer | en_US-lessac-high | 0.90 | 0.85 | 0.9 | 1.15 | 快速、响亮、充满活力的直播风格 |

## 环境变量

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

## 可观察性和调试

- 每次工具调用都会记录：发送的提示、原始 Ollama 响应、解析后的输出、会话更新
- 语音：调试日志显示应用于每种情绪的 Piper 参数
- 设置 `SENSOR_HUMOR_DEBUG=true` 以查看所有内容

## 质量说明

- 幽默的质量来自于基于骨架的提示工程，而不是单个模型参数——每种情绪都会强制执行可预测的模式。使用 `scripts/ab-scorecard.ts`（SCORECARD.md 中的模板）在您自己的模型/硬件上测量命中率。
- 提示稳定性回归门控（v1.2）：v1 情绪提示是**冻结**的（由 `tests/scorecard-frozen-prompts.test.ts` 固定——要更改一个，请升级到 `v2`，切勿直接编辑）。一个确定性的**形式 + 安全**黄金数据集 + 统计数据在 `npm test` 中运行（无后端）；`npm run scorecard` 运行实时统计偏差检查——每种情绪的命中率都受到威尔逊区间的限制，结果为三值：PASS / FAIL / INCONCLUSIVE。它测量结构一致性 + 安全性，**而不是**幽默感（自动幽默评分不可靠——最佳 LLM 与人类的相关性约为 0.2）。
- 隐喻/比较过滤器：后验证正则表达式 + 重试，然后是情绪语音的安全回退，如果泄漏仍然存在。
- 语言一致性过滤器：喜剧内容是英语，因此非拉丁字母脚本门控（连续的外语单词序列**或**高非拉丁字母比例，仅计算字母）会标记代码切换的输出——例如，`qwen2.5:7b` 在一行中切换到中文。后验证 + 一次仅英语重试，然后使用 `degraded_reason: language` 进行无输入英语回退（一种*一致性*降级，与 `safety-filter` 不同，因此它不会影响安全过滤器计数器）。仅检测——带有重音的拉丁借词（`café`、`résumé`）、标点符号、数字和表情符号都不会触发它。
- 粗俗语言过滤器：一个确定性的术语列表正则表达式作为**每个**喜剧工具（包括口头禅）的*终端门控*运行，并在每次重试后重新检查，并在应用任何回退之前应用。检测路径首先进行去混淆——NFKC + 零宽度/双向剥离 + 同形字折叠 + 俚语折叠 + 词内分隔符剥离 + 组合标记剥离——因此，常见的规避手段（零宽度插入、西里尔/希腊字母相似物、全角字符、`r3tard`、`re-tard`、`retárd`）无法绕过单词边界。这是一个确定性的**下限**，而不是安全护栏——有关诚实的上限，请参阅“安全与信任”。
- 确定性：JSON 模式强制执行，在输出错误时重试，所有工具中都强制执行情绪继承。
- 语音：Piper 提供语调分离（每种情绪的长度/噪声/音量）；Kokoro 回退仅提供速度。
- 仅用于开发工具。幽默是主观的；如果需要，可以通过环境变量禁用任何情绪或调整提示。

## 安全与信任

- **默认情况下为本地模式**——通过 HTTP 与 `localhost` 上的 Ollama 进行通信。`OLLAMA_HOST` 可以指向其他位置（例如远程/云端 Ollama）；这是唯一的外部输出，并且由操作员明确选择。
- **文件系统**——默认情况下不使用。使用 `SENSOR_HUMOR_PERSIST=true` 时，它会读取/写入一个文件，即 `~/.sensor-humor/session.json`（使用 `SENSOR_HUMOR_SESSION_DIR` 覆盖目录），其中仅包含您会话的喜剧状态（段子、笑话、常用语）——不包含任何凭据。该文件会在 24 小时后自动过期。
- **密钥**——默认情况下不使用。如果您将 `OLLAMA_HOST` 指向远程/云端 Ollama，请设置 `OLLAMA_API_KEY`；它将从环境变量中读取，并仅作为 `Bearer` 标头发送到该主机——绝不会记录、持久保存或回显（`debug_status` 仅报告是否设置了密钥，绝不会报告其值）。
- **不收集遥测数据**——不收集或发送任何数据。
- **默认情况下，会话状态存储在内存中**——当服务器进程停止时，会话状态会消失；使用 `SENSOR_HUMOR_PERSIST` 可以选择将其持久保存到磁盘。
- **输入清理**——在进行提示注入之前，会对所有用户提供的文本进行规范化和清理：Unicode NFKC 转换、删除零宽度/双向/格式字符、将常见的同形异义字转换为 ASCII、删除换行符、删除控制字符、限制长度。
- **输出过滤（确定性下限 + 诚实上限）**——一个以 base64 格式存储的术语列表正则表达式，作为终端安全门，应用于每个喜剧工具（在每次重试后重新检查，并在任何回退之前应用），并且调用者输入的备用方案会回退到静态的、不包含输入的行，而不是回显被禁止的令牌。检测路径首先进行去混淆，因此可以消除常见的规避方法：零宽度/双向插入、同形异义字（西里尔/希腊/全角）、leet 码（`r3tard`）、词内分隔符（`re-tard`、`r.e.t.a.r.d`）和组合变音符号（`retárd`）。在加载时，还会从已篡改/遗留的持久会话中删除不干净的条目。**它不执行以下操作：**它是一个确定性的术语列表过滤器，而不是一个学习型分类器——它不能防御列表之外/新的侮辱性变体、单字母间距（`r e t a r d`）、ASCII 艺术/空间混淆、完整的 Unicode 混淆覆盖或语义/越狱类攻击。将其视为本地开发喜剧工具的最佳尝试下限，而不是对不受信任的公共输入的审核保证。
- **工具错误格式**——运行时/工具错误会返回工作室的结构化错误格式（`{code, message, hint, retryable}`）；请注意，*输入模式*验证错误（例如，无效的 `mood`）由 MCP SDK 在处理程序运行之前捕获，并显示为 SDK 的标准 `InvalidParams` 错误，而不是此格式。

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
