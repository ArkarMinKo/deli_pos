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

// function getCategoriesByShopId(req, res, id) {
//     const sql = `
//         SELECT 
//         id, name, icon
//         FROM categories
//         WHERE shop_id = ?
//         ORDER BY created_at DESC
//     `

//     db.query(sql, [id], (err, results) => {
//         if (err) {
//             res.writeHead(500, { "Content-Type": "application/json" });
//             return res.end(JSON.stringify({ error: "Database error" }));
//         }

//         if (results.length === 0) {
//             res.writeHead(400, { "Content-Type": "application/json" });
//             return res.end(JSON.stringify({ error: "Categories များ မရှိသေးပါ" }));
//         }

//         res.writeHead(200, { "Content-Type": "application/json" });
//         res.end(JSON.stringify(results));
//     })
// }

function getCategoriesByShopId(req, res, id) {
    const sql = `
        SELECT 
            c.id,
            c.name,
            c.icon,
            COUNT(m.id) AS menu_count
        FROM categories c
        LEFT JOIN menu m 
            ON m.category_id = c.id
        WHERE c.shop_id = ?
        GROUP BY c.id
        ORDER BY c.created_at DESC
    `;

    db.query(sql, [id], (err, results) => {
        if (err) {
            res.writeHead(500, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ error: "Database error" }));
        }

        if (results.length === 0) {
            res.writeHead(400, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ error: "Categories များ မရှိသေးပါ" }));
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(results));
    });
}

function updateCategories(req, res, id) {
    const form = new formidable.IncomingForm({ multiples: false });

    form.parse(req, (err, fields) => {
        if (err) {
            res.writeHead(400, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ error: "Form parse error" }));
        }

        let { name, icon } = fields;

        if (!id) {
            res.writeHead(400, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ error: "Category ID required" }));
        }

        // Validate required fields
        if (!name || !parseInt(icon)) {
            res.writeHead(400, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ error: "လိုအပ်ချက်များ မပြည့်စုံပါ" }));
        }

        const sql = `
            UPDATE categories SET
                name = ?, icon = ?
            WHERE id = ?
        `;

        db.query(sql, [name, icon, id], (err2) => {
            if (err2) {
                res.writeHead(500, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({ error: "Update failed", details: err2 }));
            }

            res.writeHead(200, { "Content-Type": "application/json" });
            return res.end(
                JSON.stringify({
                    message: "Category ကို အောင်မြင်စွာ ပြင်ဆင်ပြီးပါပြီ",
                    id
                })
            );
        });
    });
}

function deleteCategories(req, res, id) {

    if (!id) {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "Category ID required" }));
    }

    // Check exist first
    db.query("SELECT id FROM categories WHERE id = ?", [id], (err, result) => {
        if (err || result.length === 0) {
            res.writeHead(404, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ error: "Category not found" }));
        }

        // Delete
        db.query("DELETE FROM categories WHERE id = ?", [id], (err2) => {
            if (err2) {
                res.writeHead(500, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({ error: "Delete failed", details: err2 }));
            }

            res.writeHead(200, { "Content-Type": "application/json" });
            return res.end(
                JSON.stringify({
                    message: "Category ကို အောင်မြင်စွာ ဖျက်ပြီးပါပြီ",
                    id
                })
            );
        });
    });
}

module.exports = { 
    createCategories,
    getCategoriesByShopId,
    updateCategories,
    deleteCategories
 };