import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { MessageSquare, AlertTriangle, Clock } from "lucide-react";
import { format } from "date-fns";
import { useEvaluator } from "@/contexts/EvaluatorContext";
import { useToast } from "@/hooks/use-toast";

type ConversationQualityInvestigation = {
  id: string;
  createdAt: string;
  trigger: string;
  notes?: string;
  runMeta?: {
    source?: string;
    sessionId?: string;
    userId?: string;
    flagged_message_index?: number;
    user_note?: string;
    conversation_window?: any[];
    analysis?: {
      failure_category: string;
      summary: string;
      repro_scenario: string;
      suggested_prompt_changes?: string;
      suggested_behaviour_test?: string;
    };
  };
  diagnosis?: string;
};

const FAILURE_CATEGORY_LABELS: Record<string, string> = {
  prompt_issue: "Prompt Issue",
  decision_logic_issue: "Decision Logic",
  missing_behaviour_test: "Missing Test",
  missing_clarification_logic: "Missing Clarification",
  unclear_or_ambiguous_user_input: "Unclear Input",
};

const FAILURE_CATEGORY_STYLES: Record<string, { variant: "default" | "secondary" | "destructive" | "outline", className?: string }> = {
  prompt_issue: { variant: "destructive" },
  decision_logic_issue: { variant: "destructive", className: "bg-red-600" },
  missing_behaviour_test: { variant: "default" },
  missing_clarification_logic: { variant: "secondary", className: "bg-yellow-600 text-white dark:bg-yellow-500" },
  unclear_or_ambiguous_user_input: { variant: "secondary" },
};

export function ConversationQualityCard() {
  const [investigations, setInvestigations] = useState<ConversationQualityInvestigation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedInvestigation, setSelectedInvestigation] = useState<ConversationQualityInvestigation | null>(null);
  const { setActiveInvestigationId } = useEvaluator();
  const { toast } = useToast();

  useEffect(() => {
    loadInvestigations();
  }, []);

  async function loadInvestigations() {
    try {
      setLoading(true);
      setError(null);
      
      console.log("[ConversationQualityCard] Fetching investigations from /tower/conversation-quality");
      
      const response = await fetch("/tower/conversation-quality");
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const investigations = await response.json();
      setInvestigations(investigations);
      
      console.log(`[ConversationQualityCard] Loaded ${investigations.length} investigation(s)`);
      
      // Show success toast only on retry
      if (error) {
        toast({
          title: "Investigations loaded",
          description: `Successfully loaded ${investigations.length} conversation quality investigation(s)`,
        });
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      console.error("[ConversationQualityCard] Failed to load investigations:", errorMessage);
      
      setError(errorMessage);
      setInvestigations([]);
      
      // Show error toast
      toast({
        variant: "destructive",
        title: "Failed to load investigations",
        description: errorMessage,
      });
    } finally {
      setLoading(false);
    }
  }

  const handleViewDetails = (investigation: ConversationQualityInvestigation) => {
    setSelectedInvestigation(investigation);
  };

  const handleInvestigate = (investigationId: string) => {
    setActiveInvestigationId(investigationId);
    setSelectedInvestigation(null);
  };

  return (
    <>
      <Card data-testid="card-conversation-quality">
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-primary" data-testid="icon-conversation-quality" />
              <CardTitle data-testid="text-conversation-quality-title">Conversation Quality</CardTitle>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={loadInvestigations}
              data-testid="button-refresh-conversation-quality"
            >
              Refresh
            </Button>
          </div>
          <CardDescription data-testid="text-conversation-quality-description">
            Flagged conversations from Wyshbone UI
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
                  <Skeleton className="h-4 w-full mb-1" />
                  <Skeleton className="h-3 w-32" />
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="text-center py-8" data-testid="text-error">
              <div className="flex items-center justify-center gap-2 text-destructive mb-2">
                <AlertTriangle className="h-5 w-5" />
                <span className="font-medium">Failed to load investigations</span>
              </div>
              <p className="text-sm text-muted-foreground mb-4">{error}</p>
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
            <div className="text-sm text-muted-foreground text-center py-8" data-testid="text-no-investigations">
              No conversation quality investigations yet
            </div>
          ) : (
            <div className="space-y-3">
              {investigations.slice(0, 10).map((investigation) => {
                const analysis = investigation.runMeta?.analysis;
                const category = analysis?.failure_category || "unknown";
                const categoryLabel = FAILURE_CATEGORY_LABELS[category] || category;
                const categoryStyle = FAILURE_CATEGORY_STYLES[category] || { variant: "secondary" as const };
                
                return (
                  <div
                    key={investigation.id}
                    className="border rounded-lg p-3 hover-elevate cursor-pointer"
                    onClick={() => handleViewDetails(investigation)}
                    data-testid={`card-investigation-${investigation.id}`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge 
                          variant={categoryStyle.variant}
                          className={categoryStyle.className}
                          data-testid={`badge-category-${investigation.id}`}
                        >
                          {categoryLabel}
                        </Badge>
                        {!analysis && (
                          <Badge variant="outline" data-testid={`badge-analyzing-${investigation.id}`}>
                            <Clock className="h-3 w-3 mr-1" />
                            Analyzing...
                          </Badge>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground" data-testid={`text-created-${investigation.id}`}>
                        {format(new Date(investigation.createdAt), "MMM d, HH:mm")}
                      </span>
                    </div>
                    <p className="text-sm mb-1" data-testid={`text-summary-${investigation.id}`}>
                      {analysis?.summary || "Analysis in progress..."}
                    </p>
                    <p className="text-xs text-muted-foreground" data-testid={`text-session-${investigation.id}`}>
                      Session: {investigation.runMeta?.sessionId?.substring(0, 8) || "unknown"}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selectedInvestigation} onOpenChange={() => setSelectedInvestigation(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh]" data-testid="dialog-investigation-details">
          <DialogHeader>
            <DialogTitle data-testid="text-dialog-title">Conversation Quality Investigation</DialogTitle>
            <DialogDescription data-testid="text-dialog-description">
              {selectedInvestigation?.id}
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            {selectedInvestigation && (
              <div className="space-y-4 pr-4">
                {/* Analysis Summary */}
                {selectedInvestigation.runMeta?.analysis && (
                  <div className="space-y-3">
                    <div>
                      <h4 className="font-semibold mb-2" data-testid="text-analysis-heading">Analysis</h4>
                      <div className="space-y-2">
                        <div>
                          <span className="text-sm font-medium">Category: </span>
                          <Badge
                            variant={FAILURE_CATEGORY_STYLES[selectedInvestigation.runMeta.analysis.failure_category]?.variant || "secondary"}
                            className={FAILURE_CATEGORY_STYLES[selectedInvestigation.runMeta.analysis.failure_category]?.className}
                            data-testid="badge-dialog-category"
                          >
                            {FAILURE_CATEGORY_LABELS[selectedInvestigation.runMeta.analysis.failure_category]}
                          </Badge>
                        </div>
                        <div>
                          <span className="text-sm font-medium">Summary: </span>
                          <p className="text-sm mt-1" data-testid="text-dialog-summary">
                            {selectedInvestigation.runMeta.analysis.summary}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Repro Scenario */}
                    <div>
                      <h4 className="font-semibold mb-2" data-testid="text-repro-heading">Reproducible Scenario</h4>
                      <pre className="text-xs bg-muted p-3 rounded whitespace-pre-wrap" data-testid="text-repro-scenario">
                        {selectedInvestigation.runMeta.analysis.repro_scenario}
                      </pre>
                    </div>

                    {/* Suggestions */}
                    {selectedInvestigation.runMeta.analysis.suggested_prompt_changes && (
                      <div>
                        <h4 className="font-semibold mb-2" data-testid="text-prompt-changes-heading">Suggested Prompt Changes</h4>
                        <p className="text-sm" data-testid="text-prompt-changes">
                          {selectedInvestigation.runMeta.analysis.suggested_prompt_changes}
                        </p>
                      </div>
                    )}

                    {selectedInvestigation.runMeta.analysis.suggested_behaviour_test && (
                      <div>
                        <h4 className="font-semibold mb-2" data-testid="text-behaviour-test-heading">Suggested Behaviour Test</h4>
                        <p className="text-sm" data-testid="text-behaviour-test">
                          {selectedInvestigation.runMeta.analysis.suggested_behaviour_test}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Metadata */}
                <div>
                  <h4 className="font-semibold mb-2" data-testid="text-metadata-heading">Metadata</h4>
                  <div className="text-sm space-y-1">
                    <div data-testid="text-metadata-session">
                      <span className="font-medium">Session ID:</span> {selectedInvestigation.runMeta?.sessionId}
                    </div>
                    <div data-testid="text-metadata-user">
                      <span className="font-medium">User ID:</span> {selectedInvestigation.runMeta?.userId || "anonymous"}
                    </div>
                    <div data-testid="text-metadata-flagged-index">
                      <span className="font-medium">Flagged Message Index:</span> {selectedInvestigation.runMeta?.flagged_message_index}
                    </div>
                    {selectedInvestigation.runMeta?.user_note && (
                      <div data-testid="text-metadata-user-note">
                        <span className="font-medium">User Note:</span> {selectedInvestigation.runMeta.user_note}
                      </div>
                    )}
                  </div>
                </div>

                {/* Conversation Window */}
                {selectedInvestigation.runMeta?.conversation_window && (
                  <div>
                    <h4 className="font-semibold mb-2" data-testid="text-conversation-heading">Conversation Window</h4>
                    <div className="space-y-2">
                      {selectedInvestigation.runMeta.conversation_window.map((msg: any, idx: number) => {
                        const isFlagged = idx === selectedInvestigation.runMeta?.flagged_message_index;
                        return (
                          <div
                            key={idx}
                            className={`p-2 rounded text-sm ${isFlagged ? "bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800" : "bg-muted"}`}
                            data-testid={`message-${idx}`}
                          >
                            {isFlagged && (
                              <div className="flex items-center gap-1 text-red-600 dark:text-red-400 mb-1" data-testid={`flagged-indicator-${idx}`}>
                                <AlertTriangle className="h-3 w-3" />
                                <span className="text-xs font-medium">Flagged Message</span>
                              </div>
                            )}
                            <div className="font-medium text-xs mb-1" data-testid={`message-role-${idx}`}>
                              {msg.role || "unknown"}
                            </div>
                            <div className="whitespace-pre-wrap" data-testid={`message-content-${idx}`}>
                              {typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content)}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2 pt-4 border-t">
                  <Button
                    onClick={() => handleInvestigate(selectedInvestigation.id)}
                    data-testid="button-open-in-console"
                  >
                    Open in Console
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setSelectedInvestigation(null)}
                    data-testid="button-close-dialog"
                  >
                    Close
                  </Button>
                </div>
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
}
