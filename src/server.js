const express = require('express')
const app = express();
const port = process.env.PORT || 8000;
const jobsRouter = require('./routes/jobs');

app.use(express.json())
app.use('/jobs',jobsRouter);

app.listen(port,()=>{
    console.log(`Listening to the port ${port}`)
});