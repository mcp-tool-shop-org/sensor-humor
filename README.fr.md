<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.md">English</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="logo.png" width="400" alt="sensor-humor" />
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/sensor-humor/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/mcp-tool-shop-org/sensor-humor/ci.yml?branch=main&label=CI" alt="CI"></a>
  <a href="https://github.com/mcp-tool-shop-org/sensor-humor/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License"></a>
  <a href="https://mcp-tool-shop-org.github.io/sensor-humor/"><img src="https://img.shields.io/badge/landing-page-34d399" alt="Landing Page"></a>
</p>

L’outil MCP qui donne à votre LLM un acolyte comique permanent : personnalité basée sur l’humeur, rappels tenant compte de la session, blagues récurrentes, sarcasmes, railleries et expressions toutes faites — le tout avec intégration vocale via Piper TTS (prosodie contrôlée).

Conçu pour les développeurs : critiques constructives sur les problèmes de code, messages d’erreur secs et laconiques, escalade chaotique en cas d’échec de la compilation. N’écrase jamais le ton du LLM hôte — voix distincte qui intervient lorsqu’on l’appelle.

## Fonctionnalités

- 6 humeurs, chacune étant réglée avec un modèle de phrase à compléter pour une sortie prévisible et de haute qualité
- État de la session : blagues récurrentes, tampon circulaire des dernières remarques (maximum 20), mappage des expressions toutes faites — éventuellement conservé sur le disque (`SENSOR_HUMOR_PERSIST`) afin que les rappels survivent à un redémarrage du serveur
- 9 outils : mood_set/mood_get, comic_timing, roast, heckle, catchphrase_generate/catchphrase_callback, debug_status, session_reset
- Backend Ollama local (qwen2.5:7b par défaut, configurable via `SENSOR_HUMOR_MODEL`)
- Appariement vocal : mcp-voice-soundboard avec Piper TTS (réglages de la prosodie : length_scale, noise_scale, noise_w_scale, volume)
- Déterministe : application du schéma JSON, validation, nouvelle tentative en cas de sortie incorrecte, héritage de l’humeur appliqué

## Humeurs

Chaque humeur utilise un modèle de phrase à compléter qui force le modèle à adopter une forme prévisible et de haute qualité.

- **dry** (sec) — laconique, minimaliste, douloureusement évident (par défaut)
- **roast** (sarcasme affectueux) — sarcasmes bienveillants, étiquettes de verdict/diagnostic
- **cynic** (cynique) — réalisme désabusé et silencieusement méchant (« Bien sûr », « Prévisible »)
- **cheeky** (effronté) — taquineries ludiques (« Oh chérie », « Coup audacieux »)
- **chaotic** (chaotique) — phrase bien construite, puis soudaine pirouette absurde (« Selon les informations… »)
- **zoomer** — sarcasme typique de la génération Z, constamment en ligne (réaction, pique, BLOCS EN MAJUSCULES, balise)

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

1. Démarrez Ollama :

```bash
ollama pull qwen2.5:7b
```

2. Démarrez le serveur MCP de sensor-humor (transport stdio) :

```bash
cd sensor-humor
SENSOR_HUMOR_DEBUG=true npm start
```

3. Démarrez voice-soundboard (mode Piper) :

```bash
cd ../mcp-voice-soundboard
VOICE_SOUNDBOARD_ENGINE=piper VOICE_SOUNDBOARD_PIPER_MODEL_DIR=/path/to/piper/models npm start
```

4. Dans votre client MCP (Claude Code, Cursor, etc.) :
- Ajoutez les deux serveurs
- Testez la chaîne :

```
mood_set(style: "roast")
roast(target: "800-line god function")
```

Un sarcasme textuel est renvoyé. Si [mcp-voice-soundboard](https://github.com/mcp-tool-shop-org/mcp-voice-soundboard) est également configuré, `voice_speak(mood: "roast")` le prononce avec la prosodie Piper appropriée à l’humeur.

## Outils

Tous les outils héritent de l’humeur actuelle de la session.

| Outil | Signature | Description |
|------|-----------|-------------|
| `mood_set` | `(style: string)` | Définit l’humeur active (dry, roast, chaotic, cheeky, cynic, zoomer) |
| `mood_get` | `()` | Humeur actuelle + nombre de blagues |
| `comic_timing` | `(text, technique?)` | Réécrit avec une présentation comique (règle des trois, diversion, escalade, rappel, euphémisme, automatique) |
| `roast` | `(target, context?)` | Sarcasme bienveillant dans la voix de l’humeur actuelle, renvoie un niveau de gravité de 1 à 5. Contexte : code, erreur, idée, situation |
| `heckle` | `(target)` | Brève pique acerbe |
| `catchphrase_generate` | `(context?)` | Crée une remarque réutilisable (stockée dans la session) |
| `catchphrase_callback` | `()` | Réutilise l’expression toutes faites la plus utilisée (ou renvoie null) |
| `debug_status` | `()` | État de santé du backend en direct (Ollama accessible, modèle téléchargé), configuration résolue, nombre de tentatives et état de la session |
| `session_reset` | `()` | Réinitialise tout l’état de la session (humeur, blagues, remarques, expressions toutes faites, compteur de tours) |

**Sortie dégradée :** lorsque Ollama est inaccessible ou que le modèle n’est pas téléchargé, les outils comiques renvoient une phrase préenregistrée dans la voix appropriée, ainsi que `degraded: true` et une `degraded_reason` (`connection`, `model-not-found`, `timeout`, `safety-filter`, …) afin qu’un appelant puisse distinguer une blague réelle d’une solution de repli — une génération de modèle authentique ne contient pas de drapeau `degraded`. Appelez `debug_status` pour voir l’accessibilité en direct, le modèle/hôte/délai résolus et les nombres de tentatives. `roast` et `heckle` renvoient également l’« humeur » active ; `catchphrase_generate` renvoie `is_fresh` (`true` = nouvellement créé, `false` = une expression toutes faites existante a été réutilisée).

## Prosodie de l’humeur (voix Piper)

Chaque humeur correspond à une voix Piper + une configuration de prosodie distincte :

| Humeur | Voix | length_scale | noise_scale | noise_w_scale | volume | Caractère |
|------|-------|-------------|-------------|---------------|--------|-----------|
| dry | en_GB-alan-medium | 1.15 | 0.3 | 0.3 | 0.9 | Plat, las, métronomique |
| roast | en_US-ryan-high | 0.95 | 0.667 | 0.8 | 1.0 | Sarcasme confiant |
| chaotic | en_US-lessac-high | 0.88 | 0.8 | 0.9 | 1.1 | Annonceur de nouvelles qui raconte des absurdités |
| cheeky | en_GB-cori-high | 1.05 | 0.5 | 0.6 | 0.95 | Chaleureux, taquin, clin d’œil joueur |
| cynic | en_GB-alan-medium | 1.25 | 0.2 | 0.2 | 0.8 | Froid, plat, aucune surprise |
| zoomer | en_US-lessac-high | 0.90 | 0.85 | 0.9 | 1.15 | Rapide, fort, énergie de streamer |

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

- Chaque appel d’outil enregistre : la requête envoyée, la réponse brute d’Ollama, la sortie analysée, la mise à jour de la session
- Voix : les journaux de débogage affichent les paramètres Piper appliqués par humeur
- Définissez `SENSOR_HUMOR_DEBUG=true` pour tout voir

## Notes sur la qualité

- La qualité de l’humour découle d’une ingénierie des invites basée sur un modèle squelettique, et non sur un seul paramètre du modèle : chaque tonalité impose une structure prévisible. Mesurez le taux de succès sur votre propre modèle/matériel à l’aide de `scripts/ab-scorecard.ts` (modèle dans SCORECARD.md).
- Filtre de similarité/comparaison : expression régulière post-validation + nouvelle tentative, puis une alternative sûre basée sur la tonalité si le problème persiste.
- Le filtre anti-langage grossier fonctionne comme une barrière terminale, de sorte que les insultes ne peuvent pas atteindre l’utilisateur, même lorsqu’une nouvelle tentative tardive en réintroduit une.
- Déterministe : application du schéma JSON, nouvelle tentative en cas de sortie incorrecte, héritage de la tonalité appliqué à tous les outils.
- Voix : Piper offre une séparation prosodique (durée/bruit/volume par tonalité) ; Kokoro ne se concentre que sur la vitesse.
- Uniquement pour l’environnement de développement. L’humour est subjectif ; désactivez toute tonalité via une variable d’environnement ou ajustez les invites si nécessaire.

## Sécurité et confiance

- **Par défaut, fonctionnement local** : communique avec Ollama sur `localhost` via HTTP. `OLLAMA_HOST` peut pointer vers un autre emplacement (par exemple, un Ollama distant/dans le cloud) ; il s’agit de la seule sortie externe et c’est le choix explicite de l’opérateur.
- **Système de fichiers** : aucun par défaut. Avec `SENSOR_HUMOR_PERSIST=true`, il lit/écrit un seul fichier, `~/.sensor-humor/session.json` (remplacez le répertoire avec `SENSOR_HUMOR_SESSION_DIR`), qui contient uniquement l’état humoristique de votre session (éléments, blagues, expressions) : aucun identifiant. Le fichier expire automatiquement après 24 heures.
- **Secrets** : aucun par défaut. Si vous pointez `OLLAMA_HOST` vers un Ollama distant/dans le cloud, définissez `OLLAMA_API_KEY` ; il est lu à partir de l’environnement et envoyé uniquement en tant qu’en-tête `Bearer` vers cet hôte : il n’est jamais enregistré, conservé ou affiché (`debug_status` indique seulement si une clé est définie, jamais sa valeur).
- **Aucune télémétrie** : rien n’est collecté ni envoyé.
- **L’état de la session est stocké en mémoire par défaut** : il disparaît lorsque le processus du serveur s’arrête ; activez la persistance sur disque avec `SENSOR_HUMOR_PERSIST`.
- **Nettoyage des entrées** : tout texte fourni par l’utilisateur est nettoyé avant l’injection d’invites (suppression des sauts de ligne, limitation de la longueur, suppression des caractères de contrôle).
- **Filtrage des sorties** : le filtre anti-langage grossier (liste de termes codée en base64) avec une nouvelle tentative + une barrière de sécurité terminale empêche les insultes d’atteindre l’utilisateur, même lors d’une nouvelle tentative tardive ou à partir d’une entrée contenant des insultes.

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
