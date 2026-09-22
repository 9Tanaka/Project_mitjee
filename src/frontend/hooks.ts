"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation.js";
import type { z } from "zod";
import { api, ApiFailure, MutationAttempt } from "./api.js";

export function useResource<T>(path: string, schema: z.ZodType<T>) {
  const router = useRouter();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiFailure | null>(null);
  const [loading, setLoading] = useState(true);
  const active = useRef<AbortController | null>(null);
  const reload = useCallback(async () => {
    active.current?.abort();
    const controller = new AbortController(); active.current = controller;
    setLoading(true); setError(null);
    try {
      const value = await api(path, schema, { signal: controller.signal });
      if (!controller.signal.aborted) setData(value);
    } catch (e) {
      if (!controller.signal.aborted) {
        const failure = e instanceof ApiFailure ? e : new ApiFailure("INTERNAL_ERROR", 500);
        setError(failure); setData(null);
        if (failure.status === 401) router.replace("/login");
      }
    } finally { if (!controller.signal.aborted) setLoading(false); }
  }, [path, schema, router]);
  useEffect(() => { void reload(); return () => active.current?.abort(); }, [reload]);
  return { data, setData, error, loading, reload };
}

export function useMutation<T>(schema: z.ZodType<T>, onSuccess: (value: T) => void,
  onReconcile: () => Promise<void> = async () => {}) {
  const router = useRouter();
  const attempt = useRef<MutationAttempt | null>(null);
  const running = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiFailure | null>(null);
  const [retryable, setRetryable] = useState(false);
  useEffect(() => () => controller.current?.abort(), []);
  async function run(next?: MutationAttempt) {
    if (running.current || (next && attempt.current)) return;
    if (next) attempt.current = next;
    const current = attempt.current; if (!current) return;
    running.current = true; setBusy(true); setError(null); setRetryable(false);
    const abort = new AbortController(); controller.current = abort;
    try {
      const response = await api(current.path, schema, { body: current.body, signal: abort.signal });
      if (!abort.signal.aborted) { attempt.current = null; onSuccess(response); }
    } catch (e) {
      if (abort.signal.aborted) return;
      const failure = e instanceof ApiFailure ? e : new ApiFailure("INTERNAL_ERROR", 500);
      setError(failure);
      if (failure.uncertain) setRetryable(true); // Keep the exact request; block new mutations.
      else {
        attempt.current = null;
        if (failure.status === 401) router.replace("/login");
        else if (["REVISION_CONFLICT", "IDEMPOTENCY_CONFLICT", "SESSION_NOT_ACTIVE", "SESSION_EXPIRED"].includes(failure.code))
          await onReconcile(); // Never re-submit automatically with a new revision.
      }
    } finally {
      running.current = false;
      if (!abort.signal.aborted) setBusy(false);
    }
  }
  return { run, retry: () => run(), busy, error, retryable, blocked: busy || retryable || error?.status === 401 };
}
