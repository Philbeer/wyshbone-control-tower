import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { MessageSquare, AlertTriangle, Clock, CheckCircle2, XCircle } from "lucide-react";
import { format } from "date-fns";
import { useEvaluator } from "@/contexts/EvaluatorContext";
import { useToast } from "@/hooks/use-toast";

type AutoConversationQualityInvestigation = {
  id: string;
  createdAt: string;
  trigger: string;
  runId?: string;
  notes?: string;
  runMeta?: {
    source?: string;
    sessionId?: string;
    userId?: string;
    runId?: string;
    conversation_transcript?: any[];
    clean?: boolean;
    analysis?: {
      failure_type: string;
      severity: string;
      summary: string;
      user_intent: string;
      expected_behaviour: string;
      actual_behaviour: string;
      suggested_fix: string;
      suggested_tests: string[];
    };
  };
  diagnosis?: string;
};

const FAILURE_TYPE_LABELS: Record<string, string> = {
  greeting_flow: "Greeting Flow",
  domain_followup: "Domain Follow-up",
  misinterpreted_intent: "Misinterpreted Intent",
  repetition: "Repetition",
  dead_end: "Dead End",
  other: "Other",
};

const FAILURE_TYPE_STYLES: Record<string, { variant: "default" | "secondary" | "destructive" | "outline", className?: string }> = {
  greeting_flow: { variant: "destructive" },
  domain_followup: { variant: "destructive", className: "bg-orange-600 dark:bg-orange-500" },
  misinterpreted_intent: { variant: "destructive", className: "bg-red-600" },
  repetition: { variant: "secondary", className: "bg-yellow-600 text-white dark:bg-yellow-500" },
  dead_end: { variant: "destructive" },
  other: { variant: "secondary" },
};

const SEVERITY_STYLES: Record<string, { variant: "default" | "secondary" | "destructive" | "outline", className?: string }> = {
  low: { variant: "secondary" },
  medium: { variant: "default", className: "bg-yellow-600 text-white dark:bg-yellow-500" },
  high: { variant: "destructive" },
};

export function AutoConversationQualityCard() {
  const [investigations, setInvestigations] = useState<AutoConversationQualityInvestigation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedInvestigation, setSelectedInvestigation] = useState<AutoConversationQualityInvestigation | null>(null);
  const { setActiveInvestigationId } = useEvaluator();
  const { toast } = useToast();

  useEffect(() => {
    loadInvestigations();
  }, []);

  async function loadInvestigations() {
    try {
      setLoading(true);
      setError(null);
      
      console.log("[AutoConversationQualityCard] Fetching auto-investigations");
      
      const response = await fetch("/tower/auto-conversation-quality");
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const investigations = await response.json();
      setInvestigations(investigations);
      
      console.log(`[AutoConversationQualityCard] Loaded ${investigations.length} investigation(s)`);
      
      if (error) {
        toast({
          title: "Investigations loaded",
          description: `Successfully loaded ${investigations.length} auto-detected investigation(s)`,
        });
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      console.error("[AutoConversationQualityCard] Failed to load investigations:", errorMessage);
      
      setError(errorMessage);
      setInvestigations([]);
      
      toast({
        variant: "destructive",
        title: "Failed to load investigations",
        description: errorMessage,
      });
    } finally {
      setLoading(false);
    }
  }

  const handleViewDetails = (investigation: AutoConversationQualityInvestigation) => {
    setSelectedInvestigation(investigation);
  };

  const handleInvestigate = (investigationId: string) => {
    setActiveInvestigationId(investigationId);
    setSelectedInvestigation(null);
  };

  const hasFailure = (investigation: AutoConversationQualityInvestigation) => {
    return investigation.runMeta?.analysis && !investigation.runMeta?.clean;
  };

  return (
    <>
      <Card data-testid="card-auto-conversation-quality">
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-primary" data-testid="icon-auto-conversation-quality" />
              <CardTitle data-testid="text-auto-conversation-quality-title">Auto Conversation Quality</CardTitle>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={loadInvestigations}
              data-testid="button-refresh-auto-conversation-quality"
            >
              Refresh
            </Button>
          </div>
          <CardDescription data-testid="text-auto-conversation-quality-description">
            Automatic analysis of live user conversations
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3" data-testid="container-loading">
              {[1, 2, 3].map((i) => (
                <div key={i} className="border rounded-lg p-3">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-5 w-24" />
                      <Skeleton className="h-5 w-20" />
                    </div>
                    <Skeleton className="h-4 w-16" />
                  </div>
                  <Skeleton className="h-16 w-full mt-2" />
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="text-center py-8" data-testid="container-error">
              <AlertTriangle className="h-12 w-12 text-destructive mx-auto mb-3" />
              <p className="text-sm text-muted-foreground mb-3">{error}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={loadInvestigations}
                data-testid="button-retry"
              >
                Retry
              </Button>
            </div>
          ) : investigations.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground" data-testid="text-no-investigations">
              No automatic conversation quality investigations yet
            </div>
          ) : (
            <ScrollArea className="h-96">
              <div className="space-y-2">
                {investigations.slice(0, 20).map((inv) => {
                  const hasIssue = hasFailure(inv);
                  const analysis = inv.runMeta?.analysis;
                  
                  return (
                    <div
                      key={inv.id}
                      className="border rounded-lg p-3 hover-elevate cursor-pointer transition-all"
                      onClick={() => handleViewDetails(inv)}
                      data-testid={`investigation-${inv.id}`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          {hasIssue ? (
                            <>
                              <XCircle className="h-4 w-4 text-destructive flex-shrink-0" />
                              {analysis && (
                                <>
                                  <Badge
                                    {...FAILURE_TYPE_STYLES[analysis.failure_type]}
                                    data-testid={`badge-failure-type-${inv.id}`}
                                  >
                                    {FAILURE_TYPE_LABELS[analysis.failure_type] || analysis.failure_type}
                                  </Badge>
                                  <Badge
                                    {...SEVERITY_STYLES[analysis.severity]}
                                    data-testid={`badge-severity-${inv.id}`}
                                  >
                                    {analysis.severity.toUpperCase()}
                                  </Badge>
                                </>
                              )}
                            </>
                          ) : (
                            <>
                              <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
                              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                                Clean
                              </Badge>
                            </>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground whitespace-nowrap">
                          <Clock className="h-3 w-3" />
                          <span>{format(new Date(inv.createdAt), "MMM d, HH:mm")}</span>
                        </div>
                      </div>
                      
                      {hasIssue && analysis ? (
                        <div className="text-sm">
                          <p className="text-muted-foreground line-clamp-2" data-testid={`text-summary-${inv.id}`}>
                            {analysis.summary}
                          </p>
                          <div className="mt-2 text-xs text-muted-foreground">
                            <span className="font-medium">User intent:</span> {analysis.user_intent}
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          No conversation quality issues detected
                        </p>
                      )}
                      
                      <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                        <span>Session: {inv.runMeta?.sessionId?.substring(0, 12) || "unknown"}</span>
                        <span>•</span>
                        <span>User: {inv.runMeta?.userId || "anonymous"}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {selectedInvestigation && (
        <Dialog open={!!selectedInvestigation} onOpenChange={() => setSelectedInvestigation(null)}>
          <DialogContent className="max-w-3xl max-h-[80vh]">
            <DialogHeader>
              <DialogTitle>
                {hasFailure(selectedInvestigation) ? "Conversation Quality Issue" : "Clean Conversation"}
              </DialogTitle>
              <DialogDescription>
                Investigation ID: {selectedInvestigation.id}
              </DialogDescription>
            </DialogHeader>
            
            <ScrollArea className="max-h-[60vh]">
              <div className="space-y-4">
                {hasFailure(selectedInvestigation) && selectedInvestigation.runMeta?.analysis && (
                  <>
                    <div>
                      <h4 className="font-semibold mb-2">Analysis Summary</h4>
                      <div className="flex items-center gap-2 mb-2">
                        <Badge {...FAILURE_TYPE_STYLES[selectedInvestigation.runMeta.analysis.failure_type]}>
                          {FAILURE_TYPE_LABELS[selectedInvestigation.runMeta.analysis.failure_type]}
                        </Badge>
                        <Badge {...SEVERITY_STYLES[selectedInvestigation.runMeta.analysis.severity]}>
                          {selectedInvestigation.runMeta.analysis.severity.toUpperCase()}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {selectedInvestigation.runMeta.analysis.summary}
                      </p>
                    </div>
                    
                    <div>
                      <h4 className="font-semibold mb-2">User Intent</h4>
                      <p className="text-sm text-muted-foreground">
                        {selectedInvestigation.runMeta.analysis.user_intent}
                      </p>
                    </div>
                    
                    <div>
                      <h4 className="font-semibold mb-2">Expected Behaviour</h4>
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                        {selectedInvestigation.runMeta.analysis.expected_behaviour}
                      </p>
                    </div>
                    
                    <div>
                      <h4 className="font-semibold mb-2">Actual Behaviour</h4>
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                        {selectedInvestigation.runMeta.analysis.actual_behaviour}
                      </p>
                    </div>
                    
                    <div>
                      <h4 className="font-semibold mb-2">Suggested Fix</h4>
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                        {selectedInvestigation.runMeta.analysis.suggested_fix}
                      </p>
                    </div>
                    
                    {selectedInvestigation.runMeta.analysis.suggested_tests.length > 0 && (
                      <div>
                        <h4 className="font-semibold mb-2">Suggested Behaviour Tests</h4>
                        <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                          {selectedInvestigation.runMeta.analysis.suggested_tests.map((test, i) => (
                            <li key={i}>{test}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </>
                )}
                
                {!hasFailure(selectedInvestigation) && (
                  <div className="text-center py-8">
                    <CheckCircle2 className="h-12 w-12 text-green-600 mx-auto mb-3" />
                    <p className="text-lg font-semibold text-green-700">No Issues Detected</p>
                    <p className="text-sm text-muted-foreground mt-2">
                      This conversation met all quality expectations per Wyshbone V1 spec
                    </p>
                  </div>
                )}
                
                <div>
                  <h4 className="font-semibold mb-2">Run Information</h4>
                  <div className="text-sm text-muted-foreground space-y-1">
                    <p>Run ID: {selectedInvestigation.runId || selectedInvestigation.runMeta?.runId || "unknown"}</p>
                    <p>Session: {selectedInvestigation.runMeta?.sessionId || "unknown"}</p>
                    <p>User: {selectedInvestigation.runMeta?.userId || "anonymous"}</p>
                    <p>Created: {format(new Date(selectedInvestigation.createdAt), "PPpp")}</p>
                  </div>
                </div>
              </div>
            </ScrollArea>
            
            <div className="flex justify-end gap-2 mt-4">
              {hasFailure(selectedInvestigation) && (
                <Button
                  onClick={() => handleInvestigate(selectedInvestigation.id)}
                  data-testid="button-open-console"
                >
                  Open in Console
                </Button>
              )}
              <Button
                variant="outline"
                onClick={() => setSelectedInvestigation(null)}
                data-testid="button-close-dialog"
              >
                Close
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
