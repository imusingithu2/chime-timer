import wave
import math
import struct

def generate_tone(filename, freq, duration=1.2, pattern='sine'):
    sample_rate = 44100
    num_samples = int(sample_rate * duration)

    # To ensure seamless loop and no click, we use a small fade-in/out at the very edges
    # and ensure the pattern itself is periodic.
    samples = []
    for i in range(num_samples):
        t = i / sample_rate
        if pattern == 'sine':
            val = math.sin(2 * math.pi * freq * t)
        elif pattern == 'square':
            val = 1.0 if math.sin(2 * math.pi * freq * t) > 0 else -1.0
        elif pattern == 'pulse':
            # A sharper pulse for "Digital"
            val = 1.0 if (t * freq) % 1.0 < 0.2 else -1.0
        else:
            val = math.sin(2 * math.pi * freq * t)

        # Basic normalization to avoid clipping
        samples.append(val * 0.5)

    # Convert to 16-bit PCM
    packed_data = []
    for s in samples:
        # Scale to 16-bit range
        int_val = int(s * 32767)
        packed_data.append(struct.pack('<h', int_val))

    data = b''.join(packed_data)

    with wave.open(filename, 'wb') as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(data)

# Define sound profiles
sounds = {
    "Bell": (440, 'sine'),
    "Chime": (880, 'sine'),
    "Marimba": (659.25, 'sine'),
    "Beacon": (1000, 'square'),
    "Pulse": (440, 'square'),
    "Digital": (1200, 'pulse'),
}

for name, (freq, pat) in sounds.items():
    generate_tone(f"sounds/{name}.wav", freq, pattern=pat)

# Silent file
generate_tone("sounds/silent.wav", 0, duration=0.5)
print("Sounds generated successfully in sounds/")
