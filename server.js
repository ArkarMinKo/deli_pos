const http = require("http");
const url = require("url");
const fs = require("fs");
const path = require("path");
const db = require("./db");

// Routes
const users = require("./routes/users");
const emails = require("./routes/emials");
const shops = require("./routes/shops");
const deliverymen = require("./routes/deliverymen");
const categories = require("./routes/categories");
const ingredients = require("./routes/ingredients");
const menu = require("./routes/menu");
const admin = require("./routes/admin");
const order = require("./routes/orders");
const mobileNoti = require('./routes/mobileNotification');
const dashboard = require('./routes/dashboard');
const announce = require('./routes/announcement');
const auth = require('./middlewares/auth');

// Upload folders
const UPLOAD_DIR = path.join(__dirname, "uploads");
const INGREDIENTS_UPLOAD_DIR = path.join(__dirname, "ingredients_uploads");
const MENU_UPLOAD_DIR = path.join(__dirname, "menu_uploads");
const SHOP_UPLOAD_DIR = path.join(__dirname, "shop_uploads");
const DELIVERYMEN_UPLOAD_DIR = path.join(__dirname, "deliverymen_uploads");
const ADMIN_UPLOAD_DIR = path.join(__dirname, "admin_uploads");
const ORDER_UPLOAD_DIR = path.join(__dirname, "orders_uploads");
const ANNOUNCE_UPLOAD_DIR = path.join(__dirname, "announce_uploads");

// Create upload folders
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(INGREDIENTS_UPLOAD_DIR, { recursive: true });
fs.mkdirSync(MENU_UPLOAD_DIR, { recursive: true });
fs.mkdirSync(SHOP_UPLOAD_DIR, { recursive: true });
fs.mkdirSync(DELIVERYMEN_UPLOAD_DIR, { recursive: true });
fs.mkdirSync(ADMIN_UPLOAD_DIR, { recursive: true });
fs.mkdirSync(ORDER_UPLOAD_DIR, { recursive: true });
fs.mkdirSync(ANNOUNCE_UPLOAD_DIR, { recursive: true });

/* ------------------------------------
      UNIVERSAL STATIC SERVE FUNCTION
--------------------------------------*/
function serveStaticFolder(reqPath, res, urlPrefix, folderPath) {
  if (!reqPath.startsWith(urlPrefix)) return false;

  const fileName = reqPath.replace(urlPrefix, "");
  const safePath = path.join(folderPath, fileName);

  fs.readFile(safePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      return res.end("File not found");
    }

    const ext = path.extname(safePath).toLowerCase();
    const mimeTypes = {
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".gif": "image/gif",
    };

    res.writeHead(200, {
      "Content-Type": mimeTypes[ext] || "application/octet-stream",
    });
    res.end(data);
  });

  return true;
}

// CORS helper
function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

const server = http.createServer(async (req, res) => {
    setCorsHeaders(res);

    if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
    }

    const parsedUrl = url.parse(req.url, true);
    const pathName = parsedUrl.pathname;
    const method = req.method;

    // CALL IMAGE
    if (serveStaticFolder(pathName, res, "/uploads/", UPLOAD_DIR)) return;
    if (serveStaticFolder(pathName, res, "/ingredients-uploads/", INGREDIENTS_UPLOAD_DIR)) return;
    if (serveStaticFolder(pathName, res, "/menu-uploads/", MENU_UPLOAD_DIR)) return;
    if (serveStaticFolder(pathName, res, "/shop-uploads/", SHOP_UPLOAD_DIR)) return;
    if (serveStaticFolder(pathName, res, "/deliverymen-uploads/", DELIVERYMEN_UPLOAD_DIR)) return;
    if (serveStaticFolder(pathName, res, "/admin-uploads/", ADMIN_UPLOAD_DIR)) return;
    if (serveStaticFolder(pathName, res, "/orders-uploads/", ORDER_UPLOAD_DIR)) return;
    if (serveStaticFolder(pathName, res, "/announce-uploads/", ANNOUNCE_UPLOAD_DIR)) return;

    // Users CRUD
    if (pathName === "/login-user" && method === "POST") users.loginUser(req, res);
    else if (pathName === "/users" && method === "POST") users.createUsers(req, res);
    else if (pathName === "/users" && method === "GET") {
        if (!(await auth.authOwnerManager(req, res))) return;
        users.getUsers(req, res);
        return;
    }
    else if (pathName === "/special-users" && method === "GET"){
        if (!(await auth.authOwnerManager(req, res))) return;
        users.getSpecialUsers(req, res);
        return;
    } 

    else if (pathName.startsWith("/get-users-by-id/") && method === "GET") {
        const id = pathName.split("/")[2];
        if (!(await auth.authUserId(req, res, id, false))) return;
        users.getUsersById(req, res, id);
        return
    }

    else if (pathName.startsWith("/userinfo-orders/") && method === "GET") {
        const id = pathName.split("/")[2];
        if (!(await auth.authUserId(req, res, id, true))) return;
        users.userInfoForOrders(req, res, id);
        return;
    }

    else if (pathName.startsWith("/users/") && method === "PUT") {
        const id = pathName.split("/")[2];
        if (!(await auth.authUserId(req, res, id, true))) return;
        users.updateUser(req, res, id, true);
        return;
    }

    else if (pathName.startsWith("/users-location/") && method === "PATCH") {
        const id = pathName.split("/")[2];
        if (!(await auth.authUserId(req, res, id, true))) return;
        users.userLocation(req, res, id);
        return;
    }

    else if (pathName.startsWith("/users/") && method === "DELETE") {
        const id = pathName.split("/")[2];
        if (!(await auth.authUserId(req, res, id, true))) return;
        users.deleteUser(req, res, id);
        return;
    }

    else if (pathName.startsWith("/users/status/") && method === "PATCH") {
        if (!(await auth.authOwnerManager(req, res))) return;
        const id = pathName.split("/")[3];
        users.changeStatus(req, res, id);
        return;
    }
    
    else if (pathName.startsWith("/special-users/") && method === "PATCH") {
        if (!(await auth.authOwnerManager(req, res))) return;
        const id = pathName.split("/")[2];
        users.toMakeSpecial(req, res, id);
        return;
    }

    else if (pathName.startsWith("/non-special-users/") && method === "PATCH") {
        if (!(await auth.authOwnerManager(req, res))) return;
        const id = pathName.split("/")[2];
        users.toMakeNonSpecial(req, res, id);
        return;
    }

    else if (pathName.startsWith("/change-passwords-users/") && method === "PATCH") {
        const id = pathName.split("/")[2];
        if (!(await auth.authUserId(req, res, id, true))) return;
        users.changePasswordByUsers(req, res, id);
        return;
    }

    else if (pathName.startsWith("/change-passwords-with-otp-users/") && method === "PATCH") {
        const id = pathName.split("/")[2];
        if (!(await auth.authUserId(req, res, id, true))) return;
        users.patchUserPasswordWithOTP(req, res, id);
        return;
    }
    // -- email confrimation ---

    else if(pathName === "/request-email-confirmation" && method === "POST"){
        emails.requestEmailConfirmation(req, res);
    }

    else if(pathName === "/verify-email-code" && method === "POST"){
        emails.verifyEmailCodeBeforeCreate(req, res);
    }

    // --- ‌Admin CRUD ---
    else if (pathName === "/login-admin" && method === "POST"){
        admin.loginAdmin(req, res)
    }
    else if (pathName === "/admin" && method === "POST") admin.createAdmin(req, res);
    else if (pathName === "/admin" && method === "GET") {
        if (!(await auth.authOwner(req, res))) return;
        admin.getAdmins(req, res);
        return;
    }
    else if (pathName === "/admin" && method === "PUT") {
        if (!(await auth.authAdmin(req, res))) return;
        admin.updateAdminInfo(req, res);
        return;
    }
    else if (pathName.startsWith("/admin/") && method === "DELETE") {
        if (!(await auth.authOwner(req, res))) return;
        const id = pathName.split("/")[2];
        admin.deleteAdmin(req, res, id);
        return;
    }

    else if (pathName.startsWith("/admin/") && method === "GET") {
        const id = pathName.split("/")[2];
        if (!(await auth.authAdminId(req, res, id))) return;
        admin.getAdminsById(req, res, id);
        return;
    }
    else if (pathName === "/admin/verify-manager-passcode" && method === "POST") {
        if (!(await auth.authOwnerManager(req, res))) return;
        admin.verifyManagerPasscode(req, res);
        return;
    }
    else if (pathName === "/admin/verify-shopmanager-passcode" && method === "POST") {
        if (!(await auth.authShopAdmin(req, res))) return;
        admin.verifyShopManagerPasscode(req, res);
        return;
    }
    else if (pathName === "/admin/verify-delimanager-passcode" && method === "POST") {
        if (!(await auth.authDeliveryAdmin(req, res))) return;
        admin.verifyDeliManagerPasscode(req, res);
        return;
    }
    else if (pathName === "/admin/verify-owner-passcode" && method === "POST") {
        if (!(await auth.authOwner(req, res))) return;
        admin.verifyOwnerPasscode(req, res);
        return;
    }

    else if(pathName === "/admin/password" && method === "PATCH") {
        if (!(await auth.authOwner(req, res))) return;
        admin.updateAdminPassword(req, res);
        return;
    }
    else if(pathName === "/admin/passcode" && method === "PATCH") {
        if (!(await auth.authOwner(req, res))) return;
        admin.updateAdminPasscode(req, res);
        return;
    }

    // --- GET Open Server and deli_fees ---
    else if (pathName === "/open-server" && method === "GET") {
        if (!(await auth.authOwner(req, res))) return;
        admin.getServer(req, res);
        return;
    }

    // --- Post Open Server ---
    else if (pathName === "/open-server" && method === "POST") {
        if (!(await auth.authOwner(req, res))) return;
        admin.openServer(req, res);
        return;
    }

    // --- PATCH deli_fees
    else if (pathName === "/deli-fees" && method === "PATCH") {
        if (!(await auth.authOwner(req, res))) return;
        admin.updateDeliFees(req, res);
        return;
    }

    // Shops CRUD
    else if (pathName === "/login-shop" && method === "POST") {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => shops.loginShop(req, res, body));
        return;
    }
    else if (pathName === "/shops" && method === "POST") shops.createShops(req, res);
    else if (pathName === "/shops" && method === "GET") {
        if (!(await auth.authShopAdmin(req, res))) return;
        shops.getShops(req, res);
        return;
    }
    else if (pathName === "/shops-pending" && method === "GET") {
        if (!(await auth.authShopAdmin(req, res))) return;
        shops.getShopsPending(req, res);
        return;
    }
    else if (pathName === "/shops-approve" && method === "GET") {
        if (!(await auth.authShopAdmin(req, res))) return;
        shops.getShopsApprove(req, res);
        return;
    }

    else if (pathName.startsWith("/shops/") && method === "GET") {
        if (!(await auth.auth(req, res))) return;
        const id = pathName.split("/")[2];
        shops.getShopsById(req, res, id);
        return;
    }

    else if (pathName.startsWith("/shops-deli-open/") && method === "GET") {
        const id = pathName.split("/")[2];
        if (!(await auth.authShopId(req, res, id))) return; 
        shops.getShopDeliOpen(req, res, id);
        return;
    }

    else if (pathName.startsWith("/shops-open/") && method === "GET") {
        const id = pathName.split("/")[2];
        if (!(await auth.authShopId(req, res, id))) return; 
        shops.getShopOpen(req, res, id);
        return;
    }

    else if (pathName.startsWith("/get-sidebar/") && method === "GET") {
        const id = pathName.split("/")[2];
        if (!(await auth.authShopId(req, res, id))) return; 
        shops.getSidebar(req, res, id);
        return;
    }

    else if (pathName.startsWith("/shops/") && method === "PUT") {
        const id = pathName.split("/")[2];
        if (!(await auth.authShopId(req, res, id))) return; 
        shops.updateShop(req, res, id);
        return;
    }

    else if (pathName.startsWith("/shops/") && method === "DELETE") {
        const id = pathName.split("/")[2];
        if (!(await auth.authShopId(req, res, id))) return; 
        shops.deleteShop(req, res, id);
        return;
    }

    else if (pathName.startsWith("/shops/approve/") && method === "PATCH") {
        if (!(await auth.authShopAdmin(req, res))) return;
        const id = pathName.split("/")[3];
        shops.approveShop(req, res, id);
        return;
    }
    else if (pathName.startsWith("/shops/reject/") && method === "PATCH") {
        if (!(await auth.authShopAdmin(req, res))) return;
        const id = pathName.split("/")[3];
        shops.rejectShop(req, res, id);
        return;
    }
    else if (pathName.startsWith("/shops/status/") && method === "PATCH") {
        if (!(await auth.authShopAdmin(req, res))) return;
        const id = pathName.split("/")[3];
        shops.changeStatus(req, res, id);
        return;
    }

    else if (pathName.startsWith("/open-shop/") && method === "PATCH") {
        const id = pathName.split("/")[2];
        if (!(await auth.authShopId(req, res, id))) return; 
        shops.openShop(req, res, id);
        return;
    }

    else if (pathName.startsWith("/off-shop/") && method === "PATCH") {
        const id = pathName.split("/")[2];
        if (!(await auth.authShopId(req, res, id))) return; 
        shops.offShop(req, res, id);
        return;
    }

    else if (pathName.startsWith("/change-sidebar/") && method === "PATCH") {
        const id = pathName.split("/")[2];
        if (!(await auth.authShopId(req, res, id))) return; 
        shops.changeSidebar(req, res, id);
        return;
    }

    else if (pathName.startsWith("/open-shop-deli/") && method === "PATCH") {
        const id = pathName.split("/")[2];
        if (!(await auth.authShopId(req, res, id))) return; 
        shops.openShopDeli(req, res, id);
        return;
    }

    else if (pathName.startsWith("/off-shop-deli/") && method === "PATCH") {
        const id = pathName.split("/")[2];
        if (!(await auth.authShopId(req, res, id))) return; 
        shops.offShopDeli(req, res, id);
        return;
    }

    else if (pathName.startsWith("/shops-categories/") && method === "PATCH") {
        const id = pathName.split("/")[2];
        if (!(await auth.authShopId(req, res, id))) return; 
        shops.updateShopsCategories(req, res, id);
        return;
    }

    else if (pathName.startsWith("/update-payments-shops/") && method === "PATCH") {
        const id = pathName.split("/")[2];
        if (!(await auth.authShopId(req, res, id))) return; 
        shops.updatePaymentsByShops(req, res, id);
        return;
    }

    else if (pathName.startsWith("/change-location-shops/") && method === "PATCH") {
        const id = pathName.split("/")[2];
        if (!(await auth.authShopId(req, res, id))) return;
        shops.changeLocation(req, res, id);
        return;
    }

    else if (pathName.startsWith("/get-location-shops/") && method === "GET") {
        const id = pathName.split("/")[2];
        if (!(await auth.authShopId(req, res, id))) return; 
        shops.getLocationByShop(req, res, id);
        return;
    }

    else if (pathName.startsWith("/change-passwords-shops/") && method === "PATCH") {
        const id = pathName.split("/")[2];
        if (!(await auth.authShopId(req, res, id))) return; 
        shops.changePasswordByShops(req, res, id);
        return;
    }

    else if (pathName.startsWith("/change-passwords-with-otp-shops/") && method === "PATCH") {
        const id = pathName.split("/")[2];
        if (!(await auth.authShopId(req, res, id))) return; 
        shops.patchShopPasswordWithOTP(req, res, id);
        return;
    }

    // deliveryMen CRUD
    else if (pathName === "/login-deliverymen" && method === "POST") deliverymen.loginDeliverymen(req, res);
    else if (pathName === "/deliverymen" && method === "POST") deliverymen.createDeliverymen(req, res);
    else if (pathName === "/deliverymen" && method === "GET") {
        if (!(await auth.authDeliveryAdmin(req, res))) return; 
        deliverymen.getAllDeliverymen(req, res);
        return;
    }

    else if (pathName.startsWith("/deliverymen/") && method === "PUT") {
        if (!(await auth.authDeliveryAdmin(req, res))) return; 
        const id = pathName.split("/")[2];
        deliverymen.putDeliverymen(req, res, id);
        return;
    }

    else if (pathName.startsWith("/deliverymen-info/") && method === "PUT") {
        const id = pathName.split("/")[2];
        if (!(await auth.authDeliverymenId(req, res, id))) return; 
        deliverymen.putDeliverymenMobile(req, res, id);
        return;
    }

    else if (pathName.startsWith("/deliverymen-shop/") && method === "POST") {
        const id = pathName.split("/")[2];
        if (!(await auth.authShopId(req, res, id))) return; 
        deliverymen.createDeliverymenForShop(req, res, id);
        return;
    }

    else if (pathName.startsWith("/deliverymen/") && method === "GET") {
        if (!(await auth.auth(req, res))) return; 
        const id = pathName.split("/")[2];
        deliverymen.getDeliverymenById(req, res, id);
        return;
    }

    else if (pathName.startsWith("/deliverymen-shop/") && method === "GET") {
        const id = pathName.split("/")[2];
        if (!(await auth.authShopId(req, res, id))) return; 
        deliverymen.getShopDeliverymen(req, res, id);
        return;
    }

    else if (pathName === "/online-deliverymen" && method === "GET") {
        if (!(await auth.authDeliveryAdmin(req, res))) return; 
        deliverymen.getOnlineDeliverymen(req, res);
        return;
    }

    else if (pathName.startsWith("/online-deliverymen/") && method === "PATCH") {
        const id = pathName.split("/")[2];
        if (!(await auth.authDeliverymenId(req, res, id))) return; 
        deliverymen.onlineDeliverymen(req, res, id);
        return;
    }

    else if (pathName.startsWith("/offline-deliverymen/") && method === "PATCH") {
        const id = pathName.split("/")[2];
        if (!(await auth.authDeliverymenId(req, res, id))) return; 
        deliverymen.offlineDeliverymen(req, res, id);
        return;
    }

    else if (pathName.startsWith("/change-location/") && method === "PATCH") {
        const id = pathName.split("/")[2];
        if (!(await auth.authDeliverymenId(req, res, id))) return; 
        deliverymen.changeLocation(req, res, id);
        return;
    }

    else if (pathName.startsWith("/deliverymen/") && method === "DELETE") {
        if (!(await auth.authDeliveryAdmin(req, res))) return; 
        const id = pathName.split("/")[2];
        deliverymen.deleteDeliverymen(req, res, id);
        return;
    }

    else if (pathName.startsWith("/deliverymen/status/") && method === "PATCH") {
        if (!(await auth.authDeliveryAdmin(req, res))) return;
        const id = pathName.split("/")[3];
        deliverymen.changeStatus(req, res, id);
        return;
    }

    else if (pathName.startsWith("/assign-orders/") && method === "POST") {
        const id = pathName.split("/")[2];
        const isAdmin = await auth.authDeliveryAdmin(req, res);
        const isDeliveryman = await auth.authDeliverymenId(req, res, id);
        if (!isAdmin && !isDeliveryman) {
            return res.status(401).json({ message: "Unauthorized access" });
        }
        deliverymen.addOrdersToDeliverymen(req, res, id);
        return;
    }

    else if (pathName.startsWith("/connected-orders/") && method === "GET") {
        const id = pathName.split("/")[2];
        if (!(await auth.authDeliverymenId(req, res, id))) return; 
        deliverymen.connectedOrders(req, res, id);
        return;
    }

    else if (pathName.startsWith("/connected-orders-special/") && method === "GET") {
        const id = pathName.split("/")[2];
        if (!(await auth.authDeliverymenId(req, res, id))) return; 
        deliverymen.connectedOrdersBySpecialUsers(req, res, id);
        return;
    }

    else if (pathName.startsWith("/connected-orders-non-special/") && method === "GET") {
        const id = pathName.split("/")[2];
        if (!(await auth.authDeliverymenId(req, res, id))) return; 
        deliverymen.connectedOrdersByNonSpecialUsers(req, res, id);
        return;
    }

    else if (pathName.startsWith("/orders-history/") && method === "GET") {
        if (!(await auth.auth(req, res))) return; 
        const id = pathName.split("/")[2];
        deliverymen.ordersHistoryByDeliveryman(req, res, id);
        return;
    }

    else if (pathName.startsWith("/deliverymen-history/") && method === "GET") {
        const id = pathName.split("/")[2];
        if (!(await auth.authDeliverymenId(req, res, id))) return; 
        deliverymen.deliverymenHistory(req, res, id);
        return;
    }

    // categories CRUD
    else if (pathName === "/categories" && method === "POST") {
        categories.createCategories(req, res);
        return;
    }

    else if (pathName.startsWith("/categories/") && method === "GET") {
        const id = pathName.split("/")[2];
        if (!(await auth.authShopId(req, res, id)) && !(await auth.authUser(req, res))) return; 
        categories.getCategoriesByShopId(req, res, id);
        return;
    }

    else if (pathName.startsWith("/categories/") && method === "PUT") {
        const id = pathName.split("/")[2];
        const shopId = id.split("_")[0];
        if (!(await auth.authShopId(req, res, shopId))) return; 
        categories.updateCategories(req, res, id);
        return;
    }

    else if (pathName.startsWith("/categories/") && method === "DELETE") {
        const id = pathName.split("/")[2];
        const shopId = id.split("_")[0];
        if (!(await auth.authShopId(req, res, shopId))) return; 
        categories.deleteCategories(req, res, id);
        return;
    }

    // Ingredients CRUD
    else if (pathName === "/ingredients" && method === "POST") {
        ingredients.createIngredients(req, res);
        return;
    }

    else if (pathName.startsWith("/ingredients/") && method === "GET") {
        const id = pathName.split("/")[2];
        if (!(await auth.authShopId(req, res, id))) return; 
        ingredients.getIngredientsByShopId(req, res, id);
        return;
    }

    else if (pathName.startsWith("/ingredients/") && method === "PUT") {
        const id = pathName.split("/")[2];
        const shopId = id.split("_")[0];
        if (!(await auth.authShopId(req, res, shopId))) return; 
        ingredients.updateIngredients(req, res, id);
        return;
    }

    else if (pathName.startsWith("/ingredients/") && method === "DELETE") {
        const id = pathName.split("/")[2];
        const shopId = id.split("_")[0];
        if (!(await auth.authShopId(req, res, shopId))) return; 
        ingredients.deleteIngredients(req, res, id);
        return;
    }

    // menu CRUD
    else if (pathName === "/menu" && method === "POST") {
        menu.createMenu(req, res);
        return;
    }
    else if (pathName === "/menu" && method === "GET") {
        if (!(await auth.auth(req, res))) return;
        menu.getAllShopsWithMenus(req, res);
        return;
    }
    else if (pathName === "/new-menu" && method === "GET") {
        if (!(await auth.auth(req, res))) return;
        menu.newMenu(req, res);
        return;
    }
    else if (pathName === "/popular-menu" && method === "GET") {
        if (!(await auth.auth(req, res))) return;
        menu.popularMenu(req, res);
        return;
    }
    else if (pathName.startsWith("/menu-by-category/") && method === "GET") {
        if (!(await auth.auth(req, res))) return;
        const category = pathName.split("/")[2];
        menu.getAllShopsWithMenusByCategories(req, res, category);
        return;
    }

    else if (pathName.startsWith("/menu/") && method === "GET") {
        if (!(await auth.auth(req, res))) return;
        const id = pathName.split("/")[2];
        menu.getMenuByShopId(req, res, id);
        return;
    }

    else if (pathName.startsWith("/menu/") && method === "PUT") {
        const id = pathName.split("/")[2];
        const shopId = id.split("_")[0];
        if (!(await auth.authShopId(req, res, shopId))) return;
        menu.updateMenu(req, res, id);
        return;
    }

    else if (pathName.startsWith("/menu/") && method === "DELETE") {
        const id = pathName.split("/")[2];
        if (!(await auth.authShopId(req, res, shopId))) return;
        menu.deleteMenu(req, res, id);
        return;
    }

    else if (pathName.startsWith("/menu-count/") && method === "GET") {
        const id = pathName.split("/")[2];
        if (!(await auth.authShopId(req, res, id))) return;
        menu.countByShopId(req, res, id);
        return;
    }

    else if (pathName.startsWith("/open-menu/") && method === "PATCH") {
        const id = pathName.split("/")[2];
        const shopId = id.split("_")[0];
        if (!(await auth.authShopId(req, res, shopId))) return;
        menu.openMenu(req, res, id);
        return;
    }

    else if (pathName.startsWith("/off-menu/") && method === "PATCH") {
        const id = pathName.split("/")[2];
        const shopId = id.split("_")[0];
        if (!(await auth.authShopId(req, res, ShopId))) return;
        menu.offMenu(req, res, id);
        return;
    }

    // Orders CRUD
    else if (pathName === "/orders" && method === "POST") {
        order.postOrder(req, res);
        return;
    }
    else if (pathName === "/orders" && method === "GET") {
        if (!(await auth.authDeliveryAdmin(req, res))) return;
        order.getAllSpecialOrders(req, res);
        return;
    }

    else if (pathName.startsWith("/all-orders/") && method === "GET") {
        const id = pathName.split("/")[2];
        if (!(await auth.authDeliverymenId(req, res, id))) return;
        order.getAllOrders(req, res, id);
        return;
    }

    else if (pathName.startsWith("/orders-by-shop/") && method === "GET") {
        const id = pathName.split("/")[2];
        if (!(await auth.authShopId(req, res, id))) return;
        order.getOrdersByShopId(req, res, id);
        return;
    }

    else if (pathName.startsWith("/orders-by-shop-noti/") && method === "GET") {
        const id = pathName.split("/")[2];
        if (!(await auth.authShopId(req, res, id))) return;
        order.getOrdersByShopId(req, res, id);
        return;
    }

    else if (pathName.startsWith("/orders-by-user/") && method === "GET") {
        const id = pathName.split("/")[2];
        if (!(await auth.authUserId(req, res, id, true))) return;
        order.getOrdersByUserId(req, res, id);
        return;
    }

    else if (pathName.startsWith("/order-by-id/") && method === "GET") {
        if (!(await auth.auth(req, res))) return;
        const id = pathName.split("/")[2];
        order.getOrderByOrderId(req, res, id);
        return;
    }

    else if(pathName.startsWith("/all-approved-orders/") && method === "PATCH") {
        const id = pathName.split("/")[2];
        order.approveAllOrderItems(req, res, id);
        return;
    }

    else if(pathName.startsWith("/pickup-order/") && method === "PATCH") {
        const id = pathName.split("/")[2];
        if (!(await auth.authDeliverymenId(req, res, id))) return;
        order.pickupOrder(req, res, id);
        return;
    }

    else if(pathName.startsWith("/finish-order/") && method === "POST") {
        const id = pathName.split("/")[2];
        if (!(await auth.authDeliverymenId(req, res, id))) return;
        order.finishOrder(req, res, id);
        return;
    }

    else if (pathName === "/connected-orders" && method === "GET") {
        if (!(await auth.authDeliveryAdmin(req, res))) return;
        order.connectedDeliverymen(req, res);
        return;
    }

    else if (pathName === "/orders-confirm" && method === "POST") {
        if (!(await auth.authUser(req, res))) return;
        order.orderConfirm(req, res);
        return;
    }

    // --- Report ---
    else if (pathName === "/report" && method === "GET") {
        if (!(await auth.authOwner(req, res))) return;
        order.getReport(req, res);
        return;
    }

    else if(pathName.startsWith("/report-shops/") && method === "GET") {
        const id = pathName.split("/")[2];
        if (!(await auth.authShopId(req, res, id)) && !(await auth.authOwner)) return;
        order.getReportByShop(req, res, id)
        return;
    }

    else if(pathName.startsWith("/today-orders-by-shop/") && method === "GET") {
        const id = pathName.split("/")[2];
        if (!(await auth.authShopId(req, res, id))) return;
        order.todayOrdersByShop(req, res, id);
        return;
    }

    else if(pathName.startsWith("/report-shops-summaries/") && method === "GET") {
        const id = pathName.split("/")[2];
        if (!(await auth.authShopId(req, res, id))) return;
        order.getReportByShopSummaries(req, res, id);
        return;
    }

    else if(pathName.startsWith("/report-shops-deliverymen-by-shops/") && method === "GET") {
        const id = pathName.split("/")[2];
        if (!(await auth.authShopId(req, res, id))) return;
        deliverymen.getReportShopDeliveymenByShop(req, res, id);
        return;
    }

    else if(pathName.startsWith("/report-system-deliverymen-by-shops/") && method === "GET") {
        const id = pathName.split("/")[2];
        if (!(await auth.authShopId(req, res, id))) return;
        deliverymen.getReportSystemDeliveymenByShop(req, res, id);
        return;
    }

    else if(pathName.startsWith("/clearedOrders-by-shops/") && method === "PATCH") {
        const id = pathName.split("/")[2];
        deliverymen.clearedOrders(req, res, id);
        return;
    }

    // --- Mobile Notification ---
    else if(pathName.startsWith("/mobile-noti/") && method === "GET") {
        const id = pathName.split("/")[2];
        if (!(await auth.authUserId(req, res, id, true))) return;
        mobileNoti.getNotiUser(req, res, id);
        return;
    }

    else if(pathName.startsWith("/mobile-noti/") && method === "PATCH") {
        const id = pathName.split("/")[2];
        mobileNoti.mobileNotiSeen(req, res, id);
        return;
    }

    // --- Dashboard ---

    else if(pathName.startsWith("/dashboard-summaries-by-shops/") && method === "GET") {
        const id = pathName.split("/")[2];
        if (!(await auth.authShopId(req, res, id))) return;
        dashboard.getDashboardSummariesByShop(req, res, id);
        return;
    }

    else if(pathName.startsWith("/report-revenuecharts-by-shops/") && method === "GET") {
        const id = pathName.split("/")[2];
        if (!(await auth.authShopId(req, res, id))) return;
        dashboard.getReportRvenueByShopId(req, res, id);
        return;
    }

    else if(pathName.startsWith("/report-categories-by-shops/") && method === "GET") {
        const id = pathName.split("/")[2];
        if (!(await auth.authShopId(req, res, id))) return;
        dashboard.getReportCategoriesChartByShopId(req, res, id);
        return;
    }

    else if(pathName.startsWith("/top5menu-by-shops/") && method === "GET") {
        const id = pathName.split("/")[2];
        if (!(await auth.authShopId(req, res, id))) return;
        dashboard.top5MenuByShopId(req, res, id);
        return;
    }

    else if(pathName.startsWith("/values-chart-by-shops/") && method === "GET") {
        const id = pathName.split("/")[2];
        if (!(await auth.authShopId(req, res, id))) return;
        dashboard.dashboardOrdersValuesChartByShopId(req, res, id);
        return;
    }

    else if(pathName.startsWith("/top5deliverymen-by-shops/") && method === "GET") {
        const id = pathName.split("/")[2];
        if (!(await auth.authShopId(req, res, id))) return;
        dashboard.top5DeliverymenByShopId(req, res, id);
        return;
    }

    else if(pathName.startsWith("/top5-less-menu-by-shops/") && method === "GET") {
        const id = pathName.split("/")[2];
        if (!(await auth.authShopId(req, res, id))) return;
        dashboard.top5LessMenuByShopId(req, res, id);
        return;
    }

    else if(pathName.startsWith("/top5-customers-by-shops/") && method === "GET") {
        const id = pathName.split("/")[2];
        if (!(await auth.authShopId(req, res, id))) return;
        dashboard.top5CustomerByShopId(req, res, id);
        return;
    }

    else if(pathName.startsWith("/orders-summaries/") && method === "GET") {
        const id = pathName.split("/")[2];
        if (!(await auth.authShopId(req, res, id))) return;
        dashboard.ordersSummaries(req, res, id);
        return;
    }

    else if(pathName.startsWith("/deliveymen-summaries/") && method === "GET") {
        const id = pathName.split("/")[2];
        if (!(await auth.authShopId(req, res, id))) return;
        dashboard.deliverymenSummaries(req, res, id);
        return;
    }

    else if(pathName.startsWith("/payments-chart-shops/") && method === "GET") {
        const id = pathName.split("/")[2];
        if (!(await auth.authShopId(req, res, id))) return;
        dashboard.paymentsChartByShop(req, res, id);
        return;
    }

    else if (pathName === "/dashboard-summaries-by-system" && method === "GET") {
        if (!(await auth.authOwner(req, res))) return;
        dashboard.systemDashboardSummaries(req, res);
        return;
    }
    else if (pathName === "/system-order-chart" && method === "GET") {
        if (!(await auth.authOwner(req, res))) return;
        dashboard.systemOrderChart(req, res);
        return;
    }
    else if (pathName === "/system-menu-branches" && method === "GET") {
        if (!(await auth.authOwner(req, res))) return;
        dashboard.systemShopMenuBranches(req, res);
        return;
    }
    else if (pathName === "/top5deliverymen-by-system" && method === "GET") {
        if (!(await auth.authOwner(req, res))) return;
        dashboard.top5DeliverymenBySystem(req, res);
        return;
    }
    else if (pathName === "/top5customer-by-system" && method === "GET") {
        if (!(await auth.authOwner(req, res))) return;
        dashboard.systemTop5Customers(req, res);
        return;
    }
    else if (pathName === "/top5shops-this-month" && method === "GET") {
        if (!(await auth.authOwner(req, res))) return;
        dashboard.top5ShopsThisMonth(req, res);
        return;
    }
    else if (pathName === "/top5Lessshops-this-month" && method === "GET") {
        if (!(await auth.authOwner(req, res))) return;
        dashboard.top5LessShopThisMonth(req, res);
        return;
    }
    else if (pathName === "/top5menu-this-month" && method === "GET") {
        if (!(await auth.authOwner(req, res))) return;
        dashboard.top5MenuThisMonth(req, res);
        return;
    }
    else if (pathName === "/top5Lessmenu-this-month" && method === "GET") {
        if (!(await auth.authOwner(req, res))) return;
        dashboard.top5LessMenuThisMonth(req, res);
        return;
    }
    else if (pathName === "/shops-summaries-by-system" && method === "GET") {
        if (!(await auth.authShopAdmin(req, res))) return;
        dashboard.shopsSummariesSystem(req, res);
        return;
    }
    else if (pathName === "/deliverymen-summaries-by-system" && method === "GET") {
        if (!(await auth.authDeliveryAdmin(req, res))) return;
        dashboard.systemDeliverymenSummaries(req, res);
        return;
    }
    else if (pathName === "/report-system-summaries" && method === "GET") {
        if (!(await auth.authOwner(req, res))) return;
        dashboard.systemReportSummaries(req, res);
        return;
    }

    // --- Announcements ---
    else if (pathName === "/announcements" && method === "POST") {
        announce.createAnnouncements(req, res);
        return;
    }
    else if (pathName === "/announcements" && method === "GET") {
        announce.getAnnouncement(req, res);
        return;
    }

    // --- 404 fallback ---
    else {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Route not found" }));
    }
})

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});