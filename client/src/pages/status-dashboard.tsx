import { useState } from "react";
import { EvaluatorProvider } from "@/contexts/EvaluatorContext";
import { RecentRunsSimple } from "@/components/RecentRunsSimple";
import { AutoFlaggedCard } from "@/components/AutoFlaggedCard";
import { ManualFlagsCard } from "@/components/ManualFlagsCard";
import { PatchFailuresCard } from "@/components/PatchFailuresCard";
import { BehaviourTestsCard } from "@/components/BehaviourTestsCard";
import { RecentRunsTable } from "@/components/RecentRunsTable";
import { TowerNavTabs } from "@/components/TowerNavTabs";
import { CollapsibleCard } from "@/components/CollapsibleCard";
import { Button } from "@/components/ui/button";
import { Settings, Activity, TestTubes, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export default function StatusDashboard() {
  const { toast } = useToast();
  const [isResetting, setIsResetting] = useState(false);

  const handleReset = async () => {
    setIsResetting(true);
    try {
      await apiRequest("POST", "/tower/reset-investigations", {});
      toast({
        title: "Tower Reset Complete",
        description: "All flags and investigations have been cleared.",
      });
      // Refresh the page to see updated data
      window.location.reload();
    } catch (error: any) {
      toast({
        title: "Reset Failed",
        description: error.message || "Failed to reset Tower data",
        variant: "destructive",
      });
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <EvaluatorProvider>
      <div className="min-h-screen bg-background">
        {/* Header */}
        <header className="border-b">
          <div className="container mx-auto px-4 py-4">
            <TowerNavTabs />
          </div>
        </header>

        {/* Main Content */}
        <div className="container mx-auto px-4 py-6">
          <div className="space-y-6 max-w-5xl mx-auto">
            {/* Core Sections - Always Visible */}
            <div className="space-y-6">
              {/* Section 1: Recent Runs */}
              <RecentRunsSimple />

              {/* Section 2: Auto-Flagged Runs */}
              <AutoFlaggedCard />

              {/* Section 3: Manual Flags */}
              <ManualFlagsCard />
            </div>

            {/* Advanced Tools - Collapsed by Default */}
            <CollapsibleCard
              title="Advanced Tools"
              description="Debugging and testing utilities"
              icon={<Settings className="h-5 w-5 text-muted-foreground" />}
              defaultOpen={false}
              testId="card-advanced-tools"
              headerActions={
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      data-testid="button-reset-tower"
                    >
                      <Trash2 className="h-3 w-3 mr-2" />
                      Clear All Flags
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Clear All Flags and Investigations?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently delete:
                        <ul className="list-disc list-inside mt-2 space-y-1">
                          <li>All auto-flagged runs</li>
                          <li>All manually-flagged runs</li>
                          <li>Past investigations and diagnoses</li>
                          <li>Patch attempts and failures</li>
                        </ul>
                        <p className="mt-3 font-medium">
                          Recent runs and system configuration will NOT be affected.
                        </p>
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel data-testid="button-cancel-reset">
                        Cancel
                      </AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleReset}
                        disabled={isResetting}
                        data-testid="button-confirm-reset"
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        {isResetting ? "Clearing..." : "Clear All Data"}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              }
            >
              <div className="space-y-6">
                {/* Tower Status Metrics */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Activity className="h-4 w-4 text-muted-foreground" />
                    <h3 className="font-medium">Tower Status</h3>
                  </div>
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
                </div>

                {/* Behaviour Tests */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <TestTubes className="h-4 w-4 text-muted-foreground" />
                    <h3 className="font-medium">Automated Tests</h3>
                  </div>
                  <BehaviourTestsCard />
                </div>

                {/* Patch Failures (if any exist) */}
                <div className="space-y-3">
                  <h3 className="font-medium">Patch Failures</h3>
                  <PatchFailuresCard />
                </div>

                {/* All Runs Table */}
                <div className="space-y-3">
                  <h3 className="font-medium">Complete Run History</h3>
                  <RecentRunsTable />
                </div>
              </div>
            </CollapsibleCard>
          </div>
        </div>
      </div>
    </EvaluatorProvider>
  );
}
