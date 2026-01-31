#!/bin/bash

# DocuHaven Deployment Script

echo "🚀 Starting Deployment Check..."

# --- 1. Ensure Node.js & NPM are available ---
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

if ! command -v npm &> /dev/null; then
    echo "⚠️  npm not found. Attempting to install Node.js via NVM..."
    
    # Install NVM
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
    
    # Load NVM
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
    
    # Install Node LTS
    echo "📦 Installing Node.js LTS..."
    nvm install --lts
    nvm use --lts
    
    if ! command -v npm &> /dev/null; then
        echo "❌ Critical: Failed to install Node.js/npm. Please install manually."
        exit 1
    fi
    echo "✅ Node.js installed."
fi

# --- 1.2 Ensure Swap Space (Critical for small VPS compiling sqlite3) ---
if [ "$EUID" -eq 0 ]; then 
    TOTAL_MEM=$(grep MemTotal /proc/meminfo | awk '{print $2}')
    SWAP_TOTAL=$(grep SwapTotal /proc/meminfo | awk '{print $2}')
    
    # If memory is < 2GB and no swap, create 1GB swap
    if [ $TOTAL_MEM -lt 2000000 ] && [ $SWAP_TOTAL -eq 0 ]; then
        echo "⚠️  Low memory detected. Creating 1GB swap file to prevent build crashes..."
        fallocate -l 1G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=1024
        chmod 600 /swapfile
        mkswap /swapfile
        swapon /swapfile
        echo '/swapfile none swap sw 0 0' >> /etc/fstab
        echo "✅ Swap created."
    fi
fi

# --- 1.5 Ensure Build Tools (for native modules like sqlite3) ---
if ! command -v make &> /dev/null; then
    echo "⚠️  'make' command not found. Installing build tools..."
    if [ -f /etc/debian_version ]; then
        # Debian/Ubuntu
        apt-get update && apt-get install -y build-essential python3
    elif [ -f /etc/redhat-release ]; then
        # RHEL/CentOS
        yum groupinstall -y 'Development Tools'
    elif [ -f /etc/alpine-release ]; then
        # Alpine
        apk add --no-cache make gcc g++ python3
    else
        echo "❌ build tools missing and unknown OS. Please install 'make' and 'g++' manually."
        exit 1
    fi
    echo "✅ Build tools installed."
fi

# --- 2. Ensure PM2 is installed ---
if ! command -v pm2 &> /dev/null; then
    echo "⚠️  PM2 not found. Installing global PM2..."
    npm install -g pm2 || { echo "❌ Failed to install PM2"; exit 1; }
    echo "✅ PM2 installed."
fi

echo "🚀 Deployment Prerequisites OK. Proceeding..."

# --- 3. Update Code ---
echo "📥 Pulling latest code..."
git pull origin main

# --- 4. Install Project Dependencies ---
echo "📦 Installing project dependencies..."
npm install || { echo "❌ npm install failed"; exit 1; }

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
