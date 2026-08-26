export default defineEventHandler(() => {
  const db = useDb()
  const tables = db
    .prepare<[], { name: string }>("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all()
    .map((r) => r.name)
  return { ok: true, dataDir: dataDir(), tables }
})
