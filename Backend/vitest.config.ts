import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    env: {
      ACCESS_TOKEN_SECRET: "test-access-token-secret",
      REFRESH_TOKEN_SECRET: "test-refresh-token-secret",
      DATABASE_URL: "postgresql://test:test@localhost:5432/test",
      ANTHROPIC_API_KEY: "test-anthropic-api-key",
    },
  },
});
