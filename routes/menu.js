const formidable = require("formidable");
const fs = require("fs");
const path = require("path");
const db = require("../db");

const { generateMenuId } = require("../utils/idMenuGenerator");
const { generatePhotoName } = require("../utils/photoNameGenerator");

const UPLOAD_DIR = path.join(__dirname, "../menu_uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);

function createMenu(req, res) {
    const form = formidable({ multiples: false });

    form.parse(req, (err, fields, files) => {
        if (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ message: "Form parsing failed", err }));
        }

        const {
            shop_id,
            name,
            prices,
            category,
            size,
            description,
            relate_menu,
            relate_ingredients,
            get_months,
            photo, // base64 string
        } = fields;

        // Required fields validation
        if (!shop_id || !name || !prices || !category || !photo) {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(
            JSON.stringify({ message: "လိုအပ်ချက်များ မပြည့်စုံပါ" })
        );
        }

        generateMenuId(db, shop_id, (err, newId) => {
        if (err) {
            res.writeHead(500, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ message: "ID generation failed" }));
        }

        // === Convert Base64 Photo ===
        let photoBuffer;
        try {
            const base64Data = photo.replace(/^data:image\/\w+;base64,/, "");
            photoBuffer = Buffer.from(base64Data, "base64");
        } catch (e) {
            res.writeHead(400, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ message: "Invalid base64 photo" }));
        }

        const photoName = generatePhotoName(newId, ".jpg");
        const photoPath = path.join(UPLOAD_DIR, photoName);

        fs.writeFile(photoPath, photoBuffer, (err) => {
            if (err) {
            res.writeHead(500, { "Content-Type": "application/json" });
            return res.end(
                JSON.stringify({ message: "Photo saving failed", err })
            );
            }

            // === Prepare JSON fields ===
            const relateMenuJson = relate_menu
            ? JSON.stringify(JSON.parse(relate_menu))
            : null;

            const relateIngredientsJson = relate_ingredients
            ? JSON.stringify(JSON.parse(relate_ingredients))
            : null;

            const monthJson = get_months
            ? JSON.stringify(JSON.parse(get_months))
            : JSON.stringify(["All months"]);

            // === Insert menu into DB ===
            const sql = `
            INSERT INTO menu (
                id, shop_id, name, prices, category, photo,
                size, description, relate_menu, relate_ingredients, get_months
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;

            const values = [
                newId,
                shop_id,
                name,
                prices,
                category,
                photoName,
                size || null,
                description || null,
                relateMenuJson,
                relateIngredientsJson,
                monthJson,
            ];

            db.query(sql, values, (err, result) => {
            if (err) {
                res.writeHead(500, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({ message: "DB error", err }));
            }

            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(
                JSON.stringify({
                message: "Menu ကို အောင်မြင်စွာ အသစ်ထည့်သွင်း ပြီးပါပြီ",
                id: newId,
                })
            );
            });
        });
        });
    });
}

module.exports = { createMenu };
