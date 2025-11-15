import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { listRuns, createInvestigationFromRun, type RunSummary } from "@/lib/evaluatorApi";
import { useEvaluator } from "@/contexts/EvaluatorContext";
import { queryClient } from "@/lib/queryClient";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import { Search, AlertCircle } from "lucide-react";

export function RecentRunsTable() {
  const { data: runs, isLoading, error } = useQuery({
    queryKey: ["/tower/runs"],
    queryFn: () => listRuns(20),
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  const { setActiveInvestigationId } = useEvaluator();
  const { toast } = useToast();

  const [selectedRun, setSelectedRun] = useState<RunSummary | null>(null);
  const [notes, setNotes] = useState("");

  const investigateMutation = useMutation({
    mutationFn: createInvestigationFromRun,
    onSuccess: (investigation) => {
      queryClient.invalidateQueries({ queryKey: ["/tower/evaluator/investigations"] });
      setActiveInvestigationId(investigation.id);
      setSelectedRun(null);
      setNotes("");
      toast({
        title: "Investigation created",
        description: "The evaluator is analyzing this run...",
      });
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Failed to create investigation",
        description: error instanceof Error ? error.message : "Unknown error",
      });
    },
  });

  const handleInvestigate = (run: RunSummary) => {
    setSelectedRun(run);
    setNotes("");
  };

  const handleSubmitInvestigation = () => {
    if (!selectedRun) return;
    investigateMutation.mutate({
      runId: selectedRun.id,
      notes: notes.trim() || undefined,
    });
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Recent runs</CardTitle>
          <CardDescription>Latest UI and Supervisor activity</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Recent runs</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <AlertCircle className="h-12 w-12 mx-auto mb-2" />
            <p>Failed to load runs</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Recent runs</CardTitle>
          <CardDescription>Latest UI and Supervisor activity</CardDescription>
        </CardHeader>
        <CardContent>
          {!runs || runs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>No runs yet</p>
              <p className="text-sm mt-1">Runs will appear here as UI/Supervisor apps execute</p>
            </div>
          ) : (
            <div className="border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>User / Company</TableHead>
                    <TableHead>Goal</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {runs.map((run) => (
                    <TableRow key={run.id} data-testid={`row-run-${run.id}`}>
                      <TableCell className="text-sm" data-testid={`text-time-${run.id}`}>
                        {formatDistanceToNow(new Date(run.createdAt), { addSuffix: true })}
                      </TableCell>
                      <TableCell data-testid={`text-source-${run.id}`}>
                        <Badge variant={run.source === "UI" ? "default" : "secondary"}>
                          {run.source}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm" data-testid={`text-user-${run.id}`}>
                        {run.userIdentifier || "—"}
                      </TableCell>
                      <TableCell className="text-sm max-w-xs truncate" data-testid={`text-goal-${run.id}`}>
                        {run.goalSummary || "—"}
                      </TableCell>
                      <TableCell data-testid={`text-status-${run.id}`}>
                        <Badge
                          variant={run.status === "completed" ? "default" : "destructive"}
                        >
                          {run.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleInvestigate(run)}
                          data-testid={`button-investigate-${run.id}`}
                        >
                          <Search className="h-3 w-3 mr-1" />
                          Investigate
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selectedRun} onOpenChange={(open) => !open && setSelectedRun(null)}>
        <DialogContent data-testid="dialog-investigate">
          <DialogHeader>
            <DialogTitle>Investigate Run</DialogTitle>
            <DialogDescription>
              Create an investigation for: {selectedRun?.goalSummary || selectedRun?.id}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="notes">What felt wrong about this run? (optional)</Label>
              <Textarea
                id="notes"
                placeholder="Describe what you noticed or what needs investigation..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
                data-testid="input-notes"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSelectedRun(null)}
              data-testid="button-cancel"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmitInvestigation}
              disabled={investigateMutation.isPending}
              data-testid="button-submit-investigation"
            >
              {investigateMutation.isPending ? "Creating..." : "Create Investigation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
