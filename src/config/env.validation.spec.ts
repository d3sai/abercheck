import { NodeEnv, validateEnv } from './env.validation';

describe('validateEnv', () => {
  const databaseUrl = 'postgresql://user:pass@db.example.com:5432/app?schema=public';

  it('should apply defaults and convert PORT to a number', () => {
    const env = validateEnv({ DATABASE_URL: databaseUrl, PORT: '8080' });

    expect(env).toMatchObject({ NODE_ENV: NodeEnv.Development, PORT: 8080 });
  });

  it('should fail fast when DATABASE_URL is missing', () => {
    expect(() => validateEnv({})).toThrow(/DATABASE_URL/);
  });

  it('should reject a non-PostgreSQL connection string', () => {
    expect(() => validateEnv({ DATABASE_URL: 'mysql://localhost/app' })).toThrow(/DATABASE_URL/);
  });
});
