#!/bin/bash
BASE="http://localhost:5000/api/tower/tower-verdict"

echo "=== Tower Verdict v1 - Local Tests ==="
echo ""

echo "--- Test 1: ACCEPT (25 leads, requested 20) ---"
curl -s -X POST "$BASE" \
  -H "Content-Type: application/json" \
  -d '{
    "artefactType": "leads_list",
    "leads": [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25],
    "success_criteria": { "target_count": 20 }
  }' | python3 -m json.tool
echo ""

echo "--- Test 2: ACCEPT (exact 20 of 20) ---"
curl -s -X POST "$BASE" \
  -H "Content-Type: application/json" \
  -d '{
    "artefactType": "leads_list",
    "leads": [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20],
    "success_criteria": { "target_count": 20 }
  }' | python3 -m json.tool
echo ""

echo "--- Test 3: CHANGE_PLAN (15 of 20 = 75%) ---"
curl -s -X POST "$BASE" \
  -H "Content-Type: application/json" \
  -d '{
    "artefactType": "leads_list",
    "leads": [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15],
    "success_criteria": { "target_count": 20 }
  }' | python3 -m json.tool
echo ""

echo "--- Test 4: CHANGE_PLAN (10 of 20 = 50%) ---"
curl -s -X POST "$BASE" \
  -H "Content-Type: application/json" \
  -d '{
    "artefactType": "leads_list",
    "leads": [1,2,3,4,5,6,7,8,9,10],
    "success_criteria": { "target_count": 20 }
  }' | python3 -m json.tool
echo ""

echo "--- Test 5: RETRY (5 of 20 = 25%) ---"
curl -s -X POST "$BASE" \
  -H "Content-Type: application/json" \
  -d '{
    "artefactType": "leads_list",
    "leads": [1,2,3,4,5],
    "success_criteria": { "target_count": 20 }
  }' | python3 -m json.tool
echo ""

echo "--- Test 6: RETRY (0 leads) ---"
curl -s -X POST "$BASE" \
  -H "Content-Type: application/json" \
  -d '{
    "artefactType": "leads_list",
    "leads": [],
    "success_criteria": { "target_count": 20 }
  }' | python3 -m json.tool
echo ""

echo "--- Test 7: STOP (leads missing entirely) ---"
curl -s -X POST "$BASE" \
  -H "Content-Type: application/json" \
  -d '{
    "artefactType": "leads_list",
    "success_criteria": { "target_count": 20 }
  }' | python3 -m json.tool
echo ""

echo "--- Test 8: STOP (leads is a string, not array) ---"
curl -s -X POST "$BASE" \
  -H "Content-Type: application/json" \
  -d '{
    "artefactType": "leads_list",
    "leads": "not an array",
    "success_criteria": { "target_count": 10 }
  }' | python3 -m json.tool
echo ""

echo "--- Test 9: Default target_count (no success_criteria) ---"
curl -s -X POST "$BASE" \
  -H "Content-Type: application/json" \
  -d '{
    "artefactType": "leads_list",
    "leads": [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20]
  }' | python3 -m json.tool
echo ""

echo "--- Test 10: Validation error (wrong artefactType) ---"
curl -s -X POST "$BASE" \
  -H "Content-Type: application/json" \
  -d '{
    "artefactType": "wrong_type",
    "leads": [1,2,3]
  }' | python3 -m json.tool
echo ""

echo "=== All tests complete ==="
