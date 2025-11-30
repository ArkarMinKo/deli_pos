const formidable = require("formidable");
const db = require("../dbForPOS")

function createProducts(req, res) {
    const form = new formidable.IncomingForm();

    form.parse(req, async (err, fields) => {
        if (err) {
            return res.status(400).json({ error: "Form parse error" });
        }

        let { id, name, quantity, price, alert_date, exp_date, remark } = fields;

        // Required fields
        if (!id || !name || !quantity || !price || !alert_date) {
            return res.status(400).json({
                error: "လိုအပ်သော အချက်အလက်များ မပြည့်စုံပါ"
            });
        }

        // Convert to integers
        quantity = parseInt(quantity);
        price = parseInt(price);

        if (isNaN(quantity) || isNaN(price)) {
            return res.status(400).json({
                error: "Quantity နဲ့ Price သည် numbers များသာ ဖြစ်ရမည်"
            });
        }

        // Check unique ID
        const checkSql = "SELECT id FROM products WHERE id = ?";
        db.query(checkSql, [id], (err, results) => {
            if (err) {
                return res.status(500).json({ error: "Database error" });
            }

            if (results.length > 0) {
                return res.status(400).json({ error: "ဤ item code သည် အရင်ထဲက ရှိပြီးသား ဖြစ်သည်" });
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
                        return res.status(500).json({ error: "Insert error" });
                    }

                    return res.status(201).json({
                        message: "Product ကို အောင်မြင်စွာ အသစ် ထည့်သွင်းပြီးပါပြီ"
                    });
                }
            );
        });
    });
}

module.exports = { 
    createProducts
};