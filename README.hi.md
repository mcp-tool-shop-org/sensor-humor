<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.md">English</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/sensor-humor/readme.png" width="600" alt="sensor-humor" />
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/sensor-humor/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/sensor-humor/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/mcp-tool-shop-org/sensor-humor/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License"></a>
  <a href="https://mcp-tool-shop-org.github.io/sensor-humor/"><img src="https://img.shields.io/badge/landing-page-34d399" alt="Landing Page"></a>
</p>

MCP टूल जो आपके LLM को एक स्थायी हास्यपूर्ण सहायक प्रदान करता है: मूड-आधारित व्यक्तित्व, सत्र-जागरूक कॉलबैक, लगातार चुटकुले, व्यंग्य, ताने और मुहावरे - सभी वॉयस इंटीग्रेशन के साथ, जो Piper TTS (प्रोसडी-नियंत्रित) के माध्यम से संभव है।

डेवलपर्स के लिए बनाया गया: कोड की कमियों पर हल्के व्यंग्य, त्रुटि संदेश जो सीधे और स्पष्ट हों, और बिल्ड विफल होने पर अराजक प्रतिक्रिया। यह आपके LLM के मूल टोन को कभी नहीं बदलता है - यह एक अलग आवाज है जो तभी सुनाई देती है जब इसे बुलाया जाता है।

## विशेषताएं

- 6 मूड: सूखा (डिफ़ॉल्ट), व्यंग्यात्मक, अतार्किक, सकारात्मक, कटाक्षपूर्ण, अराजक
- सत्र स्थिति: लगातार चुटकुले, हाल के अंशों का रिंग बफर (अधिकतम 20), मुहावरे का मानचित्र
- उपकरण: mood.set/get, comic_timing, roast, heckle, catchphrase.generate/callback
- स्थानीय Ollama बैकएंड (qwen2.5:7b-instruct अनुशंसित)
- वॉयस पेयरिंग: mcp-voice-soundboard, Piper TTS के साथ (प्रोसडी नियंत्रण: length_scale, noise_scale, noise_w_scale, volume)
- नियतात्मक: JSON स्कीमा प्रवर्तन, सत्यापन, खराब आउटपुट पर पुनः प्रयास, डिबग लॉगिंग

## आवश्यकताएं

- Node.js 18+
- Ollama स्थानीय रूप से चल रहा है, जिसमें `qwen2.5:7b-instruct` स्थापित है
- mcp-voice-soundboard स्थापित और चल रहा है (Piper बैकएंड अनुशंसित)
- @modelcontextprotocol/sdk

## इंस्टॉल करें

```bash
npm install @mcp-tool-shop/sensor-humor
# or link local dev version
npm link /path/to/sensor-humor
```

## शुरुआत कैसे करें

1. Ollama शुरू करें:

```bash
ollama run qwen2.5:7b-instruct
```

2. सेंसर-ह्यूमर MCP सर्वर शुरू करें (stdio ट्रांसपोर्ट):

```bash
cd sensor-humor
SENSOR_HUMOR_DEBUG=true npm start
```

3. वॉयस-साउंडबोर्ड शुरू करें (Piper मोड):

```bash
cd ../mcp-voice-soundboard
VOICE_SOUNDBOARD_ENGINE=piper VOICE_SOUNDBOARD_PIPER_MODEL_DIR=/path/to/piper/models npm start
```

4. अपने MCP क्लाइंट में (Claude Code, Cursor, आदि):
- दोनों सर्वर जोड़ें
- परीक्षण श्रृंखला:

```
mood.set(style: "roast")
roast(target: "800-line god function")
```

एक व्यंग्यात्मक प्रतिक्रिया प्राप्त होती है, फिर `voice_speak(mood: "roast")` इसे "am_eric" + आत्मविश्वासपूर्ण और व्यंग्यात्मक ऊर्जा के साथ बोलता है।

## उपकरण

सभी उपकरण सत्र से वर्तमान मूड को प्राप्त करते हैं।

| उपकरण | हस्ताक्षर | विवरण |
|------|-----------|-------------|
| `mood.set` | `(style: string)` | सक्रिय मूड सेट करें (सूखा, व्यंग्यात्मक, अतार्किक, सकारात्मक, कटाक्षपूर्ण, अराजक) |
| `mood.get` | `()` | वर्तमान मूड + चुटकुला गणना |
| `comic_timing` | `(text, technique?)` | हास्यपूर्ण डिलीवरी के साथ फिर से लिखें (नियम-की-तीन, गलत दिशा, वृद्धि, कॉलबैक, अल्पवाचन, ऑटो) |
| `roast` | `(target, context?)` | निर्णय/लेबल पैटर्न के साथ स्नेहपूर्ण व्यंग्य, 1-5 की गंभीरता लौटाता है। संदर्भ: कोड, त्रुटि, विचार, स्थिति |
| `heckle` | `(target)` | संक्षिप्त, तीखा कटाक्ष |
| `catchphrase.generate` | `(context?)` | पुन: प्रयोज्य अंश बनाएं (सत्र में संग्रहीत) |
| `catchphrase.callback` | `()` | सबसे अधिक उपयोग किए जाने वाले मुहावरे का पुन: उपयोग करें (या शून्य) |

## मूड प्रसडी (Piper वॉयस)

प्रत्येक मूड एक अलग Piper वॉयस + प्रसडी कॉन्फ़िगरेशन से मेल खाता है:

| मूड | वॉयस | length_scale | noise_scale | noise_w_scale | volume | चरित्र |
|------|-------|-------------|-------------|---------------|--------|-----------|
| सूखा | en_GB-alan-medium | 1.15 | 0.3 | 0.3 | 0.9 | शांत, थका हुआ, नियमित |
| व्यंग्यात्मक | en_US-ryan-high | 0.95 | 0.667 | 0.8 | 1.0 | आत्मविश्वासी व्यंग्य |
| अतार्किक | en_US-lessac-high | 0.88 | 0.8 | 0.9 | 1.1 | अस्थिर, अप्रत्याशित |
| सकारात्मक | en_GB-cori-high | 1.05 | 0.5 | 0.6 | 0.95 | गर्म, कोमल, पिता जैसा स्वभाव |
| कटाक्षपूर्ण | en_GB-alan-medium | 1.25 | 0.2 | 0.2 | 0.8 | दुनिया से निराश लहजा |
| अराजक | en_US-lessac-high | 0.82 | 0.9 | 1.0 | 1.2 | तेज़, ज़ोरदार, अराजक |

## पर्यावरण चर

```bash
# sensor-humor
SENSOR_HUMOR_DEBUG=true                # verbose prompt/response dumps
SENSOR_HUMOR_OBSERVE=true              # full chain trace (prompt -> text -> piper params)
SENSOR_HUMOR_PROMPT_VERSION=1          # prompt set version (for A/B tuning)

# voice integration (in voice-soundboard)
VOICE_SOUNDBOARD_ENGINE=piper          # or kokoro (default)
VOICE_SOUNDBOARD_PIPER_MODEL_DIR=/path/to/piper/models
```

## अवलोकनशीलता और डिबग

- प्रत्येक उपकरण कॉल लॉग करता है: भेजा गया प्रॉम्प्ट, कच्चा Ollama प्रतिक्रिया, पार्स किया गया आउटपुट, सत्र अपडेट
- वॉयस: डिबग लॉग Piper पैरामीटर दिखाते हैं जो प्रत्येक मूड के लिए लागू होते हैं
- `SENSOR_HUMOR_DEBUG=true` सेट करें ताकि सब कुछ दिखाई दे

## गुणवत्ता संबंधी नोट्स

- हास्य हिट दर: वास्तविक सत्रों में ~70-75% (सूखा सबसे मजबूत, व्यंग्यात्मक उसके करीब)
- नियतात्मक: JSON स्कीमा प्रवर्तन, अमान्य आउटपुट पर 1 पुनः प्रयास, प्रतिबंधित पैटर्न के लिए पोस्ट-सत्यापन
- वॉयस: Piper वास्तविक प्रसडी अलगाव प्रदान करता है (केवल गति नहीं); Kokoro बैकअप केवल गति-आधारित है
- उत्पादन बॉट्स के लिए नहीं - केवल एक विकास उपकरण सहायक। हास्य व्यक्तिपरक है; यदि आवश्यक हो तो प्रॉम्प्ट को ट्यून करें।

## आर्किटेक्चर

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

## विकास

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

## लाइसेंस

एमआईटी

---

यह <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a> द्वारा बनाया गया है।
