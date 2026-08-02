import "dotenv/config";

import express from "express";

import { chatRouter } from "./routes/chat.ts";

const app = express();
const port = Number(process.env.PORT) || 3001;

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  return next();
});

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/chat", chatRouter);

app.listen(port, () => {
  console.log(`Pepper chatbot server listening on http://localhost:${port}`);
});
