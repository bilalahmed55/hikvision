#!/bin/bash

echo "=========================================="
echo "Testing Employees Sync Endpoints"
echo "=========================================="
echo ""

BASE_URL="http://localhost:8000/api/hikvision"

echo "1. Syncing employees from device..."
echo "-------------------------------------------"
curl -X POST "$BASE_URL/sync-employees" \
  -H "Accept: application/json" \
  -s | jq '.'
echo ""
echo ""

echo "2. Getting employees list from database..."
echo "-------------------------------------------"
curl -X GET "$BASE_URL/employees-list" \
  -H "Accept: application/json" \
  -s | jq '.'
echo ""
echo ""

echo "=========================================="
echo "Tests Complete"
echo "=========================================="
