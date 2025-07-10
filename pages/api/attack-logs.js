const AWS = require('aws-sdk');

const dynamodb = new AWS.DynamoDB.DocumentClient({
  region: process.env.AWS_REGION || 'ap-northeast-1'
});

const ATTACK_LOG_TABLE = 'aurora-dsql-game-attack-logs';

// ログを記録する関数
async function logAttack(userId, userName, success, customTimestamp = null) {
  const timestamp = customTimestamp || Date.now(); // カスタムタイムスタンプまたは現在時刻
  const logId = `${timestamp}-${userId}-${Math.random().toString(36).substr(2, 9)}`; // 重複を避けるためランダム文字列を追加
  
  const params = {
    TableName: ATTACK_LOG_TABLE,
    Item: {
      logId,
      timestamp,
      userId,
      userName,
      success,
      createdAt: new Date(timestamp).toISOString() // タイムスタンプをISO文字列に変換
    }
  };
  
  try {
    await dynamodb.put(params).promise();
    console.log(`Attack log recorded: ${logId}`);
  } catch (error) {
    console.error('Error logging attack:', error);
    throw error; // エラーを再スローして呼び出し元で処理
  }
}

// ログをクリアする関数
async function clearLogs() {
  try {
    // 全てのログを取得
    const scanParams = {
      TableName: ATTACK_LOG_TABLE
    };
    
    const result = await dynamodb.scan(scanParams).promise();
    
    // データがない場合は何もしない
    if (!result.Items || result.Items.length === 0) {
      console.log('No logs to clear');
      return { cleared: 0, message: 'No logs found to clear' };
    }
    
    // バッチで削除
    const deleteRequests = result.Items.map(item => ({
      DeleteRequest: {
        Key: {
          logId: item.logId
        }
      }
    }));
    
    let clearedCount = 0;
    
    // 25個ずつバッチ削除（DynamoDBの制限）
    for (let i = 0; i < deleteRequests.length; i += 25) {
      const batch = deleteRequests.slice(i, i + 25);
      const batchParams = {
        RequestItems: {
          [ATTACK_LOG_TABLE]: batch
        }
      };
      
      await dynamodb.batchWrite(batchParams).promise();
      clearedCount += batch.length;
    }
    
    return { cleared: clearedCount, message: `${clearedCount} logs cleared successfully` };
  } catch (error) {
    console.error('Error clearing logs:', error);
    return { cleared: 0, message: 'Failed to clear logs', error: error.message };
  }
}

// 最新のログを取得する関数
async function getRecentLogs(limit = 10) {
  try {
    const params = {
      TableName: ATTACK_LOG_TABLE,
      Limit: limit
    };
    
    const result = await dynamodb.scan(params).promise();
    
    // データがない場合でもエラーを投げずに空配列を返す
    if (!result.Items || result.Items.length === 0) {
      console.log('No attack logs found in database');
      return [];
    }
    
    // timestampで降順ソート
    const sortedLogs = result.Items.sort((a, b) => b.timestamp - a.timestamp);
    
    return sortedLogs.slice(0, limit);
  } catch (error) {
    console.error('Error getting recent logs:', error);
    // DynamoDBエラーの場合でも空配列を返してエラーを投げない
    return [];
  }
}

export default async function handler(req, res) {
  try {
    if (req.method === 'POST') {
      // ログを記録
      const { userId, userName, success } = req.body;
      
      if (!userId || !userName || success === undefined) {
        return res.status(400).json({ error: 'Missing required fields' });
      }
      
      try {
        await logAttack(userId, userName, success);
        res.status(200).json({ message: 'Log recorded successfully' });
      } catch (error) {
        console.error('Error recording log:', error);
        res.status(500).json({ error: 'Failed to record log' });
      }
    } else if (req.method === 'GET') {
      // 最新のログを取得
      const logs = await getRecentLogs(10);
      // データがない場合でも正常なレスポンスを返す
      res.status(200).json({ 
        logs,
        count: logs.length,
        message: logs.length === 0 ? 'No attack logs found' : 'Attack logs retrieved successfully'
      });
    } else if (req.method === 'DELETE') {
      // ログをクリア
      const result = await clearLogs();
      res.status(200).json(result);
    } else {
      res.setHeader('Allow', ['GET', 'POST', 'DELETE']);
      res.status(405).end(`Method ${req.method} Not Allowed`);
    }
  } catch (error) {
    console.error('Unexpected error in attack-logs API:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// 他のファイルから使用するためにエクスポート
export { logAttack, clearLogs, getRecentLogs };
