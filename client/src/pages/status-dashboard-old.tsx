import { useState } from "react";
import { EvaluatorProvider } from "@/contexts/EvaluatorContext";
import { EvaluatorConsole } from "@/components/EvaluatorConsole";
import { LiveUserRunsCard } from "@/components/LiveUserRunsCard";
import { ConversationQualityCard } from "@/components/ConversationQualityCard";
import { AutoConversationQualityCard } from "@/components/AutoConversationQualityCard";
import { PatchFailuresCard } from "@/components/PatchFailuresCard";
import { BehaviourTestsCard } from "@/components/BehaviourTestsCard";
import { RecentRunsTable } from "@/components/RecentRunsTable";
import { TowerNavTabs } from "@/components/TowerNavTabs";
import { CollapsibleCard } from "@/components/CollapsibleCard";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, TestTubes, Activity } from "lucide-react";

export default function StatusDashboard() {
  const [isEvaluatorOpen, setIsEvaluatorOpen] = useState(false);

  return (
    <EvaluatorProvider>
      <div className="min-h-screen bg-background">
        {/* Navigation Tabs */}
        <TowerNavTabs />
        
        {/* Header */}
        <header className="border-b">
          <div className="container mx-auto px-4 py-4">
            <h1 className="text-2xl font-bold">Wyshbone Tower</h1>
            <p className="text-sm text-muted-foreground">Live Quality Monitoring & Evaluation</p>
          </div>
        </header>

        {/* Main Content: Two-column layout */}
        <div className="container mx-auto px-4 py-6">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr,400px] gap-6">
            {/* Left Column: Main Content */}
            <div className="space-y-6">
              {/* EVAL-008: Live User Runs - ALWAYS VISIBLE */}
              <LiveUserRunsCard />

              {/* EVAL-009: Auto Conversation Quality - ALWAYS VISIBLE */}
              <AutoConversationQualityCard />

              {/* EVAL-009: Conversation Quality (Manual Flags) - ALWAYS VISIBLE */}
              <ConversationQualityCard />

              {/* EVAL-016: Patch Failures - AUTO-EXPAND IF ITEMS EXIST */}
              <PatchFailuresCard />

              {/* Tower Status - COLLAPSED */}
              <CollapsibleCard
                title="Tower Status"
                description="System health and metrics"
                icon={<Activity className="h-5 w-5 text-primary" />}
                defaultOpen={false}
                testId="card-tower-status"
              >
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
              </CollapsibleCard>

              {/* Behaviour Tests - COLLAPSED */}
              <CollapsibleCard
                title="Behaviour Tests"
                description="EVAL-002: Automated scenario testing"
                icon={<TestTubes className="h-5 w-5 text-primary" />}
                defaultOpen={false}
                testId="card-behaviour-tests"
              >
                <BehaviourTestsCard />
              </CollapsibleCard>

              {/* Recent Runs Table - COLLAPSED */}
              <CollapsibleCard
                title="All Runs"
                description="Complete run history (live, test, tower)"
                defaultOpen={false}
                testId="card-all-runs"
              >
                <RecentRunsTable />
              </CollapsibleCard>
            </div>

            {/* Right Column: Evaluator Console - COLLAPSIBLE */}
            <div className="lg:sticky lg:top-6 h-fit">
              <Collapsible open={isEvaluatorOpen} onOpenChange={setIsEvaluatorOpen}>
                <Card>
                  <CollapsibleTrigger asChild>
                    <Button
                      variant="ghost"
                      className="w-full justify-between p-4 h-auto hover:bg-transparent"
                      data-testid="button-toggle-evaluator-console"
                    >
                      <div className="flex items-center gap-3 text-left">
                        <div className="flex-shrink-0">
                          {isEvaluatorOpen ? (
                            <ChevronDown className="h-5 w-5 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-5 w-5 text-muted-foreground" />
                          )}
                        </div>
                        <div>
                          <h3 className="font-semibold text-lg">Evaluator Console</h3>
                          <p className="text-sm text-muted-foreground">
                            EVAL-005: Junior Developer Agent
                          </p>
                        </div>
                      </div>
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <CardContent className="p-0">
                      <div className="h-[calc(100vh-12rem)]">
                        <EvaluatorConsole />
                      </div>
                    </CardContent>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            </div>
          </div>
        </div>
      </div>
    </EvaluatorProvider>
  );
}
