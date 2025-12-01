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

            // Convert Base64 → Buffer
            const matches = photo.match(/^data:(.+);base64,(.+)$/);
            if (!matches) {
                res.writeHead(400, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({ error: "Invalid Base64 image format" }));
            }

            const base64Data = matches[2];
            const mimeType = matches[1];
            const ext = mimeType.split("/")[1];

            // Generate filename
            const filename = generatePhotoName(newId, "." + ext);
            const filePath = path.join(UPLOAD_DIR, filename);

            // Save image file
            fs.writeFile(filePath, Buffer.from(base64Data, "base64"), (err) => {
                if (err) {
                    res.writeHead(500, { "Content-Type": "application/json" });
                    return res.end(JSON.stringify({ error: "Photo save failed" }));
                }

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
    });
}

module.exports = { createIngredients };