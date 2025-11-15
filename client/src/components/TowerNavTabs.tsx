import { useLocation } from "wouter";

export function TowerNavTabs() {
  const [location] = useLocation();
  
  const isStatusActive = location === "/status";
  const isDashboardActive = location === "/dashboard" || location === "/";
  
  return (
    <div className="border-b bg-background">
      <div className="container mx-auto px-4">
        <nav className="flex gap-6 py-3">
          <a
            href="/status"
            className={`text-sm font-medium transition-colors hover:text-foreground ${
              isStatusActive
                ? "text-foreground border-b-2 border-primary pb-3"
                : "text-muted-foreground pb-3"
            }`}
            data-testid="link-status"
          >
            Status & Plan
          </a>
          <a
            href="/dashboard"
            className={`text-sm font-medium transition-colors hover:text-foreground ${
              isDashboardActive
                ? "text-foreground border-b-2 border-primary pb-3"
                : "text-muted-foreground pb-3"
            }`}
            data-testid="link-dashboard"
          >
            Evaluator Console
          </a>
        </nav>
      </div>
    </div>
  );
}
