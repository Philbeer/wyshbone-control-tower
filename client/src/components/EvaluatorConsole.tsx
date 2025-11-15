import { useEffect, useState } from "react";
import { useEvaluator } from "@/contexts/EvaluatorContext";
import { getInvestigation, getRun, type Investigation, type RunSummary } from "@/lib/evaluatorApi";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Copy, Check, AlertCircle } from "lucide-react";
import { format } from "date-fns";

export function EvaluatorConsole() {
  const { activeInvestigationId } = useEvaluator();
  const [investigation, setInvestigation] = useState<Investigation | null>(null);
  const [run, setRun] = useState<RunSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pollCount, setPollCount] = useState(0);

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
      </CardContent>
    </Card>
  );
}
