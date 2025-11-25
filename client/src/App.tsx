import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import StatusDashboard from "@/pages/status-dashboard";
import InvestigatePage from "@/pages/investigate";
import ConversationTimeline from "@/pages/conversation-timeline";
import DevIssuesPage from "@/pages/dev-issues";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/dashboard" component={StatusDashboard} />
      <Route path="/dashboard/investigate/:id" component={InvestigatePage} />
      <Route path="/dashboard/conversation/:conversationRunId" component={ConversationTimeline} />
      <Route path="/dev/issues" component={DevIssuesPage} />
      <Route path="/" component={StatusDashboard} />
      {/* Fallback to 404 */}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
