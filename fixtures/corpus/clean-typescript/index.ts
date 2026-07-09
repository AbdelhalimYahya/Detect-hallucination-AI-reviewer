import { Request, Response, Router } from 'express';

interface User {
  id: number;
  name: string;
  email: string;
}

const router = Router();

router.get('/users/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const url = new URL(req.url, `http://${req.headers.host}`);
  const users = await queryDatabase('SELECT * FROM users WHERE id = $1', [id]);

  if (users.length === 0) {
    return res.status(404).json({ error: 'User not found' });
  }

  res.json(users[0]);
});

router.post('/users', async (req: Request, res: Response) => {
  const { name, email } = req.body;
  const result = await queryDatabase(
    'INSERT INTO users (name, email) VALUES ($1, $2) RETURNING *',
    [name, email],
  );

  res.status(201).json(result[0]);
});

async function queryDatabase(query: string, params: unknown[]): Promise<User[]> {
  return [];
}

export { router };
