import express, { Request, Response } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { connectDB, pingDB } from "./db";
import { preAuthRoutes, postAuthRoutes } from "./api/v1/routes";
import { errorHandler } from "./api/v1/middlewares";
import { API_PREFIX } from "./api/v1/common/constants";
import { config } from "./config/env";
import passport from "./config/passport.config";

connectDB();

export function createApp() {
  const app = express();
  app.set("trust proxy", 1);
  app.use(
    cors({
      origin: config.app.frontendBaseUrl,
      credentials: true,
    }),
  );
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.use(passport.initialize());

  app.get("/health", async (_req: Request, res: Response) => {
    const dbOk = await pingDB();
    if (dbOk) {
      res.json({
        status: "ok",
        timestamp: new Date().toISOString(),
        database: "connected",
      });
    } else {
      res.status(503).json({
        status: "degraded",
        timestamp: new Date().toISOString(),
        database: "disconnected",
      });
    }
  });

  app.use(API_PREFIX, preAuthRoutes);
  app.use(API_PREFIX, postAuthRoutes);

  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: "Route not found" });
  });

  app.use(errorHandler);
  return app;
}
