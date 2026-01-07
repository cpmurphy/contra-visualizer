#! /bin/bash
# Simple HTTP server for local development
# Serves the application on http://localhost:8000

cd "$(dirname "$0")"

# Try Python 3 first, then Python 2, then suggest alternatives
if command -v python3 &> /dev/null; then
    echo "Starting server on http://localhost:8000"
    echo "Press Ctrl+C to stop"
    python3 -m http.server 8000
elif command -v python &> /dev/null; then
    echo "Starting server on http://localhost:8000"
    echo "Press Ctrl+C to stop"
    python -m SimpleHTTPServer 8000
else
    echo "Python not found. Please install Python or use another HTTP server."
    echo ""
    echo "Alternative options:"
    echo "  - Node.js: npx http-server -p 8000"
    echo "  - PHP: php -S localhost:8000"
    echo "  - Ruby: ruby -run -e httpd . -p 8000"
    exit 1
fi



