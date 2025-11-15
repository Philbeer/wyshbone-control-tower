import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { fetchBehaviourTests, runAllBehaviourTests, runSingleBehaviourTest, type BehaviourTestSummary } from '@/api/behaviourTests';
import { useEvaluator } from '@/contexts/EvaluatorContext';
import { useToast } from '@/hooks/use-toast';
import { Play, RotateCw, Search } from 'lucide-react';

export function BehaviourTestsCard() {
  const [tests, setTests] = useState<BehaviourTestSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningAll, setRunningAll] = useState(false);
  const [runningTests, setRunningTests] = useState<Set<string>>(new Set());
  const [investigatingTests, setInvestigatingTests] = useState<Set<string>>(new Set());
  const { setActiveInvestigationId } = useEvaluator();
  const { toast } = useToast();

  const loadTests = async () => {
    try {
      setLoading(true);
      const data = await fetchBehaviourTests();
      setTests(data);
    } catch (error) {
      console.error('Failed to load behaviour tests:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTests();
  }, []);

  const handleRunAll = async () => {
    try {
      setRunningAll(true);
      await runAllBehaviourTests();
      await loadTests();
    } catch (error) {
      console.error('Failed to run all tests:', error);
    } finally {
      setRunningAll(false);
    }
  };

  const handleRunSingle = async (testId: string) => {
    try {
      setRunningTests(prev => new Set(prev).add(testId));
      await runSingleBehaviourTest(testId);
      await loadTests();
    } catch (error) {
      console.error(`Failed to run test ${testId}:`, error);
    } finally {
      setRunningTests(prev => {
        const next = new Set(prev);
        next.delete(testId);
        return next;
      });
    }
  };

  const handleInvestigate = async (testId: string) => {
    try {
      setInvestigatingTests(prev => new Set(prev).add(testId));
      
      const response = await fetch(`/tower/behaviour-tests/${testId}/investigate`, {
        method: 'POST',
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create investigation');
      }
      
      const investigation = await response.json();
      
      setActiveInvestigationId(investigation.id);
      
      toast({
        title: "Investigation created",
        description: `Investigation for "${investigation.runMeta?.testName || testId}" is now active`,
      });
    } catch (error) {
      console.error(`Failed to investigate test ${testId}:`, error);
      toast({
        title: "Investigation failed",
        description: error instanceof Error ? error.message : "Failed to create investigation",
        variant: "destructive",
      });
    } finally {
      setInvestigatingTests(prev => {
        const next = new Set(prev);
        next.delete(testId);
        return next;
      });
    }
  };

  const getStatusBadge = (status: string | null | undefined) => {
    if (!status) {
      return <Badge variant="secondary" data-testid={`badge-status-never-run`}>Never run</Badge>;
    }
    
    switch (status) {
      case 'pass':
        return <Badge className="bg-green-500 hover:bg-green-600" data-testid={`badge-status-pass`}>Pass</Badge>;
      case 'fail':
        return <Badge variant="destructive" data-testid={`badge-status-fail`}>Fail</Badge>;
      case 'error':
        return <Badge className="bg-orange-500 hover:bg-orange-600" data-testid={`badge-status-error`}>Error</Badge>;
      default:
        return <Badge variant="secondary" data-testid={`badge-status-${status}`}>{status}</Badge>;
    }
  };

  const formatTimestamp = (timestamp: string | null | undefined) => {
    if (!timestamp) return 'Never';
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Behaviour Tests</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Loading...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
        <CardTitle className="text-lg">Behaviour Tests</CardTitle>
        <Button
          size="sm"
          onClick={handleRunAll}
          disabled={runningAll}
          data-testid="button-run-all-tests"
        >
          {runningAll ? (
            <>
              <RotateCw className="mr-2 h-4 w-4 animate-spin" />
              Running...
            </>
          ) : (
            <>
              <Play className="mr-2 h-4 w-4" />
              Run all
            </>
          )}
        </Button>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {tests.map((item) => {
            const isRunning = runningTests.has(item.test.id);
            const isInvestigating = investigatingTests.has(item.test.id);
            return (
              <div
                key={item.test.id}
                className="flex items-start justify-between gap-3 rounded-md border p-3"
                data-testid={`test-row-${item.test.id}`}
              >
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-medium" data-testid={`text-test-name-${item.test.id}`}>
                      {item.test.name}
                    </h4>
                    {getStatusBadge(item.latestRun?.status)}
                  </div>
                  <p className="text-xs text-muted-foreground" data-testid={`text-test-description-${item.test.id}`}>
                    {item.test.description}
                  </p>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span data-testid={`text-test-category-${item.test.id}`}>
                      {item.test.category}
                    </span>
                    <span>•</span>
                    <span data-testid={`text-test-last-run-${item.test.id}`}>
                      {formatTimestamp(item.latestRun?.createdAt)}
                    </span>
                    {item.latestRun?.durationMs && (
                      <>
                        <span>•</span>
                        <span data-testid={`text-test-duration-${item.test.id}`}>
                          {item.latestRun.durationMs}ms
                        </span>
                      </>
                    )}
                  </div>
                  {item.latestRun?.details && (
                    <p className="text-xs text-muted-foreground italic" data-testid={`text-test-details-${item.test.id}`}>
                      {item.latestRun.details}
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleInvestigate(item.test.id)}
                    disabled={isInvestigating}
                    data-testid={`button-investigate-test-${item.test.id}`}
                  >
                    {isInvestigating ? (
                      <RotateCw className="h-4 w-4 animate-spin" />
                    ) : (
                      <Search className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleRunSingle(item.test.id)}
                    disabled={isRunning}
                    data-testid={`button-run-test-${item.test.id}`}
                  >
                    {isRunning ? (
                      <RotateCw className="h-4 w-4 animate-spin" />
                    ) : (
                      <Play className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
