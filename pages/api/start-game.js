import fetch from 'node-fetch';
import { clearLogs } from './attack-logs.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // まずログをクリア（ゲーム開始前に必ず実行）
    console.log('Clearing attack logs before starting game...');
    try {
      const clearResult = await clearLogs();
      console.log('Log clear result:', clearResult);
    } catch (logError) {
      console.error('Failed to clear logs:', logError);
      // ログクリアに失敗した場合はエラーを返す
      return res.status(500).json({ 
        error: 'Failed to clear attack logs before starting game',
        details: logError.message 
      });
    }
    
    // ログクリア成功後にゲーム開始
    const response = await fetch('http://localhost:3001/api/start-game', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(req.body),
    });
    
    const data = await response.json();
    
    if (response.ok) {
      console.log('Game started successfully and logs cleared');
    }
    
    res.status(response.status).json(data);
  } catch (error) {
    console.error('Proxy error:', error);
    res.status(500).json({ error: 'Backend connection failed' });
  }
}
