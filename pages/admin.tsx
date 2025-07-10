import React, { useState, useEffect, useRef } from "react";
import Head from "next/head";
import { QRCodeSVG as QRCode } from "qrcode.react";

interface GameStatus {
  isStarted: boolean;
  remainingTime: number;
  hasEnded?: boolean;
  gameWaiting?: boolean;
  winner: {
    userId: string;
    userName: string;
  } | null;
}

export default function Admin() {
  const [gameStatus, setGameStatus] = useState<GameStatus>({
    isStarted: false,
    remainingTime: 0,
    hasEnded: false,
    gameWaiting: true,
    winner: null,
  });
  const [gameDuration, setGameDuration] = useState(3);
  const [loading, setLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<string>("読み込み中...");
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // ゲーム状態を取得する関数
  const fetchGameStatus = async () => {
    try {
      console.log("fetchGameStatus: Starting API call");
      const response = await fetch("/api/game-status");
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      console.log("fetchGameStatus: API response received", data);
      setGameStatus(data);
      setLastUpdate(new Date().toLocaleTimeString());
      console.log("fetchGameStatus: State updated successfully");
    } catch (error) {
      console.error("fetchGameStatus: Error occurred", error);
    }
  };

  // コンポーネントマウント時の処理
  useEffect(() => {
    console.log("Admin component mounted");

    // 即座に初回データ取得
    fetchGameStatus();

    // 1秒間隔でデータ更新
    const interval = setInterval(() => {
      fetchGameStatus();
    }, 1000);
    intervalRef.current = interval;

    // クリーンアップ
    return () => {
      console.log("Admin component unmounting");
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  // ページが表示された後にも確実にデータを取得
  useEffect(() => {
    const timer = setTimeout(() => {
      console.log("Additional fetch after mount");
      fetchGameStatus();
    }, 500);

    return () => clearTimeout(timer);
  }, []);

  // ゲーム開始
  const startGame = async () => {
    if (loading) return;
    setLoading(true);

    try {
      const response = await fetch("/api/start-game", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ duration: gameDuration }),
      });

      if (response.ok) {
        console.log("Game started successfully");
        await fetchGameStatus();
      } else {
        const error = await response.json();
        alert("ゲーム開始に失敗しました: " + error.error);
      }
    } catch (error) {
      console.error("Error starting game:", error);
      alert("ゲーム開始中にエラーが発生しました");
    }

    setLoading(false);
  };

  // ゲーム停止
  const stopGame = async () => {
    if (loading) return;
    setLoading(true);

    try {
      const response = await fetch("/api/stop-game", { method: "POST" });
      if (response.ok) {
        console.log("Game stopped successfully");
        await fetchGameStatus();
      } else {
        const error = await response.json();
        alert("ゲーム停止に失敗しました: " + error.error);
      }
    } catch (error) {
      console.error("Error stopping game:", error);
      alert("ゲーム停止中にエラーが発生しました");
    }

    setLoading(false);
  };

  // ゲームリセット
  const resetGame = async () => {
    if (loading) return;
    if (!confirm("ゲームをリセットしますか？")) return;

    setLoading(true);

    try {
      const response = await fetch("/api/reset-game", { method: "POST" });
      if (response.ok) {
        console.log("Game reset successfully");
        await fetchGameStatus();
      } else {
        const error = await response.json();
        alert("ゲームリセットに失敗しました: " + error.error);
      }
    } catch (error) {
      console.error("Error resetting game:", error);
      alert("ゲームリセット中にエラーが発生しました");
    }

    setLoading(false);
  };

  // 状態判定
  const isBeforeGame = !gameStatus.isStarted && !gameStatus.hasEnded;
  const isDuringGame = gameStatus.isStarted && !gameStatus.hasEnded;
  const isAfterGame = gameStatus.hasEnded;

  return (
    <div
      style={{
        padding: "20px",
        fontFamily: "Arial, sans-serif",
        maxWidth: "1000px",
        margin: "0 auto",
        backgroundColor: "#f5f5f5",
        minHeight: "100vh",
      }}
    >
      <Head>
        <title>Aurora DSQL ゲーム管理画面</title>
      </Head>

      <h1
        style={{
          textAlign: "center",
          color: "#2c3e50",
          marginBottom: "30px",
          fontSize: "36px",
          fontWeight: "bold",
        }}
      >
        🎮 Aurora DSQL ゲーム管理画面
      </h1>

      {/* ゲーム開始前 */}
      {isBeforeGame && (
        <div
          style={{
            backgroundColor: "#ffffff",
            padding: "25px",
            borderRadius: "10px",
            marginBottom: "25px",
            border: "2px solid #27ae60",
            boxShadow: "0 4px 8px rgba(0,0,0,0.1)",
          }}
        >
          <h2
            style={{ color: "#27ae60", marginBottom: "20px", fontSize: "24px" }}
          >
            🚀 ゲーム開始
          </h2>
          <div style={{ marginBottom: "20px" }}>
            <label
              style={{
                display: "block",
                marginBottom: "10px",
                fontWeight: "bold",
                fontSize: "18px",
                color: "#2c3e50",
              }}
            >
              ゲーム時間（分）:
            </label>
            <input
              type="number"
              min="1"
              max="10"
              value={gameDuration}
              onChange={(e) => setGameDuration(parseInt(e.target.value) || 1)}
              style={{
                padding: "12px",
                fontSize: "18px",
                border: "2px solid #bdc3c7",
                borderRadius: "6px",
                width: "120px",
              }}
            />
          </div>
          <button
            onClick={startGame}
            disabled={loading}
            style={{
              padding: "15px 30px",
              fontSize: "20px",
              fontWeight: "bold",
              backgroundColor: loading ? "#95a5a6" : "#27ae60",
              color: "white",
              border: "none",
              borderRadius: "8px",
              cursor: loading ? "not-allowed" : "pointer",
              boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
            }}
          >
            {loading ? "開始中..." : "ゲーム開始"}
          </button>
        </div>
      )}

      {/* ゲーム中 */}
      {isDuringGame && (
        <div
          style={{
            backgroundColor: "#ffffff",
            padding: "25px",
            borderRadius: "10px",
            marginBottom: "25px",
            border: "2px solid #f39c12",
            boxShadow: "0 4px 8px rgba(0,0,0,0.1)",
          }}
        >
          <h2
            style={{ color: "#f39c12", marginBottom: "20px", fontSize: "24px" }}
          >
            ⏰ ゲーム進行中
          </h2>
          <div
            style={{
              fontSize: "36px",
              fontWeight: "bold",
              marginBottom: "20px",
              color: "#e74c3c",
              textAlign: "center",
              padding: "20px",
              backgroundColor: "#fdf2e9",
              borderRadius: "10px",
              border: "2px solid #e67e22",
            }}
          >
            残り時間: {Math.max(0, gameStatus.remainingTime)}秒
          </div>
          <div
            style={{
              marginBottom: "20px",
              fontSize: "20px",
              textAlign: "center",
              padding: "15px",
              backgroundColor: "#f4f6f7",
              borderRadius: "8px",
            }}
          >
            現在の勝者:{" "}
            <strong style={{ color: "#8e44ad" }}>
              {gameStatus.winner?.userName &&
              gameStatus.winner.userName !== "なし"
                ? `${gameStatus.winner.userName}（${gameStatus.winner.userId}）`
                : "なし"}
            </strong>
          </div>
          <div style={{ textAlign: "center" }}>
            <button
              onClick={stopGame}
              disabled={loading}
              style={{
                padding: "15px 30px",
                fontSize: "20px",
                fontWeight: "bold",
                backgroundColor: loading ? "#95a5a6" : "#e74c3c",
                color: "white",
                border: "none",
                borderRadius: "8px",
                cursor: loading ? "not-allowed" : "pointer",
                boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
              }}
            >
              {loading ? "停止中..." : "ゲーム停止"}
            </button>
          </div>
        </div>
      )}

      {/* ゲーム終了後 */}
      {isAfterGame && (
        <div
          style={{
            backgroundColor: "#ffffff",
            padding: "25px",
            borderRadius: "10px",
            marginBottom: "25px",
            border: "2px solid #8e44ad",
            boxShadow: "0 4px 8px rgba(0,0,0,0.1)",
          }}
        >
          <h2
            style={{ color: "#8e44ad", marginBottom: "20px", fontSize: "24px" }}
          >
            🏆 ゲーム終了
          </h2>
          <div
            style={{
              fontSize: "36px",
              fontWeight: "bold",
              marginBottom: "20px",
              color: "#e74c3c",
              textAlign: "center",
              padding: "20px",
              backgroundColor: "#fdf2e9",
              borderRadius: "10px",
              border: "2px solid #e67e22",
            }}
          >
            残り時間: 0秒
          </div>
          <div
            style={{
              fontSize: "24px",
              marginBottom: "20px",
              textAlign: "center",
              padding: "20px",
              backgroundColor: "#f8f5ff",
              borderRadius: "10px",
              border: "2px solid #9b59b6",
            }}
          >
            最終勝者:{" "}
            <strong style={{ color: "#e74c3c", fontSize: "28px" }}>
              {gameStatus.winner?.userName &&
              gameStatus.winner.userName !== "なし"
                ? `${gameStatus.winner.userName}（${gameStatus.winner.userId}）`
                : "なし"}
            </strong>
          </div>
          <div style={{ textAlign: "center" }}>
            <button
              onClick={resetGame}
              disabled={loading}
              style={{
                padding: "15px 30px",
                fontSize: "20px",
                fontWeight: "bold",
                backgroundColor: loading ? "#95a5a6" : "#8e44ad",
                color: "white",
                border: "none",
                borderRadius: "8px",
                cursor: loading ? "not-allowed" : "pointer",
                boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
              }}
            >
              {loading ? "リセット中..." : "ゲームリセット"}
            </button>
          </div>
        </div>
      )}

      {/* QRコード表示エリア */}
      <div
        style={{
          position: "fixed",
          bottom: "135px",
          left: "50%",
          transform: "translateX(-50%)",
          backgroundColor: "white",
          padding: "20px",
          borderRadius: "15px",
          boxShadow: "0 8px 20px rgba(0,0,0,0.15)",
          border: "3px solid #3498db",
          zIndex: 1000,
        }}
      >
        <div
          style={{
            textAlign: "center",
            marginBottom: "15px",
            fontSize: "16px",
            fontWeight: "bold",
            color: "#2c3e50",
          }}
        >
          ゲームページ
        </div>
        <QRCode
          value="https://dsql.example.com"
          size={220}
          level="M"
          includeMargin={true}
          style={{
            border: "2px solid #ecf0f1",
            borderRadius: "8px",
          }}
        />
        <div
          style={{
            textAlign: "center",
            marginTop: "10px",
            fontSize: "12px",
            color: "#7f8c8d",
            wordBreak: "break-all",
          }}
        >
          https://dsql.example.com
        </div>
      </div>
    </div>
  );
}
