import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, relative, dirname } from "node:path";
import { expect, it } from "vitest";

const root = resolve("src");
function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(e => e.name === "generated" ? [] :
    e.isDirectory() ? files(resolve(dir, e.name)) : /\.tsx?$/.test(e.name) ? [resolve(dir, e.name)] : []);
}
// Conservative source scanner, not a compiler. Includes type imports/re-exports,
// multiline declarations, literal dynamic imports and require. No new dependency.
function imports(source: string): string[] {
  const found = new Set<string>();
  for (const pattern of [
    /\b(?:import|export)\s+(?:[^;"']*?\bfrom\s*)?["']([^"']+)["']/g,
    /\b(?:import|require)\s*\(\s*["']([^"']+)["']\s*\)/g,
  ]) for (const match of source.matchAll(pattern)) found.add(match[1]!);
  return [...found];
}
const sources = new Map(files(root).map(file => [file, readFileSync(file, "utf8")]));
const graph = new Map([...sources].map(([file, source]) => [file, imports(source).map(specifier => {
  if (!specifier.startsWith(".")) return specifier;
  const plain = resolve(dirname(file), specifier);
  const candidate = [plain.replace(/\.js$/, ".ts"), plain.replace(/\.js$/, ".tsx"), plain].find(existsSync);
  if (!candidate) throw new Error(`Unresolved local dependency: ${specifier} in ${file}`);
  return candidate;
})]));
const localName = (file: string) => relative(root, file).replaceAll("\\", "/");
function reached(file: string, seen = new Set<string>()): Set<string> {
  for (const dependency of graph.get(file) ?? []) if (!seen.has(dependency)) {
    seen.add(dependency); reached(dependency, seen);
  }
  return seen;
}
it.each(["application/", "core.ts", "domain/", "dialogue/", "persistence/", "quiz/"])("%s cannot reach forbidden outer layers, including through barrels", layer => {
  const forbidden = layer === "application/" ? /^(http|auth|server|app|frontend|providers)\// : /^(application|http|auth|server|app|frontend|providers)\//;
  const selected = [...sources.keys()].filter(file => localName(file).startsWith(layer));
  expect(selected.length).toBeGreaterThan(0);
  for (const file of selected) for (const dependency of reached(file)) {
    expect(forbidden.test(localName(dependency)), `${localName(file)} reaches ${localName(dependency)}`).toBe(false);
    expect(/^(next|next-auth|openai)(\/|$)/.test(dependency), `${localName(file)} reaches framework/auth/provider SDK`).toBe(false);
  }
});
it("Application has no HTTP/Next global types or transport errors", () => {
  for (const [file, source] of sources) if (localName(file).startsWith("application/")) {
    expect(source, localName(file)).not.toMatch(/\b(Request|Response|NextRequest|NextResponse|ApiError|ApiErrorCode)\b/);
  }
});
it("browser roots and public contracts cannot reach server, domain, credentials or database implementations", () => {
  const roots = [...sources].filter(([file, source]) => localName(file).startsWith("frontend/") ||
    localName(file).startsWith("public-api/") || /^["']use client["']/.test(source));
  expect(roots.length).toBeGreaterThan(10);
  for (const [file, source] of roots) {
    for (const dependency of reached(file)) {
      expect(localName(dependency), localName(file)).not.toMatch(/^(http|application|auth|accounts|server|domain|quiz|dialogue|persistence|generated|fixtures|security|providers)\/|^core\.ts$/);
      expect(dependency, localName(file)).not.toMatch(/^(node:|bcrypt|@prisma|mariadb|openai|next-auth$|next-auth\/(?!react$))/);
    }
    expect(source, localName(file)).not.toMatch(/localStorage|sessionStorage|document\.cookie|process\.env|dangerouslySetInnerHTML|x-owner-id|x-user-id/);
  }
});
it("OpenAI adapter cannot reach Core, repositories or authority engines", () => {
  for (const file of sources.keys()) if (localName(file).startsWith("providers/")) {
    for (const dependency of reached(file)) {
      expect(localName(dependency)).not.toMatch(/^(application|http|auth|accounts|server|persistence|fixtures)\/|^core\.ts$|^domain\/(repository|training-repository|event-validator|scoring|state-machine)/);
    }
  }
});
it("account ports/services stay independent of concrete persistence, hashing and Training rules", () => {
  for (const file of sources.keys()) {
    const name = localName(file);
    if (name.startsWith("accounts/") || name === "application/account-service.ts") {
      for (const dependency of reached(file)) {
        expect(localName(dependency)).not.toMatch(/^(http|auth|server|app|persistence|security|domain|dialogue)\/|^core\.ts$/);
        expect(dependency).not.toMatch(/^(bcrypt|next|next-auth|@prisma)(\/|$)/);
      }
    }
    if (/^(domain|dialogue)\/|^core\.ts$/.test(name)) {
      for (const dependency of reached(file)) {
        expect(localName(dependency)).not.toMatch(/^(accounts|security|persistence)\/|^application\/account-service\.ts$/);
        expect(dependency).not.toMatch(/^(bcrypt|next-auth|@prisma)(\/|$)/);
      }
    }
  }
});
it("import scanner covers static, type-only, barrel, multiline, dynamic and require forms", () => {
  expect(imports(`import type { A } from "a"; export * from "b"; import("c"); require("d"); type E = import("e").E; import f = require("f"); import {\n G\n} from "g"; import "h";`)).toEqual(["a", "b", "g", "h", "c", "d", "e", "f"]);
});
it("source resolution cannot silently gain unhandled path aliases or computed imports", () => {
  const config = JSON.parse(readFileSync("tsconfig.json", "utf8")) as { compilerOptions: Record<string, unknown> };
  expect(config.compilerOptions.paths).toBeUndefined(); expect(config.compilerOptions.baseUrl).toBeUndefined();
  for (const [file, source] of sources) {
    expect(source, localName(file)).not.toMatch(/\b(?:import|require)\s*\(\s*[^\s"']/);
    for (const specifier of imports(source)) if (!specifier.startsWith(".")) {
      expect(specifier, localName(file)).not.toMatch(/^(?:src\/|@\/|~\/|[A-Za-z]:|\/)/);
    }
  }
});
