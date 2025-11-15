import { useEffect, useState } from "react";
import { useEvaluator } from "@/contexts/EvaluatorContext";
import { getInvestigation, getRun, type Investigation, type RunSummary } from "@/lib/evaluatorApi";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Copy, Check, AlertCircle, FileText, ExternalLink, Sparkles } from "lucide-react";
import { format } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

type PatchSuggestion = {
  id: string;
  status: string;
  summary: string | null;
  source: string;
  createdAt: string;
  updatedAt: string;
  externalLink: string | null;
  patchEvaluationId: string | null;
  evaluation?: {
    status: string;
    reasons: string[];
  };
};

export function EvaluatorConsole() {
  const { activeInvestigationId } = useEvaluator();
  const [investigation, setInvestigation] = useState<Investigation | null>(null);
  const [run, setRun] = useState<RunSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pollCount, setPollCount] = useState(0);
  const [devBriefOpen, setDevBriefOpen] = useState(false);
  const [devBrief, setDevBrief] = useState<any>(null);
  const [patchSuggestions, setPatchSuggestions] = useState<PatchSuggestion[]>([]);
  const [loadingBrief, setLoadingBrief] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [autoPatchLoading, setAutoPatchLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!activeInvestigationId) {
      setInvestigation(null);
      setRun(null);
      setError(null);
      setPollCount(0);
      return;
    }

    let pollInterval: NodeJS.Timeout | null = null;

    async function loadInvestigation() {
      try {
        setLoading(true);
        setError(null);
        const inv = await getInvestigation(activeInvestigationId!);
        setInvestigation(inv);

        if (inv.runId) {
          try {
            const runData = await getRun(inv.runId);
            setRun(runData);
          } catch {
            setRun(null);
          }
        }

        // Poll until diagnosis and patch suggestion are complete
        if ((!inv.diagnosis || !inv.patchSuggestion) && pollCount < 30) {
          pollInterval = setTimeout(() => {
            setPollCount((c) => c + 1);
          }, 2000);
        } else if (inv.diagnosis && inv.patchSuggestion) {
          // Reset poll count when investigation is complete
          setPollCount(0);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load investigation");
      } finally {
        setLoading(false);
      }
    }

    loadInvestigation();

    return () => {
      if (pollInterval) clearTimeout(pollInterval);
    };
  }, [activeInvestigationId, pollCount]);

  const handleCopy = async () => {
    if (investigation?.patchSuggestion) {
      await navigator.clipboard.writeText(investigation.patchSuggestion);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleViewDevBrief = async () => {
    if (!activeInvestigationId) return;
    
    setLoadingBrief(true);
    try {
      const response = await fetch(`/tower/investigations/${activeInvestigationId}/dev-brief`);
      if (!response.ok) throw new Error('Failed to load dev brief');
      const data = await response.json();
      setDevBrief(data);
      setDevBriefOpen(true);
    } catch (err) {
      console.error('Error loading dev brief:', err);
    } finally {
      setLoadingBrief(false);
    }
  };

  const handleAutoPatch = async () => {
    if (!activeInvestigationId) return;
    
    setAutoPatchLoading(true);
    try {
      const response = await fetch(`/tower/investigations/${activeInvestigationId}/auto-patch`, {
        method: 'POST',
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        if (data.reason === 'no_patch_possible') {
          toast({
            title: "Auto-patch not possible",
            description: data.details || "The AI could not generate a safe patch for this investigation",
            variant: "default",
          });
        } else {
          toast({
            title: "Auto-patch failed",
            description: data.details || data.error || "Failed to generate auto-patch",
            variant: "destructive",
          });
        }
        return;
      }

      toast({
        title: "Auto-patch created",
        description: `Suggestion created and ${data.evaluation?.status === 'approved' ? 'approved' : 'rejected'} by evaluation`,
      });

      loadPatchSuggestions();
    } catch (err) {
      console.error('Error auto-patching:', err);
      toast({
        title: "Auto-patch failed",
        description: err instanceof Error ? err.message : "An error occurred",
        variant: "destructive",
      });
    } finally {
      setAutoPatchLoading(false);
    }
  };

  const loadPatchSuggestions = async () => {
    if (!activeInvestigationId) return;
    
    setLoadingSuggestions(true);
    try {
      const response = await fetch(`/tower/investigations/${activeInvestigationId}/patch-suggestions`);
      if (!response.ok) throw new Error('Failed to load patch suggestions');
      const data = await response.json();
      setPatchSuggestions(data.suggestions || []);
    } catch (err) {
      console.error('Error loading patch suggestions:', err);
    } finally {
      setLoadingSuggestions(false);
    }
  };

  useEffect(() => {
    if (activeInvestigationId) {
      loadPatchSuggestions();
      
      const pollInterval = setInterval(() => {
        loadPatchSuggestions();
      }, 5000);
      
      return () => clearInterval(pollInterval);
    } else {
      setPatchSuggestions([]);
    }
  }, [activeInvestigationId]);

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'approved':
        return 'default';
      case 'rejected':
        return 'destructive';
      case 'applied':
        return 'default';
      case 'evaluating':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  if (!activeInvestigationId) {
    return (
      <Card className="h-full flex items-center justify-center">
        <CardContent className="text-center p-8">
          <div className="text-muted-foreground space-y-2">
            <p className="text-lg font-medium">Evaluator Console</p>
            <p className="text-sm">
              Select a run and click 'Investigate', or open an existing investigation to see its diagnosis here.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (loading && !investigation) {
    return (
      <Card className="h-full">
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="h-full">
        <CardContent className="p-8 text-center">
          <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
          <p className="text-destructive font-medium">{error}</p>
        </CardContent>
      </Card>
    );
  }

  if (!investigation) return null;

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="border-b">
        <CardTitle className="text-base">
          Investigation {investigation.id.slice(0, 8)}
        </CardTitle>
        <div className="text-xs text-muted-foreground space-y-1">
          <div>Time: {format(new Date(investigation.createdAt), "PPp")}</div>
          <div>Trigger: {investigation.trigger}</div>
        </div>
      </CardHeader>

      <CardContent className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Run Context Bubble */}
        <div className="space-y-2">
          <div className="text-xs font-medium text-muted-foreground">You / Run context</div>
          <div className="bg-muted rounded-lg p-3 space-y-2">
            {run && (
              <div className="text-sm space-y-1">
                <div><span className="font-medium">Source:</span> {run.source}</div>
                {run.userIdentifier && (
                  <div><span className="font-medium">User:</span> {run.userIdentifier}</div>
                )}
                {run.goalSummary && (
                  <div><span className="font-medium">Goal:</span> {run.goalSummary}</div>
                )}
                <div><span className="font-medium">Status:</span> {run.status}</div>
              </div>
            )}
            {investigation.notes && (
              <div className="text-sm border-t border-border pt-2 mt-2">
                <div className="font-medium mb-1">Notes:</div>
                <div className="whitespace-pre-wrap">{investigation.notes}</div>
              </div>
            )}
          </div>
        </div>

        {/* Diagnosis Bubble */}
        <div className="space-y-2">
          <div className="text-xs font-medium text-muted-foreground">Evaluator – Diagnosis</div>
          <div className="bg-primary/10 border border-primary/20 rounded-lg p-3">
            {investigation.diagnosis ? (
              <div className="text-sm whitespace-pre-wrap">{investigation.diagnosis}</div>
            ) : (
              <div className="text-sm text-muted-foreground italic">
                Waiting for evaluator response...
              </div>
            )}
          </div>
        </div>

        {/* Patch Suggestion Bubble */}
        {(investigation.patchSuggestion || investigation.diagnosis) && (
          <div className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground flex items-center justify-between">
              <span>Evaluator – Patch suggestion</span>
              {investigation.patchSuggestion && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleCopy}
                  data-testid="button-copy-patch"
                  className="h-6"
                >
                  {copied ? (
                    <>
                      <Check className="h-3 w-3 mr-1" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3 mr-1" />
                      Copy patch
                    </>
                  )}
                </Button>
              )}
            </div>
            <div className="bg-card border rounded-lg p-3">
              {investigation.patchSuggestion ? (
                <pre className="text-xs whitespace-pre-wrap font-mono overflow-x-auto">
                  {investigation.patchSuggestion}
                </pre>
              ) : (
                <div className="text-sm text-muted-foreground italic">
                  Waiting for patch suggestion...
                </div>
              )}
            </div>
          </div>
        )}

        {/* Junior Dev Section */}
        <div className="space-y-2 border-t pt-4">
          <div className="text-xs font-medium text-muted-foreground">Junior Developer Integration</div>
          
          <div className="flex gap-2">
            {/* Dev Brief Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={handleViewDevBrief}
              disabled={loadingBrief}
              data-testid="button-view-dev-brief"
              className="flex-1"
            >
              <FileText className="h-3 w-3 mr-2" />
              {loadingBrief ? 'Loading...' : 'View Dev Brief'}
            </Button>

            {/* Auto Patch Button */}
            <Button
              variant="default"
              size="sm"
              onClick={handleAutoPatch}
              disabled={autoPatchLoading}
              data-testid="button-auto-patch"
              className="flex-1"
            >
              <Sparkles className="h-3 w-3 mr-2" />
              {autoPatchLoading ? 'Generating...' : 'Auto patch (beta)'}
            </Button>
          </div>

          {/* Patch Suggestions List */}
          {patchSuggestions.length > 0 && (
            <div className="space-y-2 mt-3">
              <div className="text-xs font-medium text-muted-foreground">
                Patch Suggestions ({patchSuggestions.length})
              </div>
              {patchSuggestions.map((suggestion) => (
                <div
                  key={suggestion.id}
                  className="bg-card border rounded-lg p-3 space-y-2"
                  data-testid={`patch-suggestion-${suggestion.id}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium truncate">
                        {suggestion.summary || `Patch ${suggestion.id.slice(0, 8)}`}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Source: {suggestion.source} • {format(new Date(suggestion.createdAt), "PPp")}
                      </div>
                    </div>
                    <Badge variant={getStatusBadgeVariant(suggestion.status)} data-testid={`badge-status-${suggestion.status}`}>
                      {suggestion.status}
                    </Badge>
                  </div>
                  
                  {suggestion.evaluation && suggestion.evaluation.reasons && suggestion.evaluation.reasons.length > 0 && (
                    <div className="text-xs space-y-1 pt-2 border-t">
                      <div className="font-medium">Evaluation:</div>
                      <ul className="list-disc list-inside space-y-0.5 text-muted-foreground">
                        {suggestion.evaluation.reasons.slice(0, 3).map((reason, i) => (
                          <li key={i} className="truncate">{reason}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  
                  {suggestion.externalLink && (
                    <a
                      href={suggestion.externalLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline flex items-center gap-1"
                      data-testid="link-external"
                    >
                      <ExternalLink className="h-3 w-3" />
                      View change
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
          
          {loadingSuggestions && (
            <div className="text-xs text-muted-foreground italic">Loading patch suggestions...</div>
          )}
        </div>
      </CardContent>

      {/* Dev Brief Dialog */}
      <Dialog open={devBriefOpen} onOpenChange={setDevBriefOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Developer Brief / Patch Prompt</DialogTitle>
            <DialogDescription>
              Use this context to generate a patch for this investigation
            </DialogDescription>
          </DialogHeader>
          {devBrief && (
            <div className="space-y-4">
              <div className="bg-muted rounded-lg p-4">
                <pre className="text-xs whitespace-pre-wrap font-mono overflow-x-auto">
                  {JSON.stringify(devBrief, null, 2)}
                </pre>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  navigator.clipboard.writeText(JSON.stringify(devBrief, null, 2));
                }}
                data-testid="button-copy-dev-brief"
                className="w-full"
              >
                <Copy className="h-3 w-3 mr-2" />
                Copy to Clipboard
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
