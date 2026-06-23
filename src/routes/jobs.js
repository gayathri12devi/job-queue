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
        res.status(201).json(newJob);
    } catch(err) {
        console.error("Database save error",err);
        res.status(500).json({error:"Internal Server Error", message:"Failed to save record"});
    }
});
// router.get("/:id",(req,res)=>{});
// router.get("/",(req,res)=>{})

module.exports = router;