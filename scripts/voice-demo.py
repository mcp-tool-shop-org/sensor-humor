"""
Generate voice demos for all 6 moods using Piper TTS.
Outputs WAV files to F:/AI/sensor-humor/voice-demos/
"""
import os
import wave
import struct
from piper.voice import PiperVoice
from piper.config import SynthesisConfig

MODELS_DIR = "F:/AI/models/piper"
OUTPUT_DIR = "F:/AI/sensor-humor/voice-demos"
os.makedirs(OUTPUT_DIR, exist_ok=True)

# Mood -> (piper_model, length_scale, noise_scale, noise_w_scale, volume, sample_text)
DEMOS = {
    "dry": (
        "en_GB-alan-medium",
        1.15, 0.3, 0.3, 0.9,
        "The entire codebase is one file. It has a name. The name is app dot js."
    ),
    "roast": (
        "en_US-ryan-high",
        0.95, 0.667, 0.8, 1.0,
        "Verdict: terminal negligence. Six date libraries and the timestamps are still wrong."
    ),
    "cynic": (
        "en_GB-alan-medium",
        1.20, 0.25, 0.25, 0.85,
        "Of course: the config file has 47 boolean flags and not one of them prevents this exact failure."
    ),
    "cheeky": (
        "en_GB-cori-high",
        1.0, 0.6, 0.65, 1.0,
        "Oh honey, you deployed on Friday at five pm with zero rollback plan and full confidence."
    ),
    "chaotic": (
        "en_US-lessac-high",
        0.95, 0.7, 0.8, 1.05,
        "The CI pipeline takes 90 minutes. Sources confirm it then waits another 90 minutes to ensure nothing has changed."
    ),
    "zoomer": (
        "en_US-ryan-high",
        0.90, 0.85, 0.9, 1.15,
        "nahhh, this 800 line component is giving MAJOR 2010 FRONTEND ENERGY, skill issue detected."
    ),
}

for mood, (model_name, length_scale, noise_scale, noise_w, vol, text) in DEMOS.items():
    model_path = os.path.join(MODELS_DIR, f"{model_name}.onnx")
    config_path = model_path + ".json"

    print(f"\n[{mood}] Loading {model_name}...")
    voice = PiperVoice.load(model_path, config_path=config_path)

    syn_config = SynthesisConfig(
        length_scale=length_scale,
        noise_scale=noise_scale,
        noise_w_scale=noise_w,
        volume=vol,
    )

    # Collect all audio chunks
    all_audio = b""
    sample_rate = voice.config.sample_rate
    sample_width = 2  # 16-bit

    for chunk in voice.synthesize(text, syn_config=syn_config):
        all_audio += chunk.audio_int16_bytes

    out_path = os.path.join(OUTPUT_DIR, f"{mood}.wav")
    with wave.open(out_path, "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(sample_width)
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(all_audio)

    size_kb = os.path.getsize(out_path) / 1024
    print(f"  -> {out_path} ({size_kb:.0f} KB)")
    print(f"  Text: {text}")

print(f"\nDone! {len(DEMOS)} voice demos in {OUTPUT_DIR}")
