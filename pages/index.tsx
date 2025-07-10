import { useState, useEffect } from 'react';
import Head from 'next/head';

interface GameStatus {
  isStarted: boolean;
  remainingTime: number;
  hasEnded?: boolean;
  gameWaiting?: boolean; // ゲーム開始待ち状態
  error?: boolean; // エラー状態
  winner: {
    userId: string;
    userName: string;
  } | null;
}

interface User {
  userId: string;
  userName: string;
}

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [userName, setUserName] = useState('');
  const [gameStatus, setGameStatus] = useState<GameStatus>({
    isStarted: false,
    remainingTime: 0,
    hasEnded: false,
    gameWaiting: true,
    winner: null
  });
  const [attackResult, setAttackResult] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // セッションストレージからユーザー情報を取得
    const storedUser = sessionStorage.getItem('user');
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
  }, []);

  const fetchGameStatus = async () => {
    try {
      const response = await fetch('/api/game-status');
      const data = await response.json();
      setGameStatus(data);
    } catch (error) {
      console.error('Error fetching game status:', error);
      // エラー時はゲーム終了状態として扱う
      setGameStatus({
        isStarted: false,
        remainingTime: 0,
        hasEnded: true,
        gameWaiting: false,
        error: true,
        winner: { userId: '', userName: 'なし' }
      });
    }
  };

  useEffect(() => {
    if (user) {
      fetchGameStatus();
      
      // 1秒間隔で状態を更新
      const interval = setInterval(fetchGameStatus, 1000);
      return () => clearInterval(interval);
    }
  }, [user]);

  const registerUser = async () => {
    if (!userName || userName.length < 1 || userName.length > 30) {
      alert('名前は1〜30文字で入力してください');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userName }),
      });
      
      if (response.ok) {
        const userData = await response.json();
        setUser(userData);
        sessionStorage.setItem('user', JSON.stringify(userData));
      } else {
        const error = await response.json();
        alert(error.error);
      }
    } catch (error) {
      console.error('Error registering user:', error);
      alert('ユーザー登録に失敗しました');
    }
    setLoading(false);
  };

  const attack = async () => {
    if (!user || loading) return; // loading中は実行しない

    setLoading(true);
    setAttackResult('攻撃中...');
    
    try {
      const response = await fetch('/api/attack', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId: user.userId }),
      });
      
      if (response.ok) {
        // 成功レスポンスの場合
        const result = await response.json();
        setAttackResult(result.message || (result.success ? '攻撃成功！' : '攻撃失敗...'));
      } else {
        // HTTPエラーレスポンスの場合
        try {
          const errorResult = await response.json();
          setAttackResult(errorResult.error || `攻撃失敗 (${response.status})`);
        } catch (jsonError) {
          // JSONパースエラーの場合
          setAttackResult(`攻撃失敗 (${response.status}: ${response.statusText})`);
        }
      }
      
      // 結果を3秒後にクリア
      setTimeout(() => setAttackResult(''), 3000);
      
    } catch (error) {
      console.error('Error attacking:', error);
      setAttackResult('攻撃エラー: ネットワークまたはサーバーエラー');
      setTimeout(() => setAttackResult(''), 3000);
    } finally {
      // 必ずローディング状態をリセット
      setLoading(false);
    }
  };

  if (!user) {
    return (
      <div style={{ 
        padding: '20px', 
        fontFamily: 'Arial, sans-serif',
        maxWidth: '400px',
        margin: '0 auto',
        textAlign: 'center'
      }}>
        <Head>
          <title>Aurora DSQL ゲーム</title>
          <meta name="viewport" content="width=device-width, initial-scale=1" />
        </Head>
        
        <h1 style={{ fontSize: '24px', marginBottom: '30px' }}>
          Aurora DSQL ゲーム
        </h1>
        
        <div style={{ marginBottom: '20px' }}>
          <input
            type="text"
            placeholder="名前を入力（1〜30文字）"
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !loading) {
                registerUser();
              }
            }}
            maxLength={30}
            autoFocus
            style={{
              width: '100%',
              padding: '12px',
              fontSize: '16px',
              border: '2px solid #ddd',
              borderRadius: '4px',
              marginBottom: '10px'
            }}
          />
          <button 
            onClick={registerUser} 
            disabled={loading}
            style={{
              width: '100%',
              padding: '12px',
              fontSize: '16px',
              backgroundColor: '#4CAF50',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: loading ? 'not-allowed' : 'pointer'
            }}
          >
            {loading ? '登録中...' : '登録する'}
          </button>
        </div>
        
        <div style={{ fontSize: '14px', color: '#666', textAlign: 'left' }}>
          <h3>ゲームルール:</h3>
          <ul style={{ paddingLeft: '20px' }}>
            <li>名前を登録してゲームに参加</li>
            <li>「攻撃！」ボタンで攻撃</li>
            <li>攻撃成功で持ち時間+1秒（最大5秒）</li>
            <li>攻撃失敗で持ち時間1秒に戻る</li>
            <li>ゲーム終了時に最後の勝者が優勝</li>
          </ul>
        </div>
      </div>
    );
  }

  return (
    <div style={{ 
      padding: '20px', 
      fontFamily: 'Arial, sans-serif',
      maxWidth: '400px',
      margin: '0 auto',
      textAlign: 'center'
    }}>
      <Head>
        <title>Aurora DSQL ゲーム</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      
      <h1 style={{ fontSize: '24px', marginBottom: '20px' }}>
        Aurora DSQL ゲーム
      </h1>
      
      <div style={{ 
        marginBottom: '20px', 
        padding: '15px', 
        backgroundColor: '#f0f0f0', 
        borderRadius: '4px' 
      }}>
        <div style={{ fontSize: '14px', color: '#666' }}>プレイヤー</div>
        <div style={{ fontSize: '18px', fontWeight: 'bold' }}>{user.userName}</div>
      </div>
      
      <div style={{ marginBottom: '20px' }}>
        <div style={{ 
          fontSize: '32px', 
          fontWeight: 'bold', 
          color: gameStatus.remainingTime > 0 ? '#FF6B6B' : '#666',
          marginBottom: '10px'
        }}>
          {gameStatus.remainingTime > 0 ? `${gameStatus.remainingTime}秒` : 'ゲーム待機中'}
        </div>
        <div style={{ fontSize: '14px', color: '#666' }}>残り時間</div>
      </div>
      
      <div style={{ marginBottom: '20px' }}>
        <div style={{ fontSize: '16px', marginBottom: '5px' }}>
          現在の勝者: {gameStatus.winner && gameStatus.winner.userName !== 'なし' ? 
            `${gameStatus.winner.userName}` : 
            'まだ勝者はいません'
          }
        </div>
        {gameStatus.winner && gameStatus.winner.userName !== 'なし' && (
          <div style={{ fontSize: '12px', color: '#666' }}>
            ({gameStatus.winner.userId})
          </div>
        )}
      </div>
      
      <div style={{ marginBottom: '20px' }}>
        <button 
          onClick={attack} 
          disabled={loading || !gameStatus.isStarted || gameStatus.remainingTime <= 0}
          style={{
            width: '100%',
            padding: '20px',
            fontSize: '24px',
            fontWeight: 'bold',
            backgroundColor: gameStatus.isStarted && gameStatus.remainingTime > 0 ? '#FF6B6B' : '#ccc',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: (gameStatus.isStarted && gameStatus.remainingTime > 0 && !loading) ? 'pointer' : 'not-allowed'
          }}
        >
          {loading ? '攻撃中...' : '攻撃！'}
        </button>
      </div>
      
      {attackResult && (
        <div style={{ 
          padding: '10px', 
          backgroundColor: attackResult.includes('成功') ? '#d4edda' : '#f8d7da',
          color: attackResult.includes('成功') ? '#155724' : '#721c24',
          borderRadius: '4px',
          marginBottom: '20px',
          fontSize: '16px',
          fontWeight: 'bold'
        }}>
          {attackResult}
        </div>
      )}
      
      {/* ゲーム終了時の表示 */}
      {gameStatus.hasEnded && (
        <div style={{ 
          padding: '20px', 
          backgroundColor: gameStatus.error ? '#f8d7da' : '#d4edda', 
          color: gameStatus.error ? '#721c24' : '#155724',
          borderRadius: '8px',
          fontSize: '16px',
          marginBottom: '20px',
          border: gameStatus.error ? '2px solid #f5c6cb' : '2px solid #c3e6cb'
        }}>
          <h2 style={{ margin: '0 0 15px 0', fontSize: '20px' }}>
            {gameStatus.error ? '⚠️ システムエラー' : '🎉 ゲーム終了！'}
          </h2>
          <div style={{ marginBottom: '10px' }}>
            <strong>残り時間: 0秒</strong>
          </div>
          <div style={{ marginBottom: '15px' }}>
            <strong>最終的な勝者: </strong>
            {gameStatus.winner && gameStatus.winner.userName !== 'なし' ? 
              `${gameStatus.winner.userName} (${gameStatus.winner.userId})` : 
              'なし'
            }
          </div>
          {gameStatus.error && (
            <div style={{ marginBottom: '15px', fontSize: '14px' }}>
              システムエラーが発生しました。管理者にお問い合わせください。
            </div>
          )}
        </div>
      )}
      
      {/* ゲーム開始待ち */}
      {gameStatus.gameWaiting && !gameStatus.hasEnded && (
        <div style={{ 
          padding: '15px', 
          backgroundColor: '#fff3cd', 
          color: '#856404',
          borderRadius: '4px',
          fontSize: '14px'
        }}>
          ゲーム開始を待っています...
        </div>
      )}
    </div>
  );
}
