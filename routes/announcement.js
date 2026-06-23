const fs = require("fs");
const path = require("path");
const formidable = require("formidable");
const db = require("../db");

const UPLOAD_DIR = path.join(__dirname, "../announce_uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);

function createAnnouncements(req, res) {
  res.setHeader("Content-Type", "application/json");

  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }

  const form = new formidable.IncomingForm({
    multiples: true,
    uploadDir: UPLOAD_DIR,
    keepExtensions: true,
  });

  form.parse(req, (err, fields, files) => {
    if (err) {
      res.statusCode = 500;
      return res.end(JSON.stringify({ error: err.message }));
    }

    const second = parseInt(fields.second || 0);

    let uploadedImages = [];

    if (files.images) {
      const imageFiles = Array.isArray(files.images)
        ? files.images
        : [files.images];

      if (imageFiles.length > 5) {
        return res.end(
          JSON.stringify({
            error: "Maximum 5 images allowed",
          })
        );
      }

      uploadedImages = imageFiles.map((file) =>
        path.basename(file.filepath)
      );
    }

    db.query(
      "SELECT images FROM announcements WHERE id = 1",
      (selectErr, rows) => {
        if (selectErr) {
          return res.end(
            JSON.stringify({ error: selectErr.message })
          );
        }

        if (rows.length > 0) {
          try {
            const oldImages = JSON.parse(rows[0].images || "[]");

            oldImages.forEach((img) => {
              const imgPath = path.join(UPLOAD_DIR, img);

              if (fs.existsSync(imgPath)) {
                fs.unlinkSync(imgPath);
              }
            });
          } catch (_) {}

          db.query(
            "UPDATE announcements SET images=?, second=? WHERE id=1",
            [JSON.stringify(uploadedImages), second],
            (updateErr) => {
              if (updateErr) {
                return res.end(
                  JSON.stringify({
                    error: updateErr.message,
                  })
                );
              }

              res.end(
                JSON.stringify({
                  success: true,
                  message: "Announcement updated",
                  images: uploadedImages,
                  second,
                })
              );
            }
          );
        } else {
          db.query(
            "INSERT INTO announcements (id, images, second) VALUES (1, ?, ?)",
            [JSON.stringify(uploadedImages), second],
            (insertErr) => {
              if (insertErr) {
                return res.end(
                  JSON.stringify({
                    error: insertErr.message,
                  })
                );
              }

              res.end(
                JSON.stringify({
                  success: true,
                  message: "Announcement created",
                  images: uploadedImages,
                  second,
                })
              );
            }
          );
        }
      }
    );
  });
}

function getAnnouncement(req, res) {
  res.setHeader("Content-Type", "application/json");

  db.query(
    "SELECT images, second FROM announcements WHERE id = 1",
    (err, rows) => {
      if (err) {
        res.statusCode = 500;
        return res.end(
          JSON.stringify({
            success: false,
            error: err.message,
          })
        );
      }

      if (rows.length === 0) {
        return res.end(
          JSON.stringify({
            success: true,
            data: {
              images: [],
              second: 0,
            },
          })
        );
      }

      let images = [];

      try {
        images = JSON.parse(rows[0].images || "[]");
      } catch (e) {
        images = [];
      }

      res.end(
        JSON.stringify({
          success: true,
          data: {
            images,
            second: rows[0].second || 0,
          },
        })
      );
    }
  );
}

module.exports = {createAnnouncements, getAnnouncement};