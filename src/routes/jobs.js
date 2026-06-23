const express = require('express');
const router = express.Router()
const prisma = require('../db/client');

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
        res.status(201).json({id:newJob.id,status:newJob.status});
    } catch(err) {
        console.error("Database save error",err);
        res.status(500).json({error:"Internal Server Error", message:"Failed to save record"});
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

module.exports = router;