import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link } from "wouter";
import { ArrowLeft, Upload, Loader2, FileCode, ScrollText, ChevronDown, ChevronRight, Bug, Clock, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

const issueFormSchema = z.object({
  title: z.string().min(5, "Title must be at least 5 characters"),
  description: z.string().min(10, "Description must be at least 10 characters"),
  screenshotUrl: z.string().optional(),
});

type IssueFormData = z.infer<typeof issueFormSchema>;

interface DevIssue {
  id: string;
  title: string;
  description: string;
  screenshotUrl: string | null;
  createdAt: string;
  status: string;
}

interface DevIssueContext {
  id: string;
  issueId: string;
  filePath: string | null;
  fileContents: string | null;
  logExcerpt: string | null;
  createdAt: string;
}

function getStatusColor(status: string): string {
  switch (status) {
    case "new": return "bg-blue-500";
    case "context_gathered": return "bg-yellow-500";
    case "investigating": return "bg-purple-500";
    case "resolved": return "bg-green-500";
    case "closed": return "bg-gray-500";
    default: return "bg-gray-400";
  }
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleString();
}

function FileContextCard({ context }: { context: DevIssueContext }) {
  const [isOpen, setIsOpen] = useState(false);
  
  if (!context.filePath) return null;
  
  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card className="overflow-hidden">
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer py-3 px-4 hover-elevate">
            <div className="flex items-center gap-2">
              {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              <FileCode className="h-4 w-4 text-muted-foreground" />
              <span className="font-mono text-sm" data-testid={`text-file-path-${context.id}`}>
                {context.filePath}
              </span>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="p-0">
            <ScrollArea className="h-[300px] w-full">
              <pre className="p-4 text-xs bg-muted/50 overflow-x-auto">
                <code data-testid={`code-file-content-${context.id}`}>{context.fileContents}</code>
              </pre>
            </ScrollArea>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

function LogContextCard({ context }: { context: DevIssueContext }) {
  const [isOpen, setIsOpen] = useState(true);
  
  if (!context.logExcerpt) return null;
  
  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card className="overflow-hidden">
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer py-3 px-4 hover-elevate">
            <div className="flex items-center gap-2">
              {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              <ScrollText className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium text-sm">Log Excerpts</span>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="p-0">
            <ScrollArea className="h-[200px] w-full">
              <pre className="p-4 text-xs bg-muted/50 overflow-x-auto font-mono">
                <code data-testid="code-log-excerpt">{context.logExcerpt}</code>
              </pre>
            </ScrollArea>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

function IssueDetailPanel({ issue, context }: { issue: DevIssue; context: DevIssueContext[] }) {
  const fileContexts = context.filter(c => c.filePath);
  const logContexts = context.filter(c => c.logExcerpt);
  
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <CardTitle className="text-lg" data-testid="text-issue-title">{issue.title}</CardTitle>
              <CardDescription className="flex items-center gap-2">
                <Clock className="h-3 w-3" />
                <span data-testid="text-issue-date">{formatDate(issue.createdAt)}</span>
              </CardDescription>
            </div>
            <Badge className={getStatusColor(issue.status)} data-testid="badge-issue-status">
              {issue.status.replace("_", " ").toUpperCase()}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-2">Description</h4>
            <p className="text-sm whitespace-pre-wrap" data-testid="text-issue-description">{issue.description}</p>
          </div>
          
          {issue.screenshotUrl && (
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-2">Screenshot</h4>
              <img 
                src={issue.screenshotUrl} 
                alt="Issue screenshot" 
                className="max-w-full rounded-md border"
                data-testid="img-issue-screenshot"
              />
            </div>
          )}
        </CardContent>
      </Card>
      
      {fileContexts.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-medium flex items-center gap-2">
            <FileCode className="h-4 w-4" />
            Relevant Files ({fileContexts.length})
          </h3>
          <div className="space-y-2">
            {fileContexts.map(ctx => (
              <FileContextCard key={ctx.id} context={ctx} />
            ))}
          </div>
        </div>
      )}
      
      {logContexts.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-medium flex items-center gap-2">
            <ScrollText className="h-4 w-4" />
            Log Excerpts
          </h3>
          <div className="space-y-2">
            {logContexts.map(ctx => (
              <LogContextCard key={ctx.id} context={ctx} />
            ))}
          </div>
        </div>
      )}
      
      {fileContexts.length === 0 && logContexts.length === 0 && (
        <Card className="bg-muted/30">
          <CardContent className="p-6 text-center text-muted-foreground">
            <Bug className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No context gathered yet. Context will be gathered after issue creation.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function IssueListItem({ issue, onClick, isSelected }: { issue: DevIssue; onClick: () => void; isSelected: boolean }) {
  return (
    <Card 
      className={`cursor-pointer transition-colors ${isSelected ? 'ring-2 ring-primary' : 'hover-elevate'}`}
      onClick={onClick}
      data-testid={`card-issue-${issue.id}`}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h4 className="font-medium truncate" data-testid={`text-issue-title-${issue.id}`}>{issue.title}</h4>
            <p className="text-sm text-muted-foreground truncate mt-1">{issue.description}</p>
            <p className="text-xs text-muted-foreground mt-2">
              {formatDate(issue.createdAt)}
            </p>
          </div>
          <Badge className={getStatusColor(issue.status)} variant="secondary">
            {issue.status.replace("_", " ")}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}

export default function DevIssuesPage() {
  const { toast } = useToast();
  const [selectedIssue, setSelectedIssue] = useState<string | null>(null);
  const [isGatheringContext, setIsGatheringContext] = useState(false);
  
  const form = useForm<IssueFormData>({
    resolver: zodResolver(issueFormSchema),
    defaultValues: {
      title: "",
      description: "",
      screenshotUrl: "",
    },
  });
  
  // Fetch all issues
  const { data: issues = [], isLoading: isLoadingIssues } = useQuery<DevIssue[]>({
    queryKey: ["/api/dev/issues"],
  });
  
  // Fetch selected issue with context
  const { data: issueWithContext, isLoading: isLoadingContext } = useQuery<{ issue: DevIssue; context: DevIssueContext[] }>({
    queryKey: ["/api/dev/issues", selectedIssue],
    enabled: !!selectedIssue,
  });
  
  // Create issue mutation
  const createIssueMutation = useMutation({
    mutationFn: async (data: IssueFormData) => {
      const response = await apiRequest("POST", "/api/dev/issues/create", data);
      return response.json();
    },
    onSuccess: async (newIssue: DevIssue) => {
      toast({
        title: "Issue Created",
        description: "Now gathering context for your issue...",
      });
      
      // Clear form
      form.reset();
      
      // Invalidate issues list
      queryClient.invalidateQueries({ queryKey: ["/api/dev/issues"] });
      
      // Select the new issue
      setSelectedIssue(newIssue.id);
      
      // Gather context
      setIsGatheringContext(true);
      try {
        await apiRequest("POST", "/api/dev/issues/context", { issueId: newIssue.id });
        queryClient.invalidateQueries({ queryKey: ["/api/dev/issues", newIssue.id] });
        toast({
          title: "Context Gathered",
          description: "Relevant files and logs have been collected.",
        });
      } catch (err: any) {
        toast({
          title: "Context Gathering Failed",
          description: err.message,
          variant: "destructive",
        });
      } finally {
        setIsGatheringContext(false);
      }
    },
    onError: (err: any) => {
      toast({
        title: "Failed to Create Issue",
        description: err.message,
        variant: "destructive",
      });
    },
  });
  
  const onSubmit = (data: IssueFormData) => {
    createIssueMutation.mutate(data);
  };
  
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Link href="/dashboard">
              <Button variant="ghost" size="icon" data-testid="button-back">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-xl font-bold flex items-center gap-2">
                <Bug className="h-5 w-5" />
                Developer Issues
              </h1>
              <p className="text-sm text-muted-foreground">Report and track development issues</p>
            </div>
          </div>
        </div>
      </header>
      
      <main className="container mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Create Form + Issue List */}
          <div className="space-y-6">
            {/* Create Issue Form */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Report New Issue</CardTitle>
                <CardDescription>
                  Describe the issue and optionally upload a screenshot
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <FormField
                      control={form.control}
                      name="title"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Title</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="e.g., Add Customer button not working" 
                              {...field}
                              data-testid="input-title"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="description"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Description</FormLabel>
                          <FormControl>
                            <Textarea 
                              placeholder='Describe the issue. Include error messages like "Failed to create customer" or UI element names.'
                              className="min-h-[100px]"
                              {...field}
                              data-testid="input-description"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="screenshotUrl"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Screenshot URL (optional)</FormLabel>
                          <FormControl>
                            <div className="flex gap-2">
                              <Input 
                                placeholder="https://..." 
                                {...field}
                                data-testid="input-screenshot"
                              />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <Button 
                      type="submit" 
                      className="w-full"
                      disabled={createIssueMutation.isPending || isGatheringContext}
                      data-testid="button-create-issue"
                    >
                      {createIssueMutation.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Creating...
                        </>
                      ) : isGatheringContext ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Gathering Context...
                        </>
                      ) : (
                        <>
                          <Upload className="mr-2 h-4 w-4" />
                          Create Issue
                        </>
                      )}
                    </Button>
                  </form>
                </Form>
              </CardContent>
            </Card>
            
            {/* Issues List */}
            <div className="space-y-3">
              <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
                Recent Issues
              </h3>
              
              {isLoadingIssues ? (
                <Card className="p-6">
                  <div className="flex items-center justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                </Card>
              ) : issues.length === 0 ? (
                <Card className="p-6">
                  <p className="text-sm text-muted-foreground text-center">
                    No issues yet. Create one above to get started.
                  </p>
                </Card>
              ) : (
                <div className="space-y-2">
                  {issues.map(issue => (
                    <IssueListItem 
                      key={issue.id} 
                      issue={issue} 
                      onClick={() => setSelectedIssue(issue.id)}
                      isSelected={selectedIssue === issue.id}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
          
          {/* Right Column - Issue Detail */}
          <div className="lg:col-span-2">
            {isGatheringContext ? (
              <Card className="p-12">
                <div className="flex flex-col items-center justify-center text-center">
                  <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
                  <h3 className="font-medium text-lg mb-2">Gathering Context</h3>
                  <p className="text-muted-foreground text-sm">
                    Searching for relevant files and logs...
                  </p>
                </div>
              </Card>
            ) : isLoadingContext ? (
              <Card className="p-12">
                <div className="flex items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              </Card>
            ) : issueWithContext ? (
              <IssueDetailPanel 
                issue={issueWithContext.issue} 
                context={issueWithContext.context} 
              />
            ) : (
              <Card className="p-12">
                <div className="flex flex-col items-center justify-center text-center">
                  <Bug className="h-12 w-12 text-muted-foreground/30 mb-4" />
                  <h3 className="font-medium text-lg mb-2">No Issue Selected</h3>
                  <p className="text-muted-foreground text-sm">
                    Select an issue from the list or create a new one to see details and context.
                  </p>
                </div>
              </Card>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
