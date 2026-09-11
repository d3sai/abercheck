import { NodeEnv, validateEnv } from './env.validation';

describe('validateEnv', () => {
  const valid = {
    DATABASE_URL: 'postgresql://user:pass@db.example.com:5432/app?schema=public',
    EXTERNAL_API_KEY: 'k'.repeat(32),
  };

  it('should apply defaults and convert PORT to a number', () => {
    const env = validateEnv({ ...valid, PORT: '8080' });

    expect(env).toMatchObject({ NODE_ENV: NodeEnv.Development, PORT: 8080 });
  });

  it('should fail fast when DATABASE_URL is missing', () => {
    expect(() => validateEnv({ EXTERNAL_API_KEY: valid.EXTERNAL_API_KEY })).toThrow(/DATABASE_URL/);
  });

  it('should reject a non-PostgreSQL connection string', () => {
    expect(() => validateEnv({ ...valid, DATABASE_URL: 'mysql://localhost/app' })).toThrow(
      /DATABASE_URL/,
    );
  });

  it('should reject a short EXTERNAL_API_KEY', () => {
    expect(() => validateEnv({ ...valid, EXTERNAL_API_KEY: 'short' })).toThrow(/EXTERNAL_API_KEY/);
  });
});
