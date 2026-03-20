#!/bin/bash
# Post-publish smoke test: install from npm and verify packages work.
# Usage: bash examples/install-test/test.sh [version]
# Example: bash examples/install-test/test.sh 0.1.0-alpha.1

set -e

VERSION="${1:-alpha}"
TMPDIR=$(mktemp -d)
echo "Testing in $TMPDIR"

cd "$TMPDIR"
npm init -y --silent > /dev/null

echo "Installing @claude-channel-mux/cli@$VERSION..."
npm install "@claude-channel-mux/cli@$VERSION" --silent 2>/dev/null

echo "Installing @claude-channel-mux/core@$VERSION..."
npm install "@claude-channel-mux/core@$VERSION" --silent 2>/dev/null

echo "Installing @claude-channel-mux/discord@$VERSION..."
npm install "@claude-channel-mux/discord@$VERSION" --silent 2>/dev/null

echo ""
echo "Checking imports..."
node -e "import('@claude-channel-mux/core').then(m => console.log('core exports:', Object.keys(m).length))"
node -e "import('@claude-channel-mux/discord').then(m => console.log('discord exports:', Object.keys(m).length))"

echo ""
echo "Checking CLI..."
npx channel-mux status 2>&1 || true

echo ""
echo "Checking plugin (should fail without daemon)..."
npx channel-mux-plugin 2>&1 | head -3 || true

echo ""
echo "All checks passed."
rm -rf "$TMPDIR"
