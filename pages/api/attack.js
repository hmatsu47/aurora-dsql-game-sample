import fetch from 'node-fetch';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { userId } = req.body;

  try {
    // バックエンドに攻撃リクエストを送信
    const response = await fetch('http://localhost:3001/api/attack', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(req.body),
    });
    
    const data = await response.json();
    res.status(response.status).json(data);
    
  } catch (error) {
    console.error('Backend connection error:', error);
    res.status(500).json({ error: 'Backend connection failed' });
  }
}
