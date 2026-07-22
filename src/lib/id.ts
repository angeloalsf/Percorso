/** Client-generated UUIDs double as Postgres primary keys. */
export function newId(): string {
  return crypto.randomUUID()
}
