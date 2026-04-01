#!/usr/bin/env node

const baseUrl = process.env.VESTO_V2_BASE_URL || 'http://localhost:3000'
const sourcePath = process.argv[2]

async function run() {
  const response = await fetch(`${baseUrl}/api/migrations/vesto-v1/import`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(sourcePath ? { sourcePath } : {}),
  })

  if (!response.ok) {
    const text = await response.text()
    console.error(`Import failed (${response.status}): ${text}`)
    process.exit(1)
  }

  const payload = await response.json()
  console.log(JSON.stringify(payload, null, 2))
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
