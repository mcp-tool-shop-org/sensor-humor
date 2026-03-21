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

Cet outil MCP offre à votre LLM un compagnon comique persistant : personnalité basée sur l'humeur, rappels sensibles au contexte de session, blagues récurrentes, railleries, insultes et expressions types, le tout avec intégration vocale via Piper TTS (contrôle de la prosodie).

Conçu pour les développeurs : critiques subtiles du code, messages d'erreur secs et impersonnels, chaos total en cas d'échec de la compilation. Ne modifie jamais le ton du LLM hôte ; voix distincte qui intervient lorsque cela est demandé.

## Fonctionnalités

- 6 humeurs : neutre (par défaut), moqueur, absurde, bienveillant, sarcastique, déchaîné
- État de session : blagues récurrentes, tampon circulaire des dernières phrases (max 20), mappage des expressions types
- Outils : mood.set/get, comic_timing, roast, heckle, catchphrase.generate/callback
- Backend Ollama local (qwen2.5:7b-instruct recommandé)
- Appariement vocal : mcp-voice-soundboard avec Piper TTS (paramètres de prosodie : length_scale, noise_scale, noise_w_scale, volume)
- Déterministe : application et validation de schéma JSON, nouvelle tentative en cas de résultat incorrect, journalisation de débogage

## Modes

Chaque mode utilise une structure de phrase avec des espaces à remplir, ce qui force le modèle à adopter une forme prévisible et de haute qualité.

- **neutre** — ton neutre, minimaliste, évidement (par défaut)
- **sarcastique** — critiques affectueuses et acerbes, étiquettes de diagnostic/évaluation
- **cynique** — réalisme désabusé et subtilement méchant ("Bien sûr :", "Prévisiblement :")
- **espiègle** — taquineries ludiques et malicieuses ("Oh, mon chéri", "Audace !")
- **chaotique** — phrase cohérente, suivie d'un rebondissement absurde ("Apparemment...")
- **génération Z** — sarcasme acerbe typique de la génération Z, constamment en ligne (réaction, pique, MAJUSCULES, mention)

Tous les modes héritent de la voix et de la prosodie via mcp-voice-soundboard (Piper est recommandé).

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

2. Démarrer le serveur sensor-humor MCP (transport stdio) :

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

Une "insulte" est renvoyée, puis `voice_speak(mood: "roast")` la prononce avec une énergie sarcastique et confiante.

## Outils

Tous les outils héritent de l'humeur actuelle de la session.

| Outil | Signature | Description |
|------|-----------|-------------|
| `mood.set` | `(style: string)` | Définir le mode actif (neutre, sarcastique, chaotique, espiègle, cynique, génération Z). |
| `mood.get` | `()` | Humeur actuelle + nombre de blagues |
| `comic_timing` | `(text, technique?)` | Réécrire avec une livraison comique (règle des trois, diversion, escalade, rappel, euphémisme, automatique) |
| `roast` | `(target, context?)` | Critique affectueuse dans la voix du mode actuel, avec un niveau de sévérité de 1 à 5. Contexte : code, erreur, idée, situation. |
| `debug_status` | `()` | Supprimer l'état de la session actuelle, la configuration du mode et le backend vocal. |
| `heckle` | `(target)` | Brève remarque acerbe |
| `catchphrase.generate` | `(context?)` | Créer un élément réutilisable (stocké dans la session) |
| `catchphrase.callback` | `()` | Réutiliser l'expression type la plus utilisée (ou null) |

## Prosodie de l'humeur (voix Piper)

Chaque humeur est associée à une voix Piper distincte et à une configuration de prosodie :

| Humeur | Voix | length_scale | noise_scale | noise_w_scale | volume | Caractère |
|------|-------|-------------|-------------|---------------|--------|-----------|
| neutre | en_GB-alan-medium | 1.15 | 0.3 | 0.3 | 0.9 | Plat, las, métrique |
| moqueur | en_US-ryan-high | 0.95 | 0.667 | 0.8 | 1.0 | Sarcasme confiant |
| chaotique | en_US-lessac-high | 0.88 | 0.8 | 0.9 | 1.1 | Présentateur de nouvelles débitant des absurdités. |
| espiègle | en_GB-cori-high | 1.05 | 0.5 | 0.6 | 0.95 | Taquin, joueur, clin d'œil. |
| cynique | en_GB-alan-medium | 1.25 | 0.2 | 0.2 | 0.8 | Froid, plat, aucune surprise. |
| génération Z | en_US-lessac-high | 0.90 | 0.85 | 0.9 | 1.15 | Rapide, bruyant, énergie de streamer. |

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

- Taux de réussite comique : 70-100 % par mode/outil lors de sessions de développement réelles (ingénierie de prompts basée sur une structure).
- Filtre de comparaison/analogie : expression régulière de validation post-traitement + tentative/solution de repli pour éviter les erreurs dans les modes neutre/espiègle.
- Tous les modes atteignent un taux de 70 % ou plus lors de sessions réelles ; les modes sarcastique, cynique et chaotique atteignent souvent 90-100 %.
- Déterministe : application stricte du schéma JSON, nouvelle tentative en cas de résultat incorrect, héritage du mode appliqué à tous les outils.
- Voix : Piper permet une séparation de la prosodie (longueur/bruit/volume par mode) ; Kokoro est une solution de repli axée uniquement sur la vitesse.
- Outil d'assistance pour les développeurs uniquement. L'humour est subjectif ; désactivez tout mode via les variables d'environnement ou ajustez les prompts si nécessaire.

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
