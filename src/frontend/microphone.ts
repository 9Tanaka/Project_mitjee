/** Browser-only recording. Raw samples live in memory until submission or cancellation. */
export interface Recording { stop(): Promise<Uint8Array>; cancel(): void }
export function encodePcmWav(chunks: readonly Float32Array[], rate: number): Uint8Array {
  const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const samples = new Float32Array(length); let offset = 0;
  for (const chunk of chunks) { samples.set(chunk, offset); offset += chunk.length; }
  const count = Math.min(480_000, Math.floor(length * 16000 / rate));
  const wav = new Uint8Array(44 + count * 2), view = new DataView(wav.buffer);
  const tag = (at: number, value: string) => [...value].forEach((c, i) => { wav[at + i] = c.charCodeAt(0); });
  tag(0, "RIFF"); view.setUint32(4, wav.length - 8, true); tag(8, "WAVE"); tag(12, "fmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, 16000, true); view.setUint32(28, 32000, true); view.setUint16(32, 2, true);
  view.setUint16(34, 16, true); tag(36, "data"); view.setUint32(40, count * 2, true);
  for (let i = 0; i < count; i++) {
    const start = Math.floor(i * rate / 16000), end = Math.max(start + 1, Math.floor((i + 1) * rate / 16000));
    let sum = 0; for (let j = start; j < Math.min(end, length); j++) sum += samples[j]!;
    const sample = Math.max(-1, Math.min(1, sum / (end - start)));
    view.setInt16(44 + i * 2, Math.round(sample * (sample < 0 ? 32768 : 32767)), true);
  }
  return wav;
}
export async function startMicrophone(onLimit: () => void, signal: AbortSignal): Promise<Recording> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true }, video: false });
  const stopTracks = () => stream.getTracks().forEach(track => track.stop());
  if (signal.aborted) { stopTracks(); throw new DOMException("Cancelled", "AbortError"); }
  const chunks: Float32Array[] = [];
  let context: AudioContext | undefined, node: AudioWorkletNode | undefined, source: MediaStreamAudioSourceNode | undefined;
  let total = 0, closed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cleanup = () => {
    if (closed) return; closed = true; clearTimeout(timer); stopTracks(); source?.disconnect();
    if (node) { node.port.onmessage = null; node.port.close(); node.disconnect(); }
    void context?.close().catch(() => {}); signal.removeEventListener("abort", cancel);
  };
  const cancel = () => { cleanup(); chunks.length = 0; };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    context = new AudioContext({ sampleRate: 16000 });
    await context.audioWorklet.addModule("/call-recorder.js");
    if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
    source = context.createMediaStreamSource(stream); node = new AudioWorkletNode(context, "mitjee-call-recorder");
    node.port.onmessage = (event: MessageEvent<Float32Array>) => {
      if (closed) return;
      const remaining = Math.max(0, Math.floor(context!.sampleRate * 30) - total);
      const chunk = event.data.slice(0, remaining); chunks.push(chunk); total += chunk.length;
      if (remaining <= event.data.length) { cleanup(); onLimit(); }
    };
    source.connect(node); node.connect(context.destination); await context.resume();
    if (signal.aborted || closed) throw new DOMException("Cancelled", "AbortError");
    timer = setTimeout(() => { cleanup(); onLimit(); }, 30_000);
    return { cancel, async stop() { cleanup(); const wav = encodePcmWav(chunks, context!.sampleRate); chunks.length = 0; return wav; } };
  } catch (error) { cancel(); throw error; }
}
