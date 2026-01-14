import { Link, useLocation } from "wouter";
import { Activity, Bug, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";

export function TowerNavTabs() {
  const [location] = useLocation();

  return (
    <div className="bg-background border-b">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center">
              <Activity className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Wyshbone Control Tower</h1>
              <p className="text-xs text-muted-foreground">Monitor & Fix Quality Issues</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link href="/dashboard/strategy">
              <Button
                variant={location === "/dashboard/strategy" ? "default" : "outline"}
                size="sm"
                className="gap-2"
                data-testid="link-strategy-dashboard"
              >
                <TrendingUp className="h-4 w-4" />
                Strategy Performance
              </Button>
            </Link>
            <Link href="/dev/issues">
              <Button
                variant={location === "/dev/issues" ? "default" : "outline"}
                size="sm"
                className="gap-2"
                data-testid="link-dev-issues"
              >
                <Bug className="h-4 w-4" />
                Developer Issues
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
