<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.md">English</a>
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

Ferramenta MCP que oferece ao seu LLM um companheiro cômico persistente: personalidade baseada no humor, respostas contextuais, piadas recorrentes, comentários sarcásticos, provocações e frases de efeito — tudo com integração de voz via Piper TTS (com controle da prosódia).

Criada para desenvolvedores: críticas suaves sobre problemas no código, mensagens de erro secas e diretas, escalada caótica em caso de falhas na compilação. Nunca substitui o tom do LLM principal — voz distinta que se manifesta quando chamada.

## Recursos

- 6 humores, cada um ajustado com um modelo de prompt de preenchimento para obter resultados previsíveis e de alta qualidade
- Estado da sessão: piadas recorrentes, buffer de anel de frases recentes (máximo de 20), mapa de frases de efeito — opcionalmente persistido em disco (`SENSOR_HUMOR_PERSIST`) para que as respostas contextuais sobrevivam a uma reinicialização do servidor
- 11 ferramentas: mood_set/mood_get, comic_timing, roast, heckle, catchphrase_generate/catchphrase_callback, running_gag, debug_status, debug_chain, session_reset
- Backend local Ollama (qwen2.5:7b padrão, configurável via `SENSOR_HUMOR_MODEL`)
- Emparelhamento de voz: mcp-voice-soundboard com Piper TTS (controles de prosódia: length_scale, noise_scale, noise_w_scale, volume)
- Determinístico: aplicação do esquema JSON, validação, repetição em caso de resultados ruins, herança de humor aplicada

## Humores

Cada humor usa um modelo de prompt de preenchimento que força o modelo a adotar uma forma previsível e de alta qualidade.

- **dry** — seco, minimalista, dolorosamente óbvio (padrão)
- **roast** — comentários sarcásticos afetuosos, rótulos de veredicto/diagnóstico
- **cynic** — cínico, realismo silenciosamente vicioso ("Claro:", "Previsivelmente:")
- **cheeky** — travesso, brincalhão ("Oh, querida", "Movimento ousado")
- **chaotic** — frase fundamentada, seguida de uma reviravolta absurda repentina ("Aparentemente...")
- **zoomer** — sarcasmo da Geração Z, viciado em internet (reação, comentário, BLOQUEIO DE MAIÚSCULAS, tag)

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

Uma imagem de contêiner é publicada no GHCR em cada lançamento. sensor-humor usa MCP via stdio, então execute-o interativamente e direcione-o para um Ollama acessível:

```bash
docker run -i --rm -e OLLAMA_HOST=http://host.docker.internal:11434 \
  ghcr.io/mcp-tool-shop-org/sensor-humor:latest
```

### Configure seu cliente MCP

Registre sensor-humor como um servidor stdio na configuração MCP do seu cliente. Para Claude Code / Claude Desktop (`claude_desktop_config.json`) ou qualquer configuração no formato `mcpServers`:

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

O servidor lê sua configuração deste bloco `env` (ou do shell que o inicia) — ele **não** carrega automaticamente um arquivo `.env`. Consulte [`.env.example`](.env.example) para todas as variáveis suportadas. Se você instalou o pacote globalmente, use `"command": "sensor-humor"` sem `args`.

## Início Rápido

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

4. Em seu cliente MCP (Claude Code, Cursor, etc.):
- Adicione ambos os servidores
- Teste a cadeia:

```
mood_set(style: "roast")
roast(target: "800-line god function")
```

Comentário sarcástico retornado. Se [mcp-voice-soundboard](https://github.com/mcp-tool-shop-org/mcp-voice-soundboard) também estiver configurado, `voice_speak(mood: "roast")` o reproduz com a prosódia Piper apropriada para o humor.

## Ferramentas

Todas as ferramentas herdam o humor atual da sessão.

| Ferramenta | Assinatura | Descrição |
|------|-----------|-------------|
| `mood_set` | `(style: string)` | Define o humor ativo (dry, roast, chaotic, cheeky, cynic, zoomer) |
| `mood_get` | `()` | Humor atual + contagem de piadas + `allowed_techniques` para o humor ativo |
| `comic_timing` | `(text, technique?)` | Reescreve com entrega cômica (regra de três, desvio de atenção, escalada, resposta contextual, subestimação, automático) |
| `roast` | `(target, context?, technique?)` | Comentário sarcástico no humor da voz atual, retorna a severidade de 1 a 5. Contexto: código, erro, ideia, situação. A sobreposição de técnica opcional deve ser válida para o humor atual (combinações inválidas são recusadas). |
| `heckle` | `(target, technique?)` | Comentário sarcástico curto. Sobreposição de técnica opcional, mesma matriz de humor × técnica do comentário sarcástico. |
| `catchphrase_generate` | `(context?)` | Crie um trecho reutilizável (armazenado na sessão) |
| `catchphrase_callback` | `()` | Reutilize a frase de efeito mais usada (ou nula) |
| `running_gag` | `(setup, tag)` | Crie um trecho recorrente que o companheiro possa usar mais tarde (com segurança). Torna-se um candidato para resposta contextual após `SENSOR_HUMOR_GAG_MIN_DISTANCE` iterações; é removido após `SENSOR_HUMOR_GAG_MAX_FIRES` iterações. |
| `debug_status` | `()` | Status do backend ao vivo (Ollama acessível, modelo baixado), configuração resolvida, contagens de fallback/taxa e estado da sessão |
| `debug_chain` | `(limit?)` | Últimos N rastreamentos por chamada (ferramenta, humor, entrada, impressão digital do prompt, repetições, validadores disparados, latência) — uma chamada reconstrói o pipeline de geração |
| `session_reset` | `()` | Redefina todo o estado da sessão (humor, piadas, trechos, frases de efeito, rastreamentos, contador de iterações) |

**Saída degradada (digitada, ramificável por máquina):** quando uma ferramenta não pode retornar uma geração genuína do modelo, ela retorna uma frase pré-gravada na voz, mais `degraded: true` e um `degraded_reason` de um **conjunto fechado** que um agente consumidor pode ramificar exaustivamente: `safety-filter` (uma gíria/comparação/vazamento de metadados foi substituída) · `language` (o modelo mudou para um script diferente do latino e uma frase em inglês foi substituída — uma degradação de conformidade, não uma de segurança) · `connection` · `timeout` · `model-not-found` · `auth` · `rate-limit` · `server` · `http` · `json-parse` · `validation` · `exhausted` · `unknown`. Uma geração genuína não carrega nenhuma `degraded` — sua ausência é o sinal positivo. **Todas** as ferramentas de comédia carregam isso, incluindo `catchphrase_callback` (uma lembrança substituída por segurança é sinalizada, nunca passada como uma genuína). `roast`/`heckle` também ecoam o `mood` ativo; `catchphrase_generate` retorna `is_fresh` (`true` = recém-criado, `false` = uma frase de efeito da sessão existente reutilizada).

Ligue para `debug_status` para obter uma resposta rápida sobre saúde: disponibilidade em tempo real (mais `unreachable_reason` quando inativo — `connection` vs `auth` vs `timeout`), o modelo/host/tempo limite resolvido, estatísticas de geração, incluindo tanto `fallback_calls` (backend) **quanto** `safety_filter_fires` (com que frequência o limite de segurança substituiu uma linha) e um `prompt_fingerprint` + `active_prompt_key` que vinculam o texto do prompt *ativo* + modelo, para que o desvio na saída possa ser atribuído a uma mudança no prompt em relação ao modelo — e uma redução silenciosa da versão do prompt (uma versão v2 solicitada que retornou à v1) é visível.

## Prosódia do Humor (Voz Piper)

Cada humor é mapeado para uma voz Piper + configuração de prosódia distinta:

| Humor | Voz | length_scale | noise_scale | noise_w_scale | volume | Personagem |
|------|-------|-------------|-------------|---------------|--------|-----------|
| dry | en_GB-alan-medium | 1.15 | 0.3 | 0.3 | 0.9 | Plano, cansado, metronômico |
| roast | en_US-ryan-high | 0.95 | 0.667 | 0.8 | 1.0 | Sarcasmo confiante |
| caótico | en_US-lessac-high | 0.88 | 0.8 | 0.9 | 1.1 | Apresentador de notícias transmitindo absurdos |
| atrevido | en_GB-cori-high | 1.05 | 0.5 | 0.6 | 0.95 | Quente, provocador, piscadela brincalhona |
| cínico | en_GB-alan-medium | 1.25 | 0.2 | 0.2 | 0.8 | Frio, plano, sem surpresa |
| zoomer | en_US-lessac-high | 0.90 | 0.85 | 0.9 | 1.15 | Rápido, alto, energia de streamer |

## Variáveis de Ambiente

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

## Observabilidade e Depuração

- Cada chamada de ferramenta registra: prompt enviado, resposta bruta do Ollama, saída analisada, atualização da sessão
- Voz: os logs de depuração mostram os parâmetros do Piper aplicados por humor
- Defina `SENSOR_HUMOR_DEBUG=true` para ver tudo

## Notas de Qualidade

- A qualidade da comédia vem da engenharia de prompts baseada em esqueleto, não de um único ajuste de modelo — cada humor força uma forma previsível. Meça a taxa de sucesso em seu próprio modelo/hardware com `scripts/ab-scorecard.ts` (modelo em SCORECARD.md)
- Barreira de regressão da estabilidade do prompt (v1.2): os prompts de humor da v1 são **congelados** (fixados por `tests/scorecard-frozen-prompts.test.ts` — para alterar um, atualize para `v2`, nunca edite no local). Um conjunto **de forma + segurança** determinístico + estatísticas são executados em `npm test` (sem backend); `npm run scorecard` executa a verificação estatística de desvio em tempo real — a taxa de sucesso por humor é limitada em um intervalo de Wilson com um veredicto de três valores: PASS / FAIL / INCONCLUSIVE e parada antecipada SPRT. Ele mede a conformidade estrutural + segurança, **não** o humor (a pontuação automatizada do humor é pouco confiável — a melhor correlação LLM vs. humano ≈ 0,2)
- Filtro de símile/comparação: regex de pós-validação + repetição e, em seguida, uma alternativa de segurança com voz de humor, se ocorrer uma falha
- Filtro de conformidade de idioma: a comédia é em inglês, portanto, uma barreira não latina (uma sequência contínua de palavras estrangeiras **ou** uma alta proporção de letras não latinas, calculada apenas sobre as letras) sinaliza a saída com código misturado — por exemplo, `qwen2.5:7b` passando para o chinês no meio da linha. Pós-validação + uma repetição apenas em inglês e, em seguida, uma alternativa em inglês sem entrada com `degraded_reason: language` (uma *degradação* de conformidade, distinta de `safety-filter`, portanto, não conta para o contador de falhas do filtro de segurança). Apenas detecção — palavras emprestadas latinas acentuadas (`café`, `résumé`), pontuação, dígitos e emojis nunca a acionam
- Filtro de linguagem agressiva: uma regex determinística de lista de termos é executada como uma *barreira terminal* em **todas** as ferramentas de comédia (incluindo frases de efeito), verificada novamente após cada repetição e aplicada antes que qualquer alternativa seja interpolada. O caminho de detecção primeiro desofusca — NFKC + remoção de largura zero/bidi + dobra de homoglifo + dobra de leetspeak + remoção de separador intra-palavra + remoção de marca de combinação — para que as evasões comuns (inserção de largura zero, semelhantes do alfabeto cirílico/grego, largura total, `r3tard`, `re-tard`, `retárd`) não consigam passar uma ofensa pela fronteira da palavra. Esta é uma **base** determinística, não uma proteção — consulte Segurança e Confiança para o limite honesto
- Determinístico: aplicação do esquema JSON, repetição em caso de saída ruim, herança de humor aplicada em todas as ferramentas
- Voz: Piper oferece separação de prosódia (comprimento/ruído/volume por humor); a alternativa Kokoro é apenas de velocidade
- Apenas ferramenta de desenvolvimento. O humor é subjetivo; desative qualquer humor por meio de variáveis de ambiente ou ajuste os prompts, se necessário

## Segurança e Confiança

- **Local por padrão** — comunica com o Ollama em `localhost` via HTTP. `OLLAMA_HOST` pode apontar para outro local (por exemplo, um Ollama remoto/na nuvem); essa é a única saída externa e é a escolha explícita do operador.
- **Sistema de arquivos** — nenhum por padrão. Com `SENSOR_HUMOR_PERSIST=true`, ele lê/grava um arquivo, `~/.sensor-humor/session.json` (substitui o diretório com `SENSOR_HUMOR_SESSION_DIR`), contendo apenas o estado de comédia da sua sessão (piadas, gags, frases de efeito) — sem credenciais. O arquivo expira automaticamente após 24 horas.
- **Segredos** — nenhum por padrão. Se você apontar `OLLAMA_HOST` para um Ollama remoto/na nuvem, defina `OLLAMA_API_KEY`; ele é lido do ambiente e enviado apenas como um cabeçalho `Bearer` para esse host — nunca é registrado, persistido ou repetido (`debug_status` relata apenas *se* uma chave está definida, nunca seu valor).
- **Sem telemetria** — nada é coletado ou enviado.
- **O estado da sessão está na memória por padrão** — desaparece quando o processo do servidor é interrompido; opte pela persistência em disco com `SENSOR_HUMOR_PERSIST`.
- **Sanitização da entrada** — todo o texto fornecido pelo usuário é normalizado e higienizado antes da injeção de prompt: normalização Unicode NFKC, remoção de caracteres de largura zero/bidirecionais/formatação, homoglifos comuns convertidos para ASCII, remoção de quebras de linha, remoção de caracteres de controle, limite de comprimento.
- **Filtragem de saída (limite determinístico + limite superior honesto)** — uma lista de termos armazenada em base64 é usada como uma barreira de segurança em cada ferramenta de comédia (verificada novamente após cada tentativa, aplicada antes de qualquer alternativa), e uma alternativa de entrada do chamador é reduzida a uma linha estática e sem entrada, em vez de repetir um token proibido. O caminho de detecção primeiro remove a ofuscação, para que as técnicas de evasão comuns sejam neutralizadas: inserção de caracteres de largura zero/bidirecionais, homoglifos (cirílico/grego/largura total), leetspeak (`r3tard`), separadores intra-palavra (`re-tard`, `r.e.t.a.r.d`) e diacríticos combinados (`retárd`). Entradas problemáticas também são removidas de uma sessão persistida/legada adulterada durante o carregamento. **O que NÃO faz:** é um filtro de lista de termos determinístico, não um classificador aprendido — não se defende contra variantes de insultos/palavrões fora da lista/novas, espaçamento de uma letra (`r e t a r d`), arte ASCII/ofuscação espacial, cobertura completa de caracteres Unicode que podem ser confundidos ou ataques semânticos/de "jailbreak". Considere-o como um limite mínimo para uma ferramenta de humor local, e não como uma garantia de moderação para entradas públicas não confiáveis.
- **Formato de erro da ferramenta** — erros de tempo de execução/ferramenta retornam o formato de erro estruturado do estúdio (`{code, message, hint, retryable}`); observe que os erros de validação de *esquema de entrada* (por exemplo, um `mood` inválido) são detectados pelo SDK MCP antes que o manipulador seja executado e aparecem como o erro padrão `InvalidParams` do SDK, e não neste formato.

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
