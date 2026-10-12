// Save-for-later service for the web app (roadmap task 5.2 + 5.5 [Web]).
// Backed by `public.saved_items` (20261008_03_cart_enhancements.sql, applied).
// Mirrors Ecommerce-app/src/services/savedItems.js with web-specific field names.
import { supabase } from "../context/SupabaseConfig";
import { upsertCartItem } from "../utils/supabaseCart";

/** Effective selling price for a live product row (discount-expiry aware). */
const getLivePrice = (product) => {
  const mrp = Number(product?.price || 0);
  const disc = Number(product?.discount || 0);
  if (disc <= 0) return mrp;
  if (product?.discount_expiry && new Date(product.discount_expiry) < new Date()) return mrp;
  return mrp - (mrp * disc) / 100;
};

const MISSING_CODES = new Set(["PGRST202", "PGRST205", "42883", "42P01"]);
let warnedMissing = false;

function isMissing(err) {
  return (
    MISSING_CODES.has(err?.code) ||
    String(err?.message || "").toLowerCase().includes("schema cache")
  );
}
function warnOnce(err) {
  if (warnedMissing) return;
  warnedMissing = true;
  console.warn("[savedItems] save-for-later backend not available; hiding section.", err?.message || "");
}

/** DB row → camelCase item matching the web app's cart item shape. */
function fromRow(row) {
  return {
    id: row.product_id + (row.variant_id ? `_var_${row.variant_id}` : ""),
    compound_id: row.product_id + (row.variant_id ? `_var_${row.variant_id}` : ""),
    productId: row.product_id,
    variant_id: row.variant_id || "",
    variant_name: row.variant_name || "",
    selected_variant: row.selected_variant || null,
    quantity: row.quantity,
    title: row.title || "",
    image: row.image || "",
    thumbnail: row.image || "",
    category: row.category || "",
    price: row.price,
    discount: row.discount,
    discountExpiry: row.discount_expiry,
    savedAt: row.saved_at,
  };
}

/** Load all saved items for the signed-in user. Returns [] gracefully if backend missing. */
export async function listSavedItems() {
  const { data, error } = await supabase
    .from("saved_items")
    .select("*")
    .order("saved_at", { ascending: false });
  if (error) {
    if (isMissing(error)) { warnOnce(error); return []; }
    throw new Error(error.message || "Could not load saved items.");
  }
  return (data || []).map(fromRow);
}

/**
 * Move a cart item to saved-for-later.
 * @param {object} cartItem  — the Redux cart item
 * @param {string} uid       — auth user id
 * @param {function} deleteCartFn — (item) => void, Redux + DB removal
 */
export async function saveForLater(cartItem, uid, deleteCartFn) {
  const productId = cartItem.productId || String(cartItem.id || "").split("_var_")[0];
  const variantId = cartItem.variant_id || "";

  const row = {
    product_id: productId,
    variant_id: variantId,
    variant_name: cartItem.variant_name || "",
    selected_variant: cartItem.selected_variant || null,
    quantity: cartItem.quantity || 1,
    title: cartItem.title || "",
    image: cartItem.thumbnail || cartItem.image || "",
    category: cartItem.category || "",
    price: cartItem.price || 0,
    discount: cartItem.discount || 0,
    discount_expiry: cartItem.discountExpiry || null,
  };

  const { error } = await supabase.from("saved_items").upsert(row, {
    onConflict: "user_id,product_id,variant_id",
    ignoreDuplicates: false,
  });
  if (error) {
    if (isMissing(error)) { warnOnce(error); throw new Error("Save for later isn't available right now."); }
    throw new Error(error.message || "Could not save item for later.");
  }

  // Remove from cart
  deleteCartFn(cartItem);
}

/**
 * Move a saved item back to the cart. Clamps to live stock.
 * @returns {{ clamped: boolean, clampedTo?: number }}
 */
export async function moveSavedToCart(savedItem, uid) {
  // Fetch live product to check stock + current price
  const { data: product } = await supabase
    .from("products")
    .select("id,stock,price,discount,discount_expiry")
    .eq("id", savedItem.productId)
    .maybeSingle();

  const liveStock = product ? Number(product.stock || 0) : null;
  if (liveStock !== null && liveStock === 0) {
    throw new Error(`${savedItem.title || "This item"} is out of stock.`);
  }
  const qty = liveStock !== null ? Math.min(savedItem.quantity, liveStock) : savedItem.quantity;

  const livePrice = product ? getLivePrice(product) : savedItem.price;
  const liveDiscount = product ? (product.discount || 0) : savedItem.discount;
  const liveExpiry = product ? (product.discount_expiry || null) : savedItem.discountExpiry;

  await upsertCartItem(uid, {
    productId: savedItem.productId,
    variantId: savedItem.variant_id,
    variant_name: savedItem.variant_name,
    selected_variant: savedItem.selected_variant,
    title: savedItem.title,
    image: savedItem.image || savedItem.thumbnail,
    category: savedItem.category,
    price: livePrice,
    discount: liveDiscount,
    discountExpiry: liveExpiry,
  }, qty);

  // Remove from saved_items
  const { error } = await supabase
    .from("saved_items")
    .delete()
    .eq("product_id", savedItem.productId)
    .eq("variant_id", savedItem.variant_id);
  if (error && !isMissing(error)) throw new Error(error.message || "Could not move item to cart.");

  return { clamped: liveStock !== null && qty < savedItem.quantity, clampedTo: qty };
}

/** Remove a saved item without adding to cart. */
export async function removeSavedItem(savedItem) {
  const { error } = await supabase
    .from("saved_items")
    .delete()
    .eq("product_id", savedItem.productId)
    .eq("variant_id", savedItem.variant_id);
  if (error && !isMissing(error)) throw new Error(error.message || "Could not remove saved item.");
}

/** List available (listed, non-expired) coupons via the RPC. */
export async function listAvailableCoupons() {
  const { data, error } = await supabase.rpc("list_available_coupons");
  if (error) {
    if (isMissing(error)) { warnOnce(error); return []; }
    throw new Error(error.message || "Could not load coupons.");
  }
  return data || [];
}

/**
 * Human-readable coupon description.
 * { code, type:'percent'|'flat', value, expiry_date }
 */
export function describeCoupon(coupon) {
  if (!coupon) return "";
  const val = coupon.type === "percent" ? `${coupon.value}% off` : `\u20b9${coupon.value} off`;
  const expiry = coupon.expiry_date
    ? ` \u00b7 Valid till ${new Date(coupon.expiry_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`
    : "";
  return `${val}${expiry}`;
}
