#!/bin/bash

echo "=== Aurora DSQL Game Full Reset (Development Mode) ==="
echo "$(date): Starting full game reset..."

cd /home/ec2-user/aurora-dsql-game

# 1. プロセス停止
echo "Stopping game processes..."
pkill -f "node.*aurora-dsql-game" 2>/dev/null
pkill -f "next.*dev" 2>/dev/null
sleep 3

# 2. データベースリセット
echo "Resetting database..."
node reset-game.js

# 3. ログファイルクリア
echo "Clearing log files..."
> backend.log
> frontend.log

# 4. プロセス再起動（開発モード）
echo "Starting backend server (development)..."
nohup npm run backend > backend.log 2>&1 &
sleep 3

echo "Starting frontend server (development)..."
nohup npm run dev > frontend.log 2>&1 &
sleep 5

# バックエンドが起動しない場合の対処
if ! curl -s http://localhost:3001/api/game-status > /dev/null; then
    echo "Backend not responding, starting directly..."
    nohup node backend/server.js > backend.log 2>&1 &
    sleep 3
fi

# 5. 動作確認
echo "Checking services..."
if curl -s http://localhost:3001/api/game-status > /dev/null; then
    echo "✓ Backend API is responding"
else
    echo "✗ Backend API is not responding"
fi

if curl -s http://localhost:3000/ > /dev/null; then
    echo "✓ Frontend is accessible (dev mode on port 3000)"
else
    echo "✗ Frontend is not accessible"
fi

echo "=== Reset completed (Development Mode) ==="
echo "Game status:"
curl -s http://localhost:3001/api/game-status | jq .

echo ""
echo "Next steps:"
echo "1. Clear your browser cache (Ctrl+F5 or Cmd+Shift+R)"
echo "2. Go to http://your-server:3000/admin to start a new game"
echo "3. Players can access http://your-server:3000/ to join"
echo ""
echo "Note: Running in development mode with hot reload"
