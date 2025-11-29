const formidable = require("formidable");
const { generateId } = require("../utils/idDeliverymenGenerator");
const { generatePhotoName } = require("../utils/photoNameGenerator");
const path = require("path");
const fs = require("fs");
const db = require("../db");

const UPLOAD_DIR = path.join(__dirname, "../deliverymen_uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);

function createDeliverymen(req, res) {
    const form = new formidable.IncomingForm({
        multiples: false,
        uploadDir: UPLOAD_DIR,
        keepExtensions: true,
        encoding: "utf-8",
    });
    form.uploadDir = path.join(__dirname, "../deliverymen_uploads");
    form.keepExtensions = true;

    form.parse(req, async (err, fields, files) => {
        if (err) {
            res.writeHead(400, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ error: "Form parse error" }));
        }

        const name = fields.name;
        const email = fields.email;
        const phone = fields.phone;
        const password = fields.password;
        const work_type = fields.work_type;

        const photoFile = files.photo;

        if (!name || !email || !phone || !password) {
            res.writeHead(400, { "Content-Type": "application/json" });
            return res.end(
                JSON.stringify({ error: "ထည့်သွင်းပေးရမည့် အချက်အလက်များ မပြည့်စုံပါ" })
            );
        }

        db.query(
            "SELECT email FROM deliverymen WHERE email = ?",
            [email],
            async (err, rows) => {
                if (err) {
                    res.writeHead(500, { "Content-Type": "application/json" });
                    return res.end(JSON.stringify({ error: "Database error" }));
                }

                if (rows.length > 0) {
                    res.writeHead(400, { "Content-Type": "application/json" });
                    return res.end(
                        JSON.stringify({ error: "ဤ email သည် အသုံးပြုပြီးသား ဖြစ်ပါသည်" })
                    );
                }

                try {
                    generateId(db, (err, newId) => {
                        if (err) {
                            res.writeHead(500, { "Content-Type": "application/json" });
                            return res.end(JSON.stringify({ error: "ID creation failed" }));
                        }

                        let photoName = null;

                        // SAVE PHOTO
                        if (photoFile && photoFile.originalFilename) {
                            photoName = generatePhotoName(newId, photoFile.originalFilename);

                            const newPath = path.join(
                                __dirname,
                                "../deliverymen_uploads",
                                photoName
                            );

                            fs.rename(photoFile.filepath, newPath, (renameErr) => {
                                if (renameErr) console.log("Photo save error:", renameErr);
                            });
                        }

                        const sql = `
                            INSERT INTO deliverymen
                            (id, name, email, phone, password, photo, work_type)
                            VALUES (?, ?, ?, ?, ?, ?, ?)
                        `;

                        db.query(
                            sql,
                            [
                                newId,
                                name,
                                email,
                                phone,
                                password,
                                photoName,
                                work_type || "Full time"
                            ],
                            (err, result) => {
                                if (err) {
                                    res.statusCode = 500;
                                    return res.end(JSON.stringify({ error: err.message }));
                                }

                                res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
                                res.end(JSON.stringify({ message: "Deliveryman အသစ် ဖြည့်သွင်းပြီးပါပြီ" }));
                            }
                        );
                    });
                } catch (error) {
                    res.statusCode = 500;
                    res.end(JSON.stringify({ error: "Internal Server Error" }));
                }
            }
        );
    });
}

function getAllDeliverymen(req, res) {
    const sql = `
        SELECT 
        id, name, email, phone, photo, location, status,
        work_type, rating, total_order, assign_order, created_at
        FROM deliverymen
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

function changeStatus(req, res, id) {
    condeliverymenId = id;

    if (!deliverymenId) {
        return res.writeHead(400, { "Content-Type": "application/json" })
        .end(JSON.stringify({ error: "Missing deliverymen id" }));
    }

    // 1. Get current status
    db.query("SELECT status FROM deliverymen WHERE id = ?", [deliverymenId], (err, result) => {
        if (err) {
            return res.writeHead(500, { "Content-Type": "application/json" })
            .end(JSON.stringify({ error: "DB error" }));
        }

        if (result.length === 0) {
            return res.writeHead(404, { "Content-Type": "application/json" })
            .end(JSON.stringify({ error: "Deliverymen not found" }));
        }

        const currentStatus = result[0].status;

        // 2. Toggle status
        const newStatus = currentStatus === "active" ? "warning" : "active";

        // 3. Update status
        db.query("UPDATE deliverymen SET status = ? WHERE id = ?", [newStatus, deliverymenId], (updateErr) => {
            if (updateErr) {
                return res.writeHead(500, { "Content-Type": "application/json" })
                .end(JSON.stringify({ error: "Update failed" }));
            }

            return res.writeHead(200, { "Content-Type": "application/json" })
            .end(JSON.stringify({
                message: `Status ကို ${newStatus} အဖြစ် သတ်မှတ်လိုက်ပါပြီ`,
            }));
        });
    });
}

module.exports = { 
    createDeliverymen,
    getAllDeliverymen,
    changeStatus
};