const { verifyJWT } = require("../utils/jwtToken");

/*
|--------------------------------------------------------------------------
| Common
|--------------------------------------------------------------------------
*/

function deny(res, code, message) {
  res.writeHead(code, {
    "Content-Type": "application/json",
  });

  res.end(JSON.stringify({
    message
  }));

  return false;
}

async function authenticate(req, res) {
  try {
    const auth = await verifyJWT(req);

    req.user = auth;

    return auth;
  } catch (err) {

    deny(
      res,
      err.status || 401,
      err.message || "Unauthorized"
    );

    return false;
  }
}

/*
|--------------------------------------------------------------------------
| Any Logged In Account
|--------------------------------------------------------------------------
*/

async function auth(req, res) {

  return await authenticate(req, res);

}

/*
|--------------------------------------------------------------------------
| Admin / User / Shop / Deliverymen
|--------------------------------------------------------------------------
*/

async function authAdmin(req, res) {

  const user = await authenticate(req, res);

  if (!user) return false;

  if (user.type !== "admin") {

    return deny(res, 403, "Admin only");

  }

  return true;

}

async function authUser(req, res) {

  const user = await authenticate(req, res);

  if (!user) return false;

  if (user.type !== "user") {

    return deny(res, 403, "User only");

  }

  return true;

}

async function authShop(req, res) {

  const user = await authenticate(req, res);

  if (!user) return false;

  if (user.type !== "shop") {

    return deny(res, 403, "Shop only");

  }

  return true;

}

async function authDeliverymen(req, res) {

  const user = await authenticate(req, res);

  if (!user) return false;

  if (user.type !== "deliverymen") {

    return deny(res, 403, "Deliverymen only");

  }

  return true;

}

/*
|--------------------------------------------------------------------------
| Owner
|--------------------------------------------------------------------------
*/

async function authOwner(req, res) {

  const user = await authenticate(req, res);

  if (!user) return false;

  if (user.type !== "admin") {

    return deny(res, 403, "Admin only");

  }

  if (user.role !== "owner") {

    return deny(res, 403, "Owner only");

  }

  return true;

}

/*
|--------------------------------------------------------------------------
| Owner + Manager
|--------------------------------------------------------------------------
*/

async function authOwnerManager(req, res) {

  const user = await authenticate(req, res);

  if (!user) return false;

  if (user.type !== "admin") {

    return deny(res, 403, "Admin only");

  }

  if (!["owner", "manager"].includes(user.role)) {

    return deny(res, 403, "Owner / Manager only");

  }

  return true;

}

/*
|--------------------------------------------------------------------------
| Owner + Manager + ShopManager
|--------------------------------------------------------------------------
*/

async function authShopAdmin(req, res) {

  const user = await authenticate(req, res);

  if (!user) return false;

  if (user.type !== "admin") {

    return deny(res, 403, "Admin only");

  }

  if (!["owner", "manager", "shopmanager"].includes(user.role)) {

    return deny(res, 403, "Permission denied");

  }

  return true;

}

/*
|--------------------------------------------------------------------------
| Owner + Manager + DeliveryManager
|--------------------------------------------------------------------------
*/

async function authDeliveryAdmin(req, res) {

  const user = await authenticate(req, res);

  if (!user) return false;

  if (user.type !== "admin") {

    return deny(res, 403, "Admin only");

  }

  if (!["owner", "manager", "delimanager"].includes(user.role)) {

    return deny(res, 403, "Permission denied");

  }

  return true;

}

/*
|--------------------------------------------------------------------------
| Self ID
|--------------------------------------------------------------------------
*/

async function authUserId(req, res, id = null, isUserOnly) {

  const user = await authenticate(req, res);

  if (!user) return false;

  const isRegularUser = user.type === "user";
  const isAllowedAdmin = user.type === "admin" && (user.role === "owner" || user.role === "manager") && !isUserOnly;

  if (!isRegularUser && !isAllowedAdmin) {
    return deny(res, 403, "Access denied. Only regular users, or admins who are owners/managers, are allowed.");
  }

  if (isRegularUser){
    if (user.userId !== id) {

      return deny(res, 403, "Access denied");

    }
  }

  return true;

}

async function authShopId(req, res, id) {

  const user = await authenticate(req, res);

  if (!user) return false;

  if (user.type !== "shop") {

    return deny(res, 403, "Shop only");

  }

  if (user.userId !== id) {

    return deny(res, 403, "Access denied");

  }

  return true;

}

async function authDeliverymenId(req, res, id) {

  const user = await authenticate(req, res);

  if (!user) return false;

  if (user.type !== "deliverymen") {

    return deny(res, 403, "Deliverymen only");

  }

  if (user.userId !== id) {

    return deny(res, 403, "Access denied");

  }

  return true;

}

async function authAdminId(req, res, id) {

  const user = await authenticate(req, res);

  if (!user) return false;

  if (user.type !== "admin") {

    return deny(res, 403, "Admin only");

  }

  if(user.role !== "owner"){
    if (user.userId !== id) {

      return deny(res, 403, "Access denied");

    }
  }

  return true;

}

/*
|--------------------------------------------------------------------------
| Helper
|--------------------------------------------------------------------------
*/

function isAdmin(user) {

  return user.type === "admin";

}

function isOwner(user) {

  return user.type === "admin" && user.role === "owner";

}

module.exports = {

  auth,

  authAdmin,
  authUser,
  authShop,
  authDeliverymen,

  authAdminId,
  authUserId,
  authShopId,
  authDeliverymenId,

  authOwner,
  authOwnerManager,
  authShopAdmin,
  authDeliveryAdmin,

  isAdmin,
  isOwner,

};