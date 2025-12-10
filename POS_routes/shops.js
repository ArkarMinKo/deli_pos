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
        const photo = Array.isArray(files.photo) ? files.photo[0] : files.photo;

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

function putShops(req, res, id) {
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

        let { name, phone, address } = fields;
        let photo = files.photo;

        // --------------------------
        //   Required: ID
        // --------------------------
        if (!id) {
            res.writeHead(400, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ error: "ID is required" }));
        }

        // --------------------------
        //   Check if shop exists
        // --------------------------
        db.query("SELECT * FROM shops WHERE id = ?", [id], (err, results) => {
            if (err) {
                res.writeHead(500, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({ error: "Database error" }));
            }

            if (results.length === 0) {
                res.writeHead(404, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({ error: "Shop ကိုရှာမတွေ့ပါ" }));
            }

            const oldPhoto = results[0].photo;

            // --------------------------
            //    Process new photo
            // --------------------------
            let newPhotoName = oldPhoto;

            if (photo && photo.originalFilename) {
                newPhotoName = generatePhotoName(id, photo.originalFilename);
                const newPhotoPath = path.join(UPLOAD_DIR, newPhotoName);

                // Replace old photo
                if (oldPhoto) {
                    const oldPath = path.join(UPLOAD_DIR, oldPhoto);
                    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
                }

                fs.rename(photo.filepath, newPhotoPath, (err) => {
                    if (err) {
                        res.writeHead(500, { "Content-Type": "application/json" });
                        return res.end(JSON.stringify({ error: "Photo save error" }));
                    }
                    updateShop();
                });
            } else {
                updateShop();
            }

            // --------------------------
            //    Update DB values
            // --------------------------
            function updateShop() {
                const sql = `
                    UPDATE shops
                    SET name = ?, phone = ?, address = ?, photo = ?
                    WHERE id = ?
                `;

                const values = [
                    name || results[0].name,
                    phone || results[0].phone,
                    address || results[0].address,
                    newPhotoName,
                    id
                ];

                db.query(sql, values, (err) => {
                    if (err) {
                        res.writeHead(500, { "Content-Type": "application/json" });
                        return res.end(JSON.stringify({ error: "Update failed" }));
                    }

                    res.writeHead(200, { "Content-Type": "application/json" });
                    return res.end(
                        JSON.stringify({
                            message: "Shop ကို အောင်မြင်စွာ ပြင်ဆင်ပြီးပါပြီ"
                        })
                    );
                });
            }
        });
    });
}

function getAllShops(req, res) {
    const sql = `
        SELECT *
        FROM shops
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

function getShopsById(req, res, id) {
    const sql = `
        SELECT *
        FROM shops
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
            return res.end(JSON.stringify({ message: "Shop not found" }));
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(results));
    });
}

function deleteShops(req, res, id) {
    const shopId = id;

    if (!shopId) {
        return res.writeHead(400, { "Content-Type": "application/json" })
        .end(JSON.stringify({ error: "Missing Shop id" }));
    }

    // Check if Shop exists
    db.query("SELECT id FROM shops WHERE id = ?", [shopId], (err, result) => {
        if (err) {
            return res.writeHead(500, { "Content-Type": "application/json" })
            .end(JSON.stringify({ error: "DB error" }));
        }

        if (result.length === 0) {
            return res.writeHead(404, { "Content-Type": "application/json" })
            .end(JSON.stringify({ error: "Shop not found" }));
        }

        // If exists → delete
        db.query("DELETE FROM shops WHERE id = ?", [shopId], (deleteErr) => {
            if (deleteErr) {
                return res.writeHead(500, { "Content-Type": "application/json" })
                .end(JSON.stringify({ error: "Delete failed" }));
            }

            return res.writeHead(200, { "Content-Type": "application/json" })
            .end(JSON.stringify({
                message: "Shop ကို အောင်မြင်စွာ ဖျက်ပြီးပါပြီ",
                deletedId: shopId
            }));
        });
    });
}

module.exports = { 
    createShops,
    putShops,
    getAllShops,
    getShopsById,
    deleteShops
};