const cron = require("node-cron");

const {
    generatePlatformFees
} = require("../services/platformFeeService");

const {
    generateCommissionRecords
} = require("../services/commissionService");

function startFinanceJobs() {

    /**
     * Run every day at 00:05
     *
     * Myanmar timezone
     */
    cron.schedule(
        "5 0 * * *",
        async () => {
            try {
                await generatePlatformFees();
                await generateCommissionRecords();
            } catch (error) {
                console.error(
                    "[CRON] Platform fee job failed:",
                    error
                );
            }
        },
        {
            timezone: "Asia/Yangon"
        }
    );
}

module.exports = {
    startFinanceJobs
};