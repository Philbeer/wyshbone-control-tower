import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, CheckCircle, XCircle, Clock, AlertTriangle, Loader2, Copy } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useState, useEffect } from "react";
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
  replit_patch_prompt: string | null;
}

export default function InvestigatePage() {
  const { id } = useParams();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [rejectionReason, setRejectionReason] = useState("");
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);

  const { data: investigation, isLoading } = useQuery<Investigation>({
    queryKey: ["/tower/investigations", id],
    enabled: !!id,
  });

  // Auto-trigger evaluation if diagnosis and patch_suggestion are empty
  useEffect(() => {
    const triggerEvaluation = async () => {
      if (!investigation || !id) return;
      
      // Check if both fields are empty
      const needsEvaluation = !investigation.diagnosis || !investigation.patch_suggestion;
      
      if (needsEvaluation && !isEvaluating) {
        console.log(`[InvestigatePage] Triggering evaluation for investigation ${id}`);
        setIsEvaluating(true);
        
        try {
          const response = await apiRequest("POST", `/tower/investigations/${id}/evaluate`, {});
          const updatedInvestigation = await response.json();
          
          // Update the cache with the evaluated investigation
          queryClient.setQueryData(["/tower/investigations", id], updatedInvestigation);
          
          console.log(`[InvestigatePage] Evaluation completed successfully`);
        } catch (error: any) {
          console.error(`[InvestigatePage] Evaluation failed:`, error);
          toast({
            title: "Evaluation Failed",
            description: error.message || "Failed to generate diagnosis and patch suggestion",
            variant: "destructive",
          });
        } finally {
          setIsEvaluating(false);
        }
      }
    };

    triggerEvaluation();
  }, [investigation, id, isEvaluating, toast]);

  const approvePatchMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/tower/patch/approve/${id}`, {
        investigationId: id,
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to approve patch");
      }
      
      return await response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Patch Approved",
        description: data.message || "Copy the generated prompt and apply it in Replit UI.",
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

  const handleCopyPrompt = async () => {
    if (!investigation?.replit_patch_prompt) return;
    
    try {
      await navigator.clipboard.writeText(investigation.replit_patch_prompt);
      toast({
        title: "Copied!",
        description: "Prompt copied to clipboard. Paste it into Replit UI.",
      });
    } catch (error) {
      toast({
        title: "Copy Failed",
        description: "Failed to copy to clipboard. Please try again.",
        variant: "destructive",
      });
    }
  };

  const generatePromptMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/tower/investigations/${id}/generate-prompt`, {});
      return await response.json();
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["/tower/investigations", id], data);
      toast({
        title: "Prompt Generated",
        description: "The Replit prompt has been generated and is ready to copy.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Generation Failed",
        description: error.message || "Failed to generate prompt",
        variant: "destructive",
      });
    },
  });

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
            ) : isEvaluating ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Generating diagnosis using OpenAI...</span>
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
            ) : isEvaluating ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Generating patch suggestion using OpenAI...</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-muted-foreground">
                <AlertTriangle className="h-4 w-4" />
                <span>Patch suggestion is being generated. Please check back in a moment.</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Copy & Paste Prompt for Replit */}
        <Card data-testid="card-replit-prompt">
          <CardHeader>
            <CardTitle>Copy & Paste Prompt for Replit (Auto-Generated)</CardTitle>
            <CardDescription>
              A ready-to-use prompt you can paste directly into Replit UI to implement this fix
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {investigation.replit_patch_prompt ? (
              <>
                <div className="relative">
                  <pre className="p-4 rounded-md bg-muted text-xs overflow-x-auto whitespace-pre-wrap border">
                    {investigation.replit_patch_prompt}
                  </pre>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCopyPrompt}
                    className="absolute top-2 right-2"
                    data-testid="button-copy-prompt"
                  >
                    <Copy className="h-4 w-4 mr-2" />
                    Copy
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground">
                  Click "Copy" above, then paste this prompt into Replit UI's chat to implement the fix.
                </p>
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  Generate a formatted prompt that you can copy and paste directly into Replit UI to implement this patch.
                </p>
                <Button
                  onClick={() => generatePromptMutation.mutate()}
                  disabled={generatePromptMutation.isPending || !investigation.patch_suggestion}
                  data-testid="button-generate-prompt"
                >
                  {generatePromptMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Generate Replit Prompt
                    </>
                  )}
                </Button>
                {!investigation.patch_suggestion && (
                  <p className="text-sm text-muted-foreground italic">
                    A patch suggestion is required before generating the prompt
                  </p>
                )}
              </>
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
