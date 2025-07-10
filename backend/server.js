const { Hono } = require("hono");
const { serve } = require("@hono/node-server");
const { cors } = require("hono/cors");
const { v4: uuidv4 } = require("uuid");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  UpdateCommand,
  ScanCommand,
  DeleteCommand,
} = require("@aws-sdk/lib-dynamodb");
const { exec } = require("child_process");
const { Client } = require("pg");
const { promisify } = require("util");

const execAsync = promisify(exec);

const app = new Hono();
const port = 3001;

// Configuration
const CLUSTER_IDENTIFIER = "XXXXXXXX";
const REGION = "ap-northeast-1";
const DYNAMODB_TABLE = "aurora-dsql-game-users";
const ATTACK_LOGS_TABLE = "aurora-dsql-game-attack-logs";

// DynamoDB setup
const dynamoClient = new DynamoDBClient({ region: REGION });
const docClient = DynamoDBDocumentClient.from(dynamoClient);

// CORS middleware
app.use("*", cors());

// 攻撃ログを記録する関数
async function recordAttackLog(
  logId,
  userId,
  userName,
  success,
  attackStartTime
) {
  try {
    const logEntry = {
      logId: logId,
      userId: userId,
      userName: userName,
      success: success,
      timestamp: attackStartTime.getTime(), // APIリクエスト受信時刻のタイムスタンプ
      createdAt: attackStartTime.toISOString(), // ISO形式の日時文字列
    };

    console.log("Recording attack log:", logEntry);

    await docClient.send(
      new PutCommand({
        TableName: ATTACK_LOGS_TABLE,
        Item: logEntry,
      })
    );

    console.log(
      `Attack log recorded successfully: ${userName} (${userId}) - ${
        success ? "SUCCESS" : "FAILED"
      } at ${attackStartTime.toISOString()}`
    );
  } catch (error) {
    console.error("Error recording attack log:", error);
    // ログ記録エラーは攻撃処理には影響させない
    throw error; // エラーを再スローして呼び出し元で処理
  }
}

// ゲーム開始時に攻撃ログテーブルをクリアする関数
async function clearAttackLogs() {
  try {
    console.log("Clearing attack logs table...");

    // 既存のログをすべて取得
    const scanResult = await docClient.send(
      new ScanCommand({
        TableName: ATTACK_LOGS_TABLE,
      })
    );

    if (scanResult.Items && scanResult.Items.length > 0) {
      console.log(`Found ${scanResult.Items.length} existing logs to delete`);

      // 各ログを削除
      for (const item of scanResult.Items) {
        await docClient.send(
          new DeleteCommand({
            TableName: ATTACK_LOGS_TABLE,
            Key: {
              logId: item.logId,
            },
          })
        );
      }

      console.log(`Deleted ${scanResult.Items.length} attack logs`);
    } else {
      console.log("No existing attack logs to delete");
    }
  } catch (error) {
    console.error("Error clearing attack logs:", error);
    // ログクリアエラーはゲーム開始には影響させない
  }
}

// Aurora DSQL connection helper with token caching
let cachedToken = null;
let tokenExpiry = null;

async function generateAuthToken() {
  try {
    // Check if we have a valid cached token (tokens are valid for 15 minutes, we'll refresh after 10 minutes)
    if (cachedToken && tokenExpiry && Date.now() < tokenExpiry) {
      return cachedToken;
    }

    console.log("Generating new auth token...");
    const command = `aws dsql generate-db-connect-admin-auth-token --hostname ${CLUSTER_IDENTIFIER}.dsql.${REGION}.on.aws --region ${REGION}`;
    const { stdout } = await execAsync(command);

    cachedToken = stdout.trim().replace(/"/g, "");
    tokenExpiry = Date.now() + 10 * 60 * 1000; // Cache for 10 minutes

    console.log("Auth token generated and cached");
    return cachedToken;
  } catch (error) {
    console.error("Error generating auth token:", error);
    // Clear cache on error
    cachedToken = null;
    tokenExpiry = null;
    throw error;
  }
}

async function getDSQLConnection() {
  const authToken = await generateAuthToken();
  const client = new Client({
    host: `${CLUSTER_IDENTIFIER}.dsql.${REGION}.on.aws`,
    port: 5432,
    database: "postgres",
    user: "admin",
    password: authToken,
    ssl: {
      rejectUnauthorized: false,
    },
  });
  await client.connect();
  return client;
}

// API Routes

// ユーザー登録
app.post("/api/register", async (c) => {
  try {
    const { userName } = await c.req.json();

    if (!userName || userName.length < 1 || userName.length > 30) {
      return c.json({ error: "ユーザー名は1〜30文字で入力してください" }, 400);
    }

    const userId = uuidv4();

    // DynamoDBにユーザーを保存
    await docClient.send(
      new PutCommand({
        TableName: DYNAMODB_TABLE,
        Item: {
          userId,
          userName,
          timeRemaining: 1, // 初期持ち時間は1秒
        },
      })
    );

    return c.json({ userId, userName });
  } catch (error) {
    console.error("Error registering user:", error);
    return c.json({ error: "ユーザー登録に失敗しました" }, 500);
  }
});

// ゲーム状態取得 - 最適化版
app.get("/api/game-status", async (c) => {
  let dsqlClient;
  try {
    dsqlClient = await getDSQLConnection();

    // 単一クエリでゲーム状態と勝者情報を同時取得
    const result = await dsqlClient.query(`
      SELECT 
        gs.is_started,
        gs.start_time,
        gs.end_time,
        w.user_id as winner_user_id,
        w.user_name as winner_user_name
      FROM game_state gs
      CROSS JOIN winner w
      WHERE gs.id = 1 AND w.id = 1
    `);

    const row = result.rows[0];

    let remainingTime = 0;
    let isGameActive = row.is_started;
    let hasEnded = false;
    let needsUpdate = false;

    // ゲーム状態の判定
    if (row.end_time) {
      remainingTime = Math.max(
        0,
        Math.floor((row.end_time - Date.now()) / 1000)
      );

      if (Date.now() >= row.end_time && row.is_started) {
        // 時間切れの場合
        hasEnded = true;
        isGameActive = false;
        remainingTime = 0;
        needsUpdate = true;
      } else if (Date.now() >= row.end_time && !row.is_started) {
        // 既に終了している場合
        hasEnded = true;
        remainingTime = 0;
      }
    } else if (!row.is_started) {
      hasEnded = false;
      remainingTime = 0;
    }

    // 必要な場合のみDBを更新
    if (needsUpdate) {
      await dsqlClient.query(
        "UPDATE game_state SET is_started = FALSE WHERE id = 1"
      );
      console.log("Game automatically ended due to time expiration");
    }

    // 状態の明確化
    let gameWaiting = false;
    if (!row.is_started && !hasEnded && !row.end_time) {
      gameWaiting = true;
    }

    return c.json({
      isStarted: isGameActive,
      remainingTime,
      hasEnded: hasEnded,
      gameWaiting: gameWaiting,
      winner:
        row.winner_user_name && row.winner_user_id
          ? {
              userId: row.winner_user_id,
              userName: row.winner_user_name,
            }
          : {
              userId: null,
              userName: "なし",
            },
    });
  } catch (error) {
    console.error("Error getting game status:", error);
    // エラー時はゲーム終了状態として返す
    return c.json({
      isStarted: false,
      remainingTime: 0,
      hasEnded: true,
      gameWaiting: false,
      error: true,
      winner: {
        userId: null,
        userName: "なし",
      },
    });
  } finally {
    if (dsqlClient) {
      await dsqlClient.end();
    }
  }
});

// ゲーム開始 - 最適化版
app.post("/api/start-game", async (c) => {
  let dsqlClient;
  try {
    const { duration } = await c.req.json(); // 分単位

    if (!duration || duration < 1 || duration > 5) {
      return c.json({ error: "ゲーム時間は1〜5分で設定してください" }, 400);
    }

    const startTime = Date.now();
    const endTime = startTime + duration * 60 * 1000;

    dsqlClient = await getDSQLConnection();

    // 単一トランザクションでゲーム状態と勝者を更新
    await dsqlClient.query("BEGIN");
    await dsqlClient.query(
      "UPDATE game_state SET is_started = TRUE, start_time = $1, end_time = $2 WHERE id = 1",
      [startTime, endTime]
    );
    await dsqlClient.query(
      "UPDATE winner SET user_id = NULL, user_name = NULL WHERE id = 1"
    );
    await dsqlClient.query("COMMIT");

    // 攻撃ログテーブルをクリア（並行処理）
    const clearLogsPromise = clearAttackLogs();

    // 全ユーザーの持ち時間を1秒にリセット（並行処理で高速化）
    const users = await docClient.send(
      new ScanCommand({
        TableName: DYNAMODB_TABLE,
      })
    );

    // バッチ処理で高速化
    const updatePromises = users.Items.map((user) =>
      docClient.send(
        new UpdateCommand({
          TableName: DYNAMODB_TABLE,
          Key: { userId: user.userId, userName: user.userName },
          UpdateExpression: "SET timeRemaining = :time",
          ExpressionAttributeValues: { ":time": 1 },
        })
      )
    );

    // 並行処理の完了を待つ
    await Promise.all([...updatePromises, clearLogsPromise]);

    console.log("Game started successfully, attack logs cleared");
    return c.json({ success: true, endTime });
  } catch (error) {
    console.error("Error starting game:", error);
    if (dsqlClient) {
      try {
        await dsqlClient.query("ROLLBACK");
      } catch (rollbackError) {
        console.error("Rollback error:", rollbackError);
      }
    }
    return c.json({ error: "ゲーム開始に失敗しました" }, 500);
  } finally {
    if (dsqlClient) {
      await dsqlClient.end();
    }
  }
});

// ゲーム中断 - 最適化版
app.post("/api/stop-game", async (c) => {
  let dsqlClient;
  try {
    dsqlClient = await getDSQLConnection();

    // 単一トランザクションで両方のテーブルを更新
    await dsqlClient.query("BEGIN");
    await dsqlClient.query(
      "UPDATE game_state SET is_started = FALSE, start_time = NULL, end_time = NULL WHERE id = 1"
    );
    await dsqlClient.query(
      "UPDATE winner SET user_id = NULL, user_name = NULL WHERE id = 1"
    );
    await dsqlClient.query("COMMIT");

    return c.json({ success: true });
  } catch (error) {
    console.error("Error stopping game:", error);
    if (dsqlClient) {
      try {
        await dsqlClient.query("ROLLBACK");
      } catch (rollbackError) {
        console.error("Rollback error:", rollbackError);
      }
    }
    return c.json({ error: "ゲーム中断に失敗しました" }, 500);
  } finally {
    if (dsqlClient) {
      await dsqlClient.end();
    }
  }
});

// ゲームリセット - 最適化版
app.post("/api/reset-game", async (c) => {
  let dsqlClient;
  try {
    dsqlClient = await getDSQLConnection();

    // 単一トランザクションで両方のテーブルを更新
    await dsqlClient.query("BEGIN");
    await dsqlClient.query(
      "UPDATE game_state SET is_started = FALSE, start_time = NULL, end_time = NULL WHERE id = 1"
    );
    await dsqlClient.query(
      "UPDATE winner SET user_id = NULL, user_name = NULL WHERE id = 1"
    );
    await dsqlClient.query("COMMIT");

    return c.json({ success: true });
  } catch (error) {
    console.error("Error resetting game:", error);
    if (dsqlClient) {
      try {
        await dsqlClient.query("ROLLBACK");
      } catch (rollbackError) {
        console.error("Rollback error:", rollbackError);
      }
    }
    return c.json({ error: "ゲームリセットに失敗しました" }, 500);
  } finally {
    if (dsqlClient) {
      await dsqlClient.end();
    }
  }
});

// 攻撃処理
app.post("/api/attack", async (c) => {
  const attackStartTime = new Date(); // APIリクエストを受けたタイミングを記録
  const logId = `${Date.now()}-${uuidv4()}`;

  try {
    const { userId } = await c.req.json();

    if (!userId) {
      return c.json(
        {
          success: false,
          message: "攻撃失敗…",
          error: "ユーザーIDが必要です",
        },
        400
      );
    }

    // ユーザー情報を取得
    const userResult = await docClient.send(
      new ScanCommand({
        TableName: DYNAMODB_TABLE,
        FilterExpression: "userId = :userId",
        ExpressionAttributeValues: { ":userId": userId },
      })
    );

    if (!userResult.Items || userResult.Items.length === 0) {
      return c.json(
        {
          success: false,
          message: "攻撃失敗…",
          error: "ユーザーが見つかりません",
        },
        404
      );
    }

    const user = userResult.Items[0];
    const waitTime = user.timeRemaining * 1000; // ミリ秒に変換

    let commitSuccess = false;
    let dsqlClient;

    try {
      dsqlClient = await getDSQLConnection();

      // ゲーム状態を確認（トランザクション外で事前チェック）
      const gameStateResult = await dsqlClient.query(
        "SELECT * FROM game_state WHERE id = 1"
      );
      const gameState = gameStateResult.rows[0];

      if (!gameState.is_started || Date.now() > gameState.end_time) {
        // ゲーム終了による攻撃失敗をログに記録
        try {
          await recordAttackLog(
            logId,
            user.userId,
            user.userName,
            false,
            attackStartTime
          );
        } catch (logError) {
          console.error(
            "Failed to log attack failure (game not started/ended):",
            logError
          );
        }

        return c.json({
          success: false,
          message: "攻撃失敗…",
          userName: user.userName,
          userId: user.userId,
        });
      }

      // === トランザクション開始 ===
      console.log(
        `Starting transaction for user ${user.userName} (${user.userId})`
      );
      await dsqlClient.query("BEGIN");

      try {
        // 勝者テーブルを即座に更新（ロック取得と更新を同時に実行）
        console.log("Updating winner table immediately");
        await dsqlClient.query(
          "UPDATE winner SET user_id = $1, user_name = $2 WHERE id = 1",
          [user.userId, user.userName]
        );

        // 持ち時間分待機（トランザクション内）
        console.log(
          `Waiting for ${waitTime}ms within transaction after update`
        );
        await new Promise((resolve) => setTimeout(resolve, waitTime));

        // ゲーム終了時間を確認（トランザクション内で最新状態を確認）
        console.log("Checking game state within transaction");
        const gameStateCheck = await dsqlClient.query(
          "SELECT * FROM game_state WHERE id = 1"
        );
        const currentGameState = gameStateCheck.rows[0];

        if (Date.now() > currentGameState.end_time) {
          console.log("Game time expired during transaction, rolling back");
          await dsqlClient.query("ROLLBACK");

          // 時間切れによる攻撃失敗をログに記録
          try {
            await recordAttackLog(
              logId,
              user.userId,
              user.userName,
              false,
              attackStartTime
            );
          } catch (logError) {
            console.error(
              "Failed to log attack failure (time expired):",
              logError
            );
          }

          return c.json({
            success: false,
            message: "攻撃失敗…",
            userName: user.userName,
            userId: user.userId,
          });
        }

        // コミット
        console.log("Committing transaction");
        await dsqlClient.query("COMMIT");
        commitSuccess = true;
        console.log(
          `Transaction committed successfully for user ${user.userName}`
        );
      } catch (transactionError) {
        // トランザクション内でエラーが発生した場合はロールバック
        console.error(
          "Error within transaction, rolling back:",
          transactionError
        );
        try {
          await dsqlClient.query("ROLLBACK");
          console.log("Transaction rolled back successfully");
        } catch (rollbackError) {
          console.error("Rollback error:", rollbackError);
        }
        commitSuccess = false;
      }
      // === トランザクション終了 ===
    } catch (error) {
      console.error("Error in attack processing:", error);
      commitSuccess = false;
    } finally {
      if (dsqlClient) {
        await dsqlClient.end();
      }
    }

    // 攻撃結果をログに記録（成功・失敗問わず）
    try {
      await recordAttackLog(
        logId,
        user.userId,
        user.userName,
        commitSuccess,
        attackStartTime
      );
    } catch (logError) {
      console.error("Failed to log attack result:", logError);
      // ログ記録の失敗は攻撃結果には影響しない
    }

    // DynamoDBの持ち時間を更新
    try {
      if (commitSuccess) {
        // 成功時：持ち時間を1秒増やす（最大5秒）
        const newTime = Math.min(user.timeRemaining + 1, 5);
        await docClient.send(
          new UpdateCommand({
            TableName: DYNAMODB_TABLE,
            Key: { userId: user.userId, userName: user.userName },
            UpdateExpression: "SET timeRemaining = :time",
            ExpressionAttributeValues: { ":time": newTime },
          })
        );
      } else {
        // 失敗時：持ち時間を1秒に戻す
        await docClient.send(
          new UpdateCommand({
            TableName: DYNAMODB_TABLE,
            Key: { userId: user.userId, userName: user.userName },
            UpdateExpression: "SET timeRemaining = :time",
            ExpressionAttributeValues: { ":time": 1 },
          })
        );
      }
    } catch (dynamoError) {
      console.error("DynamoDB update error:", dynamoError);
      // DynamoDBエラーは攻撃結果には影響しないが、ログに記録
    }

    return c.json({
      success: commitSuccess,
      userName: user.userName, // ユーザー名をレスポンスに追加
      userId: user.userId, // ユーザーIDもレスポンスに追加
      message: commitSuccess ? "攻撃成功！" : "攻撃失敗…",
    });
  } catch (error) {
    console.error("Error in attack:", error);

    // エラー発生時も攻撃失敗としてログに記録
    if (c.req.json && c.req.json().userId) {
      try {
        const body = await c.req.json();
        // ユーザー情報を取得してログに記録
        const userResult = await docClient.send(
          new ScanCommand({
            TableName: DYNAMODB_TABLE,
            FilterExpression: "userId = :userId",
            ExpressionAttributeValues: { ":userId": body.userId },
          })
        );

        if (userResult.Items && userResult.Items.length > 0) {
          const user = userResult.Items[0];
          await recordAttackLog(
            logId,
            user.userId,
            user.userName,
            false,
            attackStartTime
          );
        }
      } catch (logError) {
        console.error("Failed to log attack error:", logError);
      }
    }

    // すべてのエラーケースで「攻撃失敗…」メッセージを返す
    return c.json(
      {
        success: false,
        message: "攻撃失敗…",
        error: "システムエラーが発生しました",
      },
      500
    );
  }
});

// Start server
serve(
  {
    fetch: app.fetch,
    port: port,
  },
  (info) => {
    console.log(`Hono backend server running on port ${info.port}`);
  }
);
