import type { TrainingApplicationService } from "./training-service.js";
import type { AuthenticatedPrincipal, TrainingMessageReply } from "./contracts.js";
import { DomainError } from "../domain/types.js";
import { sanitizeMessage } from "../dialogue/sanitize.js";
import { SpeechError, speechDeadline, validateWav, type SpeechToTextProvider, type TextToSpeechProvider } from "../speech/contracts.js";

export interface VoiceInput { turnId: string; expectedRevision: number; audio: Uint8Array; mime: string }
export interface VoiceReply { dialogue: TrainingMessageReply; audio: Uint8Array | null; audioStatus: "READY" | "UNAVAILABLE" | "REPLAY" }
export class VoiceApplicationService {
  constructor(private readonly app: TrainingApplicationService, private readonly stt: SpeechToTextProvider, private readonly tts: TextToSpeechProvider,
    private readonly pending: Set<string> = new Set()) {}
  /** Presentation-only replay of an owned committed character turn. No AI or mutation. */
  async speak(id: string, user: AuthenticatedPrincipal, turnId: string, signal?: AbortSignal) {
    const session = await this.app.resume(id, user);
    if (session.scenario.category !== "CALL_CENTER") throw new SpeechError("VOICE_NOT_ALLOWED");
    const message = session.messages.find(m => m.turnId === turnId && m.role === "character");
    if (!message) throw new DomainError("INVALID_TURN_ID");
    const key = JSON.stringify([user.id, id]);
    if (this.pending.has(key) || this.pending.size >= 20) throw new SpeechError("VOICE_BUSY");
    this.pending.add(key);
    try {
      const audio = await speechDeadline(s => this.tts.synthesize(sanitizeMessage(message.text), s), signal);
      if (!audio.byteLength || audio.byteLength > 4 * 1024 * 1024) throw new SpeechError("SPEECH_UNAVAILABLE");
      return { audio, audioStatus: "READY" as const };
    } catch { return { audio: null, audioStatus: "UNAVAILABLE" as const }; }
    finally { this.pending.delete(key); }
  }
  async bind(id: string, user: AuthenticatedPrincipal) {
    const session = await this.app.resume(id, user);
    return this.validateBinding(session);
  }
  private validateBinding(session: Awaited<ReturnType<TrainingApplicationService["resume"]>>) {
    if (session.scenario.category !== "CALL_CENTER") throw new SpeechError("VOICE_NOT_ALLOWED");
    if (session.status !== "ACTIVE") throw new DomainError("SESSION_NOT_ACTIVE");
    if (session.phone && (session.phone.callStatus !== "CONNECTED" || session.phone.openingStatus !== "READY")) throw new DomainError("CALL_NOT_READY");
    return session;
  }
  async send(id: string, user: AuthenticatedPrincipal, input: VoiceInput, signal?: AbortSignal,
    onCommitted?: (reply: TrainingMessageReply) => void): Promise<VoiceReply> {
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(input.turnId) || !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0) throw new DomainError("INVALID_COMMAND");
    const session = await this.app.resume(id, user);
    if (session.scenario.category !== "CALL_CENTER") throw new SpeechError("VOICE_NOT_ALLOWED");
    // A committed turn is authoritative across reconnects: no repeat STT, AI or TTS.
    const previous = session.messages.find(m => m.turnId === input.turnId && m.role === "user");
    if (previous) {
      const dialogue = await this.app.message(id, user, { turnId: input.turnId, expectedRevision: input.expectedRevision, text: previous.text });
      onCommitted?.(dialogue);
      return { dialogue, audio: null, audioStatus: "REPLAY" };
    }
    this.validateBinding(session);
    if (session.revision !== input.expectedRevision) throw new DomainError("REVISION_CONFLICT");
    validateWav(input.audio, input.mime);
    const key = JSON.stringify([user.id, id]);
    if (this.pending.has(key) || this.pending.size >= 20) throw new SpeechError("VOICE_BUSY");
    this.pending.add(key);
    try { return await this.process(id, user, input, signal, onCommitted); } finally { this.pending.delete(key); }
  }
  private async process(id: string, user: AuthenticatedPrincipal, input: VoiceInput, signal?: AbortSignal,
    onCommitted?: (reply: TrainingMessageReply) => void): Promise<VoiceReply> {
    let raw: string;
    try { raw = await speechDeadline(s => this.stt.transcribe(input.audio, s), signal); }
    catch { throw new SpeechError("STT_FAILED"); }
    const text = sanitizeMessage(raw); raw = "";
    if (!text) throw new SpeechError("EMPTY_TRANSCRIPT");
    if (signal?.aborted) throw new SpeechError("STT_FAILED");
    const dialogue = await this.app.message(id, user, { turnId: input.turnId, expectedRevision: input.expectedRevision, text });
    onCommitted?.(dialogue);
    // TTS failure cannot roll back a committed training turn.
    try {
      const audio = await speechDeadline(s => this.tts.synthesize(sanitizeMessage(dialogue.turn.characterMessage), s), signal);
      if (!audio.byteLength || audio.byteLength > 4 * 1024 * 1024) throw new SpeechError("SPEECH_UNAVAILABLE");
      return { dialogue, audio, audioStatus: "READY" };
    } catch { return { dialogue, audio: null, audioStatus: "UNAVAILABLE" }; }
  }
}
