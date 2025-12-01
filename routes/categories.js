const formidable = require("formidable");
const db = require("../db");
const { generateCategoryId } = require("../utils/idCategoriesGenerator");

function createCategories(req, res) {
    const form = new formidable.IncomingForm({
        multiples: false
    });

    form.parse(req, async (err, fields) => {
        if (err) {
            res.writeHead(400, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ error: "Form parse error" }));
        }

        let { name, icon, shop_id } = fields;

        // Validate required fields
        if (!name || !parseInt(icon) || !shop_id) {
            res.writeHead(400, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ error: "လိုအပ်ချက်များ မပြည့်စုံပါ" }));
        }

        // Generate ID based on shop_id
        generateCategoryId(db, shop_id, (err, newId) => {
            if (err) {
                res.writeHead(500, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({ error: "ID generation failed" }));
            }

            // Insert into DB
            const sql = `
                INSERT INTO categories (id, name, icon, shop_id)
                VALUES (?, ?, ?, ?)
            `;

            db.query(sql, [newId, name, icon, shop_id], (err, result) => {
                if (err) {
                    res.writeHead(500, { "Content-Type": "application/json" });
                    return res.end(JSON.stringify({ error: "Database insert failed", details: err }));
                }

                res.writeHead(201, { "Content-Type": "application/json" });
                return res.end(
                    JSON.stringify({
                        message: "Category ကို အောင်မြင်စွာ အသစ်ထည့်သွင်း ပြီးပါပြီ"
                    })
                );
            });
        });
    });
}

module.exports = { createCategories };