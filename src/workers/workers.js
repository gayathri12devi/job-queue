const prisma = require('../db/client');
const { Client } = require('pg');
require('dotenv').config();
const handlers = {
    generate_report: require('./handlers/generate_report'),
    compress_text: require('./handlers/compress_text'),
    hash_password: require('./handlers/hash_password')
}

async function claimJob() {
    const processedJob = await prisma.$transaction(async(tx)=>{
        const jobRaw = await tx.$queryRaw`
        SELECT * FROM "Job"
        WHERE status = 'pending'
        AND "nextRunAt" <= NOW()
        ORDER BY "nextRunAt" ASC,"createdAt" ASC LIMIT 1
        FOR UPDATE SKIP LOCKED
        `;
        if(jobRaw.length == 0) return null;
        const job = jobRaw[0];
        const updatedJob = await tx.job.update({
            where: {
                id: job.id
            },
            data: {
                status: 'running',
                startedAt: new Date(),
                attempts: {increment:1}
            }
        });
        return updatedJob;
    });
    return processedJob;
}

async function markDone(jobId, result) {
    const updateJob = await prisma.job.update({
        where: { id: jobId },
        data: {
            status: 'done',
            result: result,
            finishedAt: new Date()
        }
    });
}

async function markFailed(jobId, error) {
    const updateJob = await prisma.job.update({
        where: { id: jobId },
        data: {
            status: 'failed',
            error: error,
            finishedAt: new Date()
        }
    });
}

async function workerLoop() {
    const client = new Client({connectionString: process.env.DATABASE_DIRECT_URL});
    await client.connect();
    setInterval(async () => {
        await client.query('SELECT 1')
    }, 4 * 60 * 1000)
    client.on('error', async (err) => {
        console.error('PG client error:', err.message)
        try {
            await client.connect()
            await client.query('LISTEN new_job')
        } catch (e) {
            console.error('Reconnect failed:', e.message)
            setTimeout(async () => {
                await client.connect()
                await client.query('LISTEN new_job')
            }, 5000)
        }
    })
    let job = await claimJob();
    while(job) {
        console.log(`Processing existing job ${job.id} of type ${job.type}`);
        try {
            const handler = handlers[job.type]
            if(!handler) throw new Error(`Unkown job type: ${job.type}`);
            const result = await handler(job.payload);
            await markDone(job.id,result);
        } catch(err) {
            if(job.attempts<job.maxRetries) {
                const delaySec = Math.pow(2,job.attempts - 1);
                await prisma.job.update({
                    where: {id:job.id},
                    data: {
                        status: 'pending',
                        startedAt: null,
                        finishedAt: null,
                        nextRunAt: new Date(Date.now() + delaySec*1000)
                    }
                })
            } else {
                await markFailed(job.id,err.message);
            }
        }
        job = await claimJob();
    }
    console.log('Existing jobs drained, listening for new jobs');
    await client.query('LISTEN new_job');
    client.on('notification',async ()=>{
        const job = await claimJob();
        if(!job) return;
        console.log(`Processing job ${job.id} of type ${job.type}`);
        try {
            const handler = handlers[job.type]
            if(!handler) throw new Error(`Unkown job type: ${job.type}`);
            const result = await handler(job.payload);
            await markDone(job.id,result);
        } catch(err) {
            const delaySec = Math.pow(2,job.attempts - 1);
            if(job.attempts<job.maxRetries) {
                await prisma.job.update({
                    where: {id:job.id},
                    data: {
                        status: 'pending',
                        startedAt: null,
                        finishedAt: null,
                        nextRunAt: new Date(Date.now() + delaySec*1000)
                    }
                })
            } else {
                await markFailed(job.id,err.message);
            }
        }
    });
    /*const sleep = (ms)=> new Promise(resolve => setTimeout(resolve,ms));
    while(true) {
        const job = await claimJob();
        if(!job) {
            await sleep(1000)
            continue
        }
        console.log(`Processing job ${job.id} of type ${job.type}`);
        try {
            await markDone(job.id,{success: true});
        } catch(err) {
            await markFailed(job.id,err.message);
        }
    }*/
}
workerLoop().catch(console.error)