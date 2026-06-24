const prisma = require('../db/client');

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
    const sleep = (ms)=> new Promise(resolve => setTimeout(resolve,ms));
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
    }
}