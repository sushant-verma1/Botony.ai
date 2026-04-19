import "dotenv/config";
import app from "./src/app.js";
import { prisma } from "./src/config/db.js";

const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    // start server
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });

    // connect DB

    await prisma.$connect();
    console.log(" Database connected");
  } catch (error) {
    console.error(" Failed to start server:", error);
    process.exit(1);
  }
}

startServer();
