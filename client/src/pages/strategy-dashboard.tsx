import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { TowerNavTabs } from '@/components/TowerNavTabs';
import {
  getDashboardData,
  getAllAbTests,
  analyzeAbTest,
  updateAbTestStatus,
  type DashboardData,
  type AbTest,
} from '@/api/strategyEvaluator';
import { AlertCircle, TrendingUp, TrendingDown, Activity, TestTube } from 'lucide-react';

export default function StrategyDashboard() {
  const [selectedTest, setSelectedTest] = useState<string | null>(null);

  const {
    data: dashboardData,
    isLoading,
    error,
    refetch,
  } = useQuery<DashboardData>({
    queryKey: ['strategy-dashboard'],
    queryFn: getDashboardData,
    refetchInterval: 30000,
  });

  const { data: abTests } = useQuery<AbTest[]>({
    queryKey: ['ab-tests'],
    queryFn: getAllAbTests,
    refetchInterval: 30000,
  });

  const { data: testAnalysis, refetch: refetchAnalysis } = useQuery({
    queryKey: ['ab-test-analysis', selectedTest],
    queryFn: () => (selectedTest ? analyzeAbTest(selectedTest) : null),
    enabled: !!selectedTest,
  });

  const handleCompleteTest = async (testId: string) => {
    try {
      await updateAbTestStatus(testId, 'completed');
      refetch();
    } catch (err) {
      console.error('Failed to complete test:', err);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Activity className="h-12 w-12 animate-spin text-purple-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading strategy dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Alert variant="destructive" className="max-w-lg">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            Failed to load dashboard data. Please try again later.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!dashboardData) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <TowerNavTabs />

      <div className="container mx-auto p-6 max-w-7xl">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Strategy Performance Dashboard
          </h1>
          <p className="text-gray-600">
            Monitor, compare, and optimize your strategies with A/B testing and performance analytics
          </p>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          <Card>
            <CardHeader className="pb-3">
              <CardDescription>Total Strategies</CardDescription>
              <CardTitle className="text-3xl">
                {dashboardData.summary.totalStrategies}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600">
                {dashboardData.summary.activeStrategies} active
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardDescription>Active A/B Tests</CardDescription>
              <CardTitle className="text-3xl flex items-center">
                <TestTube className="h-8 w-8 text-purple-600 mr-2" />
                {dashboardData.summary.activeAbTests}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600">Running experiments</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardDescription>Recommendations</CardDescription>
              <CardTitle className="text-3xl">
                {dashboardData.recommendations.length}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600">Action items</p>
            </CardContent>
          </Card>
        </div>

        {/* Recommendations */}
        {dashboardData.recommendations.length > 0 && (
          <Card className="mb-6 border-purple-200 bg-purple-50">
            <CardHeader>
              <CardTitle className="text-purple-900">
                AI Recommendations
              </CardTitle>
              <CardDescription className="text-purple-700">
                Automatically generated insights based on performance data
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {dashboardData.recommendations.map((rec, i) => (
                  <Alert key={i} className="bg-white">
                    <AlertCircle className="h-4 w-4 text-purple-600" />
                    <AlertDescription className="ml-2">{rec}</AlertDescription>
                  </Alert>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <Tabs defaultValue="strategies" className="space-y-6">
          <TabsList>
            <TabsTrigger value="strategies">All Strategies</TabsTrigger>
            <TabsTrigger value="top-performers">Top Performers</TabsTrigger>
            <TabsTrigger value="ab-tests">A/B Tests</TabsTrigger>
          </TabsList>

          {/* All Strategies Tab */}
          <TabsContent value="strategies">
            <Card>
              <CardHeader>
                <CardTitle>Strategy Performance</CardTitle>
                <CardDescription>
                  Overview of all strategies and their metrics
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Strategy</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Success Rate</TableHead>
                      <TableHead>Total Runs</TableHead>
                      <TableHead>Avg Duration</TableHead>
                      <TableHead>Errors</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dashboardData.strategies.map((strat) => (
                      <TableRow key={strat.id}>
                        <TableCell className="font-medium">{strat.name}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{strat.category}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={strat.isActive ? 'default' : 'secondary'}>
                            {strat.isActive ? 'Active' : 'Inactive'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center">
                            {(strat.metrics.avgSuccessRate * 100).toFixed(1)}%
                            {strat.metrics.avgSuccessRate > 0.8 ? (
                              <TrendingUp className="h-4 w-4 text-green-600 ml-1" />
                            ) : strat.metrics.avgSuccessRate < 0.5 ? (
                              <TrendingDown className="h-4 w-4 text-red-600 ml-1" />
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell>{strat.metrics.totalRuns}</TableCell>
                        <TableCell>
                          {strat.metrics.avgDuration.toFixed(0)}ms
                        </TableCell>
                        <TableCell>
                          <Badge variant={strat.metrics.totalErrors > 0 ? 'destructive' : 'secondary'}>
                            {strat.metrics.totalErrors}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Top Performers Tab */}
          <TabsContent value="top-performers">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card className="border-green-200">
                <CardHeader>
                  <CardTitle className="flex items-center text-green-900">
                    <TrendingUp className="h-5 w-5 mr-2" />
                    Top Performers
                  </CardTitle>
                  <CardDescription>Best performing strategies</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {dashboardData.topPerformers.map((item, i) => (
                      <div key={i} className="flex justify-between items-center p-3 bg-green-50 rounded-lg">
                        <div>
                          <p className="font-medium">{item.strategy.name}</p>
                          <p className="text-sm text-gray-600">{item.strategy.category}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-green-700">
                            {(item.metrics.avgSuccessRate * 100).toFixed(1)}%
                          </p>
                          <p className="text-xs text-gray-600">
                            {item.metrics.totalRuns} runs
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-red-200">
                <CardHeader>
                  <CardTitle className="flex items-center text-red-900">
                    <TrendingDown className="h-5 w-5 mr-2" />
                    Underperformers
                  </CardTitle>
                  <CardDescription>Strategies needing attention</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {dashboardData.underperformers.map((item, i) => (
                      <div key={i} className="flex justify-between items-center p-3 bg-red-50 rounded-lg">
                        <div>
                          <p className="font-medium">{item.strategy.name}</p>
                          <p className="text-sm text-gray-600">{item.strategy.category}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-red-700">
                            {(item.metrics.avgSuccessRate * 100).toFixed(1)}%
                          </p>
                          <p className="text-xs text-gray-600">
                            {item.metrics.totalRuns} runs
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* A/B Tests Tab */}
          <TabsContent value="ab-tests">
            <Card>
              <CardHeader>
                <CardTitle>A/B Tests</CardTitle>
                <CardDescription>
                  Compare strategies with statistical significance
                </CardDescription>
              </CardHeader>
              <CardContent>
                {abTests && abTests.length > 0 ? (
                  <div className="space-y-4">
                    {abTests.map((test) => (
                      <Card key={test.id} className="border-l-4 border-l-purple-500">
                        <CardHeader>
                          <div className="flex justify-between items-start">
                            <div>
                              <CardTitle className="text-lg">{test.name}</CardTitle>
                              <CardDescription>{test.description}</CardDescription>
                            </div>
                            <Badge
                              variant={
                                test.status === 'active'
                                  ? 'default'
                                  : test.status === 'completed'
                                  ? 'secondary'
                                  : 'outline'
                              }
                            >
                              {test.status}
                            </Badge>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-3">
                            <div className="text-sm text-gray-600">
                              Started: {new Date(test.startedAt).toLocaleDateString()}
                            </div>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setSelectedTest(test.id);
                                  refetchAnalysis();
                                }}
                              >
                                Analyze Results
                              </Button>
                              {test.status === 'active' && (
                                <Button
                                  size="sm"
                                  variant="default"
                                  onClick={() => handleCompleteTest(test.id)}
                                >
                                  Complete Test
                                </Button>
                              )}
                            </div>

                            {selectedTest === test.id && testAnalysis && (
                              <Alert className="mt-4">
                                <AlertCircle className="h-4 w-4" />
                                <AlertTitle>
                                  {testAnalysis.winner
                                    ? `Winner: Strategy ${testAnalysis.winner}`
                                    : 'No Clear Winner Yet'}
                                </AlertTitle>
                                <AlertDescription>
                                  <div className="mt-2 space-y-2">
                                    <p>{testAnalysis.recommendation}</p>
                                    {testAnalysis.significance < 0.05 && (
                                      <p className="text-sm text-green-600">
                                        Statistically significant (p = {testAnalysis.significance.toFixed(4)})
                                      </p>
                                    )}
                                  </div>
                                </AlertDescription>
                              </Alert>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12 text-gray-500">
                    <TestTube className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No A/B tests found. Create one to start comparing strategies.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
