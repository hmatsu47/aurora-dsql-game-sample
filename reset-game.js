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
    return stdout.trim().replace(/"/g, '');
  } catch (error) {
    console.error('Error generating auth token:', error);
    throw error;
  }
}

async function resetGame() {
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

    // ゲーム状態をリセット
    const resetGameState = `
      UPDATE game_state 
      SET is_started = FALSE, start_time = NULL, end_time = NULL 
      WHERE id = 1
    `;
    await client.query(resetGameState);
    console.log('Game state reset successfully');

    // 勝者情報をクリア
    const clearWinner = `
      UPDATE winner 
      SET user_id = NULL, user_name = NULL 
      WHERE id = 1
    `;
    await client.query(clearWinner);
    console.log('Winner information cleared successfully');
    
    await client.end();
    console.log('Game reset completed successfully!');

  } catch (error) {
    console.error('Error resetting game:', error);
    process.exit(1);
  }
}

resetGame();
