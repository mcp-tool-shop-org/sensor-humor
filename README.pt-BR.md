<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.md">English</a>
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

Ferramenta MCP que oferece ao seu LLM um companheiro cômico persistente: personalidade baseada no humor, respostas contextuais com base na sessão, piadas recorrentes, comentários sarcásticos, provocações e frases de efeito — tudo com integração de voz via Piper TTS (com controle da prosódia).

Criado para desenvolvedores: críticas suaves sobre problemas no código, mensagens de erro secas e diretas, escalada caótica em caso de falhas na compilação. Nunca substitui o tom do LLM principal — voz distinta que se manifesta quando solicitado.

## Recursos

- 6 humores, cada um ajustado com um modelo básico de preenchimento para obter resultados previsíveis e de alta qualidade
- Estado da sessão: piadas recorrentes, buffer de frases recentes (máximo de 20), mapa de frases de efeito — opcionalmente persistido em disco (`SENSOR_HUMOR_PERSIST`) para que as respostas contextuais sobrevivam a uma reinicialização do servidor
- 9 ferramentas: mood_set/mood_get, comic_timing, roast, heckle, catchphrase_generate/catchphrase_callback, debug_status, session_reset
- Backend local Ollama (qwen2.5:7b padrão, configurável via `SENSOR_HUMOR_MODEL`)
- Pareamento de voz: mcp-voice-soundboard com Piper TTS (controles de prosódia: length_scale, noise_scale, noise_w_scale, volume)
- Determinístico: aplicação do esquema JSON, validação, repetição em caso de resultados ruins, herança do humor aplicada

## Humores

Cada humor usa um modelo básico de preenchimento que força o modelo a adotar uma forma previsível e de alta qualidade.

- **dry** (seco) — direto, minimalista, dolorosamente óbvio (padrão)
- **roast** (sarcástico) — comentários sarcásticos afetuosos, rótulos de veredicto/diagnóstico
- **cynic** (cínico) — realismo taciturno e amargo ("Claro:", "Previsivelmente:")
- **cheeky** (atrevido) — brincadeiras divertidas ("Oh, querida", "Atitude ousada")
- **chaotic** (caótico) — frase coerente, seguida de uma reviravolta absurda repentina ("Aparentemente...")
- **zoomer** — gírias da Geração Z, viciados em internet (reação, comentário sarcástico, letras maiúsculas, tag)

Todos os humores herdam a voz + prosódia via mcp-voice-soundboard (Piper recomendado).

## Requisitos

- Node.js 18+
- Ollama em execução localmente com `qwen2.5:7b` baixado (ou defina `SENSOR_HUMOR_MODEL` para um modelo diferente)
- mcp-voice-soundboard instalado e em execução (backend Piper recomendado, opcional)
- @modelcontextprotocol/sdk

## Instalação

```bash
npm install @mcptoolshop/sensor-humor
# or install a local dev checkout
npm install /path/to/sensor-humor
```

### Docker

Uma imagem de contêiner é publicada no GHCR a cada lançamento. sensor-humor se comunica via MCP através do stdio, então execute-o interativamente e direcione-o para um Ollama acessível:

```bash
docker run -i --rm -e OLLAMA_HOST=http://host.docker.internal:11434 \
  ghcr.io/mcp-tool-shop-org/sensor-humor:latest
```

## Início Rápido

1. Inicie o Ollama:

```bash
ollama pull qwen2.5:7b
```

2. Inicie o servidor MCP do sensor-humor (transporte stdio):

```bash
cd sensor-humor
SENSOR_HUMOR_DEBUG=true npm start
```

3. Inicie o voice-soundboard (modo Piper):

```bash
cd ../mcp-voice-soundboard
VOICE_SOUNDBOARD_ENGINE=piper VOICE_SOUNDBOARD_PIPER_MODEL_DIR=/path/to/piper/models npm start
```

4. Em seu cliente MCP (Claude Code, Cursor, etc.):
- Adicione ambos os servidores
- Teste a cadeia:

```
mood_set(style: "roast")
roast(target: "800-line god function")
```

Texto sarcástico retornado. Se [mcp-voice-soundboard](https://github.com/mcp-tool-shop-org/mcp-voice-soundboard) também estiver configurado, `voice_speak(mood: "roast")` o reproduzirá com a prosódia Piper apropriada para o humor.

## Ferramentas

Todas as ferramentas herdam o humor atual da sessão.

| Ferramenta | Assinatura | Descrição |
|------|-----------|-------------|
| `mood_set` | `(style: string)` | Define o humor ativo (dry, roast, chaotic, cheeky, cynic, zoomer) |
| `mood_get` | `()` | Humor atual + contagem de piadas |
| `comic_timing` | `(text, technique?)` | Reescreve com uma entrega cômica (regra dos três, desvio de atenção, escalada, resposta contextual, subestimação, automático) |
| `roast` | `(target, context?)` | Comentário sarcástico no humor atual, retorna a severidade de 1 a 5. Contexto: código, erro, ideia, situação |
| `heckle` | `(target)` | Comentário curto e direto |
| `catchphrase_generate` | `(context?)` | Cria uma frase reutilizável (armazenada na sessão) |
| `catchphrase_callback` | `()` | Reutiliza a frase mais usada (ou retorna nulo) |
| `debug_status` | `()` | Estado de saúde do backend ao vivo (Ollama acessível, modelo baixado), configuração resolvida, contagens de fallback e estado da sessão |
| `session_reset` | `()` | Redefine todo o estado da sessão (humor, piadas, frases, contador) |

**Saída degradada (digitada, com ramificação por máquina):** quando uma ferramenta não consegue retornar um modelo de geração genuíno, ela retorna uma frase pré-definida e genérica, juntamente com `degraded: true` e um `degraded_reason` de um **conjunto fechado**, no qual um agente consumidor pode realizar ramificações exaustivas: `safety-filter` (uma gíria/comparação/vazamento foi substituída) · `connection` · `timeout` · `model-not-found` · `auth` · `rate-limit` · `server` · `http` · `json-parse` · `validation` · `exhausted` · `unknown`. Uma geração genuína **não** contém a flag `degraded`; sua ausência é o sinal positivo. **Todas** as ferramentas de comédia possuem isso, incluindo `catchphrase_callback` (uma substituição segura é sinalizada, nunca apresentada como uma frase genuína). `roast`/`heckle` também refletem o `mood` ativo; `catchphrase_generate` retorna `is_fresh` (`true` = recém-criada, `false` = uma frase existente reutilizada).

Chame `debug_status` para obter uma resposta única sobre o status: disponibilidade (mais `unreachable_reason` quando inativo — `connection` vs. `auth` vs. `timeout`), o modelo/host/tempo limite resolvido, estatísticas de geração, incluindo tanto `fallback_calls` (backend) **quanto** `safety_filter_fires` (com que frequência o filtro de segurança substituiu uma frase), e um `prompt_fingerprint` + `active_prompt_key` que vinculam o texto do prompt *ativo* + modelo para que a deriva na saída possa ser atribuída a uma mudança no prompt em relação ao modelo — e uma redução silenciosa da versão do prompt (uma versão v2 solicitada que retornou à v1) é visível.

## Prosódia do Humor (Voz Piper)

Cada humor é mapeado para uma voz e configuração de prosódia distintas do Piper:

| Humor | Voz | length_scale | noise_scale | noise_w_scale | volume | Característica |
|------|-------|-------------|-------------|---------------|--------|-----------|
| dry | en_GB-alan-medium | 1.15 | 0.3 | 0.3 | 0.9 | Plano, cansado, metronômico |
| roast | en_US-ryan-high | 0.95 | 0.667 | 0.8 | 1.0 | Sarcasmo confiante |
| chaotic | en_US-lessac-high | 0.88 | 0.8 | 0.9 | 1.1 | Apresentador de notícias transmitindo absurdos |
| cheeky | en_GB-cori-high | 1.05 | 0.5 | 0.6 | 0.95 | Quente, divertido, piscadela brincalhona |
| cynic | en_GB-alan-medium | 1.25 | 0.2 | 0.2 | 0.8 | Frio, plano, sem surpresas |
| zoomer | en_US-lessac-high | 0.90 | 0.85 | 0.9 | 1.15 | Rápido, alto, energia de streamer |

## Variáveis de Ambiente

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

## Observabilidade e Depuração

- Cada chamada de ferramenta registra: prompt enviado, resposta bruta do Ollama, saída analisada, atualização da sessão
- Voz: os logs de depuração mostram os parâmetros do Piper aplicados por humor
- Defina `SENSOR_HUMOR_DEBUG=true` para ver tudo

## Notas sobre Qualidade

- A qualidade da comédia vem de uma engenharia de prompts baseada em esqueletos, não de um único ajuste no modelo — cada humor força uma forma previsível. Meça a taxa de sucesso em seu próprio modelo/hardware com `scripts/ab-scorecard.ts` (modelo em SCORECARD.md)
- Barreira de regressão da estabilidade do prompt (v1.2): os prompts de humor v1 são **congelados** (fixados por `tests/scorecard-frozen-prompts.ts` — para alterar um, atualize para `v2`, nunca edite no local). Um conjunto dourado determinístico de **forma + segurança** + estatísticas é executado em `npm test` (sem backend); `npm run scorecard` executa a verificação estatística da deriva ao vivo — taxa de sucesso por humor, limitada em um intervalo de Wilson com um resultado de três valores: PASS / FAIL / INCONCLUSIVE e parada antecipada SPRT. Ele mede a conformidade estrutural + segurança, **não** o humor (a pontuação automatizada do humor é pouco confiável — a melhor correlação LLM vs. humano ≈ 0,2)
- Filtro de comparação/analogia: regex pós-validação + repetição e, em seguida, uma alternativa segura com base no humor, caso um vazamento persista
- Filtro de linguagem agressiva: um regex determinístico de lista de termos é executado como um *bloqueio terminal* em **todas** as ferramentas de comédia (incluindo frases), verificado novamente após cada repetição e aplicado antes que qualquer alternativa seja interpolada. O caminho de detecção primeiro remove a ofuscação — NFKC + remoção de caracteres de largura zero/bidirecionais + dobra de homoglifos + dobra de leetspeak + remoção de separadores intra-palavra + remoção de marcas combinadas — para que as evasões comuns (inserção de largura zero, semelhantes em cirílico/grego, largura total, `r3tard`, `re-tard`, `retárd`) não consigam passar uma gíria. Este é um **limite** determinístico, não uma proteção — consulte Segurança e Confiança para obter o limite real
- Determinístico: aplicação do esquema JSON, repetição em caso de saída ruim, herança de humor aplicada em todas as ferramentas
- Voz: Piper fornece separação de prosódia (duração/ruído/volume por humor); Kokoro fallback é apenas velocidade
- Apenas ferramenta auxiliar para desenvolvimento. O humor é subjetivo; desative qualquer humor via ambiente ou ajuste os prompts, se necessário

## Segurança e Confiança

- **Local por padrão** — comunica-se com o Ollama em `localhost` via HTTP. `OLLAMA_HOST` pode apontar para outro local (por exemplo, um Ollama remoto/na nuvem); essa é a única saída externa e é a escolha explícita do operador
- **Sistema de arquivos** — nenhum por padrão. Com `SENSOR_HUMOR_PERSIST=true`, ele lê/grava um arquivo, `~/.sensor-humor/session.json` (substitua o diretório com `SENSOR_HUMOR_SESSION_DIR`), contendo apenas o estado da comédia da sua sessão (bits, piadas, frases) — sem credenciais. O arquivo expira automaticamente após 24 horas
- **Segredos** — nenhum por padrão. Se você apontar `OLLAMA_HOST` para um Ollama remoto/na nuvem, defina `OLLAMA_API_KEY`; ele é lido do ambiente e enviado apenas como um cabeçalho `Bearer` para esse host — nunca registrado, persistido ou repetido (`debug_status` relata apenas *se* uma chave está definida, nunca seu valor)
- **Sem telemetria** — nada é coletado ou enviado
- **O estado da sessão está na memória por padrão** — desaparece quando o processo do servidor é interrompido; opte pela persistência em disco com `SENSOR_HUMOR_PERSIST`
- **Sanitização de entrada** — todo o texto fornecido pelo usuário é normalizado e higienizado antes da injeção de prompt: dobra Unicode NFKC, caracteres de largura zero/bidirecionais/formato removidos, homoglifos comuns dobrados para ASCII, novas linhas removidas, caracteres de controle removidos, comprimento limitado
- **Filtragem de saída (limite determinístico + limite real)** — um regex de lista de termos armazenado em base64 é executado como um bloqueio de segurança terminal em todas as ferramentas de comédia (verificado novamente após cada repetição, aplicado antes que qualquer alternativa seja interpolada), e uma alternativa de entrada do chamador colapsa para uma linha estática e sem entrada, em vez de repetir um token proibido. O caminho de detecção primeiro remove a ofuscação, para que as evasões comuns sejam derrotadas: inserção de largura zero/bidirecional, homoglifos (cirílico/grego/largura total), leetspeak (`r3tard`), separadores intra-palavra (`re-tard`, `r.e.t.a.r.d`) e diacríticos combinados (`retárd`). Entradas sujas também são removidas de uma sessão persistida adulterada/legada no carregamento. **O que não faz:** é um filtro determinístico de lista de termos, não um classificador aprendido — ele não se defende contra variantes de gírias fora da lista/novas, espaçamento de uma letra (`r e t a r d`), ofuscação espacial ASCII ou cobertura Unicode completa, ou ataques semânticos/de quebra de jailbreak. Trate-o como um limite de melhor esforço para uma ferramenta de humor local, não como uma garantia de moderação para entrada pública não confiável
- **Formato de erro da ferramenta** — erros de tempo de execução/ferramenta retornam o formato de erro estruturado do estúdio (`{code, message, hint, retryable}`); observe que os erros de *validação de esquema de entrada* (por exemplo, um `mood` inválido) são detectados pelo SDK MCP antes que o manipulador seja executado e aparecem como o erro padrão `InvalidParams` do SDK, não este formato

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
