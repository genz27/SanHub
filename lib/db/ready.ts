let initializeDatabase: (() => Promise<void>) | undefined;

export async function ensureDatabase(): Promise<void> {
  if (!initializeDatabase) {
    const schema = await import('./schema');
    initializeDatabase = schema.initializeDatabase;
  }
  await initializeDatabase();
}