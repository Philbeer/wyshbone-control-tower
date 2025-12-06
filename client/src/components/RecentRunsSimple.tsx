import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Flag, Wrench, Clock, User } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

/** TOW-5: Lead quality label type */
type LeadQualityLabel = "low" | "medium" | "high";

interface Conversation {
  conversation_run_id: string;
  first_event_time: string;
  latest_event_time: string;
  event_count: number;
  status: string;
  input_summary: string | null;
  output_summary: string | null;
  source: string;
  user_identifier: string | null;
  /** TOW-5: Lead quality score (0-100), only for Lead Finder conversations */
  leadQualityScore?: number | null;
  /** TOW-5: Lead quality label (low/medium/high), only for Lead Finder conversations */
  leadQualityLabel?: LeadQualityLabel | null;
}

export function RecentRunsSimple() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [flagDialogOpen, setFlagDialogOpen] = useState(false);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [flagReason, setFlagReason] = useState("");

  const { data: conversations, isLoading } = useQuery<Conversation[]>({
    queryKey: ["/tower/conversations"],
    refetchInterval: 5000,
  });

  const flagMutation = useMutation({
    mutationFn: async ({ conversationRunId, reason }: { conversationRunId: string; reason?: string }) => {
      return await apiRequest("POST", `/tower/conversations/${conversationRunId}/flag`, { reason });
    },
    onSuccess: () => {
      toast({
        title: "Conversation Flagged",
        description: "This conversation has been flagged for review and added to Manual Flags.",
      });
      queryClient.invalidateQueries({ queryKey: ["/tower/manual-flags"] });
      setFlagDialogOpen(false);
      setSelectedConversation(null);
      setFlagReason("");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to flag conversation",
        variant: "destructive",
      });
    },
  });

  const handleFlagClick = (conversation: Conversation) => {
    setSelectedConversation(conversation);
    setFlagDialogOpen(true);
  };

  const handleFlagSubmit = () => {
    if (selectedConversation) {
      flagMutation.mutate({ conversationRunId: selectedConversation.conversation_run_id, reason: flagReason || undefined });
    }
  };

  const handleViewConversationClick = (conversationRunId: string) => {
    navigate(`/dashboard/conversation/${conversationRunId}`);
  };

  const formatTime = (timestamp: string) => {
    if (!timestamp) return "Unknown time";
    
    const date = new Date(timestamp);
    
    if (isNaN(date.getTime())) {
      return "Unknown time";
    }
    
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getInputText = (conversation: Conversation): string => {
    return conversation.input_summary || "No input captured";
  };

  const getOutputText = (conversation: Conversation): string => {
    return conversation.output_summary || "No response captured";
  };

  // TOW-5: Get quality badge color based on label
  const getQualityBadgeClasses = (label: LeadQualityLabel): string => {
    switch (label) {
      case "high":
        return "bg-green-50 text-green-700 border-green-200";
      case "medium":
        return "bg-yellow-50 text-yellow-700 border-yellow-200";
      case "low":
        return "bg-red-50 text-red-700 border-red-200";
      default:
        return "bg-gray-50 text-gray-700 border-gray-200";
    }
  };

  // TOW-7: Get source badge styling
  const getSourceBadgeClasses = (source: string): string => {
    switch (source) {
      case "lead_finder":
        return "bg-purple-50 text-purple-700 border-purple-200";
      case "subconscious":
        return "bg-indigo-50 text-indigo-700 border-indigo-200";
      default:
        return "";
    }
  };

  // TOW-7: Get human-readable source label
  const getSourceLabel = (source: string): string => {
    switch (source) {
      case "lead_finder":
        return "Lead Finder";
      case "subconscious":
        return "Subconscious";
      case "live_user":
        return "User";
      default:
        return source;
    }
  };

  // Filter to show Wyshbone UI user conversations, Lead Finder runs, AND Subconscious runs (TOW-7)
  const userConversations = conversations?.filter(
    conv => conv.source === "live_user" || conv.source === "lead_finder" || conv.source === "subconscious"
  ) || [];

  return (
    <>
      <Card data-testid="card-recent-runs">
        <CardHeader>
          <CardTitle>Recent Runs</CardTitle>
          <CardDescription>
            All user conversations from Wyshbone UI
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-sm text-muted-foreground">Loading conversations...</div>
          ) : userConversations.length === 0 ? (
            <div className="text-sm text-muted-foreground">No recent conversations</div>
          ) : (
            <div className="space-y-3">
              {userConversations.slice(0, 10).map((conversation) => (
                <div
                  key={conversation.conversation_run_id}
                  className="flex flex-col gap-3 p-4 rounded-md border hover-elevate"
                  data-testid={`conversation-item-${conversation.conversation_run_id}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Clock className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                        <span className="text-xs text-muted-foreground">
                          {formatTime(conversation.first_event_time)}
                        </span>
                        {/* TOW-7: Show source badge for Lead Finder and Subconscious runs */}
                        {(conversation.source === "lead_finder" || conversation.source === "subconscious") && (
                          <Badge 
                            variant="outline" 
                            className={`ml-2 ${getSourceBadgeClasses(conversation.source)}`}
                          >
                            {getSourceLabel(conversation.source)}
                          </Badge>
                        )}
                        {/* TOW-5: Show lead quality for Lead Finder runs */}
                        {conversation.source === "lead_finder" && conversation.leadQualityScore != null && conversation.leadQualityLabel && (
                          <Badge 
                            variant="outline" 
                            className={`ml-1 ${getQualityBadgeClasses(conversation.leadQualityLabel)}`}
                            title={`Lead Quality Score: ${conversation.leadQualityScore}/100`}
                          >
                            Quality: {conversation.leadQualityScore} ({conversation.leadQualityLabel.charAt(0).toUpperCase() + conversation.leadQualityLabel.slice(1)})
                          </Badge>
                        )}
                        {conversation.event_count > 1 && (
                          <Badge variant="secondary" className="ml-2">
                            {conversation.event_count} messages
                          </Badge>
                        )}
                        {conversation.user_identifier && (
                          <>
                            <User className="h-3 w-3 text-muted-foreground flex-shrink-0 ml-2" />
                            <span className="text-xs text-muted-foreground truncate">
                              {conversation.user_identifier}
                            </span>
                          </>
                        )}
                        <Badge
                          variant={
                            conversation.status === "success" || conversation.status === "completed" 
                              ? "default" 
                              : conversation.status === "error" || conversation.status === "fail"
                              ? "destructive"
                              : "secondary"
                          }
                          className="ml-auto flex-shrink-0"
                        >
                          {conversation.status}
                        </Badge>
                      </div>

                      <div>
                        <div className="text-xs text-muted-foreground mb-1">Input:</div>
                        <div className="text-sm line-clamp-2">{getInputText(conversation)}</div>
                      </div>

                      <div>
                        <div className="text-xs text-muted-foreground mb-1">Latest Output:</div>
                        <div className="text-sm text-muted-foreground line-clamp-2">
                          {getOutputText(conversation)}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleViewConversationClick(conversation.conversation_run_id)}
                      data-testid={`button-view-${conversation.conversation_run_id}`}
                    >
                      <Wrench className="h-3 w-3 mr-1" />
                      View Timeline
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleFlagClick(conversation)}
                      data-testid={`button-flag-${conversation.conversation_run_id}`}
                    >
                      <Flag className="h-3 w-3 mr-1" />
                      Flag conversation
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={flagDialogOpen} onOpenChange={setFlagDialogOpen}>
        <DialogContent data-testid="dialog-flag-run">
          <DialogHeader>
            <DialogTitle>Flag Run for Review</DialogTitle>
            <DialogDescription>
              Add this run to your Manual Flags list for later investigation.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {selectedConversation?.input_summary && (
              <div>
                <Label className="text-sm font-medium">Conversation Input</Label>
                <div className="text-sm text-muted-foreground mt-1">
                  {selectedConversation.input_summary}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="flag-reason">Reason (optional)</Label>
              <Textarea
                id="flag-reason"
                placeholder="What issue did you notice? (e.g., unhelpful response, bad reasoning, hallucination)"
                value={flagReason}
                onChange={(e) => setFlagReason(e.target.value)}
                rows={3}
                data-testid="textarea-flag-reason"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setFlagDialogOpen(false)}
              data-testid="button-cancel-flag"
            >
              Cancel
            </Button>
            <Button
              onClick={handleFlagSubmit}
              disabled={flagMutation.isPending}
              data-testid="button-submit-flag"
            >
              {flagMutation.isPending ? "Flagging..." : "Flag Run"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
