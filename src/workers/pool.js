const {Worker} = require('node:worker_threads');
const path = require('node:path');
const os = require('node:os');

const DEFAULT_POOL_SIZE = os.availableParallelism ? os.availableParallelism() : os.cpus().length;
const MAX_WORKERS = parseInt(process.env.PROCESS_MAX_WORKERS,10) || DEFAULT_POOL_SIZE;

function startWorker() {
    const worker = new Worker(path.join(__dirname, 'workers.js'));
    worker.on('error', (err)=>console.error(`Worker error: ${err.message}`));
    worker.on('exit', (code) => {
        if (code != 0) {
            console.error(`Worker stopped with exit code ${code}, restarting`);
            startWorker();
        }
    })
}

function startPool() {
    console.log(`Starting ${MAX_WORKERS} workers.`);
    for(let i=0; i<MAX_WORKERS; i++) {
        startWorker();
    }
}

startPool();