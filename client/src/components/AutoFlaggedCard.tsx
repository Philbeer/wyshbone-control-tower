import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Wrench, Clock, Sparkles } from "lucide-react";

interface Investigation {
  id: string;
  created_at: string;
  trigger: string;
  run_id: string | null;
  notes: string | null;
  run_meta: any;
  diagnosis: string | null;
}

export function AutoFlaggedCard() {
  const { data: investigations, isLoading } = useQuery<Investigation[]>({
    queryKey: ["/tower/auto-conversation-quality"],
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

  const getFlagReason = (investigation: Investigation): string => {
    // Extract issue category and summary from diagnosis
    const analysis = investigation.run_meta?.analysis;
    if (analysis?.failureCategory) {
      const categoryMap: Record<string, string> = {
        "missing_greeting": "Missing greeting flow",
        "missing_domain_personalization": "Not personalized to user's domain",
        "incomplete_onboarding": "Incomplete onboarding questions",
        "hallucination": "Provided incorrect information",
        "bad_reasoning": "Poor reasoning or logic",
        "unhelpful_tone": "Unhelpful or inappropriate tone",
        "did_not_follow_request": "Failed to follow user request",
      };
      return categoryMap[analysis.failureCategory] || analysis.failureCategory;
    }
    return "Quality issue detected";
  };

  const getOriginalInput = (investigation: Investigation): string | null => {
    const messages = investigation.run_meta?.conversation_window;
    if (Array.isArray(messages) && messages.length > 0) {
      const userMessage = messages.find((m: any) => m.role === "user");
      return userMessage?.content || null;
    }
    return investigation.run_meta?.goal_summary || null;
  };

  const getSeverityBadge = (investigation: Investigation) => {
    const severity = investigation.run_meta?.analysis?.severity || "medium";
    const severityMap: Record<string, { variant: any; label: string }> = {
      critical: { variant: "destructive", label: "Critical" },
      high: { variant: "destructive", label: "High" },
      medium: { variant: "secondary", label: "Medium" },
      low: { variant: "outline", label: "Low" },
    };
    const config = severityMap[severity] || severityMap.medium;
    return (
      <Badge variant={config.variant} className="flex-shrink-0">
        {config.label}
      </Badge>
    );
  };

  return (
    <Card data-testid="card-auto-flagged">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <div>
            <CardTitle>Auto-Flagged Runs (Automatically Detected Issues)</CardTitle>
            <CardDescription className="mt-1.5">
              Runs that Tower automatically identified as having quality issues
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading auto-flagged runs...</div>
        ) : !investigations || investigations.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            No issues detected. Tower automatically analyzes all user conversations for problems like bad reasoning, hallucinations, or unhelpful responses.
          </div>
        ) : (
          <div className="space-y-3">
            {investigations.map((inv) => (
              <div
                key={inv.id}
                className="flex flex-col gap-3 p-4 rounded-md border border-primary/20 bg-primary/5 hover-elevate"
                data-testid={`auto-flag-${inv.id}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Clock className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                      <span className="text-xs text-muted-foreground">
                        Detected {formatTime(inv.created_at)}
                      </span>
                      {getSeverityBadge(inv)}
                      <Badge variant="outline" className="flex-shrink-0 border-primary/50">
                        <AlertTriangle className="h-3 w-3 mr-1" />
                        Auto-detected
                      </Badge>
                    </div>

                    {getOriginalInput(inv) && (
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">Original Input:</div>
                        <div className="text-sm line-clamp-2">{getOriginalInput(inv)}</div>
                      </div>
                    )}

                    <div>
                      <div className="text-xs text-muted-foreground mb-1">Issue Detected:</div>
                      <div className="text-sm text-muted-foreground line-clamp-2">
                        {getFlagReason(inv)}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="default"
                    onClick={() => handleInvestigateClick(inv.id)}
                    data-testid={`button-investigate-auto-${inv.id}`}
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
