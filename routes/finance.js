const promisedb = require("../db");
const db = promisedb.promise();

async function changeMethodsAndFees(req, res, id) {
    let body = "";

    req.on("data", chunk => {
        body += chunk.toString();
    });

    req.on("end", async () => {
        try {
            const {
                platform_fees_method,
                platform_fees,
                commission_fees_method,
                commission_fees
            } = JSON.parse(body);

            if (!id) {
                res.writeHead(400, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({
                    message: "Shop ID is required"
                }));
            }

            const validMethods = ["Monthly", "Weekly", "Daily"];

            if (
                !platform_fees_method ||
                !validMethods.includes(platform_fees_method)
            ) {
                res.writeHead(400, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({
                    message: "Invalid platform_fees_method"
                }));
            }

            if (
                !commission_fees_method ||
                !validMethods.includes(commission_fees_method)
            ) {
                res.writeHead(400, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({
                    message: "Invalid commission_fees_method"
                }));
            }

            if (
                platform_fees === undefined ||
                platform_fees === null ||
                isNaN(platform_fees) ||
                Number(platform_fees) < 0
            ) {
                res.writeHead(400, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({
                    message: "Invalid platform_fees"
                }));
            }

            if (
                commission_fees === undefined ||
                commission_fees === null ||
                isNaN(commission_fees) ||
                Number(commission_fees) < 0
            ) {
                res.writeHead(400, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({
                    message: "Invalid commission_fees"
                }));
            }

            const commissionFee = Number(commission_fees);

            if (commissionFee > 99.99) {
                res.writeHead(400, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({
                    message: "commission_fees must be between 0.00 and 99.99"
                }));
            }

            const [result] = await db.execute(
                `UPDATE shops
         SET
           platform_fees_method = ?,
           platform_fees = ?,
           commission_fees_method = ?,
           commission_fees = ?
         WHERE id = ?`,
                [
                    platform_fees_method,
                    Number(platform_fees),
                    commission_fees_method,
                    commissionFee,
                    id
                ]
            );

            if (result.affectedRows === 0) {
                res.writeHead(404, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({
                    message: "Shop not found"
                }));
            }

            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({
                message: "Methods and fees updated successfully",
                data: {
                    id,
                    platform_fees_method,
                    platform_fees: Number(platform_fees),
                    commission_fees_method,
                    commission_fees: commissionFee
                }
            }));

        } catch (error) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({
                message: "Failed to update methods and fees"
            }));
        }
    });
}

async function financeByShops(req, res, shopId) {
    try {
        if (!shopId) {
            res.writeHead(400, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({
                success: false,
                message: "Shop ID is required"
            }));
        }

        const [shops] = await db.execute(
            `SELECT
        id,
        shop_name,
        phone,
        created_at,
        platform_fees_method,
        platform_fees,
        commission_fees_method,
        commission_fees
       FROM shops
       WHERE id = ?`,
            [shopId]
        );

        if (shops.length === 0) {
            res.writeHead(404, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({
                success: false,
                message: "Shop not found"
            }));
        }

        const [platformFeeRecords] = await db.execute(
            `SELECT
        type,
        period_start,
        period_end,
        amount,
        status
       FROM platform_fee_records
       WHERE shop_id = ?
       ORDER BY period_start DESC`,
            [shopId]
        );

        const [commissionRecords] = await db.execute(
            `SELECT
        type,
        period_start,
        period_end,
        sale_amount,
        commission_percentages,
        commission_fees,
        status
       FROM commission_records
       WHERE shop_id = ?
       ORDER BY period_start DESC`,
            [shopId]
        );

        const shop = shops[0];

        res.writeHead(200, { "Content-Type": "application/json" });

        res.end(JSON.stringify({
            success: true,
            shopsInfo: {
                id: shop.id,
                shop_name: shop.shop_name,
                phone: shop.phone,
                created_at: shop.created_at,
                platform_fees_method: shop.platform_fees_method,
                platform_fees: shop.platform_fees,
                commission_fees_method: shop.commission_fees_method,
                commission_fees: shop.commission_fees
            },
            platform_fee_records: platformFeeRecords,
            commission_records: commissionRecords
        }));

    } catch (error) {
        res.writeHead(500, { "Content-Type": "application/json" });

        res.end(JSON.stringify({
            success: false,
            message: "Failed to get shop finance information"
        }));
    }
}

async function payPlatformFee(req, res, recordId) {
    try {
        if (!recordId) {
            res.writeHead(400, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({
                success: false,
                message: "Record ID is required"
            }));
        }

        const [result] = await db.execute(
            `UPDATE platform_fee_records
       SET status = 'paid'
       WHERE id = ?
       AND status = 'unpaid'`,
            [recordId]
        );

        if (result.affectedRows === 0) {
            const [records] = await db.execute(
                `SELECT id, status
         FROM platform_fee_records
         WHERE id = ?`,
                [recordId]
            );

            if (records.length === 0) {
                res.writeHead(404, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({
                    success: false,
                    message: "Platform fee record not found"
                }));
            }

            res.writeHead(400, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({
                success: false,
                message: "Platform fee record is already paid"
            }));
        }

        const [updated] = await db.execute(
            `SELECT
        id,
        shop_id,
        period_start,
        period_end,
        type,
        amount,
        status
       FROM platform_fee_records
       WHERE id = ?`,
            [recordId]
        );

        res.writeHead(200, { "Content-Type": "application/json" });

        res.end(JSON.stringify({
            success: true,
            message: "Platform fee marked as paid",
            data: updated[0]
        }));

    } catch (error) {
        res.writeHead(500, { "Content-Type": "application/json" });

        res.end(JSON.stringify({
            success: false,
            message: "Failed to update platform fee status"
        }));
    }
}

async function payCommission(req, res, recordId) {
    try {
        if (!recordId) {
            res.writeHead(400, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({
                success: false,
                message: "Record ID is required"
            }));
        }

        const [result] = await db.execute(
            `UPDATE commission_records
       SET status = 'paid'
       WHERE id = ?
       AND status = 'unpaid'`,
            [recordId]
        );

        if (result.affectedRows === 0) {
            const [records] = await db.execute(
                `SELECT id, status
         FROM commission_records
         WHERE id = ?`,
                [recordId]
            );

            if (records.length === 0) {
                res.writeHead(404, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({
                    success: false,
                    message: "Commission record not found"
                }));
            }

            res.writeHead(400, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({
                success: false,
                message: "Commission record is already paid"
            }));
        }

        const [updated] = await db.execute(
            `SELECT
        id,
        shop_id,
        period_start,
        period_end,
        type,
        sale_amount,
        commission_percentages,
        commission_fees,
        status
       FROM commission_records
       WHERE id = ?`,
            [recordId]
        );

        res.writeHead(200, { "Content-Type": "application/json" });

        res.end(JSON.stringify({
            success: true,
            message: "Commission marked as paid",
            data: updated[0]
        }));

    } catch (error) {
        res.writeHead(500, { "Content-Type": "application/json" });

        res.end(JSON.stringify({
            success: false,
            message: "Failed to update commission status"
        }));
    }
}

async function financeSummaries(req, res) {
    try {
        const [rows] = await db.query(`
      SELECT
        (SELECT COALESCE(SUM(amount), 0) FROM platform_fee_records) AS total_platform_fees,
        (SELECT COALESCE(SUM(commission_fees), 0) FROM commission_records) AS total_commission_fees,
        (SELECT COUNT(*) FROM shops WHERE permission = 'approved') AS total_shops
    `);

        const total_platform_fees = Number(rows[0].total_platform_fees);
        const total_commission_fees = Number(rows[0].total_commission_fees);

        const data = {
            success: true,
            total_finance: total_platform_fees + total_commission_fees,
            total_platform_fees,
            total_commission_fees,
            total_shops: Number(rows[0].total_shops)
        };

        res.writeHead(200, {
            "Content-Type": "application/json"
        });

        res.end(JSON.stringify(data));
    } catch (error) {
        res.writeHead(500, {
            "Content-Type": "application/json"
        });

        res.end(JSON.stringify({
            success: false,
            message: "Failed to get finance summaries"
        }));
    }
}

async function financeNotiByShop(req, res, shopId) {
    try {
        const [platformFeeRecords] = await db.query(
            `
      SELECT
        id,
        shop_id,
        period_start,
        period_end,
        type,
        amount,
        status
      FROM platform_fee_records
      WHERE status = 'unpaid'
        AND shop_id = ?
      ORDER BY period_start DESC
      `,
            [shopId]
        );

        const [commissionRecords] = await db.query(
            `
      SELECT
        id,
        shop_id,
        period_start,
        period_end,
        type,
        sale_amount,
        commission_percentages,
        commission_fees,
        status
      FROM commission_records
      WHERE status = 'unpaid'
        AND shop_id = ?
      ORDER BY period_start DESC
      `,
            [shopId]
        );

        res.writeHead(200, {
            "Content-Type": "application/json"
        });

        res.end(JSON.stringify({
            success: true,
            platform_fee_records: platformFeeRecords,
            commission_records: commissionRecords
        }));
    } catch (error) {
        res.writeHead(500, {
            "Content-Type": "application/json"
        });

        res.end(JSON.stringify({
            success: false,
            message: "Failed to get finance notification"
        }));
    }
}

async function financeNoti(req, res) {
    try {
        const [shops] = await db.query(`
      SELECT
        s.id,
        s.shop_name,
        s.shopkeeper_name,
        s.phone,
        s.logo,
        s.created_at,
        p.id AS platform_id
      FROM shops s
      LEFT JOIN platform_fee_records p
        ON p.shop_id = s.id
        AND p.status = 'unpaid'
      LEFT JOIN commission_records c
        ON c.shop_id = s.id
        AND c.status = 'unpaid'
      WHERE s.permission = 'approved'
        AND (p.id IS NOT NULL OR c.id IS NOT NULL)
      GROUP BY
        s.id,
        s.shop_name,
        s.shopkeeper_name,
        s.phone,
        s.logo,
        s.created_at
      ORDER BY s.created_at DESC
    `);

        const result = await Promise.all(
            shops.map(async (shop) => {
                const [platformFeeRecords] = await db.query(
                    `
          SELECT
            id,
            shop_id,
            period_start,
            period_end,
            type,
            amount,
            status
          FROM platform_fee_records
          WHERE status = 'unpaid'
            AND shop_id = ?
          ORDER BY period_start DESC
          `,
                    [shop.id]
                );

                const [commissionRecords] = await db.query(
                    `
          SELECT
            id,
            shop_id,
            period_start,
            period_end,
            type,
            sale_amount,
            commission_percentages,
            commission_fees,
            status
          FROM commission_records
          WHERE status = 'unpaid'
            AND shop_id = ?
          ORDER BY period_start DESC
          `,
                    [shop.id]
                );

                return {
                    shopsInfo: {
                        id: shop.id,
                        shop_name: shop.shop_name,
                        shopkeeper_name: shop.shopkeeper_name,
                        phone: shop.phone,
                        logo: shop.logo,
                        created_at: shop.created_at
                    },
                    platform_fee_records: platformFeeRecords,
                    commission_records: commissionRecords
                };
            })
        );

        res.writeHead(200, {
            "Content-Type": "application/json"
        });

        res.end(JSON.stringify({
            success: true,
            shops: result
        }));
    } catch (error) {
        res.writeHead(500, {
            "Content-Type": "application/json"
        });

        res.end(JSON.stringify({
            success: false,
            message: "Failed to get finance notifications"
        }));
    }
}

module.exports = {
    changeMethodsAndFees,
    financeByShops,
    payCommission,
    payPlatformFee,
    financeSummaries,
    financeNotiByShop,
    financeNoti
};