import { useEffect, useState, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { FileX2, AlertTriangle, Clock } from "lucide-react";
import { format } from "date-fns";
import { useEvaluator } from "@/contexts/EvaluatorContext";
import { useToast } from "@/hooks/use-toast";

type PatchFailureInvestigation = {
  id: string;
  createdAt: string;
  trigger: string;
  notes?: string;
  runMeta?: {
    source?: string;
    original_investigation_id?: string;
    patch_id?: string;
    patch_diff?: string;
    sandbox_result?: {
      status: string;
      reasons: string[];
      riskLevel?: string;
    };
    analysis?: {
      failure_reason: string;
      failure_category: string;
      next_step: string;
      suggested_constraints_for_next_patch?: string;
    };
  };
  diagnosis?: string;
};

const FAILURE_CATEGORY_LABELS: Record<string, string> = {
  broke_existing_tests: "Broke Tests",
  did_not_fix_original_issue: "Didn't Fix Issue",
  misinterpreted_requirement: "Misinterpreted",
  test_is_ambiguous_or_wrong: "Ambiguous Test",
  wrong_repo_or_layer: "Wrong Layer",
  insufficient_context: "Insufficient Context",
  other: "Other",
};

const FAILURE_CATEGORY_STYLES: Record<string, { variant: "default" | "secondary" | "destructive" | "outline", className?: string }> = {
  broke_existing_tests: { variant: "destructive" },
  did_not_fix_original_issue: { variant: "destructive", className: "bg-orange-600 text-white dark:bg-orange-500" },
  misinterpreted_requirement: { variant: "secondary", className: "bg-yellow-600 text-white dark:bg-yellow-500" },
  test_is_ambiguous_or_wrong: { variant: "secondary" },
  wrong_repo_or_layer: { variant: "outline" },
  insufficient_context: { variant: "default" },
  other: { variant: "secondary" },
};

export function PatchFailuresCard() {
  const [investigations, setInvestigations] = useState<PatchFailureInvestigation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedInvestigation, setSelectedInvestigation] = useState<PatchFailureInvestigation | null>(null);
  const lastErrorToastRef = useRef<number>(0);
  const { setActiveInvestigationId } = useEvaluator();
  const { toast } = useToast();

  useEffect(() => {
    loadInvestigations();
  }, []);

  async function loadInvestigations() {
    try {
      setLoading(true);
      setError(null);
      
      console.log("[PatchFailuresCard] Fetching investigations from /tower/patch-failures");
      
      const response = await fetch("/tower/patch-failures");
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const investigations = await response.json();
      setInvestigations(investigations);
      
      console.log(`[PatchFailuresCard] Loaded ${investigations.length} investigation(s)`);
      
      // Reset error toast throttle on success
      lastErrorToastRef.current = 0;
      
      // Only show success toast if we had an error before
      if (error) {
        toast({
          title: "Investigations loaded",
          description: `Successfully loaded ${investigations.length} patch failure investigation(s)`,
        });
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      console.error("[PatchFailuresCard] Failed to load investigations:", errorMessage);
      
      setError(errorMessage);
      setInvestigations([]);
      
      // Only show toast if at least 5 seconds passed since last error toast
      const now = Date.now();
      const MIN_TOAST_INTERVAL = 5000;
      if (now - lastErrorToastRef.current > MIN_TOAST_INTERVAL) {
        lastErrorToastRef.current = now;
        toast({
          variant: "destructive",
          title: "Failed to load investigations",
          description: errorMessage,
        });
      }
    } finally {
      setLoading(false);
    }
  }

  const handleViewDetails = (investigation: PatchFailureInvestigation) => {
    setSelectedInvestigation(investigation);
  };

  const handleInvestigate = (investigationId: string) => {
    setActiveInvestigationId(investigationId);
    setSelectedInvestigation(null);
  };

  return (
    <>
      <Card data-testid="card-patch-failures">
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <FileX2 className="h-5 w-5 text-primary" data-testid="icon-patch-failures" />
              <CardTitle data-testid="text-patch-failures-title">Patch Failures</CardTitle>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={loadInvestigations}
              data-testid="button-refresh-patch-failures"
            >
              Refresh
            </Button>
          </div>
          <CardDescription data-testid="text-patch-failures-description">
            Auto-generated patches rejected by evaluator
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
              No patch failure investigations yet
            </div>
          ) : (
            <div className="space-y-3">
              {investigations.slice(0, 10).map((investigation) => {
                const analysis = investigation.runMeta?.analysis;
                const category = analysis?.failure_category || "other";
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
                        {investigation.runMeta?.sandbox_result?.riskLevel && (
                          <Badge variant="outline" data-testid={`badge-risk-${investigation.id}`}>
                            {investigation.runMeta.sandbox_result.riskLevel} risk
                          </Badge>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground" data-testid={`text-created-${investigation.id}`}>
                        {format(new Date(investigation.createdAt), "MMM d, HH:mm")}
                      </span>
                    </div>
                    <p className="text-sm mb-1" data-testid={`text-reason-${investigation.id}`}>
                      {analysis?.failure_reason || investigation.runMeta?.sandbox_result?.reasons[0] || "Analysis in progress..."}
                    </p>
                    <p className="text-xs text-muted-foreground" data-testid={`text-patch-${investigation.id}`}>
                      Patch: {investigation.runMeta?.patch_id?.substring(0, 8) || "unknown"}
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
            <DialogTitle data-testid="text-dialog-title">Patch Failure Investigation</DialogTitle>
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
                          <span className="text-sm font-medium">Failure Reason: </span>
                          <p className="text-sm mt-1" data-testid="text-dialog-failure-reason">
                            {selectedInvestigation.runMeta.analysis.failure_reason}
                          </p>
                        </div>
                        <div>
                          <span className="text-sm font-medium">Next Step: </span>
                          <p className="text-sm mt-1" data-testid="text-dialog-next-step">
                            {selectedInvestigation.runMeta.analysis.next_step}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Suggested Constraints */}
                    {selectedInvestigation.runMeta.analysis.suggested_constraints_for_next_patch && (
                      <div>
                        <h4 className="font-semibold mb-2" data-testid="text-constraints-heading">Suggested Constraints for Next Patch</h4>
                        <p className="text-sm" data-testid="text-constraints">
                          {selectedInvestigation.runMeta.analysis.suggested_constraints_for_next_patch}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Sandbox Result */}
                {selectedInvestigation.runMeta?.sandbox_result && (
                  <div>
                    <h4 className="font-semibold mb-2" data-testid="text-sandbox-heading">Sandbox Evaluation Result</h4>
                    <div className="space-y-2">
                      <div>
                        <span className="text-sm font-medium">Status: </span>
                        <Badge variant="destructive" data-testid="badge-dialog-status">
                          {selectedInvestigation.runMeta.sandbox_result.status}
                        </Badge>
                      </div>
                      {selectedInvestigation.runMeta.sandbox_result.riskLevel && (
                        <div>
                          <span className="text-sm font-medium">Risk Level: </span>
                          <Badge variant="outline" data-testid="badge-dialog-risk">
                            {selectedInvestigation.runMeta.sandbox_result.riskLevel}
                          </Badge>
                        </div>
                      )}
                      <div>
                        <span className="text-sm font-medium">Rejection Reasons:</span>
                        <ul className="list-disc list-inside text-sm mt-1 space-y-1" data-testid="list-rejection-reasons">
                          {selectedInvestigation.runMeta.sandbox_result.reasons.map((reason, idx) => (
                            <li key={idx} data-testid={`reason-${idx}`}>{reason}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                )}

                {/* Patch Diff */}
                {selectedInvestigation.runMeta?.patch_diff && (
                  <div>
                    <h4 className="font-semibold mb-2" data-testid="text-patch-diff-heading">Patch Diff</h4>
                    <pre className="text-xs bg-muted p-3 rounded whitespace-pre-wrap overflow-x-auto" data-testid="text-patch-diff">
                      {selectedInvestigation.runMeta.patch_diff.substring(0, 2000)}
                      {selectedInvestigation.runMeta.patch_diff.length > 2000 && "\n... (truncated)"}
                    </pre>
                  </div>
                )}

                {/* Metadata */}
                <div>
                  <h4 className="font-semibold mb-2" data-testid="text-metadata-heading">Metadata</h4>
                  <div className="text-sm space-y-1">
                    <div data-testid="text-metadata-original-investigation">
                      <span className="font-medium">Original Investigation:</span> {selectedInvestigation.runMeta?.original_investigation_id}
                    </div>
                    <div data-testid="text-metadata-patch-id">
                      <span className="font-medium">Patch ID:</span> {selectedInvestigation.runMeta?.patch_id}
                    </div>
                  </div>
                </div>

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
