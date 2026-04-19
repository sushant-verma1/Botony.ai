import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { connectionString } from "./config.js";

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

process.on("exit", async () => {
  await prisma.$disconnect();
});

export { prisma };