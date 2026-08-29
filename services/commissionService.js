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
 * Billing period
 *
 * Monthly:
 * Aug 10 -> Sep 9
 *
 * Weekly:
 * Sep 10 -> Sep 16
 *
 * Daily:
 * Sep 17 -> Sep 17
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

            break;


        default:

            throw new Error(
                `Invalid commission type: ${type}`
            );
    }


    return {
        periodStart,
        periodEnd
    };
}


/**
 * Get total sales from orders
 *
 * Uses:
 * shopId
 * created_at
 * grand_total
 */
async function getSaleAmount(
    shopId,
    periodStart,
    periodEnd
) {

    const start = formatDate(periodStart);

    /*
     * End date + 1 day
     *
     * Example:
     *
     * period_end = Sep 9
     *
     * < Sep 10 00:00:00
     *
     * This includes the whole Sep 9.
     */
    const end = new Date(periodEnd);

    end.setDate(
        end.getDate() + 1
    );

    const endExclusive = formatDate(end);


    const [rows] = await db.query(`
        SELECT
            COALESCE(
                SUM(grand_total - COALESCE(delivery_fees, 0)),
                0
            ) AS sale_amount
        FROM orders
        WHERE shopId = ?
          AND created_at >= ?
          AND created_at < ?
    `, [
        shopId,
        `${start} 00:00:00`,
        `${endExclusive} 00:00:00`
    ]);


    return Number(
        rows[0].sale_amount || 0
    );
}


/**
 * Calculate commission
 */
function calculateCommission(
    saleAmount,
    percentage
) {

    return Math.round(
        Number(saleAmount) *
        Number(percentage) /
        100
    );
}


/**
 * Create commission record
 */
async function createCommissionRecord(
    shop,
    periodStart,
    periodEnd,
    type,
    percentage
) {

    const start = formatDate(periodStart);
    const end = formatDate(periodEnd);


    /*
     * Get actual sales
     */
    const saleAmount = await getSaleAmount(
        shop.id,
        periodStart,
        periodEnd
    );


    /*
     * Calculate commission
     */
    const commissionFees =
        calculateCommission(
            saleAmount,
            percentage
        );

    const sql = `
        INSERT INTO commission_records
        (
            shop_id,
            period_start,
            period_end,
            type,
            sale_amount,
            commission_percentages,
            commission_fees,
            status
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)

        ON DUPLICATE KEY UPDATE
            id = id
    `;


    const values = [
        shop.id,
        start,
        end,
        type,
        saleAmount,
        percentage,
        commissionFees,
        "unpaid"
    ];


    const [result] = await db.query(
        sql,
        values
    );
}


/**
 * Generate commission for one shop
 */
async function generateCommissionForShop(shop) {

    const today = getToday();


    /*
     * Get latest commission record
     */
    const [records] = await db.query(`
        SELECT
            id,
            period_start,
            period_end,
            type,
            sale_amount,
            commission_percentages,
            commission_fees
        FROM commission_records
        WHERE shop_id = ?
        ORDER BY period_end DESC
        LIMIT 1
    `, [
        shop.id
    ]);


    let nextStart;


    /*
     * ============================================
     * NO RECORD
     * ============================================
     *
     * Start from shop.created_at
     *
     * First period:
     *
     * Monthly / 0%
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
         * First period ALWAYS:
         *
         * Monthly / 0%
         */
        const {
            periodStart,
            periodEnd
        } = getBillingPeriod(
            nextStart,
            "Monthly"
        );


        /*
         * Shop has not started yet
         */
        if (periodStart > today) {
            return;
        }


        /*
         * Create first Monthly / 0% record
         *
         * Sale amount is still calculated
         * from orders.
         */
        await createCommissionRecord(
            shop,
            periodStart,
            periodEnd,
            "Monthly",
            0
        );


        /*
         * If current date is inside this
         * first period, STOP.
         *
         * Example:
         *
         * Aug 10 -> Sep 9
         *
         * Today = Aug 22
         *
         * Don't start Weekly yet.
         */
        if (periodEnd >= today) {
            return;
        }


        /*
         * Continue from next period
         */
        nextStart = new Date(
            periodEnd
        );

        nextStart.setDate(
            nextStart.getDate() + 1
        );
    }


    /*
     * ============================================
     * EXISTING RECORD
     * ============================================
     */

    else {

        const latest = records[0];


        const latestEnd = parseDate(
            latest.period_end
        );


        /*
         * Next period starts after
         * latest period.
         */
        nextStart = new Date(
            latestEnd
        );

        nextStart.setDate(
            nextStart.getDate() + 1
        );
    }


    /*
     * ============================================
     * GENERATE MISSING PERIODS
     * ============================================
     */
    while (true) {

        /*
         * CURRENT SHOP SETTINGS
         *
         * Example:
         *
         * Monthly / 5%
         *
         * changed to:
         *
         * Weekly / 3%
         *
         * The NEW setting starts only
         * after the previous record ends.
         */
        const type =
            shop.commission_fees_method;


        const percentage =
            Number(
                shop.commission_fees || 0
            );


        const {
            periodStart,
            periodEnd
        } = getBillingPeriod(
            nextStart,
            type
        );


        /*
         * Don't create future period
         */
        if (periodStart > today) {
            break;
        }


        /*
         * Create commission record
         */
        await createCommissionRecord(
            shop,
            periodStart,
            periodEnd,
            type,
            percentage
        );


        /*
         * Current period contains today
         *
         * Stop here.
         */
        if (periodEnd >= today) {
            break;
        }


        /*
         * Next period starts one day
         * after current period.
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
 * Generate commission records
 * for all shops
 */
async function generateCommissionRecords() {
    const [shops] = await db.query(`
        SELECT
            id,
            shop_name,
            created_at,
            commission_fees_method,
            commission_fees
        FROM shops
        WHERE permission = 'approved'
    `);

    for (const shop of shops) {

        try {

            await generateCommissionForShop(
                shop
            );

        } catch (error) {

            console.error(
                `[COMMISSION] Failed for shop ${shop.id}:`,
                error
            );
        }
    }
}


module.exports = {
    generateCommissionRecords
};