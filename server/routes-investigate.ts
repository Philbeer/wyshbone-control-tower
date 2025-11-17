import { Router } from "express";
import { db } from "../src/lib/db";
import { investigations } from "@shared/schema";
import { eq } from "drizzle-orm";

const router = Router();

// GET /tower/investigations/:id - Get a specific investigation
router.get("/investigations/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const investigation = await db.query.investigations.findFirst({
      where: eq(investigations.id, id),
    });

    if (!investigation) {
      return res.status(404).json({ error: "Investigation not found" });
    }

    res.json(investigation);
  } catch (error: any) {
    console.error("[InvestigateAPI] Error fetching investigation:", error);
    res.status(500).json({
      error: "Failed to fetch investigation",
      details: error.message,
    });
  }
});

export default router;
