import express from "express";
import "dotenv/config";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import authRouter from "./routes/auth.routes.js";
import chatRouter from "./routes/chat.routes.js";


const app = express();

// Middleware
app.use(helmet());
app.use(morgan('dev'));

app.use(cors());
app.use(express.json());

app.use("/api/auth", authRouter);
app.use("/api/chat", chatRouter);

app.get("/", (req, res) => {
  res.send("API running");
});

export default app;