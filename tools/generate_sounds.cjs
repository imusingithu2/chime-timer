const fs = require('fs');
const path = require('path');

function writeWav(filename, freq, duration = 1.2, pattern = 'sine') {
    const sampleRate = 44100;
    const numSamples = Math.floor(sampleRate * duration);
    const buffer = Buffer.alloc(44 + numSamples * 2);

    // RIFF header
    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(36 + numSamples * 2 - 8, 4);
    buffer.write('WAVE', 8);
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20);
    buffer.writeUInt16LE(1, 22);
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(sampleRate * 2, 28);
    buffer.writeUInt16LE(2, 32);
    buffer.writeUInt16LE(16, 34);
    buffer.write('data', 36);
    buffer.writeUInt32LE(numSamples * 2, 40);

    for (let i = 0; i < numSamples; i++) {
        const t = i / sampleRate;
        let val = 0;
        if (pattern === 'sine') {
            val = Math.sin(2 * Math.pi * freq * t);
        } else if (pattern === 'square') {
            val = Math.sin(2 * Math.pi * freq * t) > 0 ? 1.0 : -1.0;
        } else if (pattern === 'pulse') {
            val = ((t * freq) % 1.0 < 0.2) ? 1.0 : -1.0;
        } else {
            val = Math.sin(2 * Math.pi * freq * t);
        }
        
        const sample = Math.max(-1, Math.min(1, val * 0.5));
        buffer.writeInt16LE(Math.floor(sample * 32767), 44 + i * 2);
    }

    fs.writeFileSync(filename, buffer);
}

const sounds = {
    "Bell": [440, 'sine'],
    "Chime": [880, 'sine'],
    "Marimba": [659.25, 'sine'],
    "Beacon": [1000, 'square'],
    "Pulse": [440, 'square'],
    "Digital": [1200, 'pulse'],
};

const soundsDir = path.join(process.cwd(), 'sounds');
if (!fs.existsSync(soundsDir)) fs.mkdirSync(soundsDir);

for (const [name, [freq, pat]] of Object.entries(sounds)) {
    writeWav(path.join(soundsDir, `${name}.wav`), freq, 1.2, pat);
}
writeWav(path.join(soundsDir, 'silent.wav'), 0, 0.5);
console.log('Sounds generated successfully using Node.js');
