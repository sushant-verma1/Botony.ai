import winston from "winston";

const readableFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.printf(({ level, message, timestamp, ...meta }) => {
    return `${timestamp} [${level.toUpperCase()}]: ${message} ${
      Object.keys(meta).length ? "\n" + JSON.stringify(meta, null, 2) : ""
    }`;
  }),
);

const logger = winston.createLogger({
  level: "info",
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(winston.format.colorize(), readableFormat),
    }),

    new winston.transports.File({
      filename: "logs/error.log",
      level: "error",
      format: readableFormat,
    }),

    new winston.transports.File({
      filename: "logs/combined.log",
      format: readableFormat,
    }),
  ],
});

export default logger;
