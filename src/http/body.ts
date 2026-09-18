import { ApiError } from "./errors.js";
export async function readJson(request: Request, maxBytes: number): Promise<unknown> {
  if (request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !== "application/json" || request.headers.has("content-encoding")) throw new ApiError("INVALID_REQUEST");
  const length = request.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > maxBytes)) throw new ApiError("PAYLOAD_TOO_LARGE");
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError("INVALID_REQUEST");
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > maxBytes) { void reader.cancel().catch(() => {}); throw new ApiError("PAYLOAD_TOO_LARGE"); }
      chunks.push(chunk.value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError("INVALID_REQUEST");
  } finally { reader.releaseLock(); }
}
