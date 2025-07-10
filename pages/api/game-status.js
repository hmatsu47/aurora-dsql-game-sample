import fetch from 'node-fetch';
import { getRecentLogs } from './attack-logs.js';

export default async function handler(req, res) {
  try {
    console.log('Fetching game-status and attack logs...');
    
    // バックエンドからゲーム状態を取得
    const response = await fetch('http://localhost:3001/api/game-status', {
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      console.error('Backend response not ok:', response.status, response.statusText);
      // エラーの場合でも攻撃ログ配列を含むレスポンスを返す
      return res.status(response.status).json({ 
        error: 'Backend error',
        isStarted: false,
        remainingTime: 0,
        hasEnded: true,
        gameWaiting: false,
        winner: { userId: null, userName: 'なし' },
        attackLogs: [],
        attackLogsCount: 0,
        lastUpdated: new Date().toISOString()
      });
    }
    
    const gameData = await response.json();
    console.log('Game status retrieved successfully');
    
    // 攻撃ログを取得（必ず配列を取得）
    let attackLogs = [];
    try {
      console.log('Fetching attack logs...');
      attackLogs = await getRecentLogs(10);
      console.log(`Attack logs retrieved: ${attackLogs.length} logs`);
    } catch (logError) {
      console.warn('Failed to fetch attack logs, using empty array:', logError);
      attackLogs = []; // 必ず空配列を設定
    }
    
    // 攻撃ログが null や undefined の場合も空配列に変換
    if (!Array.isArray(attackLogs)) {
      console.warn('Attack logs is not an array, converting to empty array');
      attackLogs = [];
    }
    
    // ゲーム状態と攻撃ログを統合したレスポンスを返す（必ず攻撃ログ配列を含む）
    const combinedData = {
      ...gameData,
      attackLogs: attackLogs, // 必ず配列
      attackLogsCount: attackLogs.length, // 必ず数値
      lastUpdated: new Date().toISOString() // 必ず文字列
    };
    
    console.log('Combined response prepared with', attackLogs.length, 'attack logs');
    console.log('Response attackLogs is array:', Array.isArray(combinedData.attackLogs));
    res.status(200).json(combinedData);
  } catch (error) {
    console.error('Game status API error:', error.message);
    // エラーの場合でも必ず攻撃ログ配列を含むレスポンスを返す
    res.status(500).json({ 
      error: 'Backend connection failed',
      details: error.message,
      isStarted: false,
      remainingTime: 0,
      hasEnded: true,
      gameWaiting: false,
      winner: { userId: null, userName: 'なし' },
      attackLogs: [], // 必ず空配列
      attackLogsCount: 0, // 必ず0
      lastUpdated: new Date().toISOString() // 必ず現在時刻
    });
  }
}
