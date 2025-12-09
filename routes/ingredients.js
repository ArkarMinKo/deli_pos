const formidable = require("formidable");
const path = require("path");
const fs = require("fs");
const db = require("../db");

const { generateIngredientsId } = require("../utils/idIngredientsGenerator");
const { generatePhotoName } = require("../utils/photoNameGenerator");

const UPLOAD_DIR = path.join(__dirname, "../ingredients_uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);

function createIngredients(req, res) {
    const form = new formidable.IncomingForm({
        multiples: false,
    });

    form.parse(req, async (err, fields) => {
        if (err) {
            res.writeHead(400, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ error: "Form parse error" }));
        }

        let { name, prices, shop_id, photo } = fields;

        // Required fields
        if (!name || !prices || !shop_id || !photo) {
            res.writeHead(400, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ error: "လိုအပ်ချက်များ မပြည့်စုံပါ" }));
        }

        // Generate Ingredient ID
        generateIngredientsId(db, shop_id, (err, newId) => {
            if (err) {
                res.writeHead(500, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({ error: "ID generation failed" }));
            }

            // ------------------------------------------------------------------
            // === Base64 Decode Logic (REPLACED EXACTLY AS YOU WANT) ===
            // ------------------------------------------------------------------
            let filename = null;

            try {
                if (fields.photo && fields.photo.startsWith("data:image")) {
                    const base64Data = fields.photo.replace(/^data:image\/\w+;base64,/, "");
                    const ext = fields.photo.substring(
                        "data:image/".length,
                        fields.photo.indexOf(";base64")
                    );
                    if (!ext) {
                        return res.end(JSON.stringify({ error: "Missing image extension in Base64 string" }));
                    }

                    filename = generatePhotoName(newId, `photo.${ext}`);
                    const filePath = path.join(UPLOAD_DIR, filename);

                    fs.writeFileSync(filePath, Buffer.from(base64Data, "base64"));
                } else {
                    res.writeHead(400, { "Content-Type": "application/json" });
                    return res.end(JSON.stringify({ error: "Invalid Base64 image format" }));
                }
            } catch (e) {
                res.writeHead(400, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({ error: "Invalid Base64 format", e }));
            }
            // ------------------------------------------------------------------

            // Insert into DB
            const sql = `
                INSERT INTO ingredients (id, name, photo, prices, shop_id)
                VALUES (?, ?, ?, ?, ?)
            `;

            db.query(sql, [newId, name, filename, prices, shop_id], (err, result) => {
                if (err) {
                    res.writeHead(500, { "Content-Type": "application/json" });
                    return res.end(JSON.stringify({ error: "Database insert failed", details: err }));
                }

                res.writeHead(201, { "Content-Type": "application/json" });
                return res.end(
                    JSON.stringify({
                        message: "Ingredient ကို အောင်မြင်စွာ အသစ်ထည့်သွင်း ပြီးပါပြီ",
                    })
                );
            });
        });
    });
}

function updateIngredients(req, res, id) {
    const form = new formidable.IncomingForm({ multiples: false });

    form.parse(req, (err, fields) => {
        if (err) {
            res.writeHead(400, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ error: "Form parse error" }));
        }

        let { name, prices, photo } = fields;

        if (!id) {
            res.writeHead(400, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ error: "Ingredient ID required" }));
        }

        // Required fields
        if (!name || !prices) {
            res.writeHead(400, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ error: "လိုအပ်ချက်များ မပြည့်စုံပါ" }));
        }

        // 1. Get existing ingredient
        const getSql = `SELECT photo FROM ingredients WHERE id = ?`;

        db.query(getSql, [id], (err, result) => {
            if (err || result.length === 0) {
                res.writeHead(404, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({ error: "Ingredient not found" }));
            }

            let oldPhoto = result[0].photo;
            let newPhotoName = oldPhoto;

            // 2. Replace photo only if new Base64 photo included
            try {
                if (photo && photo.startsWith("data:image")) {
                    const base64Data = photo.replace(/^data:image\/\w+;base64,/, "");
                    const ext = photo.substring(
                        "data:image/".length,
                        photo.indexOf(";base64")
                    );

                    newPhotoName = generatePhotoName(id, `photo.${ext}`);

                    fs.writeFileSync(
                        path.join(UPLOAD_DIR, newPhotoName),
                        Buffer.from(base64Data, "base64")
                    );

                    // delete old photo
                    const oldPath = path.join(UPLOAD_DIR, oldPhoto);
                    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
                }
            } catch (e) {
                res.writeHead(400, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({ error: "Invalid Base64 format", e }));
            }

            // 3. Update DB
            const updateSql = `
                UPDATE ingredients SET
                    name = ?, prices = ?, photo = ?
                WHERE id = ?
            `;

            db.query(
                updateSql,
                [
                    name,
                    prices,
                    newPhotoName,
                    id,
                ],
                (err2) => {
                    if (err2) {
                        res.writeHead(500, { "Content-Type": "application/json" });
                        return res.end(JSON.stringify({ error: "Update failed", details: err2 }));
                    }

                    res.writeHead(200, { "Content-Type": "application/json" });
                    return res.end(
                        JSON.stringify({
                            message: "Ingredient ကို အောင်မြင်စွာ ပြင်ဆင်ပြီးပါပြီ",
                        })
                    );
                }
            );
        });
    });
}

function getIngredientsByShopId(req, res, id) {
    const sql = `
        SELECT 
        id, name, prices, photo
        FROM ingredients
        WHERE shop_id = ?
        ORDER BY created_at DESC
    `

    db.query(sql, [id], (err, results) => {
        if (err) {
            res.writeHead(500, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ error: "Database error" }));
        }

        if (results.length === 0) {
            res.writeHead(400, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ error: "Ingredients များ မရှိသေးပါ" }));
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(results));
    })
}

function deleteIngredients(req, res, id) {
    if (!id) {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "Ingredient ID required" }));
    }

    // 1. Get photo name first
    db.query(
        "SELECT photo FROM ingredients WHERE id = ?",
        [id],
        (err, result) => {
            if (err || result.length === 0) {
                res.writeHead(404, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({ error: "Ingredient not found" }));
            }

            const photoName = result[0].photo;

            // 2. Delete DB row
            db.query("DELETE FROM ingredients WHERE id = ?", [id], (err2) => {
                if (err2) {
                    res.writeHead(500, { "Content-Type": "application/json" });
                    return res.end(JSON.stringify({ error: "Delete failed", details: err2 }));
                }

                // 3. Delete image file
                const photoPath = path.join(UPLOAD_DIR, photoName);
                if (fs.existsSync(photoPath)) fs.unlinkSync(photoPath);

                res.writeHead(200, { "Content-Type": "application/json" });
                return res.end(
                    JSON.stringify({
                        message: "Ingredient ကို အောင်မြင်စွာ ဖျက်ပြီးပါပြီ",
                    })
                );
            });
        }
    );
}

module.exports = {
        createIngredients,
        updateIngredients,
        getIngredientsByShopId,
        deleteIngredients
    };