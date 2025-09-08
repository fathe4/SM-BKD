#!/bin/bash

# tests/run-feed-tests.sh
# Script to run feed-specific tests with different configurations

echo "🧪 Starting Feed Posts Test Suite..."
echo "=================================="

# Check if Jest is available
if ! command -v npx &> /dev/null; then
    echo "❌ npx not found. Please install Node.js and npm."
    exit 1
fi

# Run feed tests only
echo "📊 Running Feed Tests..."
npx jest tests/feed.test.ts --verbose

echo ""
echo "📊 Running Feed Tests with Coverage..."
npx jest tests/feed.test.ts --coverage --coverageReporters=text

echo ""
echo "🔍 Running Feed Tests in Watch Mode (for development)..."
echo "Press 'q' to quit watch mode"
npx jest tests/feed.test.ts --watch --verbose

echo ""
echo "✅ Feed tests completed!"
echo "📁 Check coverage report in: ./coverage/lcov-report/index.html"
