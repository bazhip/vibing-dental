// AudioWorklet processor: forwards mono Float32 mic frames to the main
// thread, where they're resampled to 16 kHz linear16 for Deepgram.
// Served as a static file (not a blob: URL) so it passes the CSP's
// script-src 'self'.
class PcmCaptureProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (channel && channel.length) {
      // Copy — the underlying buffer is reused by the audio thread.
      this.port.postMessage(channel.slice(0));
    }
    return true;
  }
}

registerProcessor('pcm-capture', PcmCaptureProcessor);
