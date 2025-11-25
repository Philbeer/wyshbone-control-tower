import { Router } from "express";
import { z } from "zod";
import {
  createDevIssue,
  getAllDevIssues,
  getDevIssueById,
  getDevIssueWithContext,
  gatherContextForIssue,
  updateDevIssueStatus,
} from "../src/evaluator/devIssueContextService";
import {
  generatePatchSuggestions,
  getPatchesForIssue,
} from "../src/evaluator/devIssuePatchService";
import { insertDevIssueSchema } from "../shared/schema";

const router = Router();

// POST /api/dev/issues/create - Create a new dev issue
router.post("/issues/create", async (req, res) => {
  try {
    const body = req.body;
    
    // Validate request body
    const validatedData = insertDevIssueSchema.parse({
      title: body.title,
      description: body.description,
      screenshotUrl: body.screenshotUrl || null,
      status: body.status || "new",
    });
    
    const issue = await createDevIssue(validatedData);
    res.status(201).json(issue);
  } catch (err: any) {
    console.error("[DevIssues] Error creating issue:", err);
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: "Validation error", details: err.errors });
    } else {
      res.status(500).json({ error: "Failed to create issue: " + err.message });
    }
  }
});

// POST /api/dev/issues/context - Gather context for an issue
router.post("/issues/context", async (req, res) => {
  try {
    const { issueId } = req.body;
    
    if (!issueId) {
      return res.status(400).json({ error: "issueId is required" });
    }
    
    const result = await gatherContextForIssue(issueId);
    res.status(200).json({
      success: true,
      filesFound: result.files.length,
      logsFound: result.logs ? 1 : 0,
      context: result,
    });
  } catch (err: any) {
    console.error("[DevIssues] Error gathering context:", err);
    res.status(500).json({ error: "Failed to gather context: " + err.message });
  }
});

// GET /api/dev/issues - List all issues
router.get("/issues", async (req, res) => {
  try {
    const issues = await getAllDevIssues();
    res.status(200).json(issues);
  } catch (err: any) {
    console.error("[DevIssues] Error listing issues:", err);
    res.status(500).json({ error: "Failed to list issues: " + err.message });
  }
});

// GET /api/dev/issues/:id - Get a specific issue with context
router.get("/issues/:id", async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await getDevIssueWithContext(id);
    
    if (!result) {
      return res.status(404).json({ error: "Issue not found" });
    }
    
    res.status(200).json(result);
  } catch (err: any) {
    console.error("[DevIssues] Error fetching issue:", err);
    res.status(500).json({ error: "Failed to fetch issue: " + err.message });
  }
});

// PATCH /api/dev/issues/:id/status - Update issue status
router.patch("/issues/:id/status", async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    if (!status) {
      return res.status(400).json({ error: "status is required" });
    }
    
    const validStatuses = ["new", "context_gathered", "investigating", "resolved", "closed"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ 
        error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` 
      });
    }
    
    const updated = await updateDevIssueStatus(id, status);
    
    if (!updated) {
      return res.status(404).json({ error: "Issue not found" });
    }
    
    res.status(200).json(updated);
  } catch (err: any) {
    console.error("[DevIssues] Error updating issue status:", err);
    res.status(500).json({ error: "Failed to update status: " + err.message });
  }
});

// POST /api/dev/issues/:id/suggest-patch - Generate AI patch suggestions
router.post("/issues/:id/suggest-patch", async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log(`[DevIssues] Generating patch suggestions for issue ${id}`);
    
    const result = await generatePatchSuggestions(id);
    
    res.status(200).json({
      success: true,
      issue: result.issue,
      patches: result.patches,
    });
  } catch (err: any) {
    console.error("[DevIssues] Error generating patch suggestions:", err);
    
    // Return 404 for not found errors
    if (err.message && err.message.includes("Issue not found")) {
      return res.status(404).json({ error: "Issue not found" });
    }
    
    res.status(500).json({ error: "Failed to generate patch suggestions: " + err.message });
  }
});

// GET /api/dev/issues/:id/patches - Get all patches for an issue
router.get("/issues/:id/patches", async (req, res) => {
  try {
    const { id } = req.params;
    
    const patches = await getPatchesForIssue(id);
    
    res.status(200).json(patches);
  } catch (err: any) {
    console.error("[DevIssues] Error fetching patches:", err);
    res.status(500).json({ error: "Failed to fetch patches: " + err.message });
  }
});

export default router;
