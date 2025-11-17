import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Flag, Wrench, Clock } from "lucide-react";

interface Investigation {
  id: string;
  created_at: string;
  trigger: string;
  run_id: string | null;
  notes: string | null;
  run_meta: any;
  diagnosis: string | null;
}

export function ManualFlagsCard() {
  const { data: investigations, isLoading } = useQuery<Investigation[]>({
    queryKey: ["/tower/manual-flags"],
    refetchInterval: 10000,
  });

  const handleInvestigateClick = (investigationId: string) => {
    window.location.href = `/dashboard/investigate/${investigationId}`;
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

  const getDisplayReason = (investigation: Investigation): string => {
    // Extract reason from notes (first line before any timestamp)
    if (investigation.notes) {
      const lines = investigation.notes.split('\n');
      return lines[0].trim();
    }
    return "No reason provided";
  };

  const getOriginalInput = (investigation: Investigation): string | null => {
    return investigation.run_meta?.goal_summary || null;
  };

  return (
    <Card data-testid="card-manual-flags">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Flag className="h-5 w-5 text-orange-500" />
          <div>
            <CardTitle>Manual Flags (Runs You Marked as Needing Fix)</CardTitle>
            <CardDescription className="mt-1.5">
              Runs you flagged for investigation from Recent Runs
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading manual flags...</div>
        ) : !investigations || investigations.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            No manually flagged runs. Use "Flag this run" in Recent Runs to flag conversations needing review.
          </div>
        ) : (
          <div className="space-y-3">
            {investigations.map((inv) => (
              <div
                key={inv.id}
                className="flex flex-col gap-3 p-4 rounded-md border border-orange-500/20 bg-orange-500/5 hover-elevate"
                data-testid={`manual-flag-${inv.id}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-center gap-2">
                      <Clock className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                      <span className="text-xs text-muted-foreground">
                        Flagged {formatTime(inv.created_at)}
                      </span>
                      <Badge variant="outline" className="ml-auto flex-shrink-0 border-orange-500/50 text-orange-600">
                        Manual Flag
                      </Badge>
                    </div>

                    {getOriginalInput(inv) && (
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">Original Input:</div>
                        <div className="text-sm line-clamp-2">{getOriginalInput(inv)}</div>
                      </div>
                    )}

                    <div>
                      <div className="text-xs text-muted-foreground mb-1">Reason:</div>
                      <div className="text-sm text-muted-foreground line-clamp-2">
                        {getDisplayReason(inv)}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="default"
                    onClick={() => handleInvestigateClick(inv.id)}
                    data-testid={`button-investigate-manual-${inv.id}`}
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
  );
}
