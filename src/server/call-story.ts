import { randomInt } from "node:crypto";
import { CALL_STORIES } from "../domain/constants.js";
import { callStoryRegistry, type CallStoryId } from "../fixtures/call-center-foundation.js";
import { demoCallVariant } from "./call-variant.js";

/** A present exact override completely supersedes the legacy variant configuration. */
export function demoCallStory(env: Readonly<Record<string, string | undefined>> = process.env): (() => CallStoryId) | undefined {
  const exact = env.CALL_CENTER_DEMO_STORY;
  if (exact !== undefined && exact !== "") {
    if (!(CALL_STORIES as readonly string[]).includes(exact)) throw new Error("Invalid CALL_CENTER_DEMO_STORY configuration");
    return () => exact as CallStoryId;
  }
  const variant = demoCallVariant(env);
  if (!variant) return undefined;
  return () => {
    const selected = variant();
    const eligible = CALL_STORIES.filter(id => callStoryRegistry[id].variant === selected);
    return eligible[randomInt(eligible.length)]!;
  };
}
