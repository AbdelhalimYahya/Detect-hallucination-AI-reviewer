// Pattern 4: Simple CRUD wrapped in 3 unnecessary abstraction layers
import { Router, Request, Response } from 'express';

// --- Adapter Layer ---
interface UserRow {
  id: string;
  name: string;
  email: string;
}

class DatabaseAdapter {
  async query(sql: string, params: any[]): Promise<any[]> {
    // Imagine this calls a real database
    return [];
  }
}

// --- Repository Layer ---
class UserRepository {
  constructor(private db: DatabaseAdapter) {}

  async findById(id: string): Promise<UserRow | null> {
    const rows = await this.db.query(
      'SELECT * FROM users WHERE id = $1',
      [id]
    );
    return rows[0] || null;
  }

  async save(user: Partial<UserRow>): Promise<UserRow> {
    const rows = await this.db.query(
      'INSERT INTO users (name, email) VALUES ($1, $2) RETURNING *',
      [user.name, user.email]
    );
    return rows[0];
  }

  async deleteById(id: string): Promise<void> {
    await this.db.query('DELETE FROM users WHERE id = $1', [id]);
  }
}

// --- Service Layer ---
class UserService {
  constructor(private repo: UserRepository) {}

  async getUser(id: string) {
    return this.repo.findById(id);
  }

  async createUser(data: { name: string; email: string }) {
    return this.repo.save(data);
  }

  async removeUser(id: string) {
    return this.repo.deleteById(id);
  }
}

// --- Route Handler ---
const router = Router();
const db = new DatabaseAdapter();
const repo = new UserRepository(db);
const service = new UserService(repo);

router.get('/users/:id', async (req: Request, res: Response) => {
  const user = await service.getUser(req.params.id);
  res.json(user);
});

router.post('/users', async (req: Request, res: Response) => {
  const user = await service.createUser(req.body);
  res.json(user);
});

router.delete('/users/:id', async (req: Request, res: Response) => {
  await service.removeUser(req.params.id);
  res.status(204).send();
});

export default router;
