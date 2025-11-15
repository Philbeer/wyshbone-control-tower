#!/usr/bin/env node

/**
 * Test script to experiment with Wyshbone UI /api/chat endpoint
 * and discover the correct request schema
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const sourcesPath = join(__dirname, '../config/sources.json');
const sources = JSON.parse(readFileSync(sourcesPath, 'utf-8'));

const uiSource = sources.find(s => s.name === 'Wyshbone UI');

if (!uiSource) {
  console.error('Wyshbone UI source not found in config/sources.json');
  process.exit(1);
}

async function testChatRequest(payload, authMethod = 'none') {
  console.log('\n=== Testing payload ===');
  console.log(JSON.stringify(payload, null, 2));
  console.log(`Auth method: ${authMethod}`);
  
  try {
    const headers = {
      'Content-Type': 'application/json',
    };
    
    if (authMethod === 'X-EXPORT-KEY' && uiSource.exportKey) {
      headers['X-EXPORT-KEY'] = uiSource.exportKey;
    }
    
    const response = await fetch(`${uiSource.baseUrl}/api/chat`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    const responseText = await response.text();
    
    console.log(`\nStatus: ${response.status} ${response.statusText}`);
    console.log('Response body:');
    
    try {
      const jsonData = JSON.parse(responseText);
      console.log(JSON.stringify(jsonData, null, 2));
    } catch {
      console.log(responseText);
    }
    
    return { status: response.status, body: responseText };
  } catch (error) {
    console.error('Request failed:', error.message);
    return { error: error.message };
  }
}

async function main() {
  console.log(`Testing Wyshbone UI at: ${uiSource.baseUrl}/api/chat\n`);

  // Test 1: Without auth - should get 401
  console.log('\n--- TEST 1: Without authentication ---');
  await testChatRequest({
    user: {
      id: "tower-eval",
      name: "Tower Evaluator",
      email: "tower@evaluator.local"
    },
    messages: [
      {
        role: "user",
        content: "Hello"
      }
    ]
  }, 'none');

  // Test 2: With auth - greeting test
  console.log('\n--- TEST 2: With auth - Greeting test ---');
  await testChatRequest({
    user: {
      id: "tower-eval",
      name: "Tower Evaluator",
      email: "tower@evaluator.local"
    },
    messages: [
      {
        role: "user",
        content: "Hello"
      }
    ]
  }, 'X-EXPORT-KEY');

  // Test 3: With auth - personalization via domain
  console.log('\n--- TEST 3: With auth - Personalization test ---');
  await testChatRequest({
    user: {
      id: "tower-eval",
      name: "Tower Evaluator",
      email: "tower@evaluator.local",
      domain: "examplebrewery.com"
    },
    messages: [
      {
        role: "user",
        content: "My company domain is examplebrewery.com"
      }
    ]
  }, 'X-EXPORT-KEY');

  // Test 4: With auth - lead search
  console.log('\n--- TEST 4: With auth - Lead search test ---');
  await testChatRequest({
    user: {
      id: "tower-eval",
      name: "Tower Evaluator",
      email: "tower@evaluator.local"
    },
    messages: [
      {
        role: "user",
        content: "Find some freehouse pubs near Brighton"
      }
    ]
  }, 'X-EXPORT-KEY');
}

main().catch(console.error);
