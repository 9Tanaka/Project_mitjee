import { z } from "zod";

// Demo policies, not numeric requirements stated by Proposal v4.
export const MIN_PASSWORD_CODE_POINTS = 12;
export const MAX_PASSWORD_BYTES = 72;
export const accountInput = z.strictObject({
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
  password: z.string().refine(value =>
    [...value].length >= MIN_PASSWORD_CODE_POINTS &&
    new TextEncoder().encode(value).byteLength <= MAX_PASSWORD_BYTES),
});
