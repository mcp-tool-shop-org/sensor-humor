<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.md">English</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
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

L’outil MCP qui donne à votre LLM un partenaire comique persistant : personnalité basée sur l’humeur, rappels tenant compte de la session, blagues récurrentes, sarcasmes, railleries et phrases toutes faites, le tout avec intégration vocale via Piper TTS (prosodie contrôlée).

Conçu pour les développeurs : critiques subtiles sur les problèmes de code, messages d’erreur secs et laconiques, escalade chaotique en cas d’échec de la compilation. N’écrase jamais le ton du LLM hôte, mais propose une voix distincte qui intervient lorsqu’on le lui demande.

## Fonctionnalités

- 6 humeurs, chacune étant réglée avec un modèle de phrase à compléter pour une sortie prévisible et de haute qualité
- État de la session : blagues récurrentes, tampon circulaire des dernières répliques (maximum 20), mappage des phrases toutes faites, qui peuvent être sauvegardées sur le disque (`SENSOR_HUMOR_PERSIST`) afin que les rappels survivent à un redémarrage du serveur
- 11 outils : mood_set/mood_get, comic_timing, roast, heckle, catchphrase_generate/catchphrase_callback, running_gag, debug_status, debug_chain, session_reset
- Backend Ollama local (qwen2.5:7b par défaut, configurable via `SENSOR_HUMOR_MODEL`)
- Appariement vocal : mcp-voice-soundboard avec Piper TTS (réglages de la prosodie : length_scale, noise_scale, noise_w_scale, volume)
- Déterministe : application du schéma JSON, validation, nouvelle tentative en cas de sortie incorrecte, application de l’héritage de l’humeur

## Humeurs

Chaque humeur utilise un modèle de phrase à compléter qui force le modèle à adopter une forme prévisible et de haute qualité.

- **dry** (sec) : laconique, minimaliste, douloureusement évident (par défaut)
- **roast** (sarcasme) : sarcasmes affectueux et pointus, étiquettes de verdict/diagnostic
- **cynic** (cynique) : réalisme cynique et discret (« Bien sûr », « Prévisiblement »)
- **cheeky** (effronté) : taquineries et espiègleries (« Oh, mon chéri », « Coup audacieux »)
- **chaotic** (chaotique) : phrase ancrée, puis rebondissement absurde soudain (« Selon les informations… »)
- **zoomer** : sarcasme typique de la génération Z, constamment en ligne (réaction, pique, BLOC EN MAJUSCULES, balise)

Toutes les humeurs héritent de la voix et de la prosodie via mcp-voice-soundboard (Piper recommandé).

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

Une image de conteneur est publiée sur GHCR à chaque version. sensor-humor communique via MCP sur stdio, il est donc préférable de l’exécuter de manière interactive et de le connecter à un Ollama accessible :

```bash
docker run -i --rm -e OLLAMA_HOST=http://host.docker.internal:11434 \
  ghcr.io/mcp-tool-shop-org/sensor-humor:latest
```

### Configurez votre client MCP

Enregistrez sensor-humor en tant que serveur stdio dans la configuration MCP de votre client. Pour Claude Code / Claude Desktop (`claude_desktop_config.json`) ou toute configuration de type `mcpServers` :

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

Le serveur lit sa configuration à partir de ce bloc `env` (ou du shell qui le lance) ; il ne charge **pas** automatiquement un fichier `.env`. Consultez [`.env.example`](.env.example) pour toutes les variables prises en charge. Si vous avez installé le package globalement, utilisez `"command": "sensor-humor"` sans `args`.

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
| `mood_get` | `()` | Humeur actuelle + nombre de blagues + `allowed_techniques` pour l’humeur active |
| `comic_timing` | `(text, technique?)` | Réécrit avec une présentation comique (règle de trois, diversion, escalade, rappel, sous-entendu, automatique) |
| `roast` | `(target, context?, technique?)` | Sarcasme affectueux dans la voix de l’humeur actuelle, renvoie une sévérité de 1 à 5. Contexte : code, erreur, idée, situation. Le surcalage de technique facultatif doit être valide pour l’humeur actuelle (les combinaisons non valides sont refusées). |
| `heckle` | `(target, technique?)` | Brève pique. Surcalage de technique facultatif, même matrice humeur × technique que le sarcasme. |
| `catchphrase_generate` | `(context?)` | Crée un élément réutilisable (stocké dans la session) |
| `catchphrase_callback` | `()` | Réutilise la phrase toutes faites la plus utilisée (ou null) |
| `running_gag` | `(setup, tag)` | Introduit une blague récurrente à laquelle le partenaire comique peut faire référence plus tard (sécurité garantie). Devient un candidat au rappel après `SENSOR_HUMOR_GAG_MIN_DISTANCE` tours ; disparaît après `SENSOR_HUMOR_GAG_MAX_FIRES` utilisations. |
| `debug_status` | `()` | État de santé du backend en direct (Ollama accessible, modèle téléchargé), configuration résolue, nombre de tentatives et d’échecs, et état de la session |
| `debug_chain` | `(limit?)` | Dernières N traces par appel (outil, humeur, entrée, empreinte de l’invite, nouvelles tentatives, validateurs déclenchés, latence) : un seul appel reconstruit le pipeline de génération |
| `session_reset` | `()` | Réinitialise tout l’état de la session (humeur, blagues, éléments, phrases toutes faites, traces, compteur de tours) |

**Sortie dégradée (typée, pouvant être traitée par une machine) :** lorsqu’un outil ne peut pas renvoyer une génération de modèle authentique, il renvoie une phrase préenregistrée dans la voix appropriée, ainsi que `degraded: true` et un `degraded_reason` provenant d’un **ensemble fermé** sur lequel un agent consommateur peut effectuer une branchement exhaustif : `safety-filter` (un juron/une comparaison/une fuite de métadonnées a été substitué) · `language` (le modèle a basculé hors de l’alphabet latin et une phrase anglaise a été substituée, ce qui est une dégradation de la conformité, et non une dégradation de la sécurité) · `connection` · `timeout` · `model-not-found` · `auth` · `rate-limit` · `server` · `http` · `json-parse` · `validation` · `exhausted` · `unknown`. Une génération authentique ne comporte **aucun** indicateur `degraded` ; son absence est le signal positif. **Tous** les outils comiques comportent cet indicateur, y compris `catchphrase_callback` (un rappel substitué pour des raisons de sécurité est signalé, mais il n’est jamais présenté comme authentique). `roast`/`heckle` font également écho à l’humeur active `mood` ; `catchphrase_generate` renvoie `is_fresh` (`true` = nouvellement créé, `false` = une phrase toutes faites de la session réutilisée).

Appelez le `debug_status` pour obtenir une réponse rapide sur les questions de santé : disponibilité en temps réel (plus `unreachable_reason` en cas de panne — `connection` par rapport à `auth` par rapport à `timeout`), modèle/hôte/délai résolus, statistiques de génération incluant à la fois `fallback_calls` (backend) **et** `safety_filter_fires` (fréquence à laquelle le seuil de sécurité a remplacé une ligne), et un `prompt_fingerprint` + `active_prompt_key` qui lient le texte de l’invite *active* + le modèle, de sorte que la dérive de la sortie est attribuable à un changement d’invite par rapport au modèle, et une mise à niveau silencieuse de la version de l’invite (une version v2 demandée qui est revenue à la version v1) est visible.

## Prosodie de l’humeur (voix Piper)

Chaque humeur correspond à une voix Piper + une configuration de prosodie distinctes :

| Humeur | Voix | length_scale | noise_scale | noise_w_scale | volume | Personnage |
|------|-------|-------------|-------------|---------------|--------|-----------|
| dry | en_GB-alan-medium | 1.15 | 0.3 | 0.3 | 0.9 | Plat, las, rythmique |
| roast | en_US-ryan-high | 0.95 | 0.667 | 0.8 | 1.0 | Sarcasme confiant |
| chaotic | en_US-lessac-high | 0.88 | 0.8 | 0.9 | 1.1 | Présentateur de journal télévisé débitant des absurdités |
| cheeky | en_GB-cori-high | 1.05 | 0.5 | 0.6 | 0.95 | Chaleureux, taquin, clin d’œil joueur |
| cynic | en_GB-alan-medium | 1.25 | 0.2 | 0.2 | 0.8 | Froid, plat, aucune surprise |
| zoomer | en_US-lessac-high | 0.90 | 0.85 | 0.9 | 1.15 | Rapide, fort, énergie de streamer |

## Variables d’environnement

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

## Observabilité et débogage

- Chaque appel d’outil enregistre : invite envoyée, réponse brute d’Ollama, sortie analysée, mise à jour de la session
- Voix : les journaux de débogage affichent les paramètres Piper appliqués par humeur
- Définissez `SENSOR_HUMOR_DEBUG=true` pour tout voir

## Notes sur la qualité

- La qualité comique provient de l’ingénierie d’invites basée sur un squelette, et non d’un seul paramètre du modèle : chaque humeur impose une forme prévisible. Mesurez le taux de réussite sur votre propre modèle/matériel avec `scripts/ab-scorecard.ts` (modèle dans SCORECARD.md)
- Barrière de régression de la stabilité de l’invite (v1.2) : les invites d’humeur v1 sont **figées** (fixées par `tests/scorecard-frozen-prompts.test.ts` — pour en modifier une, passez à `v2`, ne modifiez jamais directement). Un ensemble **forme + sécurité** déterministe + des statistiques sont exécutées dans `npm test` (pas de backend) ; `npm run scorecard` exécute la vérification statistique en direct de la dérive — le taux de réussite par humeur est limité par un intervalle de Wilson avec un verdict à trois valeurs : RÉUSSI / ÉCHOUÉ / INCONCLUSIF et arrêt précoce SPRT. Il mesure la conformité structurelle + la sécurité, **pas** l’humour (le score d’humour automatisé est peu fiable — la meilleure corrélation LLM par rapport à l’humain ≈ 0,2)
- Filtre de similitude/comparaison : regex de post-validation + nouvelle tentative, puis une alternative de sécurité vocalisée par l’humeur si une fuite persiste
- Filtre de conformité linguistique : l’humour est en anglais, donc une barrière non latine (une séquence continue de mots étrangers **ou** un ratio élevé de lettres non latines, calculé uniquement sur les lettres) signale une sortie avec changement de code — par exemple, `qwen2.5:7b` qui glisse dans le chinois au milieu d’une ligne. Post-validation + une nouvelle tentative uniquement en anglais, puis une alternative en anglais sans entrée avec `degraded_reason: language` (une dégradation de la *conformité*, distincte de `safety-filter`, elle ne compte donc pas dans le compteur de déclenchement du filtre de sécurité). Détection uniquement — les mots d’emprunt latins accentués (`café`, `résumé`), la ponctuation, les chiffres et les emojis ne la déclenchent jamais
- Filtre de langage violent : une regex déterministe de liste de termes s’exécute comme une *barrière terminale* sur **chaque** outil comique (y compris les slogans), est vérifiée à nouveau après chaque nouvelle tentative et est appliquée avant l’interpolation de toute alternative. Le chemin de détection dés-obfusque d’abord — NFKC + suppression des espaces zéro/bidi + pliage des homoglyphes + pliage du langage geek + suppression des séparateurs intra-mots + suppression des marques de combinaison — de sorte que les échappatoires courants (insertion d’espaces zéro, ressemblances cyrilliques/grecques, caractères de largeur complète, `r3tard`, `re-tard`, `retárd`) ne peuvent pas faire passer un terme vulgaire au-delà de la limite du mot. Il s’agit d’un **seuil** déterministe, et non d’une garde-fou — voir Sécurité et confiance pour le seuil réel
- Déterministe : application du schéma JSON, nouvelle tentative en cas de sortie incorrecte, application de l’héritage de l’humeur sur tous les outils
- Voix : Piper offre une séparation de la prosodie (longueur/bruit/volume par humeur) ; Kokoro offre une alternative uniquement en termes de vitesse
- Uniquement pour l’outil de développement. L’humour est subjectif ; désactivez toute humeur via l’environnement ou ajustez les invites si nécessaire

## Sécurité et confiance

- **Par défaut, fonctionnement local** : communique avec Ollama sur `localhost` via HTTP. `OLLAMA_HOST` peut pointer vers un autre emplacement (par exemple, un Ollama distant/dans le cloud) ; il s’agit de la seule sortie externe et c’est le choix explicite de l’opérateur.
- **Système de fichiers** : aucun par défaut. Avec `SENSOR_HUMOR_PERSIST=true`, il lit/écrit un seul fichier, `~/.sensor-humor/session.json` (remplace le répertoire par `SENSOR_HUMOR_SESSION_DIR`), qui contient uniquement l’état de la session pour les éléments humoristiques (blagues, gags, expressions) – aucun identifiant. Le fichier expire automatiquement après 24 heures.
- **Secrets** : aucun par défaut. Si vous pointez `OLLAMA_HOST` vers un Ollama distant/dans le cloud, définissez `OLLAMA_API_KEY` ; il est lu à partir de l’environnement et envoyé uniquement en tant qu’en-tête `Bearer` vers cet hôte – il n’est jamais enregistré, conservé ou affiché (`debug_status` indique uniquement si une clé est définie, jamais sa valeur).
- **Aucune télémétrie** : rien n’est collecté ni envoyé.
- **L’état de la session est stocké en mémoire par défaut** : il est supprimé lorsque le processus du serveur s’arrête ; vous pouvez activer la persistance sur disque avec `SENSOR_HUMOR_PERSIST`.
- **Nettoyage des entrées** : tout le texte fourni par l’utilisateur est normalisé et nettoyé avant l’injection d’invite : normalisation Unicode NFKC, suppression des caractères de largeur nulle/bidirectionnels/de format, regroupement des homoglyphes courants en ASCII, suppression des sauts de ligne, suppression des caractères de contrôle, limitation de la longueur.
- **Filtrage des sorties (seuil déterministe + limite réaliste)** : une liste de termes stockée au format base64 est utilisée comme filtre de sécurité terminal pour chaque outil humoristique (elle est vérifiée à nouveau après chaque nouvelle tentative et appliquée avant toute solution de repli), et une solution de repli basée sur l’entrée de l’utilisateur se réduit à une ligne statique, sans entrée, plutôt que d’afficher un terme interdit. Le chemin de détection dés-obfusque d’abord, de sorte que les méthodes d’évasion courantes sont neutralisées : insertion de caractères de largeur nulle/bidirectionnels, homoglyphes (cyrillique/grec/largeur complète), leet speak (`r3tard`), séparateurs intra-mots (`re-tard`, `r.e.t.a.r.d`) et diacritiques combinés (`retárd`). Les entrées incorrectes sont également supprimées d’une session persistante altérée ou obsolète lors du chargement. **Ce que cela ne fait PAS** : il s’agit d’un filtre de liste de termes déterministe, et non d’un classificateur entraîné ; il ne se protège pas contre les variantes d’insultes nouvelles ou non répertoriées, l’espacement d’une seule lettre (`r e t a r d`), l’art ASCII/l’obfuscation spatiale, une couverture Unicode complète ou les attaques sémantiques/de contournement. Considérez-le comme un seuil minimal pour un outil d’humour local, et non comme une garantie de modération pour les entrées publiques non fiables.
- **Format des erreurs d’outil** : les erreurs d’exécution/d’outil renvoient le format d’erreur structuré du studio (`{code, message, hint, retryable}`) ; notez que les erreurs de validation du *schéma d’entrée* (par exemple, un `mood` non valide) sont détectées par le SDK MCP avant l’exécution du gestionnaire et se manifestent sous la forme de l’erreur standard `InvalidParams` du SDK, et non de ce format.

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
