const express = require('express');
const router = express.Router()
const prisma = require('../db/client');
const {Client} = require('pg');
require('dotenv').config();
const notifyClient = new Client({connectionString: process.env.DATABASE_DIRECT_URL});
notifyClient.connect().then(()=>console.log('Notify client connected'));

router.post("/",async (req,res)=>{
    const {type,payload} = req.body;
    if(!type) {
        return res.status(400).json({error:"type is required"});
    }
    try{
        const newJob = await prisma.job.create({
            data:{
                type:type,
                payload:payload || {}
            }
        });
        await notifyClient.query('NOTIFY new_job');
        res.status(201).json({id:newJob.id,status:newJob.status});
    } catch(err) {
        console.error("Database save error",err);
        res.status(500).json({error:"Internal Server Error", message:"Failed to save record"});
    }
});
router.get("/",async (req,res)=>{
    try{
        const allJobs = await prisma.job.findMany({orderBy: {createdAt:'desc'},take:50});
        if(allJobs.length === 0) {
            return res.status(404).json({error:"Jobs not found"});
        }
        res.status(200).json(allJobs);
    } catch(err) {
        console.error("Failed to fetch",err);
        res.status(500).json({error:"Internal Server Error"});
    }
});
router.get("/metrics", async (req, res) => {
    try {
        const counts = await prisma.job.groupBy({
            by: ['status'],
            _count: { id: true }
        });
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        const throughput = await prisma.job.count({
            where: {
                status: 'done',
                finishedAt: { gte: oneHourAgo }
            }
        });
        const processingTime = await prisma.$queryRaw`
    SELECT AVG(EXTRACT(EPOCH FROM("finishedAt"-"startedAt"))*1000)
    AS avg_ms FROM "Job"
    WHERE status = 'done'
    AND "startedAt" IS NOT NULL
    AND "finishedAt" IS NOT NULL
    `;
        const waitTime = await prisma.$queryRaw`
    SELECT AVG(EXTRACT(EPOCH FROM("startedAt"-"createdAt"))*1000)
    AS avg_ms FROM "Job"
    WHERE status = 'done'
    AND "startedAt" IS NOT NULL
    `;
        const countsMap = {}
        counts.forEach(c => {
            countsMap[c.status] = c._count.id
        });
        res.status(200).json({
            counts: countsMap,
            throughput: { last_60_min: throughput },
            avg_processing_time_ms: Number(processingTime[0]?.avg_ms || 0).toFixed(2),
            avg_wait_time_ms: Number(waitTime?.avg_ms || 0).toFixed(2)
        })
    } catch (err) {
        console.log('Metrics error', err);
        res.status(500).json({ error: 'Internal Server Error' })
    }
});
router.get("/:id",async (req,res)=>{
    const jobId = req.params.id;
    try {
        const job = await prisma.job.findUnique({
            where: {
                id: jobId
            }
        });
        if(!job) {
            return res.status(404).json({error:"Job not found"});
        }
        res.status(200).json({id:job.id,status:job.status,type:job.type,payload:job.payload,result:job.result,error:job.error});
    } catch(err) {
        console.error("Failed to fetch",err);
        res.status(500).json({error:"Internal Server Error"})
    }
});

module.exports = router;