import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Flag, Wrench, Clock, User } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

interface Run {
  id: string;
  created_at: string;
  source: string;
  user_identifier: string | null;
  goal_summary: string | null;
  status: string;
  meta: any;
}

export function RecentRunsSimple() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [flagDialogOpen, setFlagDialogOpen] = useState(false);
  const [selectedRun, setSelectedRun] = useState<Run | null>(null);
  const [flagReason, setFlagReason] = useState("");

  const { data: runs, isLoading } = useQuery<Run[]>({
    queryKey: ["/tower/runs"],
    refetchInterval: 5000,
  });

  const flagMutation = useMutation({
    mutationFn: async ({ runId, reason }: { runId: string; reason?: string }) => {
      return await apiRequest("POST", `/tower/runs/${runId}/flag`, { reason });
    },
    onSuccess: () => {
      toast({
        title: "Run Flagged",
        description: "This run has been flagged for review and added to Manual Flags.",
      });
      queryClient.invalidateQueries({ queryKey: ["/tower/manual-flags"] });
      setFlagDialogOpen(false);
      setSelectedRun(null);
      setFlagReason("");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to flag run",
        variant: "destructive",
      });
    },
  });

  const handleFlagClick = (run: Run) => {
    setSelectedRun(run);
    setFlagDialogOpen(true);
  };

  const handleFlagSubmit = () => {
    if (selectedRun) {
      flagMutation.mutate({ runId: selectedRun.id, reason: flagReason || undefined });
    }
  };

  const investigateMutation = useMutation({
    mutationFn: async (runId: string) => {
      // Create an investigation for this run
      const response = await apiRequest("POST", "/tower/investigate-run", { runId });
      const data = await response.json();
      return data.investigation_id;
    },
    onSuccess: (investigationId: string) => {
      navigate(`/dashboard/investigate/${investigationId}`);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create investigation",
        variant: "destructive",
      });
    },
  });

  const handleInvestigateClick = (runId: string) => {
    investigateMutation.mutate(runId);
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return date.toLocaleDateString();
  };

  // Filter to only show Wyshbone UI user runs
  const userRuns = runs?.filter(run => run.source === "live_user") || [];

  return (
    <>
      <Card data-testid="card-recent-runs">
        <CardHeader>
          <CardTitle>Recent Runs</CardTitle>
          <CardDescription>
            All user conversations from Wyshbone UI
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-sm text-muted-foreground">Loading runs...</div>
          ) : userRuns.length === 0 ? (
            <div className="text-sm text-muted-foreground">No recent runs</div>
          ) : (
            <div className="space-y-3">
              {userRuns.slice(0, 10).map((run) => (
                <div
                  key={run.id}
                  className="flex flex-col gap-3 p-4 rounded-md border hover-elevate"
                  data-testid={`run-item-${run.id}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-center gap-2">
                        <Clock className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                        <span className="text-xs text-muted-foreground">
                          {formatTime(run.created_at)}
                        </span>
                        {run.user_identifier && (
                          <>
                            <User className="h-3 w-3 text-muted-foreground flex-shrink-0 ml-2" />
                            <span className="text-xs text-muted-foreground truncate">
                              {run.user_identifier}
                            </span>
                          </>
                        )}
                        <Badge
                          variant={run.status === "completed" ? "default" : "secondary"}
                          className="ml-auto flex-shrink-0"
                        >
                          {run.status}
                        </Badge>
                      </div>

                      {run.goal_summary && (
                        <div>
                          <div className="text-xs text-muted-foreground mb-1">Input:</div>
                          <div className="text-sm line-clamp-2">{run.goal_summary}</div>
                        </div>
                      )}

                      {run.meta?.output && (
                        <div>
                          <div className="text-xs text-muted-foreground mb-1">Output:</div>
                          <div className="text-sm text-muted-foreground line-clamp-2">
                            {run.meta.output}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleFlagClick(run)}
                      data-testid={`button-flag-${run.id}`}
                    >
                      <Flag className="h-3 w-3 mr-1" />
                      Flag this run
                    </Button>
                    <Button
                      size="sm"
                      variant="default"
                      onClick={() => handleInvestigateClick(run.id)}
                      data-testid={`button-investigate-${run.id}`}
                    >
                      <Wrench className="h-3 w-3 mr-1" />
                      Investigate & Fix
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={flagDialogOpen} onOpenChange={setFlagDialogOpen}>
        <DialogContent data-testid="dialog-flag-run">
          <DialogHeader>
            <DialogTitle>Flag Run for Review</DialogTitle>
            <DialogDescription>
              Add this run to your Manual Flags list for later investigation.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {selectedRun?.goal_summary && (
              <div>
                <Label className="text-sm font-medium">Run Input</Label>
                <div className="text-sm text-muted-foreground mt-1">
                  {selectedRun.goal_summary}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="flag-reason">Reason (optional)</Label>
              <Textarea
                id="flag-reason"
                placeholder="What issue did you notice? (e.g., unhelpful response, bad reasoning, hallucination)"
                value={flagReason}
                onChange={(e) => setFlagReason(e.target.value)}
                rows={3}
                data-testid="textarea-flag-reason"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setFlagDialogOpen(false)}
              data-testid="button-cancel-flag"
            >
              Cancel
            </Button>
            <Button
              onClick={handleFlagSubmit}
              disabled={flagMutation.isPending}
              data-testid="button-submit-flag"
            >
              {flagMutation.isPending ? "Flagging..." : "Flag Run"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
