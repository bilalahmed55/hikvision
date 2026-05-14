#!/bin/bash

echo "=========================================="
echo "Hikvision Middleware Service"
echo "=========================================="
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo "⚠️  .env file not found!"
    echo "Creating .env from .env.middleware..."
    cp .env.middleware .env
    echo "✅ .env file created"
    echo ""
    echo "Please edit .env with your configuration:"
    echo "  - DEVICE_IP"
    echo "  - DEVICE_USER"
    echo "  - DEVICE_PASS"
    echo "  - LARAVEL_URL"
    echo ""
    exit 1
fi

# Check if node_modules exists
if [ ! -d node_modules ]; then
    echo "📦 Installing dependencies..."
    npm install axios dotenv xml2js
    echo "✅ Dependencies installed"
    echo ""
fi

# Start the middleware
echo "🚀 Starting middleware service..."
echo ""
node middleware.js
