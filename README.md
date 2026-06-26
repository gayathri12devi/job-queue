# Job Queue System

A distributed background job processing system built with Node.js, PostgreSQL, and worker_threads. It is designed to execute slow, long-running, or unreliable tasks (such as report generation, compression, and password hashing) without blocking the API. The project demonstrates asynchronous background job processing—a common architectural pattern used in scalable backend systems, including email platforms, payment processing services, and CI/CD pipelines.

---

## Why This Exists

When a user triggers a slow task (sending emails, generating reports, processing files), blocking the API until it finishes is not an option. This system decouples task submission from task execution:

- API responds in **milliseconds** with a job ID
- Workers process tasks **concurrently in the background**
- Clients poll for status whenever they want

---

## Architecture

```
              POST /jobs
                    │
                    ▼
              Express API
                    │
                    ▼
             PostgreSQL Queue
          (pending / running)
                    │
         LISTEN / NOTIFY
                    │
                    ▼
          Worker Pool (threads)
          │      │       │
          ▼      ▼       ▼
       Worker  Worker  Worker
          │
          ▼
     Execute Handler
          │
          ▼
 Update Job Status
```

---

## Key Technical Decisions

### 1. `SELECT FOR UPDATE SKIP LOCKED` — Atomic Job Claiming

The core concurrency problem: multiple workers polling the same `pending` jobs table simultaneously will claim the same job (race condition), processing it multiple times.

**Naive approach (broken):**
```sql
SELECT * FROM "Job" WHERE status = 'pending' LIMIT 1;
-- Worker 1 and Worker 2 both read the same row before either updates it
```

**Solution:**
```sql
SELECT * FROM "Job"
WHERE status = 'pending'
AND "nextRunAt" <= NOW()
ORDER BY "nextRunAt" ASC, "createdAt" ASC
LIMIT 1
FOR UPDATE SKIP LOCKED;
```

- `FOR UPDATE` locks the selected row within the transaction
- `SKIP LOCKED` makes other workers skip locked rows instead of waiting
- Wrapped in a transaction so lock + status update happen atomically

Result: N workers process N different jobs simultaneously with zero conflicts.

### 2. PostgreSQL `LISTEN/NOTIFY` — Push Instead of Poll

**Polling approach (wasteful):**
```js
while (true) {
  const job = await claimJob()
  if (!job) await sleep(1000) // hitting DB every second regardless
}
```

**LISTEN/NOTIFY approach:**
```js
await client.query('LISTEN new_job')        // worker subscribes once
// ... idle, zero DB load ...
// POST /jobs triggers:
await notifyClient.query('NOTIFY new_job')  // API wakes workers instantly
```

Workers consume zero DB resources when idle. Jobs are picked up in milliseconds instead of up to 1 second.

**Note:** Neon's default connection pooler doesn't support persistent connections required by `LISTEN`. A direct (non-pooled) connection URL is used specifically for the pub/sub channel, while the pooled URL handles regular queries.

### 3. Exponential Backoff on Retry

Failed jobs aren't retried immediately — they wait progressively longer between attempts:

```
Attempt 1 fails → wait 1s  → retry
Attempt 2 fails → wait 2s  → retry
Attempt 3 fails → wait 4s  → permanent failure
```

Formula: `delay = 2^(attempts - 1) seconds`

Implemented via a `nextRunAt` column. Workers only claim jobs where `nextRunAt <= NOW()`, preventing hammering of a temporarily failing service.

### 4. Worker Pool with `worker_threads`

Node.js is single-threaded — CPU-bound work blocks the event loop. `worker_threads` spawns true OS threads, one per CPU core:

```js
const MAX_WORKERS = os.availableParallelism()
for (let i = 0; i < MAX_WORKERS; i++) startWorker()
```

Each worker runs an independent event loop with its own DB connection. Crashed workers are automatically restarted by the pool.

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/jobs` | Submit a new job |
| GET | `/jobs/:id` | Get job status and result |
| GET | `/jobs` | List recent jobs (newest first, limit 50) |
| GET | `/jobs/metrics` | Queue analytics |

### Submit a Job
```bash
curl -X POST http://localhost:8000/jobs \
  -H "Content-Type: application/json" \
  -d '{"type": "generate_report", "payload": {"userId": "123"}}'

# Response
{"id": "811a6879-ef20-4502-9eef-cb8e227436c8", "status": "pending"}
```

### Check Status
```bash
curl http://localhost:8000/jobs/811a6879-ef20-4502-9eef-cb8e227436c8

# Response
{
  "id": "811a6879-ef20-4502-9eef-cb8e227436c8",
  "status": "done",
  "type": "generate_report",
  "payload":{"userId":"123"},
  "result": {"file": "report_123.txt"},
  "error": null,
}
```

### Metrics
```bash
curl http://localhost:8000/jobs/metrics

#Response
{
    "counts":{"done":7},
    "throughput":{"last_60_min":5},
    "avg_processing_time_ms":"177.57",
    "avg_wait_time_ms":"0.00"
}
```

---

## Supported Job Types

| Type | Payload | What it does |
|------|---------|--------------|
| `generate_report` | `{ userId }` | Writes a `.txt` report to disk |
| `compress_text` | `{ text }` | Compresses using gzip, returns size ratio |
| `hash_password` | `{ password }` | PBKDF2-SHA512 hash via Node crypto |

---

## Setup

### Prerequisites
- Node.js 18+
- PostgreSQL database (Neon recommended)

### Installation

```bash
git clone https://github.com/gayathri12devi/job-queue
cd job-queue
npm install
```

### Environment Variables

Create a `.env` file:
```env
DATABASE_URL="your-neon-pooled-url"
DATABASE_DIRECT_URL="your-neon-direct-url"
PORT=8000
PROCESS_MAX_WORKERS=4
```

> **Note:** Both URLs are required. `DATABASE_URL` (pooled) is used for regular queries via Prisma. `DATABASE_DIRECT_URL` (direct, no `-pooler`) is used for `LISTEN/NOTIFY`.

### Database Setup

```bash
npx prisma generate
npx prisma migrate dev
```

### Running

```bash
# Terminal 1 — API server
node src/server.js

# Terminal 2 — Worker pool
node src/workers/pool.js
```

---

## Job Lifecycle

```
pending → running → done
                 ↘ pending (retry with backoff, if attempts < maxRetries)
                 ↘ failed  (permanent, if attempts >= maxRetries)
```

---

## Stack

- **Runtime:** Node.js
- **API:** Express
- **ORM:** Prisma 7
- **Database:** PostgreSQL (Neon)
- **Concurrency:** `worker_threads`, `LISTEN/NOTIFY`
- **Driver:** `@prisma/adapter-pg`, `pg`