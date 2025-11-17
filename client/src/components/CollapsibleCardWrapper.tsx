import { useState, ReactElement, cloneElement } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CollapsibleCardWrapperProps {
  defaultOpen?: boolean;
  children: ReactElement;
  onToggle?: (isOpen: boolean) => void;
}

export function CollapsibleCardWrapper({ 
  defaultOpen = false, 
  children,
  onToggle 
}: CollapsibleCardWrapperProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  const handleToggle = (newState: boolean) => {
    setIsOpen(newState);
    onToggle?.(newState);
  };

  // Clone the child Card and inject collapsible behavior
  const modifiedChild = cloneElement(children, {
    ...children.props,
    className: `${children.props.className || ''} relative`,
    children: (
      <>
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-4 right-4 z-10"
            data-testid={`button-toggle-card`}
          >
            {isOpen ? (
              <ChevronDown className="h-5 w-5" />
            ) : (
              <ChevronRight className="h-5 w-5" />
            )}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          {children.props.children}
        </CollapsibleContent>
      </>
    )
  });

  return (
    <Collapsible open={isOpen} onOpenChange={handleToggle}>
      {modifiedChild}
    </Collapsible>
  );
}
