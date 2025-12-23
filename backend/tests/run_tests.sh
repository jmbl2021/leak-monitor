#!/bin/bash
# Simple shell-based API tests

BASE_URL="http://localhost:8001"
PASSED=0
FAILED=0

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

run_test() {
    local test_name="$1"
    local test_command="$2"
    local expected_status="$3"

    echo -n "Testing: $test_name ... "

    # Run the test command and capture status
    HTTP_STATUS=$(eval "$test_command" 2>&1 | tail -1 | grep -oP 'HTTP_STATUS:\K\d+')

    if [ "$HTTP_STATUS" == "$expected_status" ]; then
        echo -e "${GREEN}PASS${NC}"
        ((PASSED++))
    else
        echo -e "${RED}FAIL${NC} (expected $expected_status, got $HTTP_STATUS)"
        ((FAILED++))
    fi
}

echo "========================================"
echo "Running Leak Monitor API Tests"
echo "========================================"
echo ""

# Test 1: Health endpoint
run_test "Health endpoint" \
    "curl -s -w 'HTTP_STATUS:%{http_code}' $BASE_URL/api/health -o /dev/null" \
    "200"

# Test 2: Root endpoint
run_test "Root endpoint" \
    "curl -s -w 'HTTP_STATUS:%{http_code}' $BASE_URL/ -o /dev/null" \
    "200"

# Test 3: List victims
run_test "List victims" \
    "curl -s -w 'HTTP_STATUS:%{http_code}' $BASE_URL/api/victims?limit=5 -o /dev/null" \
    "200"

# Test 4: List monitors
run_test "List monitors" \
    "curl -s -w 'HTTP_STATUS:%{http_code}' $BASE_URL/api/monitors -o /dev/null" \
    "200"

# Test 5: List groups
run_test "List groups" \
    "curl -s -w 'HTTP_STATUS:%{http_code}' $BASE_URL/api/monitors/groups/list -o /dev/null" \
    "200"

# Test 6: Get stats
run_test "Get stats" \
    "curl -s -w 'HTTP_STATUS:%{http_code}' $BASE_URL/api/victims/stats -o /dev/null" \
    "200"

# Test 7: Get pending victims
run_test "Get pending victims" \
    "curl -s -w 'HTTP_STATUS:%{http_code}' $BASE_URL/api/victims/pending?limit=5 -o /dev/null" \
    "200"

# Test 8: AI classify without API key (should fail with 401)
run_test "AI auth check (should fail)" \
    "curl -s -w 'HTTP_STATUS:%{http_code}' -X POST $BASE_URL/api/analyze/classify -H 'Content-Type: application/json' -d '{\"victim_ids\": [\"00000000-0000-0000-0000-000000000000\"]}' -o /dev/null" \
    "401"

# Test 9: 8-K batch endpoint
run_test "8-K batch endpoint" \
    "curl -s -w 'HTTP_STATUS:%{http_code}' -X POST '$BASE_URL/api/analyze/8k/batch?limit=5' -o /dev/null" \
    "200"

# Test 10: Invalid UUID format (should fail with 422)
run_test "Invalid UUID validation" \
    "curl -s -w 'HTTP_STATUS:%{http_code}' $BASE_URL/api/victims/not-a-uuid -o /dev/null" \
    "422"

# Test 11: OpenAPI docs
run_test "OpenAPI docs endpoint" \
    "curl -s -w 'HTTP_STATUS:%{http_code}' $BASE_URL/openapi.json -o /dev/null" \
    "200"

echo ""
echo "========================================"
echo "Test Summary"
echo "========================================"
echo "Total tests: $((PASSED + FAILED))"
echo -e "${GREEN}Passed: $PASSED${NC}"
if [ $FAILED -gt 0 ]; then
    echo -e "${RED}Failed: $FAILED${NC}"
else
    echo -e "${GREEN}Failed: $FAILED${NC}"
fi
echo "========================================"

# Exit with error if any tests failed
if [ $FAILED -gt 0 ]; then
    exit 1
fi

exit 0
