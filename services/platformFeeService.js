const promisedb = require("../db");
const db = promisedb.promise();


function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}


function parseDate(dateString) {
    const [year, month, day] = dateString
        .split("-")
        .map(Number);

    return new Date(year, month - 1, day);
}


function getToday() {
    const now = new Date();

    return new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate()
    );
}


/**
 * Calculate billing period
 *
 * Monthly:
 *  Aug 10 -> Sep 9
 *
 * Weekly:
 *  Sep 10 -> Sep 16
 *
 * Daily:
 *  Sep 17 -> Sep 17
 */
function getBillingPeriod(startDate, type) {

    const periodStart = new Date(startDate);
    const periodEnd = new Date(startDate);


    switch (type) {

        case "Monthly":

            periodEnd.setMonth(
                periodEnd.getMonth() + 1
            );

            periodEnd.setDate(
                periodEnd.getDate() - 1
            );

            break;


        case "Weekly":

            periodEnd.setDate(
                periodEnd.getDate() + 6
            );

            break;


        case "Daily":

            // Same day
            break;


        default:

            throw new Error(
                `Invalid platform fee type: ${type}`
            );
    }


    return {
        periodStart,
        periodEnd
    };
}


/**
 * Create platform fee record
 */
async function createPlatformFee(
    shop,
    periodStart,
    periodEnd,
    type,
    amount
) {

    const start = formatDate(periodStart);
    const end = formatDate(periodEnd);


    /*
     * 0 MMK = paid/free
     * Otherwise = unpaid
     */
    const status =
        Number(amount) === 0
            ? "paid"
            : "unpaid";


    const sql = `
        INSERT INTO platform_fee_records
        (
            shop_id,
            period_start,
            period_end,
            type,
            amount,
            status
        )
        VALUES (?, ?, ?, ?, ?, ?)

        ON DUPLICATE KEY UPDATE
            id = id
    `;


    const values = [
        shop.id,
        start,
        end,
        type,
        amount,
        status
    ];


    const [result] = await db.query(
        sql,
        values
    );

    return;
}


/**
 * Generate platform fees for one shop
 */
async function generateFeeForShop(shop) {

    const today = getToday();


    /*
     * Get the latest platform fee record
     */
    const [records] = await db.query(`
        SELECT
            id,
            period_start,
            period_end,
            type,
            amount
        FROM platform_fee_records
        WHERE shop_id = ?
        ORDER BY period_end DESC
        LIMIT 1
    `, [
        shop.id
    ]);


    let nextStart;


    /*
     * ============================================
     * NO RECORD YET
     * ============================================
     *
     * First record starts from shop.created_at
     *
     * ALWAYS:
     *
     * Monthly / 0
     */
    if (records.length === 0) {

        nextStart = new Date(
            shop.created_at
        );


        /*
         * Remove time
         */
        nextStart = new Date(
            nextStart.getFullYear(),
            nextStart.getMonth(),
            nextStart.getDate()
        );


        /*
         * First period is ALWAYS
         *
         * Monthly / 0
         */
        const {
            periodStart,
            periodEnd
        } = getBillingPeriod(
            nextStart,
            "Monthly"
        );


        /*
         * If shop has not started yet,
         * don't create anything.
         */
        if (periodStart > today) {
            return;
        }


        /*
         * If first period is current period,
         * create Monthly / 0.
         */
        await createPlatformFee(
            shop,
            periodStart,
            periodEnd,
            "Monthly",
            0
        );


        return;
    }


    /*
     * ============================================
     * EXISTING RECORD
     * ============================================
     */

    const latest = records[0];


    const latestEnd = parseDate(
        latest.period_end
    );


    /*
     * Next period starts one day
     * after the previous period ends.
     */
    nextStart = new Date(
        latestEnd
    );

    nextStart.setDate(
        nextStart.getDate() + 1
    );


    /*
     * ============================================
     * GENERATE MISSING PERIODS
     * ============================================
     *
     * We continue generating until
     * the next period contains today.
     */
    while (true) {

        /*
         * IMPORTANT:
         *
         * Use CURRENT shop settings.
         *
         * If the previous record was:
         *
         * Monthly / 0
         *
         * and admin changed the shop to:
         *
         * Weekly / 15000
         *
         * then this NEXT record uses:
         *
         * Weekly / 15000
         *
         * We do NOT care when the change happened.
         */
        const type =
            shop.platform_fees_method;

        const amount =
            Number(shop.platform_fees || 0);


        const {
            periodStart,
            periodEnd
        } = getBillingPeriod(
            nextStart,
            type
        );


        /*
         * Don't create a future period.
         */
        if (periodStart > today) {
            break;
        }


        /*
         * Create the period.
         */
        await createPlatformFee(
            shop,
            periodStart,
            periodEnd,
            type,
            amount
        );


        /*
         * If this period includes today,
         * stop.
         *
         * Example:
         *
         * Today = Aug 22
         *
         * Aug 10 -> Sep 9
         *
         * We don't create Sep 10 -> Sep 16 yet.
         */
        if (periodEnd >= today) {
            break;
        }


        /*
         * Move to next period.
         *
         * Next start =
         * current period end + 1 day
         */
        nextStart = new Date(
            periodEnd
        );

        nextStart.setDate(
            nextStart.getDate() + 1
        );
    }
}


/**
 * Generate platform fees for all shops
 */
async function generatePlatformFees() {
    const [shops] = await db.query(`
        SELECT
            id,
            shop_name,
            created_at,
            platform_fees_method,
            platform_fees
        FROM shops
        WHERE permission = 'approved'
    `);


    for (const shop of shops) {

        try {

            await generateFeeForShop(shop);

        } catch (error) {

            console.error(
                `[PLATFORM FEE] Failed for shop ${shop.id}:`,
                error
            );
        }
    }
}


module.exports = {
    generatePlatformFees
};