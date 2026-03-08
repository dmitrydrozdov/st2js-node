#!/usr/bin/env bash
# generate-parser.sh
# Generates ANTLR4 parser files from grammar/ST.g4
# Requires: Java 11+ and ANTLR4 tool jar
#
# Usage:
#   bash scripts/generate-parser.sh [path/to/antlr4.jar]
#
# If ANTLR4_JAR env var is set, it will be used.
# Downloads ANTLR4 jar if not found and curl/wget is available.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
GRAMMAR="$ROOT_DIR/grammar/ST.g4"
OUTPUT_DIR="$ROOT_DIR/src/generated"
ANTLR_VERSION="4.13.1"
ANTLR_JAR="${ANTLR4_JAR:-$ROOT_DIR/.antlr4/antlr-${ANTLR_VERSION}-complete.jar}"

echo "ANTLR4 Parser Generator for st2js"
echo "=================================="

# Check Java
if ! command -v java &>/dev/null; then
  echo "ERROR: Java not found. Install Java 11+ to use ANTLR4 parser generation."
  echo "The built-in hand-written parser will be used instead."
  exit 0
fi

echo "Java: $(java -version 2>&1 | head -1)"

# Check/download ANTLR4 jar
if [ ! -f "$ANTLR_JAR" ]; then
  echo "ANTLR4 jar not found at: $ANTLR_JAR"

  if command -v curl &>/dev/null || command -v wget &>/dev/null; then
    mkdir -p "$(dirname "$ANTLR_JAR")"
    URL="https://www.antlr.org/download/antlr-${ANTLR_VERSION}-complete.jar"
    echo "Downloading ANTLR4 $ANTLR_VERSION from $URL..."

    if command -v curl &>/dev/null; then
      curl -L -o "$ANTLR_JAR" "$URL"
    else
      wget -O "$ANTLR_JAR" "$URL"
    fi
  else
    echo "ERROR: curl/wget not available. Please download ANTLR4 jar manually:"
    echo "  https://www.antlr.org/download/antlr-${ANTLR_VERSION}-complete.jar"
    echo "  Place it at: $ANTLR_JAR or set ANTLR4_JAR env var"
    exit 0
  fi
fi

# Generate parser
mkdir -p "$OUTPUT_DIR"
echo "Generating parser from $GRAMMAR..."
echo "Output directory: $OUTPUT_DIR"

java -jar "$ANTLR_JAR" \
  -Dlanguage=JavaScript \
  -visitor \
  -listener \
  -o "$OUTPUT_DIR" \
  "$GRAMMAR"

echo ""
echo "Parser generation complete!"
echo "Generated files:"
ls -la "$OUTPUT_DIR/"
