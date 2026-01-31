#!/bin/bash

# DocuHaven Deployment Script

echo "🚀 Starting Deployment..."

# 1. Pull latest changes
echo "📥 Pulling latest code..."
git pull origin main

# 2. Install dependencies
echo "📦 Installing dependencies..."
npm install

# 3. Check for database migrations (if any in future)
# npm run migrate 

# 4. Restart Application using PM2
if command -v pm2 &> /dev/null
then
    echo "🔄 Restarting application..."
    pm2 restart ecosystem.config.js --env production || pm2 start ecosystem.config.js --env production
    pm2 save
else
    echo "⚠️  PM2 not found. Installing global PM2..."
    npm install -g pm2
    echo "🔄 Starting application..."
    pm2 start ecosystem.config.js --env production
    pm2 save
fi

echo "✅ Deployment Complete! Server running."
pm2 status
