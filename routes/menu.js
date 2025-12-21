const formidable = require("formidable");
const fs = require("fs");
const path = require("path");
const db = require("../db");

const { generateMenuId } = require("../utils/idMenuGenerator");
const { generatePhotoName } = require("../utils/photoNameGenerator");

const UPLOAD_DIR = path.join(__dirname, "../menu_uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);

function createMenu(req, res) {
    const form = new formidable.IncomingForm({
        multiples: false,
    });

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

            // ------------------------------------------------------------------
            // === Base64 Decode Logic (REPLACED EXACTLY AS YOU ASKED) ===
            // ------------------------------------------------------------------
            let photoName = null;

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
                    photoName = generatePhotoName(newId, `photo.${ext}`);
                    fs.writeFileSync(
                        path.join(UPLOAD_DIR, photoName),
                        Buffer.from(base64Data, "base64")
                    );
                } else {
                    res.writeHead(400, { "Content-Type": "application/json" });
                    return res.end(JSON.stringify({ message: "Invalid base64 photo" }));
                }
            } catch (e) {
                res.writeHead(400, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({ message: "Invalid base64 format", e }));
            }
            // ------------------------------------------------------------------

            // === Prepare JSON fields ===
            const relateMenuJson = Array.isArray(relate_menu)
                ? JSON.stringify(relate_menu)
                : null;

            const relateIngredientsJson = Array.isArray(relate_ingredients)
                ? JSON.stringify(relate_ingredients)
                : null;

            const monthJson = Array.isArray(get_months)
                ? JSON.stringify(get_months)
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
}

function updateMenu(req, res, id) {
    const form = new formidable.IncomingForm({ multiples: false });

    form.parse(req, async (err, fields) => {
        if (err) {
            res.writeHead(500, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ message: "Form parse failed", err }));
        }

        const {
            name,
            prices,
            category,
            size,
            description,
            relate_menu,
            relate_ingredients,
            get_months,
            photo  // OPTIONAL (base64)
        } = fields;

        if (!name || !prices || !category, !size, !description, !relate_menu, !relate_ingredients, !get_months) {
            res.writeHead(400, { "Content-Type": "application/json" });
            return res.end(
                JSON.stringify({ message: "လိုအပ်ချက်များ မပြည့်စုံပါ" })
            );
        }

        if (!id) {
            res.writeHead(400, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ message: "Menu ID is required" }));
        }

        // === 1. Get existing menu to know old photo name ===
        db.query(
            "SELECT photo FROM menu WHERE id = ?",
            [id],
            (err, result) => {
                if (err || result.length === 0) {
                    res.writeHead(404, { "Content-Type": "application/json" });
                    return res.end(JSON.stringify({ message: "Menu not found" }));
                }

                let oldPhoto = result[0].photo;
                let newPhotoName = oldPhoto;

                // === 2. If new Base64 photo included → decode + replace ===
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
                        if (oldPhoto) {
                            const oldPath = path.join(UPLOAD_DIR, oldPhoto);
                            if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
                        }
                    }
                } catch (e) {
                    res.writeHead(400, { "Content-Type": "application/json" });
                    return res.end(JSON.stringify({ message: "Invalid base64 format", e }));
                }

                // === 3. JSON fields ===
                const relateMenuJson = Array.isArray(relate_menu)
                    ? JSON.stringify(relate_menu)
                    : null;

                const relateIngredientsJson = Array.isArray(relate_ingredients)
                    ? JSON.stringify(relate_ingredients)
                    : null;

                const monthsJson = Array.isArray(get_months)
                    ? JSON.stringify(get_months)
                    : null;

                // === 4. Update DB ===
                const sql = `
                    UPDATE menu SET
                        name = ?, prices = ?, category = ?, photo = ?,
                        size = ?, description = ?, relate_menu = ?, relate_ingredients = ?, get_months = ?
                    WHERE id = ?
                `;

                const values = [
                    name || null,
                    prices || null,
                    category || null,
                    newPhotoName,
                    size || null,
                    description || null,
                    relateMenuJson,
                    relateIngredientsJson,
                    monthsJson,
                    id,
                ];

                db.query(sql, values, (err, result) => {
                    if (err) {
                        res.writeHead(500, { "Content-Type": "application/json" });
                        return res.end(JSON.stringify({ message: "DB update error", err }));
                    }

                    res.writeHead(200, { "Content-Type": "application/json" });
                    res.end(
                        JSON.stringify({
                            message: "Menu ကို အောင်မြင်စွာ ပြင်ဆင်ပြီးပါပြီ",
                            id,
                        })
                    );
                });
            }
        );
    });
}

function deleteMenu(req, res, id) {
    if (!id) {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ message: "Menu ID is required" }));
    }

    // 1. Find old photo first
    db.query(
        "SELECT photo FROM menu WHERE id = ?",
        [id],
        (err, result) => {
            if (err || result.length === 0) {
                res.writeHead(404, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({ message: "Menu not found" }));
            }

            const photoName = result[0].photo;

            // 2. Delete DB row
            db.query("DELETE FROM menu WHERE id = ?", [id], (err2) => {
                if (err2) {
                    res.writeHead(500, { "Content-Type": "application/json" });
                    return res.end(JSON.stringify({ message: "Delete failed", err2 }));
                }

                // 3. Delete photo file
                const photoPath = path.join(UPLOAD_DIR, photoName);
                if (fs.existsSync(photoPath)) fs.unlinkSync(photoPath);

                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(
                    JSON.stringify({
                        message: "Menu ကို အောင်မြင်စွာ ဖျက်ပြီးပါပြီ",
                        id,
                    })
                );
            });
        }
    );
}

function getMenuByShopId(req, res, shopId) {
  // 1. Get shop information
  const shopSql = `
    SELECT shop_name, shopkeeper_name, photo, phone, address, location 
    FROM shops 
    WHERE id = ?
  `;

  db.query(shopSql, [shopId], (err, shopResult) => {
    if (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ message: "Shop fetch error" }));
    }

    if (!shopResult || shopResult.length === 0) {
      res.writeHead(404, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ message: "Shop မရှိသေးပါ" }));
    }

    const shopInfo = shopResult[0];

    // 2. Get all categories (for mapping category name)
    const categoriesSql = `SELECT id, name FROM categories`;

    db.query(categoriesSql, (err, categories) => {
      if (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ message: "Category fetch error" }));
      }

      const categoryMap = {};
      categories.forEach((c) => (categoryMap[c.id] = c.name));

      // 3. Get all menu from this shop
      const menuSql = `SELECT * FROM menu WHERE shop_id = ? ORDER BY created_at DESC`;

      db.query(menuSql, [shopId], (err, menus) => {
        if (err) {
          res.writeHead(500, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ message: "Menu fetch error" }));
        }

        let processedMenus = new Array(menus.length);
        let pending = menus.length;

        if (pending === 0) {
          res.writeHead(200, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ shop: shopInfo, menus: [] }));
        }

        menus.forEach((menu, index) => {
          // ===== SAFE PARSE RELATIONS =====
          let relateMenuIds = [];
          let relateIngredientsIds = [];

          if (Array.isArray(menu.relate_menu)) {
            relateMenuIds = menu.relate_menu;
          } else if (typeof menu.relate_menu === "string") {
            try {
              relateMenuIds = JSON.parse(menu.relate_menu);
            } catch {
              relateMenuIds = [];
            }
          }

          if (Array.isArray(menu.relate_ingredients)) {
            relateIngredientsIds = menu.relate_ingredients;
          } else if (typeof menu.relate_ingredients === "string") {
            try {
              relateIngredientsIds = JSON.parse(menu.relate_ingredients);
            } catch {
              relateIngredientsIds = [];
            }
          }

          // 4. Fetch related menus
          const fetchRelateMenu = new Promise((resolve) => {
            if (relateMenuIds.length === 0) return resolve([]);

            const relatedMenuSql = `
              SELECT id, name, prices, size, category, photo
              FROM menu
              WHERE id IN (${relateMenuIds.map(() => "?").join(",")})
            `;

            db.query(relatedMenuSql, relateMenuIds, (err, result) => {
              if (err) return resolve([]);

              resolve(
                result.map((m) => ({
                  id: m.id,
                  name: m.name,
                  prices: m.prices,
                  size: m.size,
                  category: categoryMap[m.category] || m.category,
                  photo: m.photo,
                }))
              );
            });
          });

          // 5. Fetch related ingredients
          const fetchRelateIngredients = new Promise((resolve) => {
            if (relateIngredientsIds.length === 0) return resolve([]);

            const ingredientSql = `
              SELECT id, name, photo, prices
              FROM ingredients
              WHERE id IN (${relateIngredientsIds.map(() => "?").join(",")})
            `;

            db.query(ingredientSql, relateIngredientsIds, (err, result) => {
              if (err) return resolve([]);

              resolve(
                result.map((i) => ({
                  id: i.id,
                  name: i.name,
                  photo: i.photo,
                  prices: i.prices,
                }))
              );
            });
          });

          // 6. Combine all
          Promise.all([fetchRelateMenu, fetchRelateIngredients]).then(
            ([relatedMenus, relatedIngredients]) => {
              processedMenus[index] = {
                id: menu.id,
                shop_id: menu.shop_id,
                name: menu.name,
                prices: menu.prices,
                category_id: menu.category,
                category: categoryMap[menu.category] || menu.category,
                photo: menu.photo,
                size: menu.size,
                description: menu.description,
                complete_order: menu.complete_order,
                rating: menu.rating,
                rating_count: menu.rating_count,
                created_at: menu.created_at,
                get_months:
                  Array.isArray(menu.get_months)
                    ? menu.get_months
                    : typeof menu.get_months === "string"
                    ? JSON.parse(menu.get_months)
                    : ["All months"],
                relate_menu: relatedMenus,
                relate_ingredients: relatedIngredients,
              };

              pending--;
              if (pending === 0) {
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(
                  JSON.stringify({
                    shop: shopInfo,
                    menus: processedMenus,
                  })
                );
              }
            }
          );
        });
      });
    });
  });
}

function getAllShopsWithMenus(req, res) {
  // 1. Get all shopss
  const shopSql = `
    SELECT id, shop_name, shopkeeper_name, photo, phone, address, location
    FROM shops
    ORDER BY id DESC
  `;

  db.query(shopSql, (err, shops) => {
    if (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ message: "Shop fetch error" }));
    }

    if (!shops || shops.length === 0) {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ shops: [] }));
    }

    // 2. Get all categories
    const categoriesSql = `SELECT id, name FROM categories`;

    db.query(categoriesSql, (err, categories) => {
      if (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ message: "Category fetch error" }));
      }

      const categoryMap = {};
      categories.forEach(c => (categoryMap[c.id] = c.name));

      let processedShops = new Array(shops.length);
      let shopPending = shops.length;

      shops.forEach((shop, shopIndex) => {
        // 3. Get menus by shop
        const menuSql = `
          SELECT * FROM menu
          WHERE shop_id = ?
          ORDER BY created_at DESC
        `;

        db.query(menuSql, [shop.id], (err, menus) => {
          if (err) menus = [];

          let processedMenus = new Array(menus.length);
          let menuPending = menus.length;

          if (menuPending === 0) {
            processedShops[shopIndex] = {
              shop,
              menus: []
            };
            shopPending--;
            if (shopPending === 0) sendResponse();
            return;
          }

          menus.forEach((menu, menuIndex) => {
            // ===== SAFE PARSE =====
            let relateMenuIds = [];
            let relateIngredientsIds = [];

            try {
              relateMenuIds = Array.isArray(menu.relate_menu)
                ? menu.relate_menu
                : JSON.parse(menu.relate_menu || "[]");
            } catch {
              relateMenuIds = [];
            }

            try {
              relateIngredientsIds = Array.isArray(menu.relate_ingredients)
                ? menu.relate_ingredients
                : JSON.parse(menu.relate_ingredients || "[]");
            } catch {
              relateIngredientsIds = [];
            }

            // 4. Related menus
            const fetchRelateMenu = new Promise(resolve => {
              if (relateMenuIds.length === 0) return resolve([]);

              const sql = `
                SELECT id, name, prices, size, category, photo
                FROM menu
                WHERE id IN (${relateMenuIds.map(() => "?").join(",")})
              `;

              db.query(sql, relateMenuIds, (err, result) => {
                if (err) return resolve([]);
                resolve(
                  result.map(m => ({
                    id: m.id,
                    name: m.name,
                    prices: m.prices,
                    size: m.size,
                    category: categoryMap[m.category] || m.category,
                    photo: m.photo
                  }))
                );
              });
            });

            // 5. Related ingredients
            const fetchRelateIngredients = new Promise(resolve => {
              if (relateIngredientsIds.length === 0) return resolve([]);

              const sql = `
                SELECT id, name, photo, prices
                FROM ingredients
                WHERE id IN (${relateIngredientsIds.map(() => "?").join(",")})
              `;

              db.query(sql, relateIngredientsIds, (err, result) => {
                if (err) return resolve([]);
                resolve(
                  result.map(i => ({
                    id: i.id,
                    name: i.name,
                    photo: i.photo,
                    prices: i.prices
                  }))
                );
              });
            });

            // 6. Combine menu
            Promise.all([fetchRelateMenu, fetchRelateIngredients]).then(
              ([relatedMenus, relatedIngredients]) => {
                processedMenus[menuIndex] = {
                  id: menu.id,
                  shop_id: menu.shop_id,
                  name: menu.name,
                  prices: menu.prices,
                  category_id: menu.category,
                  category: categoryMap[menu.category] || menu.category,
                  photo: menu.photo,
                  size: menu.size,
                  description: menu.description,
                  complete_order: menu.complete_order,
                  rating: menu.rating,
                  rating_count: menu.rating_count,
                  created_at: menu.created_at,
                  get_months: (() => {
                    try {
                      return Array.isArray(menu.get_months)
                        ? menu.get_months
                        : JSON.parse(menu.get_months || '["All months"]');
                    } catch {
                      return ["All months"];
                    }
                  })(),
                  relate_menu: relatedMenus,
                  relate_ingredients: relatedIngredients
                };

                menuPending--;
                if (menuPending === 0) {
                  processedShops[shopIndex] = {
                    shop,
                    menus: processedMenus
                  };
                  shopPending--;
                  if (shopPending === 0) sendResponse();
                }
              }
            );
          });
        });
      });

      function sendResponse() {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ shops: processedShops }));
      }
    });
  });
}

function countByShopId(req, res, shopId) {
  const ingredientQuery =
    "SELECT COUNT(*) AS ingredientCount FROM ingredients WHERE shop_id = ?";
  const categoryQuery =
    "SELECT COUNT(*) AS categoryCount FROM categories WHERE shop_id = ?";
  const menuQuery =
    "SELECT COUNT(*) AS menusCount FROM menu WHERE shop_id = ?";

  db.query(ingredientQuery, [shopId], (err, ingredientResult) => {
    if (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: err.message }));
    }

    db.query(categoryQuery, [shopId], (err, categoryResult) => {
      if (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: err.message }));
      }

      db.query(menuQuery, [shopId], (err, menuResult) => {
        if (err) {
          res.writeHead(500, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ error: err.message }));
        }

        const response = {
          ingredientCount: ingredientResult[0].ingredientCount,
          categoryCount: categoryResult[0].categoryCount,
          menusCount: menuResult[0].menusCount
        };

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(response));
      });
    });
  });
}

module.exports = { 
    createMenu,
    updateMenu,
    deleteMenu,
    getMenuByShopId,
    countByShopId,
    getAllShopsWithMenus
};