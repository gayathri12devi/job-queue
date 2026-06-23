const express = require('express')
const app = express();
const port = process.env.PORT || 8000;
const router = express.Router()

router.post("/",(req,res)=>{});
router.get("/:id",(req,res)=>{});
router.get("/",(req,res)=>{})


app.listen(port,()=>{
    console.log(`Listening to the port ${port}`)
});