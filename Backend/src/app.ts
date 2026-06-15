import express from "express";
import { ErrorRequestHandler } from "express";
import "dotenv/config";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import authRouter from "./routes/auth.routes.js";
import chatRouter from "./routes/chat.routes.js";
import logger from "./services/logger.js";
import cookieParser from "cookie-parser";

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: "http://localhost:5173",
    credentials: true,
  }),
);
app.use(express.json());
app.use(morgan("dev"));
app.use(cookieParser());

app.use("/api/auth", authRouter);
app.use("/api/chat", chatRouter);

app.get("/", (req, res) => {
  res.send("API running");
});

// app.get("/test-error", (req, res) => {
//   throw new Error("Test error triggered");
// });

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
