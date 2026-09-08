import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // `npm run build` emits compiled copies of every test file; without this
    // a build followed by a test run executes each suite twice.
    exclude: ["**/node_modules/**", "dist/**"],
    env: {
      ACCESS_TOKEN_SECRET: "test-access-token-secret",
      REFRESH_TOKEN_SECRET: "test-refresh-token-secret",
      DATABASE_URL: "postgresql://test:test@localhost:5432/test",
      XAI_API_KEY: "test-xai-api-key",
      XAI_MODEL: "grok-4.6",
      GEMINI_API_KEY: "test-gemini-api-key",
      GEMINI_MODEL: "gemini-3.6-flash",
      CLOUDINARY_CLOUD_NAME: "test-cloud",
      CLOUDINARY_API_KEY: "test-cloudinary-key",
      CLOUDINARY_API_SECRET: "test-cloudinary-secret",
    },
  },
});
