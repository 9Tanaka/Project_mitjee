import type { ReactNode } from "react";
import { AuthGate } from "../../frontend/auth.js";
export default function TrainingLayout({ children }: { children: ReactNode }) {
  return <AuthGate>{children}</AuthGate>;
}
