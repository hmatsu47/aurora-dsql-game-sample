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

async function initWinnerNone() {
  try {
    console.log('Generating authentication token...');
    const authToken = await generateAuthToken();
    
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

    // 勝者を「なし」に初期化
    await client.query(`
      UPDATE winner 
      SET user_id = NULL, 
          user_name = 'なし' 
      WHERE id = 1
    `);
    
    console.log('Winner initialized to "なし"');
    
    await client.end();

  } catch (error) {
    console.error('Error initializing winner:', error);
  }
}

initWinnerNone();
