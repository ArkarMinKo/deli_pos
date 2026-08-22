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

module.exports = {
    changeMethodsAndFees
};