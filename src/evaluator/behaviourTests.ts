import type { BehaviourTest } from '../../shared/schema';
import type { ChatRequest, ChatMessage } from './chatApiTypes';

export type BehaviourTestResult = {
  testId: string;
  status: "pass" | "fail" | "error";
  details: string;
  rawLog?: any;
  durationMs?: number;
};

const TEST_DEFINITIONS: BehaviourTest[] = [
  {
    id: "greeting-basic",
    name: "Greeting / onboarding",
    description: "Simulate a new user conversation and verify the system responds with a welcome and asks for goals",
    category: "greeting",
    isActive: true,
  },
  {
    id: "personalisation-domain",
    name: "Personalisation via domain",
    description: "Supply a domain and verify the system acknowledges it and adapts its language to that business",
    category: "personalisation",
    isActive: true,
  },
  {
    id: "lead-search-basic",
    name: "Basic lead search",
    description: "Request a lead search and verify the system triggers a search and returns results",
    category: "lead-search",
    isActive: true,
  },
  {
    id: "monitor-setup-basic",
    name: "Monitoring setup",
    description: "Request monitoring setup and verify the system acknowledges setting up a recurring behavior",
    category: "monitoring",
    isActive: true,
  },
];

export function getAllBehaviourTestDefinitions(): BehaviourTest[] {
  return TEST_DEFINITIONS;
}

async function callWyshboneUI(
  message: string,
  options?: { domain?: string }
): Promise<string> {
  const sources = await import('../../config/sources.json');
  const uiSource = sources.default.find((s: any) => s.name === 'Wyshbone UI');
  
  if (!uiSource) {
    throw new Error('Wyshbone UI source not configured');
  }

  const chatRequest: ChatRequest = {
    user: {
      id: "tower-eval",
      name: "Tower Evaluator",
      email: "tower@evaluator.local",
      ...(options?.domain && { domain: options.domain }),
    },
    messages: [
      {
        role: "user",
        content: message,
      },
    ],
  };

  const response = await fetch(`${uiSource.baseUrl}/api/tower/chat-test`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-EXPORT-KEY': uiSource.exportKey,
    },
    body: JSON.stringify(chatRequest),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`UI API returned ${response.status}: ${errorText}`);
  }

  // Handle streaming event-stream response
  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('text/event-stream')) {
    return await parseStreamingResponse(response);
  }

  // Fallback for non-streaming responses
  const data = await response.json();
  
  if (typeof data === 'string') {
    return data;
  }
  
  if (data.message) {
    return data.message;
  }
  
  if (data.response) {
    return data.response;
  }
  
  return JSON.stringify(data);
}

async function parseStreamingResponse(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('Response body is not readable');
  }

  const decoder = new TextDecoder();
  let fullText = '';
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      
      // Process complete SSE events
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6); // Remove 'data: ' prefix
          
          if (data === '[DONE]') {
            continue;
          }

          try {
            const parsed = JSON.parse(data);
            if (parsed.content) {
              fullText += parsed.content;
            } else if (parsed.delta?.content) {
              fullText += parsed.delta.content;
            } else if (typeof parsed === 'string') {
              fullText += parsed;
            }
          } catch {
            // If not JSON, treat as plain text
            fullText += data;
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return fullText.trim();
}

async function testGreeting(): Promise<BehaviourTestResult> {
  const startTime = Date.now();
  
  try {
    const response = await callWyshboneUI("Hello");
    const durationMs = Date.now() - startTime;
    
    const responseLower = response.toLowerCase();
    
    const hasGreeting = /\b(hello|hi|hey|welcome|greetings)\b/.test(responseLower);
    const hasGoalQuestion = /(what.*(?:trying|like|want|need|help|goal|achieve|looking for))|(?:can i help)|(?:how.*help)/.test(responseLower);
    
    if (hasGreeting && hasGoalQuestion) {
      return {
        testId: "greeting-basic",
        status: "pass",
        details: "Response contains greeting and asks about user goals",
        rawLog: { response: response.substring(0, 500) },
        durationMs,
      };
    } else if (hasGreeting) {
      return {
        testId: "greeting-basic",
        status: "fail",
        details: "Response has greeting but doesn't ask about goals",
        rawLog: { response: response.substring(0, 500) },
        durationMs,
      };
    } else {
      return {
        testId: "greeting-basic",
        status: "fail",
        details: "Response missing greeting pattern",
        rawLog: { response: response.substring(0, 500) },
        durationMs,
      };
    }
  } catch (error: any) {
    return {
      testId: "greeting-basic",
      status: "error",
      details: `Error: ${error.message}`,
      rawLog: { error: error.toString() },
      durationMs: Date.now() - startTime,
    };
  }
}

async function testPersonalisation(): Promise<BehaviourTestResult> {
  const startTime = Date.now();
  
  try {
    const response = await callWyshboneUI(
      "My company domain is examplebrewery.com",
      { domain: "examplebrewery.com" }
    );
    const durationMs = Date.now() - startTime;
    
    const responseLower = response.toLowerCase();
    
    const acknowledgesDomain = /(examplebrewery|brewery|your business|your company|domain)/.test(responseLower);
    const hasBusinessContext = /(pubs|bars|retailers|distributors|beer|beverage|hospitality)/.test(responseLower);
    
    if (acknowledgesDomain && hasBusinessContext) {
      return {
        testId: "personalisation-domain",
        status: "pass",
        details: "Response acknowledges domain and provides business-specific context",
        rawLog: { response: response.substring(0, 500) },
        durationMs,
      };
    } else if (acknowledgesDomain) {
      return {
        testId: "personalisation-domain",
        status: "fail",
        details: "Response acknowledges domain but lacks business-specific adaptation",
        rawLog: { response: response.substring(0, 500) },
        durationMs,
      };
    } else {
      return {
        testId: "personalisation-domain",
        status: "fail",
        details: "Response doesn't acknowledge the domain",
        rawLog: { response: response.substring(0, 500) },
        durationMs,
      };
    }
  } catch (error: any) {
    return {
      testId: "personalisation-domain",
      status: "error",
      details: `Error: ${error.message}`,
      rawLog: { error: error.toString() },
      durationMs: Date.now() - startTime,
    };
  }
}

async function testLeadSearch(): Promise<BehaviourTestResult> {
  const startTime = Date.now();
  
  try {
    const response = await callWyshboneUI("Find some freehouse pubs near Brighton");
    const durationMs = Date.now() - startTime;
    
    const responseLower = response.toLowerCase();
    
    const hasSearchIndication = /(search|searching|found|finding|results|leads|looking for|identified)/.test(responseLower);
    const hasPubsOrLeads = /(pubs?|freehouse|leads?|venues?|establishments?)/.test(responseLower);
    const hasLocationContext = /(brighton|area|near|location)/.test(responseLower);
    
    if (hasSearchIndication && (hasPubsOrLeads || hasLocationContext)) {
      return {
        testId: "lead-search-basic",
        status: "pass",
        details: "Response indicates lead search was triggered with relevant context",
        rawLog: { response: response.substring(0, 500) },
        durationMs,
      };
    } else if (hasSearchIndication) {
      return {
        testId: "lead-search-basic",
        status: "fail",
        details: "Response mentions search but lacks specific lead context",
        rawLog: { response: response.substring(0, 500) },
        durationMs,
      };
    } else {
      return {
        testId: "lead-search-basic",
        status: "fail",
        details: "Response doesn't indicate a search was performed",
        rawLog: { response: response.substring(0, 500) },
        durationMs,
      };
    }
  } catch (error: any) {
    return {
      testId: "lead-search-basic",
      status: "error",
      details: `Error: ${error.message}`,
      rawLog: { error: error.toString() },
      durationMs: Date.now() - startTime,
    };
  }
}

async function testMonitorSetup(): Promise<BehaviourTestResult> {
  const startTime = Date.now();
  
  try {
    const response = await callWyshboneUI("Set up a monitor for new breweries in Texas");
    const durationMs = Date.now() - startTime;
    
    const responseLower = response.toLowerCase();
    
    const hasMonitoringLanguage = /(monitor|monitoring|track|tracking|watch|alert|notify|recurring|schedule|automated)/.test(responseLower);
    const hasSetupConfirmation = /(set up|setup|created|configured|will.*monitor|i'll.*track)/.test(responseLower);
    const hasContext = /(breweries|texas|new)/.test(responseLower);
    
    if (hasMonitoringLanguage && hasSetupConfirmation) {
      return {
        testId: "monitor-setup-basic",
        status: "pass",
        details: "Response confirms monitoring setup with appropriate language",
        rawLog: { response: response.substring(0, 500) },
        durationMs,
      };
    } else if (hasMonitoringLanguage) {
      return {
        testId: "monitor-setup-basic",
        status: "fail",
        details: "Response mentions monitoring but doesn't confirm setup",
        rawLog: { response: response.substring(0, 500) },
        durationMs,
      };
    } else {
      return {
        testId: "monitor-setup-basic",
        status: "fail",
        details: "Response doesn't indicate monitoring capability",
        rawLog: { response: response.substring(0, 500) },
        durationMs,
      };
    }
  } catch (error: any) {
    return {
      testId: "monitor-setup-basic",
      status: "error",
      details: `Error: ${error.message}`,
      rawLog: { error: error.toString() },
      durationMs: Date.now() - startTime,
    };
  }
}

export async function runBehaviourTest(
  testId: string,
  options?: { buildTag?: string }
): Promise<BehaviourTestResult> {
  const testDef = TEST_DEFINITIONS.find(t => t.id === testId);
  
  if (!testDef) {
    return {
      testId,
      status: "error",
      details: `Unknown test ID: ${testId}`,
    };
  }

  if (!testDef.isActive) {
    return {
      testId,
      status: "error",
      details: "Test is not active",
    };
  }

  switch (testId) {
    case "greeting-basic":
      return await testGreeting();
    case "personalisation-domain":
      return await testPersonalisation();
    case "lead-search-basic":
      return await testLeadSearch();
    case "monitor-setup-basic":
      return await testMonitorSetup();
    default:
      return {
        testId,
        status: "error",
        details: "Test not implemented",
      };
  }
}

export async function runAllBehaviourTests(
  options?: { buildTag?: string }
): Promise<BehaviourTestResult[]> {
  const activeTests = TEST_DEFINITIONS.filter(t => t.isActive);
  
  const results: BehaviourTestResult[] = [];
  
  for (const test of activeTests) {
    const result = await runBehaviourTest(test.id, options);
    results.push(result);
  }
  
  return results;
}
