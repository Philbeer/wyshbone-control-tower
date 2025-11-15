import { createContext, useContext, useState, type ReactNode } from "react";

type EvaluatorContextValue = {
  activeInvestigationId: string | null;
  setActiveInvestigationId: (id: string | null) => void;
};

const EvaluatorContext = createContext<EvaluatorContextValue | null>(null);

export function EvaluatorProvider({ children }: { children: ReactNode }) {
  const [activeInvestigationId, setActiveInvestigationId] = useState<string | null>(null);

  return (
    <EvaluatorContext.Provider value={{ activeInvestigationId, setActiveInvestigationId }}>
      {children}
    </EvaluatorContext.Provider>
  );
}

export function useEvaluator() {
  const context = useContext(EvaluatorContext);
  if (!context) {
    throw new Error("useEvaluator must be used within EvaluatorProvider");
  }
  return context;
}
