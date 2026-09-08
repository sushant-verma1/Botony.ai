import express from "express";
import { ErrorRequestHandler } from "express";
import "dotenv/config";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import * as Sentry from "@sentry/node";
import authRouter from "./routes/auth.routes.js";
import chatRouter from "./routes/chat.routes.js";
import attachmentRouter from "./routes/attachment.routes.js";
import logger from "./services/logger.js";
import cookieParser from "cookie-parser";

const app = express();

const allowedOrigins = (process.env.ALLOWED_ORIGINS || "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim());

app.use(helmet());
app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  }),
);
// Files never pass through this backend — they go straight from the browser
// to Cloudinary — so JSON bodies never need to carry more than metadata.
app.use(express.json({ limit: "100kb" }));
app.use(morgan("dev"));
app.use(cookieParser());

app.use("/api/auth", authRouter);
app.use("/api/chat", chatRouter);
app.use("/api/attachments", attachmentRouter);

app.get("/", (req, res) => {
  res.send("API running");
});

// app.get("/test-error", (req, res) => {
//   throw new Error("Test error triggered");
// });

// No-op if SENTRY_DSN was never set — Sentry.init() wasn't called in that
// case, so this simply doesn't attach a handler.
Sentry.setupExpressErrorHandler(app);

const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  logger.error({
    message: err.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
  });

  res.status(500).json({
    message: "Internal Server Error",
  });
};

app.use(errorHandler);

export default app;
