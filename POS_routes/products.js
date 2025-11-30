const formidable = require("formidable");
const db = require("../dbForPOS")

function createProducts(req, res) {
    const form = new formidable.IncomingForm();

    form.parse(req, async (err, fields) => {
        if (err) {
            res.writeHead(400, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ error: "Form parse error" }));
        }

        let { id, name, quantity, price, alert_date, exp_date, remark } = fields;

        // Required fields
        if (!id || !name || !quantity || !price || !alert_date) {
            res.writeHead(400, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({
                error: "လိုအပ္ေသာ အခ်က္အလက္မ်ား မျပည့္စံုပါ"
            }));
        }

        // Convert to integers
        quantity = parseInt(quantity);
        price = parseInt(price);

        if (isNaN(quantity) || isNaN(price)) {
            res.writeHead(400, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({
                error: "Quantity နဲ့ Price သည် numbers များသာ ဖြစ်ရမည်"
            }));
        }

        // Check unique ID
        const checkSql = "SELECT id FROM products WHERE id = ?";
        db.query(checkSql, [id], (err, results) => {
            if (err) {
                res.writeHead(500, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({ error: "Database error" }));
            }

            if (results.length > 0) {
                res.writeHead(400, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({
                    error: "ဤ item code သည် အရင်ထဲက ရှိပြီးသား ဖြစ်သည်"
                }));
            }

            // Insert product
            const insertSql = `
                INSERT INTO products 
                (id, name, quantity, price, alert_date, exp_date, remark)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `;

            db.query(
                insertSql,
                [id, name, quantity, price, alert_date, exp_date || null, remark || null],
                (err) => {
                    if (err) {
                        res.writeHead(500, { "Content-Type": "application/json" });
                        return res.end(JSON.stringify({ error: "Insert error" }));
                    }

                    res.writeHead(201, { "Content-Type": "application/json" });
                    return res.end(JSON.stringify({
                        message: "Product ကို အောင်မြင်စွာ အသစ် ထည့်သွင်းပြီးပါပြီ"
                    }));
                }
            );
        });
    });
}

module.exports = { 
    createProducts
};