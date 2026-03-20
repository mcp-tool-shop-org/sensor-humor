<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.md">English</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/sensor-humor/readme.png" width="600" alt="sensor-humor" />
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/sensor-humor/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/sensor-humor/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/mcp-tool-shop-org/sensor-humor/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License"></a>
  <a href="https://mcp-tool-shop-org.github.io/sensor-humor/"><img src="https://img.shields.io/badge/landing-page-34d399" alt="Landing Page"></a>
</p>

Un outil MCP qui donne à votre LLM un acolyte comique persistant : personnalité basée sur l'humeur, rappels sensibles au contexte de session, blagues récurrentes, railleries, insultes et expressions types, le tout avec une intégration vocale via Piper TTS (avec contrôle de la prosodie).

Conçu pour les développeurs : critiques subtiles du code, messages d'erreur secs et impersonnels, chaos total en cas d'échec de la compilation. Ne modifie jamais le ton du LLM hôte ; voix distincte qui intervient lorsqu'elle est appelée.

## Fonctionnalités

- 6 humeurs : neutre (par défaut), moqueur, absurde, bienveillant, sarcastique, déjanté
- État de session : blagues récurrentes, tampon circulaire des dernières phrases (max 20), mappage des expressions types
- Outils : mood.set/get, comic_timing, roast, heckle, catchphrase.generate/callback
- Backend Ollama local (qwen2.5:7b-instruct recommandé)
- Appariement vocal : mcp-voice-soundboard avec Piper TTS (paramètres de prosodie : length_scale, noise_scale, noise_w_scale, volume)
- Déterministe : application et validation de schéma JSON, nouvelle tentative en cas de résultat incorrect, journalisation de débogage

## Prérequis

- Node.js 18+
- Ollama en cours d'exécution localement avec `qwen2.5:7b-instruct` installé
- mcp-voice-soundboard installé et en cours d'exécution (backend Piper recommandé)
- @modelcontextprotocol/sdk

## Installation

```bash
npm install @mcp-tool-shop/sensor-humor
# or link local dev version
npm link /path/to/sensor-humor
```

## Démarrage rapide

1. Démarrer Ollama :

```bash
ollama run qwen2.5:7b-instruct
```

2. Démarrer le serveur MCP sensor-humor (transport stdio) :

```bash
cd sensor-humor
SENSOR_HUMOR_DEBUG=true npm start
```

3. Démarrer le voice-soundboard (mode Piper) :

```bash
cd ../mcp-voice-soundboard
VOICE_SOUNDBOARD_ENGINE=piper VOICE_SOUNDBOARD_PIPER_MODEL_DIR=/path/to/piper/models npm start
```

4. Dans votre client MCP (Claude Code, Cursor, etc.) :
- Ajouter les deux serveurs
- Tester la chaîne :

```
mood.set(style: "roast")
roast(target: "800-line god function")
```

Une critique moqueuse est renvoyée, puis `voice_speak(mood: "roast")` la prononce avec une énergie sarcastique et confiante.

## Outils

Tous les outils héritent de l'humeur actuelle de la session.

| Outil | Signature | Description |
|------|-----------|-------------|
| `mood.set` | `(style: string)` | Définir l'humeur active (neutre, moqueur, absurde, bienveillant, sarcastique, déjanté) |
| `mood.get` | `()` | Humeur actuelle + nombre de blagues |
| `comic_timing` | `(text, technique?)` | Réécrire avec une livraison comique (règle des trois, diversion, escalade, rappel, euphémisme, automatique) |
| `roast` | `(target, context?)` | Critique affectueuse avec motif de verdict/étiquette, renvoie un niveau de gravité de 1 à 5. Contexte : code, erreur, idée, situation |
| `heckle` | `(target)` | Brève remarque acerbe |
| `catchphrase.generate` | `(context?)` | Créer un élément réutilisable (stocké dans la session) |
| `catchphrase.callback` | `()` | Réutiliser l'expression type la plus utilisée (ou null) |

## Prosodie de l'humeur (Voix Piper)

Chaque humeur correspond à une voix Piper distincte et à une configuration de prosodie :

| Humeur | Voix | length_scale | noise_scale | noise_w_scale | volume | Caractère |
|------|-------|-------------|-------------|---------------|--------|-----------|
| neutre | en_GB-alan-medium | 1.15 | 0.3 | 0.3 | 0.9 | Plat, las, métrique |
| moqueur | en_US-ryan-high | 0.95 | 0.667 | 0.8 | 1.0 | Sarcasme confiant |
| absurde | en_US-lessac-high | 0.88 | 0.8 | 0.9 | 1.1 | Erratique, imprévisible |
| bienveillant | en_GB-cori-high | 1.05 | 0.5 | 0.6 | 0.95 | Énergie chaleureuse et douce de "papa" |
| sarcastique | en_GB-alan-medium | 1.25 | 0.2 | 0.2 | 0.8 | Ton monocorde et blasé |
| déjanté | en_US-lessac-high | 0.82 | 0.9 | 1.0 | 1.2 | Rapide, bruyant, chaotique |

## Variables d'environnement

```bash
# sensor-humor
SENSOR_HUMOR_DEBUG=true                # verbose prompt/response dumps
SENSOR_HUMOR_OBSERVE=true              # full chain trace (prompt -> text -> piper params)
SENSOR_HUMOR_PROMPT_VERSION=1          # prompt set version (for A/B tuning)

# voice integration (in voice-soundboard)
VOICE_SOUNDBOARD_ENGINE=piper          # or kokoro (default)
VOICE_SOUNDBOARD_PIPER_MODEL_DIR=/path/to/piper/models
```

## Observabilité et débogage

- Chaque appel d'outil enregistre : invite envoyée, réponse Ollama brute, résultat analysé, mise à jour de la session
- Voix : les journaux de débogage montrent les paramètres Piper appliqués pour chaque humeur
- Définir `SENSOR_HUMOR_DEBUG=true` pour voir tout

## Notes de qualité

- Taux de réussite comique : ~70-75 % dans les sessions réelles (neutre le plus fort, moqueur juste derrière)
- Déterministe : application du schéma JSON, 1 nouvelle tentative en cas de résultat invalide, validation post-exécution pour les motifs interdits
- Voix : Piper offre une séparation réelle de la prosodie (et non pas seulement de la vitesse) ; Kokoro est une simple variation de vitesse
- Ne pas utiliser pour les bots de production ; outil de développement uniquement. L'humour est subjectif ; ajuster les invites si nécessaire.

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
