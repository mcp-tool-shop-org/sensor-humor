<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.md">English</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
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

```text
Outil MCP qui donne à votre LLM un acolyte comique permanent : personnalité basée sur l’humeur, rappels tenant compte de la session, blagues récurrentes, sarcasmes, railleries et expressions toutes faites — le tout avec intégration vocale via Piper TTS (prosodie contrôlée).

Conçu pour les développeurs : critiques douces sur les problèmes de code, messages d’erreur secs et laconiques, escalade chaotique en cas d’échec de la compilation. N’écrase jamais le ton du LLM hôte — voix distincte qui intervient lorsqu’on lui demande.

## Fonctionnalités

- 6 humeurs, chacune étant réglée avec un modèle de phrase à trous pour une sortie prévisible et de haute qualité
- État de la session : blagues récurrentes, tampon circulaire des dernières remarques (maximum 20), mappage des expressions toutes faites — éventuellement conservé sur le disque (`SENSOR_HUMOR_PERSIST`) afin que les rappels survivent à un redémarrage du serveur
- 9 outils : mood_set/mood_get, comic_timing, roast, heckle, catchphrase_generate/catchphrase_callback, debug_status, session_reset
- Backend Ollama local (qwen2.5:7b par défaut, configurable via `SENSOR_HUMOR_MODEL`)
- Appariement vocal : mcp-voice-soundboard avec Piper TTS (réglages de la prosodie : length_scale, noise_scale, noise_w_scale, volume)
- Déterministe : application du schéma JSON, validation, nouvelle tentative en cas de sortie incorrecte, héritage de l’humeur appliqué

## Humeurs

Chaque humeur utilise un modèle de phrase à trous qui force le modèle à adopter une forme prévisible et de haute qualité.

- **dry** — laconique, minimaliste, douloureusement évident (par défaut)
- **roast** — sarcasmes affectueux, étiquettes de verdict/diagnostic
- **cynic** — cynisme, réalisme silencieux et acerbe (« Bien sûr : », « Prévisiblement : »)
- **cheeky** — taquineries ludiques (« Oh chérie », « Coup audacieux »)
- **chaotic** — phrase bien construite, puis rebondissement absurde soudain (« Selon les informations… »)
- **zoomer** — sarcasme typique de la génération Z, constamment en ligne (réaction, pique, BLOC DE MAJUSCULES, balise)

Toutes les humeurs héritent de la voix + de la prosodie via mcp-voice-soundboard (Piper recommandé).

## Prérequis

- Node.js 18+
- Ollama en cours d’exécution localement avec `qwen2.5:7b` téléchargé (ou définissez `SENSOR_HUMOR_MODEL` pour un autre modèle)
- mcp-voice-soundboard installé et en cours d’exécution (backend Piper recommandé, facultatif)
- @modelcontextprotocol/sdk

## Installation

```bash
npm install @mcptoolshop/sensor-humor
# or install a local dev checkout
npm install /path/to/sensor-humor
```

### Docker

Une image de conteneur est publiée sur GHCR à chaque version. sensor-humor communique via MCP sur stdio, donc exécutez-le en mode interactif et pointez-le vers un Ollama accessible :

```bash
docker run -i --rm -e OLLAMA_HOST=http://host.docker.internal:11434 \
  ghcr.io/mcp-tool-shop-org/sensor-humor:latest
```

## Démarrage rapide

1. Démarrez Ollama :

```bash
ollama pull qwen2.5:7b
```

2. Démarrez le serveur MCP de sensor-humor (transport stdio) :

```bash
cd sensor-humor
SENSOR_HUMOR_DEBUG=true npm start
```

3. Démarrez voice-soundboard (mode Piper) :

```bash
cd ../mcp-voice-soundboard
VOICE_SOUNDBOARD_ENGINE=piper VOICE_SOUNDBOARD_PIPER_MODEL_DIR=/path/to/piper/models npm start
```

4. Dans votre client MCP (Claude Code, Cursor, etc.) :
- Ajoutez les deux serveurs
- Testez la chaîne :

```
mood_set(style: "roast")
roast(target: "800-line god function")
```

Sarcasme textuel renvoyé. Si [mcp-voice-soundboard](https://github.com/mcp-tool-shop-org/mcp-voice-soundboard) est également configuré, `voice_speak(mood: "roast")` le prononce avec la prosodie Piper appropriée à l’humeur.

## Outils

Tous les outils héritent de l’humeur actuelle de la session.

| Outil | Signature | Description |
|------|-----------|-------------|
| `mood_set` | `(style: string)` | Définit l’humeur active (dry, roast, chaotic, cheeky, cynic, zoomer) |
| `mood_get` | `()` | Humeur actuelle + nombre de blagues |
| `comic_timing` | `(text, technique?)` | Réécrit avec une présentation comique (règle des trois, diversion, escalade, rappel, euphémisme, automatique) |
| `roast` | `(target, context?)` | Sarcasme affectueux dans la voix de l’humeur actuelle, renvoie un niveau de gravité de 1 à 5. Contexte : code, erreur, idée, situation |
| `heckle` | `(target)` | Brève pique acerbe |
| `catchphrase_generate` | `(context?)` | Crée une phrase réutilisable (stockée dans la session) |
| `catchphrase_callback` | `()` | Réutilise l’expression toutes faites la plus utilisée (ou null) |
| `debug_status` | `()` | État de santé du backend en direct (Ollama accessible, modèle téléchargé), configuration résolue, nombre de tentatives et état de la session |
| `session_reset` | `()` | Réinitialise tout l’état de la session (humeur, blagues, phrases, expressions toutes faites, compteur de tours) |

**Sortie dégradée (texte, pouvant être branché par une machine) :** lorsqu’un outil ne peut pas renvoyer une génération de modèle authentique, il renvoie une phrase préenregistrée dans la voix appropriée, ainsi que `degraded: true` et une `degraded_reason` provenant d’un **ensemble fermé** sur lequel un agent consommateur peut effectuer une branche exhaustive : `safety-filter` (un juron/une comparaison/une fuite de métadonnées a été substitué) · `connection` · `timeout` · `model-not-found` · `auth` · `rate-limit` · `server` · `http` · `json-parse` · `validation` · `exhausted` · `unknown`. Une génération authentique ne contient **pas** de drapeau `degraded` — son absence est le signal positif. **Tous** les outils comiques en contiennent un, y compris `catchphrase_callback` (un rappel substitué pour des raisons de sécurité est signalé, mais n’est jamais présenté comme authentique). `roast`/`heckle` renvoient également l’humeur active ; `catchphrase_generate` renvoie `is_fresh` (`true` = nouvellement créé, `false` = une expression toutes faites existante réutilisée).

Appelez `debug_status` pour obtenir une réponse sur l’état en un seul appel : accessibilité en direct (plus `unreachable_reason` lorsque cela est impossible — `connection` par rapport à `auth` par rapport à `timeout`), le modèle/hôte/délai résolus, les statistiques de génération, y compris à la fois `fallback_calls` (backend) **et** `safety_filter_fires` (fréquence à laquelle le seuil de sécurité a substitué une phrase), et un `prompt_fingerprint` + `active_prompt_key` qui lient le texte du *prompt actif* + le modèle afin que la dérive de la sortie puisse être attribuée à un changement de prompt par rapport au modèle — et une rétrogradation silencieuse de la version du prompt (une version 2 demandée qui est revenue à la version 1) est visible.

## Prosodie de l’humeur (voix Piper)

Chaque humeur correspond à une voix Piper + une configuration de prosodie distincte :

| Humeur | Voix | length_scale | noise_scale | noise_w_scale | volume | Caractère |
|------|-------|-------------|-------------|---------------|--------|-----------|
| dry | en_GB-alan-medium | 1.15 | 0.3 | 0.3 | 0.9 | Plat, las, métronome |
| roast | en_US-ryan-high | 0.95 | 0.667 | 0.8 | 1.0 | Sarcasme confiant |
| chaotic | en_US-lessac-high | 0.88 | 0.8 | 0.9 | 1.1 | Animateur de journal télévisé qui raconte des absurdités |
| cheeky
``` | en_GB-cori-high | 1.05 | 0.5 | 0.6 | 0.95 | Chaleureux, taquin, clin d’œil joueur |
| cynique | en_GB-alan-medium | 1.25 | 0.2 | 0.2 | 0.8 | Froid, plat, aucune surprise |
| jeune génération (zoomer) | en_US-lessac-high | 0.90 | 0.85 | 0.9 | 1.15 | Rythmé, bruyant, énergie de streamer |

## Variables d’environnement

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

## Observabilité et débogage

- Chaque appel à un outil est enregistré : requête envoyée, réponse brute d’Ollama, résultat analysé, mise à jour de la session
- Voix : les journaux de débogage affichent les paramètres Piper appliqués en fonction de l’humeur
- Définissez `SENSOR_HUMOR_DEBUG=true` pour tout voir

## Notes sur la qualité

- La qualité comique provient d’une conception de requêtes basée sur un modèle, et non d’un seul paramètre du modèle ; chaque humeur impose une forme prévisible. Mesurez le taux de succès sur votre propre modèle/matériel avec `scripts/ab-scorecard.ts` (modèle dans SCORECARD.md)
- Contrôle de régression de la stabilité des requêtes (v1.2) : les requêtes d’humeur v1 sont **figées** (définies par `tests/scorecard-frozen-prompts.ts` — pour en modifier une, passez à `v2`, ne modifiez jamais directement). Un ensemble de référence déterministe **forme + sécurité** et des statistiques sont exécutés dans `npm test` (pas de backend) ; `npm run scorecard` exécute la vérification statistique en direct des dérives — le taux de succès par humeur est contrôlé à l’aide d’un intervalle de Wilson avec un verdict à trois valeurs : PASSÉ / ÉCHOUÉ / INCONCLUSIF et arrêt précoce SPRT. Il mesure la conformité structurelle + la sécurité, **pas** l’humour (la notation automatisée de l’humour est peu fiable — meilleure corrélation LLM par rapport à un humain ≈ 0,2)
- Filtre de similitudes/comparaisons : regex de post-validation + nouvelle tentative, puis une alternative sûre basée sur l’humeur si une fuite persiste
- Filtre de langage violent : une liste déterministe de termes est utilisée comme un *contrôle final* pour **tous** les outils comiques (y compris les slogans), vérifiée à nouveau après chaque nouvelle tentative et appliquée avant toute alternative. Le chemin de détection désambiguïse d’abord — NFKC + suppression des caractères zéro-largeur/bidirectionnels + pliage des homoglyphes + pliage du langage « leet » + suppression des séparateurs intra-mots + suppression des marques combinatoires — afin que les échappatoires courants (insertion de largeur nulle, ressemblances cyrilliques/grecques, caractères larges, `r3tard`, `re-tard`, `retárd`) ne puissent pas contourner la limite du mot. Il s’agit d’un **seuil** déterministe, et non d’une barrière de sécurité — voir Sécurité et confiance pour connaître le seuil réel
- Déterministe : application du schéma JSON, nouvelle tentative en cas de résultat incorrect, héritage de l’humeur appliqué à tous les outils
- Voix : Piper fournit une séparation prosodique (durée/bruit/volume par humeur) ; Kokoro ne se base que sur la vitesse
- Uniquement pour les outils de développement. L’humour est subjectif ; désactivez toute humeur via l’environnement ou ajustez les requêtes si nécessaire

## Sécurité et confiance

- **Par défaut, fonctionnement local** — communique avec Ollama sur `localhost` via HTTP. `OLLAMA_HOST` peut pointer vers un autre emplacement (par exemple, un Ollama distant/dans le cloud) ; il s’agit de la seule sortie externe et du choix explicite de l’opérateur
- **Système de fichiers** — aucun par défaut. Avec `SENSOR_HUMOR_PERSIST=true`, il lit/écrit un fichier, `~/.sensor-humor/session.json` (remplacez le répertoire par `SENSOR_HUMOR_SESSION_DIR`), qui contient uniquement l’état comique de votre session (éléments, blagues, slogans) — aucun identifiant. Le fichier expire automatiquement après 24 heures
- **Secrets** — aucun par défaut. Si vous pointez `OLLAMA_HOST` vers un Ollama distant/dans le cloud, définissez `OLLAMA_API_KEY` ; il est lu à partir de l’environnement et envoyé uniquement en tant qu’en-tête `Bearer` vers cet hôte — jamais enregistré, conservé ou affiché (`debug_status` indique seulement si une clé est définie, jamais sa valeur)
- **Pas de télémétrie** — rien n’est collecté ni envoyé
- **L’état de la session est stocké en mémoire par défaut** — il disparaît lorsque le processus du serveur s’arrête ; activez la persistance sur disque avec `SENSOR_HUMOR_PERSIST`
- **Sanitisation des entrées** — tout texte fourni par l’utilisateur est normalisé et nettoyé avant l’injection de requêtes : pliage Unicode NFKC, suppression des caractères zéro-largeur/bidirectionnels/de format, pliage des homoglyphes courants vers ASCII, suppression des sauts de ligne, suppression des caractères de contrôle, limitation de la longueur
- **Filtrage des sorties (seuil déterministe + seuil réaliste)** — une liste de termes stockée au format base64 est utilisée comme un filtre de sécurité final pour tous les outils comiques (vérifiée à nouveau après chaque nouvelle tentative, appliquée avant toute alternative), et une alternative basée sur l’entrée du demandeur se réduit à une ligne statique, sans entrée, plutôt que d’afficher un terme interdit. Le chemin de détection désambiguïse d’abord, afin que les échappatoires courants soient neutralisés : insertion de largeur nulle/bidirectionnelle, homoglyphes (cyrilliques/grecs/caractères larges), langage « leet » (`r3tard`), séparateurs intra-mots (`re-tard`, `r.e.t.a.r.d`) et diacritiques combinés (`retárd`). Les entrées incorrectes sont également supprimées d’une session persistante altérée ou obsolète lors du chargement. **Ce que cela ne fait PAS :** il s’agit d’un filtre de liste de termes déterministe, et non d’un classificateur appris — il ne se protège pas contre les variantes d’insultes hors liste/nouvelles, l’espacement à une lettre (`r e t a r d`), l’art ASCII / l’obfuscation spatiale, la couverture Unicode complète ou les attaques sémantiques/de contournement. Considérez-le comme un seuil minimal pour un outil de développement local, et non comme une garantie de modération pour des entrées publiques non fiables
- **Forme d’erreur de l’outil** — les erreurs d’exécution/d’outil renvoient la forme d’erreur structurée du studio (`{code, message, hint, retryable}`); notez que les erreurs de *validation du schéma d’entrée* (par exemple, une humeur non valide) sont détectées par le SDK MCP avant l’exécution du gestionnaire et apparaissent sous la forme de l’erreur standard `InvalidParams` du SDK, et non de cette forme

## Architecture

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

## Développement

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

## Licence

MIT

---

Créé par <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
