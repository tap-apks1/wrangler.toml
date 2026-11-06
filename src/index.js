const KITS = [
  {
    id: "style-konser-latar-fog",
    title: "Style Konser Latar+Fogs",
    tier: "FREE",
    price: 0,
    premium_price: 0,
    premium_download: "",
    free_download: "https://raw.githubusercontent.com/tap-apks1/Url_Link_mpdk2/main/mpdk2/konser_final.drumkit"
  },
  {
    id: "茜色の空を越えて",
    title: "茜色の空を越えて",
    premium_price: 10000,
    premium_download: "https://raw.githubusercontent.com/tap-apks1/Url_Link_mpdk2/main/mpdk2/________.drumkit",
    free_download: ""
  },
  {
    id: "Midnight Rockstars 🎸",
    title: "Midnight Rockstars",
    premium_price: 10000,
    premium_download: "https://ts.buzzheavier.com/d/toka9cznoywf?v=BsiTIdunm7X9UYBAoT8zb0waBRcxrLOooJl2D7A2OKO6qMJ7kkH2EhsxHM8sMMqPFu3JhtgQilgeyUDzRSwq9dPsqEroTnnXCU2KGRC_qIyo2B4tE3DoK0Aq5r31GoULcNLJfhaI2EMKHBjpx44Ru0Rlf5Yut340NhNHd1U_zNzEKhsIVr5cFgq0bMV4uHYYvg",
    free_download: ""
  },
  {
    id: "Style Wali Band",
    title: "Style Wali Band",
    premium_price: 10000,
    premium_download: "https://raw.githubusercontent.com/tap-apks1/Url_Link_mpdk2/main/mpdk2/animation_2.drumkit",
    free_download: ""
  },
  {
    id: "Style Pearl Cool (Statis)",
    title: "Style Pearl Blue Cool",
    premium_price: 18000,
    premium_download: "https://github.com/tap-apks1/Url_Link_mpdk2/releases/download/music-v1/animation_23.drumkit",
    free_download: ""
  }
];

const LYNK_CHECKOUT = "http://lynk.id/nexora_games2026/021k4wj857wj/checkout";
const LYNK_PRODUCT_KIT_ID = "Style Pearl Cool (Statis)";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Lynk-Signature"
};

function response(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...cors,
      "Content-Type": "application/json",
      "Cache-Control": "no-store, no-cache, must-revalidate"
    }
  });
}

async function verifyLynkSignature(amount, refId, messageId, receivedSignature, secret) {
  if (!secret || !receivedSignature) return false;
  const raw = amount + refId + messageId + secret;
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(raw)
  );
  const calculated = [...new Uint8Array(hash)]
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
  if (calculated.length !== receivedSignature.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < calculated.length; i++) {
    diff |= calculated.charCodeAt(i) ^ receivedSignature.toLowerCase().charCodeAt(i);
  }
  return diff === 0;
}

// Mencari order pending yang cocok di Cloudflare KV
async function findMatchingPendingOrder(env, customerEmail, kitIdHint) {
  const listRes = await env.PURCHASES.list({ prefix: "order:" });
  const pendingOrders = [];

  for (const keyObj of listRes.keys) {
    const raw = await env.PURCHASES.get(keyObj.name);
    if (!raw) continue;
    try {
      const ord = JSON.parse(raw);
      if (ord && ord.status === "pending") {
        pendingOrders.push(ord);
      }
    } catch {}
  }

  if (pendingOrders.length === 0) return null;

  // Urutkan dari yang terbaru dibuat
  pendingOrders.sort((a, b) => {
    const ta = Date.parse(a.created_at || 0) || 0;
    const tb = Date.parse(b.created_at || 0) || 0;
    return tb - ta;
  });

  // 1. Jika user_id sama dengan email customer Lynk.id
  if (customerEmail) {
    const byEmail = pendingOrders.find(
      o => String(o.user_id || "").toLowerCase() === String(customerEmail).toLowerCase()
    );
    if (byEmail) return byEmail;
  }

  // 2. Jika cocok dengan kitIdHint
  if (kitIdHint) {
    const byKit = pendingOrders.find(o => o.kit_id === kitIdHint);
    if (byKit) return byKit;
  }

  // 3. Ambil order pending terbaru untuk produk Lynk
  return pendingOrders.find(o => o.kit_id === LYNK_PRODUCT_KIT_ID) || pendingOrders[0];
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: cors });
    }

    const url = new URL(request.url);

    if (!env.PURCHASES) {
      return response({ error: "PURCHASES KV binding missing" }, 500);
    }

    // 1. LYNK WEBHOOK (Verifikasi X-Lynk-Signature + Aktifkan Kepemilikan Otomatis)
    if (url.pathname === "/api/lynk-webhook" && request.method === "POST") {
      let body;
      try {
        body = await request.json();
      } catch {
        return response({ error: "Invalid JSON" }, 400);
      }

      if (body?.event !== "payment.received") {
        return response({ success: true, message: "Webhook event received" });
      }

      if (!env.LYNK_MERCHANT_KEY) {
        return response({ error: "LYNK_MERCHANT_KEY configuration missing" }, 500);
      }

      const signature = request.headers.get("X-Lynk-Signature");
      if (!signature) {
        return response({ error: "Missing signature" }, 401);
      }

      const data = body?.data;
      const payment = data?.message_data;
      if (!payment?.refId || !data?.message_id || payment?.totals?.grandTotal == null) {
        return response({ error: "Invalid payment event" }, 400);
      }

      if (String(data.message_action) !== "SUCCESS" || String(data.message_code) !== "0") {
        return response({ error: "Payment not successful" }, 400);
      }

      const amount = String(payment.totals.grandTotal);
      const refId = String(payment.refId);
      const messageId = String(data.message_id);

      const valid = await verifyLynkSignature(
        amount,
        refId,
        messageId,
        signature,
        env.LYNK_MERCHANT_KEY
      );

      if (!valid) {
        return response({ error: "Invalid signature" }, 401);
      }

      const eventKey = `lynk_event:${messageId}`;
      const existingRaw = await env.PURCHASES.get(eventKey);
      if (existingRaw) {
        try {
          const existingEvt = JSON.parse(existingRaw);
          if (existingEvt.matched) {
            return response({ success: true, verified: true, duplicate: true, matched: true });
          }
        } catch {}
      }

      const customerEmail = payment?.customer?.email || "";
      const matchedOrder = await findMatchingPendingOrder(env, customerEmail, LYNK_PRODUCT_KIT_ID);
      const paidAt = new Date().toISOString();

      if (matchedOrder) {
        matchedOrder.status = "paid";
        matchedOrder.paid_at = paidAt;
        matchedOrder.refId = refId;
        matchedOrder.message_id = messageId;
        matchedOrder.paid_amount = amount;

        await env.PURCHASES.put(
          `order:${matchedOrder.order_id}`,
          JSON.stringify(matchedOrder)
        );

        // Simpan kepemilikan untuk user_id pemilik order
        await env.PURCHASES.put(
          `owned:${matchedOrder.user_id}:${matchedOrder.kit_id}:PREMIUM`,
          JSON.stringify({
            user_id: matchedOrder.user_id,
            kit_id: matchedOrder.kit_id,
            tier: "PREMIUM",
            purchased: true,
            order_id: matchedOrder.order_id,
            refId,
            message_id: messageId,
            paid_at: paidAt
          })
        );

        // Jika ada email customer di Lynk.id, simpan juga atas nama email tersebut
        if (customerEmail) {
          await env.PURCHASES.put(
            `owned:${customerEmail}:${matchedOrder.kit_id}:PREMIUM`,
            JSON.stringify({
              user_id: customerEmail,
              kit_id: matchedOrder.kit_id,
              tier: "PREMIUM",
              purchased: true,
              order_id: matchedOrder.order_id,
              refId,
              message_id: messageId,
              paid_at: paidAt
            })
          );
        }

        const webhookData = {
          event: body.event,
          refId,
          message_id: messageId,
          amount,
          customer_email: customerEmail,
          items: payment.items || [],
          received_at: paidAt,
          verified: true,
          matched: true,
          matched_order_id: matchedOrder.order_id,
          matched_user_id: matchedOrder.user_id,
          matched_kit_id: matchedOrder.kit_id,
          status: "matched"
        };

        await env.PURCHASES.put(eventKey, JSON.stringify(webhookData));

        return response({
          success: true,
          verified: true,
          matched: true,
          order_id: matchedOrder.order_id,
          kit_id: matchedOrder.kit_id,
          button: "DOWNLOAD"
        });
      }

      // Jika belum ada order pending saat webhook tiba, simpan sebagai verified_unmatched
      // agar dapat dipasangkan saat /api/access dipanggil oleh pemilik order
      const webhookData = {
        event: body.event,
        refId,
        message_id: messageId,
        amount,
        customer_email: customerEmail,
        items: payment.items || [],
        received_at: paidAt,
        verified: true,
        matched: false,
        status: "received_unmatched"
      };

      await env.PURCHASES.put(eventKey, JSON.stringify(webhookData));

      return response({
        success: true,
        verified: true,
        matched: false,
        message: "Payment recorded."
      });
    }

    // 2. HOME
    if (url.pathname === "/" && request.method === "GET") {
      return response({
        status: "online",
        service: "MPDK2 Purchase API",
        version: "2.1"
      });
    }

    // 3. KITS
    if (url.pathname === "/api/kits" && request.method === "GET") {
      return response({
        success: true,
        kits: KITS.map(kit => ({
          id: kit.id,
          title: kit.title,
          tier: kit.tier || "PREMIUM",
          price: kit.price ?? kit.premium_price,
          options: [
            {
              tier: "FREE",
              price: 0,
              available: Boolean(kit.free_download)
            },
            {
              tier: "PREMIUM",
              price: kit.premium_price,
              available: Boolean(kit.premium_download)
            }
          ]
        }))
      });
    }

    // 4. PURCHASE
    if (url.pathname === "/api/purchase" && request.method === "POST") {
      let body;
      try {
        body = await request.json();
      } catch {
        return response({ error: "Invalid JSON" }, 400);
      }

      const { user_id, kit_id, tier, price: customPrice, checkout_url: customCheckout } = body;
      if (!user_id || !kit_id || !tier) {
        return response({ error: "Missing purchase information" }, 400);
      }

      const kit = KITS.find(k => k.id === kit_id);

      if (tier === "FREE") {
        if (!kit || !kit.free_download) {
          return response({ error: "Free version not available" }, 400);
        }
        await env.PURCHASES.put(
          `owned:${user_id}:${kit_id}:FREE`,
          JSON.stringify({ user_id, kit_id, tier: "FREE", purchased: true })
        );
        return response({
          success: true,
          status: "owned",
          button: "DOWNLOAD"
        });
      }

      if (tier !== "PREMIUM") {
        return response({ error: "Invalid tier" }, 400);
      }

      const resolvedPrice = Number(customPrice ?? kit?.premium_price ?? 18000);
      const resolvedCheckout = (customCheckout && String(customCheckout).trim() !== "")
        ? String(customCheckout).trim()
        : (kit_id === LYNK_PRODUCT_KIT_ID ? LYNK_CHECKOUT : "");

      if (!resolvedCheckout) {
        return response({ error: "Checkout for this kit is not configured yet" }, 400);
      }

      // Gunakan kembali order pending yang sudah ada untuk user_id + kit_id ini agar tidak duplikat
      const existingOrderId = await env.PURCHASES.get(`pending_user:${user_id}:${kit_id}`);
      if (existingOrderId) {
        const existingOrderRaw = await env.PURCHASES.get(`order:${existingOrderId}`);
        if (existingOrderRaw) {
          try {
            const existingOrder = JSON.parse(existingOrderRaw);
            if (existingOrder && existingOrder.status === "pending") {
              return response({
                success: true,
                status: "pending",
                order_id: existingOrder.order_id,
                price: resolvedPrice,
                checkout_url: resolvedCheckout,
                message: "Waiting for payment verification"
              });
            }
          } catch {}
        }
      }

      const order_id = crypto.randomUUID();
      const order = {
        order_id,
        user_id,
        kit_id,
        tier: "PREMIUM",
        price: resolvedPrice,
        status: "pending",
        created_at: new Date().toISOString()
      };

      await env.PURCHASES.put(`order:${order_id}`, JSON.stringify(order));
      await env.PURCHASES.put(`pending_user:${user_id}:${kit_id}`, order_id);

      return response({
        success: true,
        status: "pending",
        order_id,
        price: resolvedPrice,
        checkout_url: resolvedCheckout,
        message: "Waiting for payment verification"
      });
    }

    // 5. ACCESS (Termasuk rekonsiliasi otomatis untuk pembayaran verified_unmatched)
    if (url.pathname === "/api/access" && request.method === "GET") {
      const user_id = url.searchParams.get("user_id");
      const kit_id = url.searchParams.get("kit_id");
      const tier = url.searchParams.get("tier");

      if (!user_id || !kit_id || !tier) {
        return response({ error: "Missing parameters" }, 400);
      }

      const kit = KITS.find(k => k.id === kit_id);
      const downloadUrl = kit
        ? (tier === "FREE" ? kit.free_download : kit.premium_download)
        : "";

      // Cek apakah sudah tercatat owned di KV
      let owned = await env.PURCHASES.get(`owned:${user_id}:${kit_id}:${tier}`);

      // Jika belum tercatat owned, cek apakah user ini punya order pending DAN ada webhook
      // pembayaran Lynk.id yang sudah terverifikasi (verified: true, status: "received_unmatched")
      if (!owned && tier === "PREMIUM") {
        const orderList = await env.PURCHASES.list({ prefix: "order:" });
        let userPendingOrder = null;

        for (const k of orderList.keys) {
          const rawOrd = await env.PURCHASES.get(k.name);
          if (!rawOrd) continue;
          try {
            const ord = JSON.parse(rawOrd);
            if (ord && ord.user_id === user_id && ord.kit_id === kit_id && ord.status === "pending") {
              userPendingOrder = ord;
              break;
            }
          } catch {}
        }

        if (userPendingOrder) {
          const eventList = await env.PURCHASES.list({ prefix: "lynk_event:" });
          for (const ek of eventList.keys) {
            const rawEvt = await env.PURCHASES.get(ek.name);
            if (!rawEvt) continue;
            try {
              const evt = JSON.parse(rawEvt);
              if (evt && evt.verified === true && !evt.matched) {
                const paidAt = new Date().toISOString();
                evt.matched = true;
                evt.status = "matched";
                evt.matched_order_id = userPendingOrder.order_id;
                evt.matched_user_id = user_id;
                evt.matched_kit_id = kit_id;
                await env.PURCHASES.put(ek.name, JSON.stringify(evt));

                userPendingOrder.status = "paid";
                userPendingOrder.paid_at = paidAt;
                userPendingOrder.refId = evt.refId;
                userPendingOrder.message_id = evt.message_id;
                await env.PURCHASES.put(`order:${userPendingOrder.order_id}`, JSON.stringify(userPendingOrder));

                const ownedPayload = JSON.stringify({
                  user_id,
                  kit_id,
                  tier: "PREMIUM",
                  purchased: true,
                  order_id: userPendingOrder.order_id,
                  refId: evt.refId,
                  message_id: evt.message_id,
                  paid_at: paidAt
                });
                await env.PURCHASES.put(`owned:${user_id}:${kit_id}:PREMIUM`, ownedPayload);
                owned = ownedPayload;
                break;
              }
            } catch {}
          }
        }
      }

      if (!owned) {
        return response({
          success: true,
          owned: false,
          button: "BUY"
        });
      }

      return response({
        success: true,
        owned: true,
        button: "DOWNLOAD",
        download_url: downloadUrl
      });
    }

    // 6. ADMIN APPROVE
    if (url.pathname === "/api/admin/approve" && request.method === "POST") {
      if (
        !env.ADMIN_SECRET ||
        request.headers.get("Authorization") !== `Bearer ${env.ADMIN_SECRET}`
      ) {
        return response({ error: "Unauthorized" }, 401);
      }

      let body;
      try {
        body = await request.json();
      } catch {
        return response({ error: "Invalid JSON" }, 400);
      }

      const { order_id } = body;
      if (!order_id) {
        return response({ error: "Missing order_id" }, 400);
      }

      const orderData = await env.PURCHASES.get(`order:${order_id}`);
      if (!orderData) {
        return response({ error: "Order not found" }, 404);
      }

      const order = JSON.parse(orderData);
      if (order.status === "paid") {
        return response({ success: true, status: "already_paid" });
      }

      order.status = "paid";
      order.paid_at = new Date().toISOString();

      await env.PURCHASES.put(`order:${order_id}`, JSON.stringify(order));
      await env.PURCHASES.put(
        `owned:${order.user_id}:${order.kit_id}:PREMIUM`,
        JSON.stringify({
          user_id: order.user_id,
          kit_id: order.kit_id,
          tier: "PREMIUM",
          purchased: true
        })
      );

      return response({
        success: true,
        status: "paid",
        button: "DOWNLOAD"
      });
    }

    return response({ error: "Endpoint not found" }, 404);
  }
};
