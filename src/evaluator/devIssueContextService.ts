import { db } from "../lib/db";
import { devIssues, devIssueContext, type InsertDevIssue, type InsertDevIssueContext, type DevIssue, type DevIssueContext } from "../../shared/schema";
import { eq, desc } from "drizzle-orm";
import { readFileSync, readdirSync, statSync, existsSync } from "fs";
import { join, resolve } from "path";

// Create a new dev issue
export async function createDevIssue(data: InsertDevIssue): Promise<DevIssue> {
  const [issue] = await db.insert(devIssues).values(data).returning();
  return issue;
}

// Get all dev issues
export async function getAllDevIssues(): Promise<DevIssue[]> {
  return await db.select().from(devIssues).orderBy(desc(devIssues.createdAt));
}

// Get a specific dev issue by ID
export async function getDevIssueById(id: string): Promise<DevIssue | undefined> {
  const [issue] = await db.select().from(devIssues).where(eq(devIssues.id, id));
  return issue;
}

// Get context for a specific issue
export async function getDevIssueContextByIssueId(issueId: string): Promise<DevIssueContext[]> {
  return await db.select().from(devIssueContext).where(eq(devIssueContext.issueId, issueId));
}

// Add context to an issue
export async function addDevIssueContext(data: InsertDevIssueContext): Promise<DevIssueContext> {
  const [context] = await db.insert(devIssueContext).values(data).returning();
  return context;
}

// Update issue status
export async function updateDevIssueStatus(id: string, status: string): Promise<DevIssue | undefined> {
  const [updated] = await db.update(devIssues).set({ status }).where(eq(devIssues.id, id)).returning();
  return updated;
}

// Get issue with its context
export async function getDevIssueWithContext(id: string): Promise<{ issue: DevIssue; context: DevIssueContext[] } | undefined> {
  const issue = await getDevIssueById(id);
  if (!issue) return undefined;
  
  const context = await getDevIssueContextByIssueId(id);
  return { issue, context };
}

// Extract search keywords from issue description and title
function extractKeywords(text: string): string[] {
  const keywords: string[] = [];
  
  // Extract quoted phrases (UI labels, error messages)
  const quotedMatches = text.match(/"([^"]+)"|'([^']+)'/g);
  if (quotedMatches) {
    keywords.push(...quotedMatches.map(m => m.slice(1, -1).toLowerCase()));
  }
  
  // Extract error-like patterns
  const errorPatterns = text.match(/(?:error|failed|cannot|unable|exception|crash|bug|issue|broken|wrong)[:\s]+([^\n.!?]+)/gi);
  if (errorPatterns) {
    keywords.push(...errorPatterns.map(m => m.toLowerCase().trim()));
  }
  
  // Extract capitalized words (likely component or function names)
  const capitalWords = text.match(/\b[A-Z][a-z]+(?:[A-Z][a-z]+)+\b/g);
  if (capitalWords) {
    keywords.push(...capitalWords.map(m => m.toLowerCase()));
  }
  
  // Extract common UI element words
  const uiWords = ['button', 'form', 'input', 'modal', 'dialog', 'table', 'list', 'card', 'page', 'dashboard'];
  const words = text.toLowerCase().split(/\s+/);
  for (const word of words) {
    if (uiWords.some(ui => word.includes(ui))) {
      keywords.push(word);
    }
  }
  
  // Extract significant words (length > 4, not common words)
  const commonWords = ['this', 'that', 'with', 'have', 'will', 'from', 'when', 'what', 'they', 'been', 'were', 'your', 'more', 'some', 'their', 'about', 'which', 'would', 'there', 'could', 'other', 'after', 'first', 'should'];
  const significantWords = text.toLowerCase()
    .split(/[\s.,!?;:()[\]{}]+/)
    .filter(w => w.length > 4 && !commonWords.includes(w) && /^[a-z]+$/.test(w));
  keywords.push(...significantWords);
  
  // Remove duplicates
  return Array.from(new Set(keywords));
}

// Search directories to look in
const SEARCH_DIRECTORIES = [
  'client/src/components',
  'client/src/pages',
  'client/src/lib',
  'client/src/api',
  'client/src/hooks',
  'server',
  'src/evaluator',
  'src/lib',
  'shared',
  'lib',
];

// File extensions to search
const SEARCH_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.json'];

// Recursively find files matching extensions
function findFiles(dir: string, extensions: string[], files: string[] = []): string[] {
  try {
    const fullPath = resolve(process.cwd(), dir);
    if (!existsSync(fullPath)) return files;
    
    const entries = readdirSync(fullPath);
    for (const entry of entries) {
      const entryPath = join(fullPath, entry);
      const stat = statSync(entryPath);
      
      if (stat.isDirectory()) {
        // Skip node_modules, .git, etc
        if (!['node_modules', '.git', 'dist', '.cache'].includes(entry)) {
          findFiles(join(dir, entry), extensions, files);
        }
      } else if (extensions.some(ext => entry.endsWith(ext))) {
        files.push(join(dir, entry));
      }
    }
  } catch (err) {
    // Ignore errors (permission denied, etc.)
  }
  return files;
}

// Search for files containing keywords
function searchFilesForKeywords(keywords: string[], maxResults: number = 10): { path: string; content: string; matchCount: number }[] {
  const results: { path: string; content: string; matchCount: number }[] = [];
  
  for (const dir of SEARCH_DIRECTORIES) {
    const files = findFiles(dir, SEARCH_EXTENSIONS);
    
    for (const filePath of files) {
      try {
        const fullPath = resolve(process.cwd(), filePath);
        const content = readFileSync(fullPath, 'utf-8');
        const lowerContent = content.toLowerCase();
        
        // Count how many keywords match
        let matchCount = 0;
        for (const keyword of keywords) {
          if (lowerContent.includes(keyword.toLowerCase())) {
            matchCount++;
          }
        }
        
        if (matchCount > 0) {
          results.push({
            path: filePath,
            content: content.length > 10000 ? content.substring(0, 10000) + '\n... (truncated)' : content,
            matchCount
          });
        }
      } catch (err) {
        // Skip files that can't be read
      }
    }
  }
  
  // Sort by match count and return top results
  results.sort((a, b) => b.matchCount - a.matchCount);
  return results.slice(0, maxResults);
}

// Fetch recent logs from log file or in-memory (simplified version)
function fetchRecentLogs(keywords: string[], maxLines: number = 50): string {
  const logLines: string[] = [];
  
  // Try to read from common log locations
  const logPaths = [
    '/tmp/tower.log',
    'logs/server.log',
    'server.log',
  ];
  
  for (const logPath of logPaths) {
    try {
      const fullPath = resolve(process.cwd(), logPath);
      if (existsSync(fullPath)) {
        const content = readFileSync(fullPath, 'utf-8');
        const lines = content.split('\n');
        logLines.push(...lines.slice(-200)); // Get last 200 lines
      }
    } catch (err) {
      // Ignore errors
    }
  }
  
  // If no log files found, provide a helpful message
  if (logLines.length === 0) {
    return 'No server logs available. Check the console output for recent logs.';
  }
  
  // Filter lines by keywords
  const lowerKeywords = keywords.map(k => k.toLowerCase());
  const matchingLines = logLines.filter(line => {
    const lowerLine = line.toLowerCase();
    return lowerKeywords.some(keyword => lowerLine.includes(keyword)) ||
           lowerLine.includes('error') ||
           lowerLine.includes('exception') ||
           lowerLine.includes('failed');
  });
  
  // Return last N matching lines
  return matchingLines.slice(-maxLines).join('\n') || 'No matching log entries found.';
}

// Main context gathering function
export async function gatherContextForIssue(issueId: string): Promise<{ files: DevIssueContext[]; logs: DevIssueContext | null }> {
  const issue = await getDevIssueById(issueId);
  if (!issue) {
    throw new Error(`Issue not found: ${issueId}`);
  }
  
  // Extract keywords from title and description
  const searchText = `${issue.title} ${issue.description}`;
  const keywords = extractKeywords(searchText);
  
  console.log(`[DevIssue] Gathering context for issue ${issueId}`);
  console.log(`[DevIssue] Keywords extracted: ${keywords.slice(0, 10).join(', ')}`);
  
  // Search for relevant files
  const matchingFiles = searchFilesForKeywords(keywords, 5);
  console.log(`[DevIssue] Found ${matchingFiles.length} relevant files`);
  
  // Store file contexts
  const fileContexts: DevIssueContext[] = [];
  for (const file of matchingFiles) {
    const ctx = await addDevIssueContext({
      issueId,
      filePath: file.path,
      fileContents: file.content,
      logExcerpt: null,
    });
    fileContexts.push(ctx);
  }
  
  // Fetch and store logs
  const logExcerpt = fetchRecentLogs(keywords);
  let logContext: DevIssueContext | null = null;
  if (logExcerpt && logExcerpt !== 'No server logs available. Check the console output for recent logs.') {
    logContext = await addDevIssueContext({
      issueId,
      filePath: null,
      fileContents: null,
      logExcerpt,
    });
  }
  
  // Update issue status
  await updateDevIssueStatus(issueId, 'context_gathered');
  
  console.log(`[DevIssue] Context gathering complete for issue ${issueId}`);
  
  return { files: fileContexts, logs: logContext };
}
