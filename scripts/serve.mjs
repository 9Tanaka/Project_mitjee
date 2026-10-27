import nextEnv from "@next/env";
const dev = !process.argv.includes("--production");
process.env.NODE_ENV = dev ? "development" : "production";
nextEnv.loadEnvConfig(process.cwd(), dev, { info() {}, error() {} });
const { serve } = await import("../src/server/serve.ts");
await serve(dev);
