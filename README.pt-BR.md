<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.md">English</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/sensor-humor/readme.png" width="400" alt="sensor-humor" />
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/sensor-humor/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/sensor-humor/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/mcp-tool-shop-org/sensor-humor/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License"></a>
  <a href="https://mcp-tool-shop-org.github.io/sensor-humor/"><img src="https://img.shields.io/badge/landing-page-34d399" alt="Landing Page"></a>
</p>

MCP (Model Context Protocol) que oferece ao seu LLM (Large Language Model) um companheiro cômico persistente: personalidade baseada no humor, callbacks conscientes da sessão, piadas recorrentes, críticas, provocações e frases de efeito — tudo com integração de voz via Piper TTS (com controle de prosódia).

Desenvolvido para desenvolvedores: críticas sutis sobre código mal escrito, mensagens de erro secas e diretas, caos descontrolado em caso de falhas de compilação. Nunca sobrescreve o tom do LLM principal — voz distinta que entra em ação quando solicitada.

## Características

- 6 modos, todos com uma taxa de acerto de 70% ou mais em sessões de desenvolvimento reais.
- Estado da sessão: piadas recorrentes, buffer circular das últimas falas (máximo de 20), mapa de frases características.
- 9 ferramentas: mood_set/mood_get, comic_timing, roast, heckle, catchphrase_generate/catchphrase_callback, debug_status, session_reset.
- Backend local do Ollama (qwen2.5:7b por padrão, configurável via `SENSOR_HUMOR_MODEL`).
- Emparelhamento de voz: mcp-voice-soundboard com Piper TTS (controles de prosódia: length_scale, noise_scale, noise_w_scale, volume).
- Determinístico: aplicação e validação de esquema JSON, repetição em caso de saída inválida, herança de modo forçada.

## Modos

Cada modo utiliza um modelo de prompt com espaços em branco que força o modelo a adotar uma forma previsível e de alta qualidade.

- **neutro** — tom sério, minimalista, óbvio (padrão)
- **sarcástico** — críticas afetuosas e incisivas, rótulos de veredicto/diagnóstico
- **cínico** — realismo cínico e discreto ("Claro:", "Previsivelmente:")
- **travesso** — brincadeiras e provocações ("Oh, querido", "Movimento ousado")
- **caótico** — frase inicial, seguida de uma reviravolta absurda ("Aparentemente...")
- **moderno** — sarcasmo da geração Z, excessivamente conectado ("reação", "provocação", "MAIÚSCULAS", "marcação")

Todos os modos herdam a voz e a entonação através do mcp-voice-soundboard (Piper recomendado).

## Requisitos

- Node.js 18+
- Ollama em execução localmente com o modelo `qwen2.5:7b` baixado (ou defina `SENSOR_HUMOR_MODEL` para um modelo diferente).
- mcp-voice-soundboard instalado e em execução (backend Piper recomendado, opcional).
- @modelcontextprotocol/sdk

## Instalação

```bash
npm install sensor-humor
# or link local dev version
npm link /path/to/sensor-humor
```

## Início rápido

1. Inicie o Ollama:

```bash
ollama pull qwen2.5:7b
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
mood_set(style: "roast")
roast(target: "800-line god function")
```

Texto "roast" retornado. Se o [mcp-voice-soundboard](https://github.com/mcp-tool-shop-org/mcp-voice-soundboard) também estiver configurado, `voice_speak(mood: "roast")` reproduzirá o texto com a prosódia apropriada para o modo.

## Ferramentas

Todas as ferramentas herdam o humor atual da sessão.

| Ferramenta | Assinatura | Descrição |
|------|-----------|-------------|
| `mood_set` | `(style: string)` | Definir o estado de espírito (neutro, sarcástico, caótico, irreverente, cínico, "zoomer") |
| `mood_get` | `()` | Humor atual + contagem de piadas. |
| `comic_timing` | `(text, technique?)` | Reescreve com entrega cômica (regra de três, desvio de atenção, escalada, referência, subestimação, automático). |
| `roast` | `(target, context?)` | Crítica afetuosa na voz do modo atual, com nível de intensidade de 1 a 5. Contexto: código, erro, ideia, situação. |
| `heckle` | `(target)` | Crítica curta e direta. |
| `catchphrase_generate` | `(context?)` | Cria um "bit" reutilizável (armazenado na sessão). |
| `catchphrase_callback` | `()` | Reutiliza a frase de efeito mais usada (ou nula). |
| `debug_status` | `()` | Descarrega o estado atual da sessão, a configuração do modo e o backend da voz. |
| `session_reset` | `()` | Reseta todo o estado da sessão (modo, piadas, falas, frases características, contador de turnos). |

## Prosódia do Humor (Voz Piper)

Cada humor corresponde a uma voz Piper distinta e configuração de prosódia:

| Humor | Voz | length_scale | noise_scale | noise_w_scale | volume | Característica |
|------|-------|-------------|-------------|---------------|--------|-----------|
| seco | en_GB-alan-medium | 1.15 | 0.3 | 0.3 | 0.9 | Monótono, cansado, metronômico. |
| crítico | en_US-ryan-high | 0.95 | 0.667 | 0.8 | 1.0 | Sarcasmo confiante. |
| Caótico | en_US-lessac-high | 0.88 | 0.8 | 0.9 | 1.1 | Apresentador de notícias falando bobagens |
| Irreverente | en_GB-cori-high | 1.05 | 0.5 | 0.6 | 0.95 | Piscadela calorosa, provocadora e brincalhona |
| Cínico | en_GB-alan-medium | 1.25 | 0.2 | 0.2 | 0.8 | Frio, sem emoção, sem surpresa |
| "Zoomer" | en_US-lessac-high | 0.90 | 0.85 | 0.9 | 1.15 | Rápido, alto, energia de streamer |

## Variáveis de Ambiente

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

## Observabilidade e Depuração

- Cada chamada de ferramenta registra: prompt enviado, resposta bruta do Ollama, saída analisada, atualização da sessão.
- Voz: os logs de depuração mostram os parâmetros do Piper aplicados para cada humor.
- Defina `SENSOR_HUMOR_DEBUG=true` para ver tudo.

## Observações sobre a Qualidade

- Taxa de sucesso cômico: 70-100% por modo/ferramenta em sessões de desenvolvimento reais (engenharia de prompts baseada em modelos).
- Filtro de comparação/analogia: expressão regular de validação posterior + tentativas/alternativas para evitar falhas nos modos neutro/travesso.
- Todos os modos com 70%+ em sessões reais; sarcástico/cínico/caótico frequentemente com 90-100%.
- Determinístico: aplicação de esquema JSON, repetição em caso de saída incorreta, herança de modo aplicada a todas as ferramentas.
- Voz: Piper oferece separação de entonação (duração/ruído/volume por modo); Kokoro é uma alternativa mais rápida.
- Apenas uma ferramenta de desenvolvimento. O humor é subjetivo; desative qualquer modo através de variáveis de ambiente ou ajuste os prompts, se necessário.

## Segurança e Confiança

- **Apenas local** — comunica-se com o Ollama no localhost via HTTP, sem saída para a rede externa.
- **Sem acesso ao sistema de arquivos** — não lê nem grava arquivos.
- **Sem tratamento de segredos** — não lê, armazena nem transmite credenciais.
- **Sem telemetria** — nada é coletado ou enviado.
- **O estado da sessão é apenas na memória** — é perdido quando o processo do servidor é interrompido.
- **Sanitização da entrada** — todo o texto fornecido pelo usuário é sanitizado antes da injeção de prompt (quebras de linha removidas, limite de comprimento aplicado, caracteres de controle removidos).
- **Filtragem da saída** — filtro de linguagem ofensiva (lista de termos codificados em base64) com repetição + fallback seguro para evitar que insultos cheguem ao usuário.

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
