#!/bin/bash
# Simple test runner for unit tests
# Requires Node.js 20+ (which includes built-in test runner)
#
# Usage:
#   ./test.sh          # Run tests directly with node

cd "$(dirname "$0")"

if ! command -v node &> /dev/null; then
    echo "Error: Node.js is not installed or not in PATH"
    echo "Please install Node.js 20 or later to run tests"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
    echo "Error: Node.js 20 or later is required (found version $NODE_VERSION)"
    echo "The built-in test runner is available in Node.js 18+."
    echo "Node.js 20+ has better support for ES modules."
    exit 1
fi

echo "Running unit tests..."
echo ""

node --test tests/*.js
