import { Activity } from "lucide-react";

export function TowerNavTabs() {
  return (
    <div className="bg-background">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center">
            <Activity className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Wyshbone Control Tower</h1>
            <p className="text-xs text-muted-foreground">Monitor & Fix Quality Issues</p>
          </div>
        </div>
      </div>
    </div>
  );
}
