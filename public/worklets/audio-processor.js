class AudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.bufferSize = 4096
    this.buffer = new Float32Array(this.bufferSize)
    this.bufferIndex = 0
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0]
    if (!input || !input[0]) return true

    const samples = input[0]

    for (let i = 0; i < samples.length; i++) {
      this.buffer[this.bufferIndex++] = samples[i]

      if (this.bufferIndex >= this.bufferSize) {
        // Convert Float32 to Int16 PCM
        const pcmData = new Int16Array(this.bufferSize)
        for (let j = 0; j < this.bufferSize; j++) {
          // Clamp and convert to 16-bit
          const s = Math.max(-1, Math.min(1, this.buffer[j]))
          pcmData[j] = s < 0 ? s * 0x8000 : s * 0x7fff
        }

        // Send the PCM data to the main thread
        this.port.postMessage({
          audioData: pcmData.buffer
        }, [pcmData.buffer])

        // Reset buffer
        this.buffer = new Float32Array(this.bufferSize)
        this.bufferIndex = 0
      }
    }

    return true
  }
}

registerProcessor('audio-processor', AudioProcessor)
