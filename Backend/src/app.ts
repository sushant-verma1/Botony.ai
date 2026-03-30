import express from "express";
import "dotenv/config";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";


const app = express();

// Middleware
app.use(helmet());
app.use(morgan('dev'));

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("API running");
});

export default app;