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
            description,
            relate_menu,
            relate_ingredients,
            get_months,
            photo,
        } = fields;

        if (!shop_id || !name || !prices || !category || !photo) {
            res.writeHead(400, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ message: "လိုအပ်ချက်များ မပြည့်စုံပါ" }));
        }

        // ✅ FIX prices
        let pricesJson;
        try {
            const parsed = typeof prices === "string" ? JSON.parse(prices) : prices;
            if (!Array.isArray(parsed)) throw new Error();

            pricesJson = JSON.stringify(
                parsed.map(p => ({
                    size: p.size,
                    price: Number(p.price)
                }))
            );
        } catch (e) {
            res.writeHead(400, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ message: "Invalid prices JSON" }));
        }

        generateMenuId(db, shop_id, (err, newId) => {
            if (err) {
                res.writeHead(500, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({ message: "ID generation failed" }));
            }

            let photoName = null;

            try {
                if (fields.photo && fields.photo.startsWith("data:image")) {
                    const base64Data = fields.photo.replace(/^data:image\/\w+;base64,/, "");
                    const ext = fields.photo.substring(
                        "data:image/".length,
                        fields.photo.indexOf(";base64")
                    );

                    photoName = generatePhotoName(newId, `photo.${ext}`);

                    fs.writeFileSync(
                        path.join(UPLOAD_DIR, photoName),
                        Buffer.from(base64Data, "base64")
                    );
                } else {
                    return res.end(JSON.stringify({ message: "Invalid base64 photo" }));
                }
            } catch (e) {
                return res.end(JSON.stringify({ message: "Invalid base64 format" }));
            }

            const relateMenuJson = Array.isArray(relate_menu)
                ? JSON.stringify(relate_menu)
                : null;

            const relateIngredientsJson = Array.isArray(relate_ingredients)
                ? JSON.stringify(relate_ingredients)
                : null;

            const monthJson = Array.isArray(get_months)
                ? JSON.stringify(get_months)
                : JSON.stringify(["All months"]);

            const sql = `
                INSERT INTO menu (
                    id, shop_id, name, prices, category, photo,
                    description, relate_menu, relate_ingredients, get_months
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;

            const values = [
                newId,
                shop_id,
                name,
                pricesJson,
                category,
                photoName,
                description || null,
                relateMenuJson,
                relateIngredientsJson,
                monthJson,
            ];

            db.query(sql, values, (err) => {
                if (err) {
                    return res.end(JSON.stringify({ message: "DB error", err }));
                }
                res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
                res.end(JSON.stringify({
                    message: "Menu ကို အောင်မြင်စွာ အသစ်ထည့်သွင်း ပြီးပါပြီ",
                    id: newId,
                }));
            });
        });
    });
}

function updateMenu(req, res, id) {
    const form = new formidable.IncomingForm({
        multiples: false,
        maxFileSize: 50 * 1024 * 1024,
    });

    form.parse(req, (err, fields) => {
        if (err) {
            return res.end(JSON.stringify({ message: "Form parse failed", err }));
        }

        const {
            name,
            prices,
            category,
            description,
            relate_menu,
            relate_ingredients,
            get_months,
            photo
        } = fields;

        if (!id) {
            return res.end(JSON.stringify({ message: "Menu ID is required" }));
        }

        // ✅ FIX prices
        let pricesJson;
        try {
            const parsed = typeof prices === "string" ? JSON.parse(prices) : prices;
            pricesJson = JSON.stringify(parsed.map(p => ({
                size: p.size,
                price: Number(p.price)
            })));
        } catch {
            return res.end(JSON.stringify({ message: "Invalid prices JSON" }));
        }

        db.query("SELECT photo FROM menu WHERE id = ?", [id], (err, result) => {
            if (err || result.length === 0) {
                return res.end(JSON.stringify({ message: "Menu not found" }));
            }

            let oldPhoto = result[0].photo;
            let newPhotoName = oldPhoto;

            try {
              if (photo && photo.startsWith("data:image")) {

                  const matches = photo.match(/^data:(.+);base64,(.+)$/);
                  if (!matches) {
                      return res.end(JSON.stringify({ message: "Invalid base64 format" }));
                  }

                  const mimeType = matches[1];
                  const base64Data = matches[2];
                  const ext = mimeType.split("/")[1].replace("jpeg", "jpg");

                  const photoName = generatePhotoName(id, `photo.${ext}`);

                  fs.writeFileSync(
                      path.join(UPLOAD_DIR, photoName),
                      Buffer.from(base64Data, "base64")
                  );

                  if (oldPhoto && fs.existsSync(path.join(UPLOAD_DIR, oldPhoto))) {
                      fs.unlinkSync(path.join(UPLOAD_DIR, oldPhoto));
                  }

                  newPhotoName = photoName;
              }

                // 🔥 FORCE FIX OLD DATA
                else if (oldPhoto && !path.extname(oldPhoto)) {

                  const possibleExts = [".jpg", ".png", ".jpeg", ".webp"];
                  let found = false;

                  for (let ext of possibleExts) {
                      const testPath = path.join(UPLOAD_DIR, oldPhoto + ext);

                      if (fs.existsSync(testPath)) {
                          newPhotoName = oldPhoto + ext;
                          found = true;
                          break;
                      }
                  }

                  // 🔥 if not found → default to .jpg
                  if (!found) {
                      newPhotoName = oldPhoto + ".jpg";
                  }
              }
            } catch (e) {
                console.log("PHOTO ERROR:", e.message);
                return res.end(JSON.stringify({ message: "Photo processing failed" }));
            }

            const sql = `
                UPDATE menu SET
                    name=?, prices=?, category=?, photo=?,
                    description=?, relate_menu=?, relate_ingredients=?, get_months=?
                WHERE id=?
            `;

            db.query(sql, [
                name || null,
                pricesJson,
                category || null,
                newPhotoName,
                description || null,
                Array.isArray(relate_menu) ? JSON.stringify(relate_menu) : null,
                Array.isArray(relate_ingredients) ? JSON.stringify(relate_ingredients) : null,
                Array.isArray(get_months) ? JSON.stringify(get_months) : null,
                id
            ], (err) => {
                if (err) {
                    return res.end(JSON.stringify({ message: "DB update error", err }));
                }

                res.end(JSON.stringify({
                    message: "Menu ကို အောင်မြင်စွာ ပြင်ဆင် ပြီးပါပြီ",
                    photo: newPhotoName
                }));
            });
        });
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
  const shopSql = `
    SELECT shop_name, shopkeeper_name, photo, phone, address, payment_name, payment_phone, payment_method, have_deliverymen, deli_fees_method, open_shop, location 
    FROM shops 
    WHERE id = ?
  `;

  db.query(shopSql, [shopId], (err, shopResult) => {
    if (err) {
      return res.end(JSON.stringify({ message: "Shop fetch error" }));
    }

    if (!shopResult || shopResult.length === 0) {
      res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
      return res.end(JSON.stringify({ message: "Shop မရှိသေးပါ" }));
    }

    const shopInfo = shopResult[0];

    const categoriesSql = `SELECT id, name FROM categories`;

    db.query(categoriesSql, (err, categories) => {
      if (err) {
        res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
        return res.end(JSON.stringify({ message: "Category fetch error" }));
      }

      const categoryMap = {};
      categories.forEach((c) => (categoryMap[c.id] = c.name));

      const menuSql = `SELECT * FROM menu WHERE shop_id = ? ORDER BY created_at DESC`;

      db.query(menuSql, [shopId], (err, menus) => {
        if (err) {
          res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
          return res.end(JSON.stringify({ message: "Menu fetch error" }));
        }

        let processedMenus = new Array(menus.length);
        let pending = menus.length;

        if (pending === 0) {
          res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
          return res.end(JSON.stringify({ shop: shopInfo, menus: [] }));
        }

        menus.forEach((menu, index) => {
          let relateMenuIds = [];
          let relateIngredientsIds = [];

          try {
            relateMenuIds = Array.isArray(menu.relate_menu)
              ? menu.relate_menu
              : JSON.parse(menu.relate_menu || "[]");
          } catch {}

          try {
            relateIngredientsIds = Array.isArray(menu.relate_ingredients)
              ? menu.relate_ingredients
              : JSON.parse(menu.relate_ingredients || "[]");
          } catch {}

          const fetchRelateMenu = new Promise((resolve) => {
            if (relateMenuIds.length === 0) return resolve([]);

            const sql = `
              SELECT id, name, prices, category, photo
              FROM menu
              WHERE id IN (${relateMenuIds.map(() => "?").join(",")})
            `;

            db.query(sql, relateMenuIds, (err, result) => {
              if (err) return resolve([]);

              resolve(
                result.map((m) => ({
                  id: m.id,
                  name: m.name,
                  prices: m.prices,
                  category: categoryMap[m.category] || m.category,
                  photo: m.photo,
                }))
              );
            });
          });

          const fetchRelateIngredients = new Promise((resolve) => {
            if (relateIngredientsIds.length === 0) return resolve([]);

            const sql = `
              SELECT id, name, photo, prices
              FROM ingredients
              WHERE id IN (${relateIngredientsIds.map(() => "?").join(",")})
            `;

            db.query(sql, relateIngredientsIds, (err, result) => {
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

          Promise.all([fetchRelateMenu, fetchRelateIngredients]).then(
            ([relatedMenus, relatedIngredients]) => {
              processedMenus[index] = {
                id: menu.id,
                shop_id: menu.shop_id,
                name: menu.name,
                prices: typeof menu.prices === "string"
                  ? JSON.parse(menu.prices)
                  : menu.prices,
                category_id: menu.category,
                category: categoryMap[menu.category] || menu.category,
                photo: menu.photo,
                description: menu.description,
                complete_order: menu.complete_order,
                rating: menu.rating,
                rating_count: menu.rating_count,
                open_menu: menu.open_menu,
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
                relate_ingredients: relatedIngredients,
              };

              pending--;
              if (pending === 0) {
                res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
                res.end(JSON.stringify({
                  shop: shopInfo,
                  menus: processedMenus,
                }));
              }
            }
          );
        });
      });
    });
  });
}

function getAllShopsWithMenus(req, res) {
  const shopSql = `
    SELECT id, shop_name, shopkeeper_name, photo, phone, address, payment_name, payment_phone, payment_method, have_deliverymen, deli_fees_method, open_shop, location
    FROM shops WHERE permission = 'approved'
    ORDER BY id DESC
  `;

  db.query(shopSql, (err, shops) => {
    if (err) {
      res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      return res.end(JSON.stringify({ message: "Shop fetch error" }));
    }

    if (!shops || shops.length === 0) {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      return res.end(JSON.stringify({ shops: [] }));
    }

    const categoriesSql = `SELECT id, name FROM categories`;

    db.query(categoriesSql, (err, categories) => {
      if (err) {
        res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
        return res.end(JSON.stringify({ message: "Category fetch error" }));
      }

      const categoryMap = {};
      categories.forEach(c => (categoryMap[c.id] = c.name));

      let processedShops = new Array(shops.length);
      let shopPending = shops.length;

      shops.forEach((shop, shopIndex) => {
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
            processedShops[shopIndex] = { shop, menus: [] };
            shopPending--;
            if (shopPending === 0) sendResponse();
            return;
          }

          menus.forEach((menu, menuIndex) => {
            let relateMenuIds = [];
            let relateIngredientsIds = [];

            try {
              relateMenuIds = Array.isArray(menu.relate_menu)
                ? menu.relate_menu
                : JSON.parse(menu.relate_menu || "[]");
            } catch {}

            try {
              relateIngredientsIds = Array.isArray(menu.relate_ingredients)
                ? menu.relate_ingredients
                : JSON.parse(menu.relate_ingredients || "[]");
            } catch {}

            const fetchRelateMenu = new Promise(resolve => {
              if (relateMenuIds.length === 0) return resolve([]);

              const sql = `
                SELECT id, name, prices, category, photo
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
                    category: categoryMap[m.category] || m.category,
                    photo: m.photo
                  }))
                );
              });
            });

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

            Promise.all([fetchRelateMenu, fetchRelateIngredients]).then(
              ([relatedMenus, relatedIngredients]) => {
                processedMenus[menuIndex] = {
                  id: menu.id,
                  shop_id: menu.shop_id,
                  shop_name: shop.shop_name,
                  name: menu.name,
                  prices: typeof menu.prices === "string"
                    ? JSON.parse(menu.prices)
                    : menu.prices,
                  category_id: menu.category,
                  category: categoryMap[menu.category] || menu.category,
                  photo: menu.photo,
                  description: menu.description,
                  complete_order: menu.complete_order,
                  rating: menu.rating,
                  rating_count: menu.rating_count,
                  open_shop: shop.open_shop,
                  open_menu: menu.open_menu,
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
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
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

function openMenu(req, res, id) {

  if (!id) {
    res.writeHead(400, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "Menu ID is required" }));
  }

  const query = `
    UPDATE menu
    SET open_menu = 1
    WHERE id = ?
  `;

  db.query(query, [id], (err, result) => {
    if (err) {
      console.error("Database error:", err);
      res.writeHead(500, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "Database error" }));
    }

    if (result.affectedRows === 0) {
      res.writeHead(404, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "Menu not found" }));
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      success: true,
      message: "Menu ဖွင့်လှစ်လိုက်ပါပြီ",
      deliveryman_id: id
    }));
  });
}

function offMenu(req, res, id) {

  if (!id) {
    res.writeHead(400, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "Menu ID is required" }));
  }

  const query = `
    UPDATE menu
    SET open_menu = 0
    WHERE id = ?
  `;

  db.query(query, [id], (err, result) => {
    if (err) {
      console.error("Database error:", err);
      res.writeHead(500, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "Database error" }));
    }

    if (result.affectedRows === 0) {
      res.writeHead(404, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "Menu not found" }));
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      success: true,
      message: "Menu ပိတ်လိုက်ပါပြီ",
      deliveryman_id: id
    }));
  });
}

module.exports = { 
    createMenu,
    updateMenu,
    deleteMenu,
    getMenuByShopId,
    countByShopId,
    getAllShopsWithMenus,
    openMenu,
    offMenu
};