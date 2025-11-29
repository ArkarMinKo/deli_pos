const formidable = require("formidable");
const { generateId } = require("../utils/idDeliverymenGenerator");
const { generatePhotoName } = require("../utils/photoNameGenerator");
const path = require("path");
const fs = require("fs");

function createDeliverymen(req, res) {
    const form = new formidable.IncomingForm();
    form.uploadDir = path.join(__dirname, "../deliverymen-uploads");
    form.keepExtensions = true;

    form.parse(req, async (err, fields, files) => {
        if (err)
            return res.status(400).json({ error: "Form parse error" });

        const name = fields.name;
        const email = fields.email;
        const phone = fields.phone;
        const password = fields.password;
        const location = fields.location;
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
                                "../deliverymen-uploads",
                                photoName
                            );

                            fs.rename(photoFile.filepath, newPath, (renameErr) => {
                                if (renameErr) console.log("Photo save error:", renameErr);
                            });
                        }

                        const sql = `
                            INSERT INTO deliverymen
                            (id, name, email, phone, password, photo, location, work_type)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
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
                                location || null,
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

module.exports = { 
    createDeliverymen
};