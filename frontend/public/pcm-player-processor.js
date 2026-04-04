/**
 * PCM Player AudioWorklet Processor — Ring buffer approach.
 * Based on Google's ADK Gemini Live API demo.
 * Receives Int16 PCM data, converts to Float32, plays through ring buffer.
 * This prevents audio repeating, gaps, and timing issues.
 */
class PCMPlayerProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    // Ring buffer: 180 seconds at 24kHz
    this.bufferSize = 24000 * 180;
    this.buffer = new Float32Array(this.bufferSize);
    this.writeIndex = 0;
    this.readIndex = 0;

    this.port.onmessage = (event) => {
      if (event.data.command === "endOfAudio") {
        // Skip to current write position (clear buffer)
        this.readIndex = this.writeIndex;
        return;
      }
      if (event.data.command === "clear") {
        this.readIndex = this.writeIndex;
        return;
      }
      const int16Samples = new Int16Array(event.data);
      this._enqueue(int16Samples);
    };
  }

  _enqueue(int16Samples) {
    for (let i = 0; i < int16Samples.length; i++) {
      const floatVal = int16Samples[i] / 32768;
      this.buffer[this.writeIndex] = floatVal;
      this.writeIndex = (this.writeIndex + 1) % this.bufferSize;
      // If we catch up to read index, advance read (drop oldest)
      if (this.writeIndex === this.readIndex) {
        this.readIndex = (this.readIndex + 1) % this.bufferSize;
      }
    }
  }

  process(inputs, outputs, parameters) {
    const output = outputs[0];
    const framesPerBlock = output[0].length;

    for (let frame = 0; frame < framesPerBlock; frame++) {
      output[0][frame] = this.buffer[this.readIndex];
      if (output.length > 1) {
        output[1][frame] = this.buffer[this.readIndex];
      }
      if (this.readIndex !== this.writeIndex) {
        this.readIndex = (this.readIndex + 1) % this.bufferSize;
      }
    }
    return true;
  }
}

registerProcessor("pcm-player-processor", PCMPlayerProcessor);
