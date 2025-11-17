import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Clock, MessageSquare } from "lucide-react";

interface RunEvent {
  id: string;
  created_at: string;
  source: string;
  user_identifier: string | null;
  goal_summary: string | null;
  status: string;
  meta: any;
}

export default function ConversationTimeline() {
  const { conversationRunId } = useParams<{ conversationRunId: string }>();
  const [, navigate] = useLocation();

  const { data: events, isLoading } = useQuery<RunEvent[]>({
    queryKey: ["/tower/conversations", conversationRunId, "events"],
    enabled: !!conversationRunId,
  });

  const formatTime = (timestamp: string) => {
    if (!timestamp) return "Unknown time";
    
    const date = new Date(timestamp);
    
    if (isNaN(date.getTime())) {
      return "Unknown time";
    }
    
    return date.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const getInputText = (event: RunEvent): string => {
    return event.goal_summary || 
           event.meta?.inputText || 
           event.meta?.requestText || 
           "No input";
  };

  const getOutputText = (event: RunEvent): string => {
    return event.meta?.output || 
           event.meta?.responseText || 
           event.meta?.outputText || 
           "No response";
  };

  if (isLoading) {
    return (
      <div className="container mx-auto py-6">
        <Card>
          <CardContent className="p-6">
            <div className="text-sm text-muted-foreground">Loading conversation...</div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!events || events.length === 0) {
    return (
      <div className="container mx-auto py-6">
        <Card>
          <CardContent className="p-6">
            <div className="text-sm text-muted-foreground">No events found for this conversation.</div>
            <Button
              variant="outline"
              onClick={() => navigate("/dashboard")}
              className="mt-4"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Conversation Timeline</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {events.length} {events.length === 1 ? 'message' : 'messages'} in this conversation
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => navigate("/dashboard")}
          data-testid="button-back-to-dashboard"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Dashboard
        </Button>
      </div>

      <div className="space-y-4">
        {events.map((event, index) => (
          <Card key={event.id} data-testid={`event-item-${index}`}>
            <CardHeader>
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-muted-foreground" />
                  <CardTitle className="text-base">
                    Message {index + 1}
                  </CardTitle>
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    variant={
                      event.status === "success" || event.status === "completed" 
                        ? "default" 
                        : event.status === "error" || event.status === "fail"
                        ? "destructive"
                        : "secondary"
                    }
                  >
                    {event.status}
                  </Badge>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {formatTime(event.created_at)}
                  </div>
                </div>
              </div>
              {event.meta?.durationMs && (
                <CardDescription>
                  Duration: {(event.meta.durationMs / 1000).toFixed(2)}s
                </CardDescription>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="text-sm font-medium mb-2">Input:</div>
                <div className="text-sm bg-muted p-3 rounded-md whitespace-pre-wrap">
                  {getInputText(event)}
                </div>
              </div>

              <div>
                <div className="text-sm font-medium mb-2">Output:</div>
                <div className="text-sm bg-muted p-3 rounded-md whitespace-pre-wrap">
                  {getOutputText(event)}
                </div>
              </div>

              {event.meta?.toolCalls && event.meta.toolCalls.length > 0 && (
                <div>
                  <div className="text-sm font-medium mb-2">Tools Used:</div>
                  <div className="flex flex-wrap gap-2">
                    {event.meta.toolCalls.map((tool: any, toolIndex: number) => (
                      <Badge key={toolIndex} variant="outline">
                        {tool.name || 'Unknown tool'}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {event.meta?.model && (
                <div className="text-xs text-muted-foreground">
                  Model: {event.meta.model}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
