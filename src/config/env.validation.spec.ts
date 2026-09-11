import { NodeEnv, validateEnv } from './env.validation';

describe('validateEnv', () => {
  const valid = {
    DATABASE_URL: 'postgresql://user:pass@db.example.com:5432/app?schema=public',
    EXTERNAL_API_KEY: 'k'.repeat(32),
    TELEGRAM_BOT_TOKEN: `123456789:${'A'.repeat(35)}`,
    TELEGRAM_ADMIN_CHAT_ID: '-1002286861249',
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

  it('should parse the admin chat id as a negative number', () => {
    expect(validateEnv(valid).TELEGRAM_ADMIN_CHAT_ID).toBe(-1002286861249);
  });

  it('should reject a malformed bot token', () => {
    expect(() => validateEnv({ ...valid, TELEGRAM_BOT_TOKEN: 'not-a-token' })).toThrow(
      /TELEGRAM_BOT_TOKEN/,
    );
  });

  it('should reject a short EXTERNAL_API_KEY', () => {
    expect(() => validateEnv({ ...valid, EXTERNAL_API_KEY: 'short' })).toThrow(/EXTERNAL_API_KEY/);
  });
});
