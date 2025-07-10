const { exec } = require('child_process');
const { Client } = require('pg');
const { promisify } = require('util');

const execAsync = promisify(exec);

const CLUSTER_IDENTIFIER = 'iiabugbtpup6akihm4ccrfpa7m';
const REGION = 'ap-northeast-1';

async function generateAuthToken() {
  try {
    const command = `aws dsql generate-db-connect-admin-auth-token --hostname ${CLUSTER_IDENTIFIER}.dsql.${REGION}.on.aws --region ${REGION}`;
    const { stdout } = await execAsync(command);
    return stdout.trim().replace(/"/g, ''); // Remove quotes from the token
  } catch (error) {
    console.error('Error generating auth token:', error);
    throw error;
  }
}

async function initializeDatabase() {
  try {
    console.log('Generating authentication token...');
    const authToken = await generateAuthToken();
    console.log('Authentication token generated successfully');
    
    const client = new Client({
      host: `${CLUSTER_IDENTIFIER}.dsql.${REGION}.on.aws`,
      port: 5432,
      database: 'postgres',
      user: 'admin',
      password: authToken,
      ssl: {
        rejectUnauthorized: false
      }
    });

    console.log('Connecting to Aurora DSQL...');
    await client.connect();
    console.log('Connected to Aurora DSQL');

    // ゲーム状態テーブルの作成
    const createGameStateTable = `
      CREATE TABLE IF NOT EXISTS game_state (
        id INTEGER PRIMARY KEY,
        is_started BOOLEAN NOT NULL DEFAULT FALSE,
        start_time BIGINT,
        end_time BIGINT
      )
    `;

    await client.query(createGameStateTable);
    console.log('Game state table created successfully');

    // 勝者テーブルの作成
    const createWinnerTable = `
      CREATE TABLE IF NOT EXISTS winner (
        id INTEGER PRIMARY KEY,
        user_id VARCHAR(255),
        user_name VARCHAR(255)
      )
    `;

    await client.query(createWinnerTable);
    console.log('Winner table created successfully');

    // 初期データの挿入
    const insertGameState = `
      INSERT INTO game_state (id, is_started, start_time, end_time) 
      VALUES (1, FALSE, NULL, NULL)
      ON CONFLICT (id) DO NOTHING
    `;

    await client.query(insertGameState);
    console.log('Initial game state inserted');

    const insertWinner = `
      INSERT INTO winner (id, user_id, user_name) 
      VALUES (1, NULL, NULL)
      ON CONFLICT (id) DO NOTHING
    `;

    await client.query(insertWinner);
    console.log('Initial winner record inserted');
    
    await client.end();
    console.log('Database initialization completed successfully!');

  } catch (error) {
    console.error('Error initializing database:', error);
    process.exit(1);
  }
}

initializeDatabase();
