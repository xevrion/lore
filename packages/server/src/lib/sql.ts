function bindable(value: unknown) {
  if (value instanceof Date) return value.toISOString()
  if (value === undefined) return null
  return value
}

export const sql = (db: D1Database) => {
  return (strings: TemplateStringsArray, ...values: unknown[]) =>
    db.prepare(strings.join("?")).bind(...values.map(bindable))
}
