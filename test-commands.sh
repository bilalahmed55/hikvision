#!/bin/bash

echo "=========================================="
echo "Testing Device Commands System"
echo "=========================================="
echo ""

BASE_URL="http://localhost:8000/api/hikvision"

echo "1. Creating a new command..."
echo "-------------------------------------------"
COMMAND_ID=$(curl -X POST "$BASE_URL/commands" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d '{
    "employee_no": "1001",
    "employee_name": "John Doe"
  }' \
  -s | jq -r '.command.id')

echo "Created command ID: $COMMAND_ID"
echo ""
echo ""

echo "2. Getting pending commands..."
echo "-------------------------------------------"
curl -X GET "$BASE_URL/commands/pending" \
  -H "Accept: application/json" \
  -s | jq '.'
echo ""
echo ""

echo "3. Updating command status to completed..."
echo "-------------------------------------------"
curl -X PUT "$BASE_URL/commands/$COMMAND_ID" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d '{
    "status": "completed",
    "result": "Fingerprint enrolled successfully"
  }' \
  -s | jq '.'
echo ""
echo ""

echo "=========================================="
echo "Tests Complete"
echo "=========================================="
