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

                    filename = generatePhotoName(newId, `.${ext}`);
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

module.exports = {
        createIngredients,
        getIngredientsByShopId
    };