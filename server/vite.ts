import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { createServer as createViteServer, createLogger } from "vite";
import { type Server } from "http";
import viteConfig from "../vite.config";
import { nanoid } from "nanoid";

const viteLogger = createLogger();

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

export async function setupVite(app: Express, server: Server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      },
    },
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "..",
        "client",
        "index.html",
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`,
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  // Vite builds to dist/public relative to project root
  const distPath = path.resolve(import.meta.dirname, "..", "dist", "public");

  if (!fs.existsSync(distPath)) {
    console.warn(`Static build directory not found: ${distPath}`);
    console.warn('React dashboard will not be available. Run "npm run build" to build the frontend.');
    return;
  }

  app.use(express.static(distPath));

  // fall through to index.html for SPA routing (but not for API routes)
  app.use("*", (req, res, next) => {
    // Don't intercept API routes or server-rendered pages
    if (req.originalUrl.startsWith('/api/') || 
        req.originalUrl.startsWith('/tower/') ||
        req.originalUrl.startsWith('/status') ||
        req.originalUrl.startsWith('/health') ||
        req.originalUrl.startsWith('/tasks') ||
        req.originalUrl.startsWith('/investigations') ||
        req.originalUrl.startsWith('/critical-path') ||
        req.originalUrl.startsWith('/evaluator-tasks') ||
        req.originalUrl.startsWith('/proxy/')) {
      return next();
    }
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
