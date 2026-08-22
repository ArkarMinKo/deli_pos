const cron = require("node-cron");

const {
    generatePlatformFees
} = require("../services/platformFeeService");

const {
    generateCommissionRecords
} = require("../services/commissionService");


async function runFinanceJobs() {

    try {

        await generatePlatformFees();

        await generateCommissionRecords();

    } catch (error) {

        console.error(
            "[FINANCE] Finance jobs failed:",
            error
        );
    }
}


function startFinanceJobs() {

    runFinanceJobs();

    cron.schedule(
        "5 0 * * *",
        async () => {

            await runFinanceJobs();

        },
        {
            timezone: "Asia/Yangon"
        }
    );
}


module.exports = {
    startFinanceJobs
};