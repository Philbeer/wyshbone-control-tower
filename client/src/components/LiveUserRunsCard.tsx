import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertCircle, Search } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useEvaluator } from "@/contexts/EvaluatorContext";
import { createInvestigationFromLiveRun } from "@/api/liveUserRuns";
import { queryClient } from "@/lib/queryClient";
import type { RunSummary } from "../../../src/evaluator/runStore";
import { formatDistanceToNow } from "date-fns";

export function LiveUserRunsCard() {
  const [selectedRun, setSelectedRun] = useState<RunSummary | null>(null);
  const { setActiveInvestigationId } = useEvaluator();
  const { toast } = useToast();

  const { data: runs, isLoading } = useQuery<RunSummary[]>({
    queryKey: ["/tower", "runs", "live"],
    refetchInterval: 30000,
  });

  const investigateMutation = useMutation({
    mutationFn: createInvestigationFromLiveRun,
    onSuccess: (investigation) => {
      queryClient.invalidateQueries({ queryKey: ["/tower/evaluator/investigations"] });
      setActiveInvestigationId(investigation.id);
      setSelectedRun(null);
      toast({
        title: "Investigation created",
        description: "The evaluator is analyzing this live run...",
      });
    },
    onError: (error) => {
      toast({
        title: "Investigation failed",
        description: error instanceof Error ? error.message : "Failed to create investigation",
        variant: "destructive",
      });
    },
  });

  const handleInvestigate = (run: RunSummary) => {
    investigateMutation.mutate(run.id);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'success':
      case 'completed':
        return <Badge variant="default" data-testid={`status-${status}`}>Success</Badge>;
      case 'error':
        return <Badge variant="destructive" data-testid={`status-${status}`}>Error</Badge>;
      case 'timeout':
        return <Badge variant="destructive" data-testid={`status-${status}`}>Timeout</Badge>;
      case 'fail':
        return <Badge variant="destructive" data-testid={`status-${status}`}>Fail</Badge>;
      default:
        return <Badge variant="secondary" data-testid={`status-${status}`}>{status}</Badge>;
    }
  };

  const truncate = (text: string, maxLength: number) => {
    if (!text) return '';
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Recent Live Runs</CardTitle>
          <CardDescription>Real user conversations from Wyshbone UI</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!runs || runs.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Recent Live Runs</CardTitle>
          <CardDescription>Real user conversations from Wyshbone UI</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <AlertCircle className="h-12 w-12 mx-auto mb-2" />
            <p>No live user runs yet</p>
            <p className="text-sm mt-1">Runs will appear here when users interact with Wyshbone UI</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Recent Live Runs</CardTitle>
          <CardDescription>
            Real user conversations from Wyshbone UI ({runs.length} recent)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {runs.map((run) => {
              const inputText = run.meta?.requestText || run.goalSummary || 'No input';
              const outputText = run.meta?.responseText || 'No response';
              const durationMs = run.meta?.durationMs;
              const sessionId = run.meta?.sessionId;

              return (
                <div
                  key={run.id}
                  className="border rounded-lg p-3 hover-elevate cursor-pointer"
                  onClick={() => setSelectedRun(run)}
                  data-testid={`live-run-${run.id}`}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      {getStatusBadge(run.status)}
                      <span className="text-xs text-muted-foreground" data-testid={`run-time-${run.id}`}>
                        {formatDistanceToNow(new Date(run.createdAt), { addSuffix: true })}
                      </span>
                      {durationMs && (
                        <span className="text-xs text-muted-foreground" data-testid={`run-duration-${run.id}`}>
                          {durationMs}ms
                        </span>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleInvestigate(run);
                      }}
                      disabled={investigateMutation.isPending}
                      data-testid={`button-investigate-${run.id}`}
                    >
                      <Search className="h-4 w-4 mr-1" />
                      Investigate
                    </Button>
                  </div>
                  
                  <div className="space-y-1">
                    {run.userIdentifier && (
                      <p className="text-xs text-muted-foreground" data-testid={`run-user-${run.id}`}>
                        User: {run.userIdentifier}
                      </p>
                    )}
                    {sessionId && (
                      <p className="text-xs text-muted-foreground" data-testid={`run-session-${run.id}`}>
                        Session: {sessionId}
                      </p>
                    )}
                    <p className="text-sm" data-testid={`run-input-${run.id}`}>
                      <strong>Input:</strong> {truncate(inputText, 80)}
                    </p>
                    <p className="text-sm text-muted-foreground" data-testid={`run-output-${run.id}`}>
                      <strong>Output:</strong> {truncate(outputText, 80)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!selectedRun} onOpenChange={(open) => !open && setSelectedRun(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto" data-testid="dialog-run-details">
          <DialogHeader>
            <DialogTitle>Live Run Details</DialogTitle>
            <DialogDescription>
              Complete information for this user interaction
            </DialogDescription>
          </DialogHeader>

          {selectedRun && (
            <div className="space-y-4">
              <div>
                <h4 className="font-semibold mb-2">Metadata</h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Run ID:</span>
                    <p className="font-mono text-xs" data-testid="detail-run-id">{selectedRun.id}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Status:</span>
                    <div data-testid="detail-status">{getStatusBadge(selectedRun.status)}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Created:</span>
                    <p data-testid="detail-created">
                      {new Date(selectedRun.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Duration:</span>
                    <p data-testid="detail-duration">
                      {selectedRun.meta?.durationMs ? `${selectedRun.meta.durationMs}ms` : 'N/A'}
                    </p>
                  </div>
                  {selectedRun.userIdentifier && (
                    <div>
                      <span className="text-muted-foreground">User:</span>
                      <p data-testid="detail-user">{selectedRun.userIdentifier}</p>
                    </div>
                  )}
                  {selectedRun.meta?.sessionId && (
                    <div>
                      <span className="text-muted-foreground">Session:</span>
                      <p className="font-mono text-xs" data-testid="detail-session">
                        {selectedRun.meta.sessionId}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <h4 className="font-semibold mb-2">User Input</h4>
                <div className="bg-muted p-3 rounded-md">
                  <p className="text-sm whitespace-pre-wrap" data-testid="detail-input-text">
                    {selectedRun.meta?.requestText || selectedRun.goalSummary || 'No input'}
                  </p>
                </div>
              </div>

              <div>
                <h4 className="font-semibold mb-2">Assistant Response</h4>
                <div className="bg-muted p-3 rounded-md">
                  <p className="text-sm whitespace-pre-wrap" data-testid="detail-output-text">
                    {selectedRun.meta?.responseText || 'No response'}
                  </p>
                </div>
              </div>

              {selectedRun.meta?.toolCalls && selectedRun.meta.toolCalls.length > 0 && (
                <div>
                  <h4 className="font-semibold mb-2">Tool Calls</h4>
                  <div className="bg-muted p-3 rounded-md space-y-2">
                    {selectedRun.meta.toolCalls.map((tool: any, idx: number) => (
                      <div key={idx} className="text-sm" data-testid={`detail-tool-${idx}`}>
                        <span className="font-mono">{tool.name}</span>
                        {tool.args && (
                          <pre className="text-xs mt-1 text-muted-foreground overflow-x-auto">
                            {JSON.stringify(tool.args, null, 2)}
                          </pre>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSelectedRun(null)}
              data-testid="button-close-details"
            >
              Close
            </Button>
            <Button
              onClick={() => selectedRun && handleInvestigate(selectedRun)}
              disabled={investigateMutation.isPending}
              data-testid="button-investigate-details"
            >
              <Search className="h-4 w-4 mr-2" />
              {investigateMutation.isPending ? 'Creating...' : 'Investigate'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
