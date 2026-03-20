<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.md">English</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/sensor-humor/readme.png" width="600" alt="sensor-humor" />
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/sensor-humor/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/sensor-humor/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/mcp-tool-shop-org/sensor-humor/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License"></a>
  <a href="https://mcp-tool-shop-org.github.io/sensor-humor/"><img src="https://img.shields.io/badge/landing-page-34d399" alt="Landing Page"></a>
</p>

MCP (Model Context Protocol) que oferece ao seu LLM (Large Language Model) um companheiro cômico persistente: personalidade baseada no humor, callbacks conscientes da sessão, piadas recorrentes, críticas, provocações e frases de efeito — tudo com integração de voz via Piper TTS (com controle de prosódia).

Desenvolvido para desenvolvedores: críticas sutis sobre código mal escrito, mensagens de erro secas e diretas, caos descontrolado em caso de falhas de compilação. Nunca sobrescreve o tom do LLM principal — voz distinta que entra em ação quando solicitada.

## Características

- 6 humores: seco (padrão), crítico, absurdo, amigável, sarcástico, descontrolado.
- Estado da sessão: piadas recorrentes, buffer de "bits" recentes (máximo de 20), mapa de frases de efeito.
- Ferramentas: mood.set/get, comic_timing, roast, heckle, catchphrase.generate/callback.
- Backend local Ollama (recomendado: qwen2.5:7b-instruct).
- Emparelhamento de voz: mcp-voice-soundboard com Piper TTS (parâmetros de prosódia: length_scale, noise_scale, noise_w_scale, volume).
- Determinístico: aplicação e validação de esquema JSON, repetição em caso de saída inválida, registro de depuração.

## Requisitos

- Node.js 18+.
- Ollama em execução localmente com o modelo `qwen2.5:7b-instruct` baixado.
- mcp-voice-soundboard instalado e em execução (backend Piper recomendado).
- @modelcontextprotocol/sdk.

## Instalação

```bash
npm install @mcp-tool-shop/sensor-humor
# or link local dev version
npm link /path/to/sensor-humor
```

## Início rápido

1. Inicie o Ollama:

```bash
ollama run qwen2.5:7b-instruct
```

2. Inicie o servidor MCP sensor-humor (transporte stdio):

```bash
cd sensor-humor
SENSOR_HUMOR_DEBUG=true npm start
```

3. Inicie o voice-soundboard (modo Piper):

```bash
cd ../mcp-voice-soundboard
VOICE_SOUNDBOARD_ENGINE=piper VOICE_SOUNDBOARD_PIPER_MODEL_DIR=/path/to/piper/models npm start
```

4. No seu cliente MCP (Claude Code, Cursor, etc.):
- Adicione ambos os servidores.
- Teste a cadeia:

```
mood.set(style: "roast")
roast(target: "800-line god function")
```

Uma crítica é retornada, e então `voice_speak(mood: "roast")` a pronuncia com energia sarcástica e confiante.

## Ferramentas

Todas as ferramentas herdam o humor atual da sessão.

| Ferramenta | Assinatura | Descrição |
|------|-----------|-------------|
| `mood.set` | `(style: string)` | Define o humor ativo (seco, crítico, absurdo, amigável, sarcástico, descontrolado). |
| `mood.get` | `()` | Humor atual + contagem de piadas. |
| `comic_timing` | `(text, technique?)` | Reescreve com entrega cômica (regra de três, desvio de atenção, escalada, referência, subestimação, automático). |
| `roast` | `(target, context?)` | Crítica afetuosa com padrão de veredicto/rótulo, retorna a severidade de 1 a 5. Contexto: código, erro, ideia, situação. |
| `heckle` | `(target)` | Crítica curta e direta. |
| `catchphrase.generate` | `(context?)` | Cria um "bit" reutilizável (armazenado na sessão). |
| `catchphrase.callback` | `()` | Reutiliza a frase de efeito mais usada (ou nula). |

## Prosódia do Humor (Voz Piper)

Cada humor corresponde a uma voz Piper distinta e configuração de prosódia:

| Humor | Voz | length_scale | noise_scale | noise_w_scale | volume | Característica |
|------|-------|-------------|-------------|---------------|--------|-----------|
| seco | en_GB-alan-medium | 1.15 | 0.3 | 0.3 | 0.9 | Monótono, cansado, metronômico. |
| crítico | en_US-ryan-high | 0.95 | 0.667 | 0.8 | 1.0 | Sarcasmo confiante. |
| absurdo | en_US-lessac-high | 0.88 | 0.8 | 0.9 | 1.1 | Errático, imprevisível. |
| amigável | en_GB-cori-high | 1.05 | 0.5 | 0.6 | 0.95 | Energia calorosa e gentil de pai. |
| sarcástico | en_GB-alan-medium | 1.25 | 0.2 | 0.2 | 0.8 | Tom cansado do mundo. |
| descontrolado | en_US-lessac-high | 0.82 | 0.9 | 1.0 | 1.2 | Rápido, alto, caótico. |

## Variáveis de Ambiente

```bash
# sensor-humor
SENSOR_HUMOR_DEBUG=true                # verbose prompt/response dumps
SENSOR_HUMOR_OBSERVE=true              # full chain trace (prompt -> text -> piper params)
SENSOR_HUMOR_PROMPT_VERSION=1          # prompt set version (for A/B tuning)

# voice integration (in voice-soundboard)
VOICE_SOUNDBOARD_ENGINE=piper          # or kokoro (default)
VOICE_SOUNDBOARD_PIPER_MODEL_DIR=/path/to/piper/models
```

## Observabilidade e Depuração

- Cada chamada de ferramenta registra: prompt enviado, resposta bruta do Ollama, saída analisada, atualização da sessão.
- Voz: os logs de depuração mostram os parâmetros do Piper aplicados para cada humor.
- Defina `SENSOR_HUMOR_DEBUG=true` para ver tudo.

## Observações sobre a Qualidade

- Taxa de acerto do humor: ~70-75% em sessões reais (o humor "seco" é o mais forte, seguido pelo "crítico").
- Determinístico: aplicação de esquema JSON, 1 repetição em caso de saída inválida, validação pós-execução para padrões proibidos.
- Voz: o Piper oferece uma separação real de prosódia (não apenas velocidade); o Kokoro é apenas de velocidade.
- Não é para bots de produção — apenas uma ferramenta para desenvolvedores. O humor é subjetivo; ajuste os prompts, se necessário.

## Arquitetura

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

## Desenvolvimento

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

## Licença

MIT

---

Criado por <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
