const fs = require('fs')

async function generate_report(payload) {
    const report = `Report for user ${payload.userId}\nGenerated at: ${new Date()}`;
    fs.writeFileSync(`./reports/report_${payload.userId}.txt`,report);
    return {file:`report_${payload.userId}.txt`};
}
module.exports = generate_report;