#!/bin/bash

echo "=========================================="
echo "Testing New Hikvision Endpoints"
echo "=========================================="
echo ""

BASE_URL="http://localhost:8000/api/hikvision"

echo "1. Testing GET /pending-employees"
echo "-------------------------------------------"
curl -X GET "$BASE_URL/pending-employees" \
  -H "Accept: application/json" \
  -s | jq '.'
echo ""
echo ""

echo "2. Testing PUT /employees/1/mark-synced"
echo "-------------------------------------------"
curl -X PUT "$BASE_URL/employees/1/mark-synced" \
  -H "Accept: application/json" \
  -s | jq '.'
echo ""
echo ""

echo "=========================================="
echo "Tests Complete"
echo "=========================================="
