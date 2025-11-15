import { EvaluatorProvider } from "@/contexts/EvaluatorContext";
import { EvaluatorConsole } from "@/components/EvaluatorConsole";
import { RecentRunsTable } from "@/components/RecentRunsTable";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function StatusDashboard() {
  return (
    <EvaluatorProvider>
      <div className="min-h-screen bg-background">
        {/* Header */}
        <header className="border-b">
          <div className="container mx-auto px-4 py-4">
            <h1 className="text-2xl font-bold">Wyshbone Tower</h1>
            <p className="text-sm text-muted-foreground">Evaluator Console</p>
          </div>
        </header>

        {/* Main Content: Two-column layout */}
        <div className="container mx-auto px-4 py-6">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr,400px] gap-6">
            {/* Left Column: Main Content */}
            <div className="space-y-6">
              {/* Usage Meter / Stats Card */}
              <Card>
                <CardHeader>
                  <CardTitle>Tower Status</CardTitle>
                  <CardDescription>System health and metrics</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="space-y-1">
                      <div className="text-2xl font-bold">0</div>
                      <div className="text-xs text-muted-foreground">Active Runs</div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-2xl font-bold">3</div>
                      <div className="text-xs text-muted-foreground">Total Runs</div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-2xl font-bold">0</div>
                      <div className="text-xs text-muted-foreground">Investigations</div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-2xl font-bold">Online</div>
                      <div className="text-xs text-muted-foreground">Status</div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Recent Runs Table */}
              <RecentRunsTable />
            </div>

            {/* Right Column: Evaluator Console */}
            <div className="lg:sticky lg:top-6 h-[calc(100vh-8rem)]">
              <EvaluatorConsole />
            </div>
          </div>
        </div>
      </div>
    </EvaluatorProvider>
  );
}
