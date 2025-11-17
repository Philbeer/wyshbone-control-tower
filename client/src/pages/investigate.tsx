import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, CheckCircle, XCircle, Clock, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

interface Investigation {
  id: string;
  created_at: string;
  trigger: string;
  run_id: string | null;
  notes: string | null;
  run_logs: any[];
  run_meta: any;
  diagnosis: string | null;
  patch_suggestion: string | null;
}

export default function InvestigatePage() {
  const { id } = useParams();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [rejectionReason, setRejectionReason] = useState("");
  const [showRejectDialog, setShowRejectDialog] = useState(false);

  const { data: investigation, isLoading } = useQuery<Investigation>({
    queryKey: ["/tower/investigations", id],
    enabled: !!id,
  });

  const approvePatchMutation = useMutation({
    mutationFn: async () => {
      // Send patch to Replit via existing API
      return await apiRequest("POST", `/tower/patch/approve/${id}`, {
        investigationId: id,
      });
    },
    onSuccess: () => {
      toast({
        title: "Patch Approved",
        description: "The patch has been sent to Replit for application.",
      });
      
      // Invalidate queries so dashboard updates
      queryClient.invalidateQueries({ queryKey: ["/tower/runs"] });
      queryClient.invalidateQueries({ queryKey: ["/tower/manual-flags"] });
      queryClient.invalidateQueries({ queryKey: ["/tower/auto-conversation-quality"] });
      queryClient.invalidateQueries({ queryKey: ["/tower/conversation-quality"] });
      queryClient.invalidateQueries({ queryKey: ["/tower/patch-failures"] });
      
      navigate("/dashboard");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to approve patch",
        variant: "destructive",
      });
    },
  });

  const rejectPatchMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", `/tower/patch/reject/${id}`, {
        investigationId: id,
        reason: rejectionReason.trim(),
      });
    },
    onSuccess: () => {
      toast({
        title: "Patch Rejected",
        description: "Your feedback has been recorded.",
      });
      setShowRejectDialog(false);
      setRejectionReason("");
      
      // Invalidate queries so dashboard updates
      queryClient.invalidateQueries({ queryKey: ["/tower/runs"] });
      queryClient.invalidateQueries({ queryKey: ["/tower/manual-flags"] });
      queryClient.invalidateQueries({ queryKey: ["/tower/auto-conversation-quality"] });
      queryClient.invalidateQueries({ queryKey: ["/tower/conversation-quality"] });
      queryClient.invalidateQueries({ queryKey: ["/tower/patch-failures"] });
      
      navigate("/dashboard");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to reject patch",
        variant: "destructive",
      });
      // Dialog stays open so user can fix the issue
    },
  });

  const handleApprove = () => {
    approvePatchMutation.mutate();
  };

  const handleReject = () => {
    // Explicit front-end validation before mutation
    if (!rejectionReason.trim()) {
      toast({
        title: "Reason Required",
        description: "Please provide a reason for rejecting this patch.",
        variant: "destructive",
      });
      return;
    }
    rejectPatchMutation.mutate();
  };

  const getOriginalInput = (inv: Investigation): string => {
    const messages = inv.run_meta?.conversation_window;
    if (Array.isArray(messages) && messages.length > 0) {
      const userMessage = messages.find((m: any) => m.role === "user");
      if (userMessage?.content) return userMessage.content;
    }
    return inv.run_meta?.goal_summary || "No input available";
  };

  const getOriginalOutput = (inv: Investigation): string => {
    const messages = inv.run_meta?.conversation_window;
    if (Array.isArray(messages) && messages.length > 0) {
      const assistantMessage = messages.find((m: any) => m.role === "assistant");
      if (assistantMessage?.content) return assistantMessage.content;
    }
    return inv.run_meta?.output || "No output available";
  };

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="container mx-auto max-w-4xl">
          <div className="text-center">Loading investigation...</div>
        </div>
      </div>
    );
  }

  if (!investigation) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="container mx-auto max-w-4xl">
          <Card>
            <CardHeader>
              <CardTitle>Investigation Not Found</CardTitle>
              <CardDescription>
                The investigation you're looking for doesn't exist.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => navigate("/dashboard")} data-testid="button-back-to-dashboard">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Dashboard
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="container mx-auto max-w-4xl space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            onClick={() => navigate("/dashboard")}
            data-testid="button-back"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Investigate & Fix</h1>
            <p className="text-sm text-muted-foreground">
              Review the issue and approve or reject the suggested patch
            </p>
          </div>
        </div>

        {/* Investigation Info */}
        <Card data-testid="card-investigation-info">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle>Investigation Details</CardTitle>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">
                  {formatTime(investigation.created_at)}
                </span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-sm font-medium">Run Input</Label>
              <div className="mt-2 p-3 rounded-md bg-muted text-sm">
                {getOriginalInput(investigation)}
              </div>
            </div>

            <div>
              <Label className="text-sm font-medium">Run Output</Label>
              <div className="mt-2 p-3 rounded-md bg-muted text-sm">
                {getOriginalOutput(investigation)}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Diagnosis */}
        <Card data-testid="card-diagnosis">
          <CardHeader>
            <CardTitle>Auto Diagnosis</CardTitle>
            <CardDescription>
              Tower analyzed the conversation and identified the following issue
            </CardDescription>
          </CardHeader>
          <CardContent>
            {investigation.diagnosis ? (
              <div className="prose prose-sm max-w-none">
                <p className="whitespace-pre-wrap">{investigation.diagnosis}</p>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-muted-foreground">
                <AlertTriangle className="h-4 w-4" />
                <span>Diagnosis is being generated. Please check back in a moment.</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Patch Suggestion */}
        <Card data-testid="card-patch">
          <CardHeader>
            <CardTitle>Suggested Patch</CardTitle>
            <CardDescription>
              Recommended code changes to fix this issue
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {investigation.patch_suggestion ? (
              <>
                <div className="p-4 rounded-md bg-muted font-mono text-xs overflow-x-auto">
                  <pre className="whitespace-pre-wrap">{investigation.patch_suggestion}</pre>
                </div>

                <div className="flex gap-3">
                  <Button
                    onClick={handleApprove}
                    disabled={approvePatchMutation.isPending}
                    className="flex-1"
                    data-testid="button-approve-patch"
                  >
                    <CheckCircle className="h-4 w-4 mr-2" />
                    {approvePatchMutation.isPending ? "Approving..." : "Approve Patch"}
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => setShowRejectDialog(true)}
                    disabled={rejectPatchMutation.isPending}
                    className="flex-1"
                    data-testid="button-reject-patch"
                  >
                    <XCircle className="h-4 w-4 mr-2" />
                    Reject Patch
                  </Button>
                </div>
              </>
            ) : (
              <div className="flex items-center gap-2 text-muted-foreground">
                <AlertTriangle className="h-4 w-4" />
                <span>Patch suggestion is being generated. Please check back in a moment.</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Rejection Dialog */}
        <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
          <DialogContent data-testid="dialog-reject-patch">
            <DialogHeader>
              <DialogTitle>Reject This Patch?</DialogTitle>
              <DialogDescription>
                Please explain what was wrong with this patch so we can improve future suggestions.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2">
              <Label htmlFor="rejection-reason">Reason for Rejection <span className="text-destructive">*</span></Label>
              <Textarea
                id="rejection-reason"
                placeholder="e.g., This would break the login flow, The fix doesn't address the root cause, etc."
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                rows={4}
                data-testid="textarea-rejection-reason"
              />
              {!rejectionReason.trim() && (
                <p className="text-sm text-muted-foreground">
                  Please provide a reason to help improve future patch suggestions.
                </p>
              )}
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setShowRejectDialog(false);
                  setRejectionReason("");
                }}
                data-testid="button-cancel-reject"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleReject}
                disabled={rejectPatchMutation.isPending || !rejectionReason.trim()}
                data-testid="button-confirm-reject"
              >
                {rejectPatchMutation.isPending ? "Rejecting..." : "Reject Patch"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
