const formidable = require("formidable");
const path = require("path");
const fs = require("fs");
const db = require("../dbForPOS");

const { generatePhotoName } = require("../POS_utils/photoNameGenerator");

// Upload directory
const UPLOAD_DIR = path.join(__dirname, "../shop_pos_uploads");

// Ensure folder exists
if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

function createShops(req, res) {
    const form = new formidable.IncomingForm({
        multiples: false,
        uploadDir: UPLOAD_DIR,
        keepExtensions: true
    });

    form.parse(req, async (err, fields, files) => {
        if (err) {
            res.writeHead(400, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ error: "Form parse error" }));
        }

        let { id, name, phone, address } = fields;
        let photo = files.photo;

        // -----------------------------
        //   Validate required fields
        // -----------------------------
        if (!id || !name || !phone || !address) {
            res.writeHead(400, { "Content-Type": "application/json" });
            return res.end(
                JSON.stringify({ error: "id, name, phone and address are required" })
            );
        }

        // -----------------------------
        //   Check unique ID
        // -----------------------------
        db.query("SELECT id FROM shops WHERE id = ?", [id], (err, results) => {
            if (err) {
                res.writeHead(500, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({ error: "Database error" }));
            }

            if (results.length > 0) {
                res.writeHead(400, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({ error: "ဤ shop code သည် အရင်ထဲက ရှိပြီးသား ဖြစ်သည်" }));
            }

            // -----------------------------
            //   Process photo (if exists)
            // -----------------------------
            let photoName = null;

            if (photo && photo.originalFilename) {
                photoName = generatePhotoName(id, photo.originalFilename);
                const newPath = path.join(UPLOAD_DIR, photoName);

                fs.rename(photo.filepath, newPath, (err) => {
                    if (err) {
                        res.writeHead(500, { "Content-Type": "application/json" });
                        return res.end(JSON.stringify({ error: "Photo save error" }));
                    }

                    insertShop();
                });
            } else {
                insertShop(); // No photo uploaded
            }

            // -----------------------------
            //   Insert into database
            // -----------------------------
            function insertShop() {
                const sql = `
                    INSERT INTO shops (id, name, phone, address, photo)
                    VALUES (?, ?, ?, ?, ?)
                `;

                const values = [id, name, phone, address, photoName];

                db.query(sql, values, (err) => {
                    if (err) {
                        res.writeHead(500, { "Content-Type": "application/json" });
                        return res.end(JSON.stringify({ error: "Insert failed" }));
                    }

                    res.writeHead(200, { "Content-Type": "application/json" });
                    return res.end(JSON.stringify({ message: "Shop ကို အောင်မြင်စွာ အသစ် ထည့်သွင်းပြီးပါပြီ" }));
                });
            }
        });
    });
}

module.exports = { 
    createShops
};