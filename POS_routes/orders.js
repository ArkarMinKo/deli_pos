const formidable = require("formidable");
const db = require("../dbForPOS")
const { generateId } = require("../POS_utils/idOrderGenerator");

function createOrder(req, res) {
    const form = new formidable.IncomingForm({
        multiples: false,
        encoding: "utf-8",
    });

    form.parse(req, async (err, fields, files) => {
        if (err) {
            res.writeHead(500, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ message: "Form parsing failed", error: err }));
        }

        const { shop_name, seller_id, item, quantity, unit, date, phone, address, remark } = fields;

        if (!shop_name || !seller_id || !item || !quantity || !unit, !date, !phone, !address) {
            res.writeHead(400, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ error: "လိုအပ်သော အချက်အလက်များ မပြည့်စုံပါ" }));
        }

        // Generate order ID first
        generateId(db, (err, newId) => {
            if (err) {
                res.writeHead(500, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({ message: "ID generation failed", error: err }));
            }

            const sql = `
                INSERT INTO orders 
                (id, shop_name, seller_id, item, quantity, unit, date, phone, address, remark)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;

            const values = [
                newId,
                shop_name,
                seller_id,
                item,
                parseInt(quantity, 10),
                unit,
                date,
                phone,
                address,
                remark || null
            ];

            db.query(sql, values, (err, result) => {
                if (err) {
                    res.writeHead(500, { "Content-Type": "application/json" });
                    return res.end(JSON.stringify({ message: "Database insert failed", error: err }));
                }

                res.writeHead(200, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({
                    message: "Order အောင်မြင်စွာ တင်ပြီးပါပြီ",
                    id: newId
                }));
            });
        });
    });
}

module.exports = { createOrder };