const prisma = require('../db/client');
const { Client } = require('pg');
require('dotenv').config();

async function claimJob() {
    const processedJob = await prisma.$transaction(async(tx)=>{
        const jobRaw = await tx.$queryRaw`
        SELECT * FROM "Job"
        WHERE status = 'pending'
        ORDER BY "createdAt" ASC LIMIT 1
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
    let job = await claimJob();
    while(job) {
        console.log(`Processing existing job ${job.id} of type ${job.type}`);
        try {
            await markDone(job.id,{success:true});
        } catch(err) {
            await markFailed(job.id,err.message);
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
            await markDone(job.id,{success:true});
        } catch(err) {
            await markFailed(job.id,err.message);
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