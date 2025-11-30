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
                error: "လိုအပ်သော အချက်အလက်များ မပြည့်စုံပါ"
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

function getAllProducts(req, res) {
    const sql = `
        SELECT *
        FROM products
        ORDER BY created_at DESC
    `;

    db.query(sql, (err, results) => {
        if (err) {
            res.writeHead(500, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ error: "Database error" }));
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(results));
    });
}

function getProductsById(req, res, id) {
    const sql = `
        SELECT *
        FROM products
        WHERE id = ?
        LIMIT 1
    `;

    db.query(sql, [id], (err, results) => {
        if (err) {
            res.writeHead(500, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ error: "Database error" }));
        }

        if (results.length === 0) {
            res.writeHead(404, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ message: "Product not found" }));
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(results));
    });
}

function putProducts(req, res, productId) {
    const form = new formidable.IncomingForm();

    form.parse(req, async (err, fields) => {
        if (err) {
            res.writeHead(400, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ error: "Form parse error" }));
        }

        let { name, quantity, price, alert_date, exp_date, remark } = fields;

        // Convert numeric fields
        if (quantity !== undefined) quantity = parseInt(quantity);
        if (price !== undefined) price = parseInt(price);

        if (quantity !== undefined && isNaN(quantity)) {
            res.writeHead(400, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({
                error: "Quantity သည် number ဖြစ်ရမည်"
            }));
        }

        if (price !== undefined && isNaN(price)) {
            res.writeHead(400, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({
                error: "Price သည် number ဖြစ်ရမည်"
            }));
        }

        // Check if product exists
        const checkSql = "SELECT * FROM products WHERE id = ?";
        db.query(checkSql, [productId], (err, results) => {
            if (err) {
                res.writeHead(500, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({ error: "Database error" }));
            }

            if (results.length === 0) {
                res.writeHead(404, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({
                    error: "Product ကို မတွေ့ရှိပါ"
                }));
            }

            // Keep previous values
            const old = results[0];

            const updatedName = name || old.name;
            const updatedQuantity = quantity !== undefined ? quantity : old.quantity;
            const updatedPrice = price !== undefined ? price : old.price;
            const updatedAlertDate = alert_date || old.alert_date;
            const updatedExpDate = exp_date || old.exp_date;
            const updatedRemark = remark || old.remark;

            // Update SQL
            const updateSql = `
                UPDATE products SET
                    name = ?,
                    quantity = ?,
                    price = ?,
                    alert_date = ?,
                    exp_date = ?,
                    remark = ?
                WHERE id = ?
            `;

            db.query(
                updateSql,
                [
                    updatedName,
                    updatedQuantity,
                    updatedPrice,
                    updatedAlertDate,
                    updatedExpDate,
                    updatedRemark,
                    productId
                ],
                (err) => {
                    if (err) {
                        res.writeHead(500, { "Content-Type": "application/json" });
                        return res.end(JSON.stringify({ error: "Update error" }));
                    }

                    res.writeHead(200, { "Content-Type": "application/json" });
                    return res.end(JSON.stringify({
                        message: "Product ကို အောင်မြင်စွာ ပြင်ဆင်ပြီးပါပြီ"
                    }));
                }
            );
        });
    });
}

function deleteProducts(req, res, id) {
    const productId = id;

    if (!productId) {
        return res.writeHead(400, { "Content-Type": "application/json" })
        .end(JSON.stringify({ error: "Missing Product id" }));
    }

    // Check if product exists
    db.query("SELECT id FROM products WHERE id = ?", [productId], (err, result) => {
        if (err) {
            return res.writeHead(500, { "Content-Type": "application/json" })
            .end(JSON.stringify({ error: "DB error" }));
        }

        if (result.length === 0) {
            return res.writeHead(404, { "Content-Type": "application/json" })
            .end(JSON.stringify({ error: "Product not found" }));
        }

        // If exists → delete
        db.query("DELETE FROM products WHERE id = ?", [productId], (deleteErr) => {
            if (deleteErr) {
                return res.writeHead(500, { "Content-Type": "application/json" })
                .end(JSON.stringify({ error: "Delete failed" }));
            }

            return res.writeHead(200, { "Content-Type": "application/json" })
            .end(JSON.stringify({
                message: "Product ကို အောင်မြင်စွာ ဖျက်ပြီးပါပြီ",
                deletedId: productId
            }));
        });
    });
}

module.exports = { 
    createProducts,
    getAllProducts,
    getProductsById,
    putProducts,
    deleteProducts
};