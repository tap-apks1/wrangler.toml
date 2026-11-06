const KITS = [
  {
    id: "style-konser-latar-fog",
    title: "Style Konser Latar+Fogs",
    premium_price: 10000,
    premium_download: "https://raw.githubusercontent.com/tap-apks1/Url_Link_mpdk2/main/mpdk2/konser_final.drumkit",
    free_download: ""
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

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Lynk-Signature"
};

function response(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json" }
  });
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: cors });
    }

    const url = new URL(request.url);

    // WEBHOOK LYNK.ID / HOPPSCOTCH SIMULATION
    if (url.pathname === "/api/lynk-webhook" && request.method === "POST") {
      let body = {};
      try {
        body = await request.json();
      } catch {
        body = {};
      }

      // BYPASS SIGNATURE CHECK UNTUK MEMUDAHKAN TEST & DASHBOARD LYNK.ID
      const data = body?.data;
      const payment = data?.message_data;

      const message_id = data?.message_id || "TEST_MSG_ID";
      const refId = payment?.refId || "TEST_REF_ID";
      const grandTotal = payment?.totals?.grandTotal || 10000;

      if (env.PURCHASES) {
        await env.PURCHASES.put(
          `lynk_event:${message_id}`,
          JSON.stringify({
            event: body.event || "payment.received",
            refId: refId,
            message_id: message_id,
            amount: String(grandTotal),
            items: payment?.items || [],
            received_at: new Date().toISOString(),
            verified: true,
            matched: false,
            status: "received_unmatched"
          })
        );
      }

      return response({
        success: true,
        verified: true,
        matched: false,
        message: "Webhook processed successfully (Bypassed for testing)"
      });
    }

    // HOME
    if (url.pathname === "/") {
      return response({ status: "online", service: "MPDK2 Purchase API", version: "1.2" });
    }

    // DAFTAR KITS
    if (url.pathname === "/api/kits") {
      return response({
        success: true,
        kits: KITS.map(kit => ({
          id: kit.id,
          title: kit.title,
          options: [
            { tier: "FREE", price: 0, available: Boolean(kit.free_download) },
            { tier: "PREMIUM", price: kit.premium_price, available: true }
          ]
        }))
      });
    }

    // PURCHASE
    if (url.pathname === "/api/purchase" && request.method === "POST") {
      let body;
      try {
        body = await request.json();
      } catch {
        return response({ error: "Invalid JSON" }, 400);
      }

      const { user_id, kit_id, tier } = body;
      if (!user_id || !kit_id || !tier) {
        return response({ error: "Missing purchase information" }, 400);
      }

      const kit = KITS.find(k => k.id === kit_id);
      if (!kit) return response({ error: "Kit not found" }, 404);

      if (tier === "FREE") {
        if (!kit.free_download) return response({ error: "Free version not available yet" }, 400);
        await env.PURCHASES.put(`owned:${user_id}:${kit_id}:FREE`, JSON.stringify({ user_id, kit_id, tier: "FREE", purchased: true }));
        return response({ success: true, status: "owned", button: "DOWNLOAD" });
      }

      const order_id = crypto.randomUUID();
      await env.PURCHASES.put(
        `order:${order_id}`,
        JSON.stringify({ order_id, user_id, kit_id, tier: "PREMIUM", status: "pending", created_at: new Date().toISOString() })
      );

      return response({ success: true, status: "pending", order_id, price: kit.premium_price, message: "Waiting for payment verification" });
    }

    // ACCESS
    if (url.pathname === "/api/access") {
      const user_id = url.searchParams.get("user_id");
      const kit_id = url.searchParams.get("kit_id");
      const tier = url.searchParams.get("tier");

      if (!user_id || !kit_id || !tier) return response({ error: "Missing parameters" }, 400);
      const kit = KITS.find(k => k.id === kit_id);
      if (!kit) return response({ error: "Kit not found" }, 404);

      const owned = await env.PURCHASES.get(`owned:${user_id}:${kit_id}:${tier}`);
      if (!owned) return response({ success: true, owned: false, button: "BUY" });

      return response({
        success: true,
        owned: true,
        button: "DOWNLOAD",
        download_url: tier === "FREE" ? kit.free_download : kit.premium_download
      });
    }

    // ADMIN APPROVE
    if (url.pathname === "/api/admin/approve" && request.method === "POST") {
      if (!env.ADMIN_SECRET || request.headers.get("Authorization") !== `Bearer ${env.ADMIN_SECRET}`) {
        return response({ error: "Unauthorized" }, 401);
      }

      let body;
      try {
        body = await request.json();
      } catch {
        return response({ error: "Invalid JSON" }, 400);
      }

      const { order_id } = body;
      if (!order_id) return response({ error: "Missing order_id" }, 400);

      const orderData = await env.PURCHASES.get(`order:${order_id}`);
      if (!orderData) return response({ error: "Order not found" }, 404);

      const order = JSON.parse(orderData);
      order.status = "paid";
      order.paid_at = new Date().toISOString();

      await env.PURCHASES.put(`order:${order_id}`, JSON.stringify(order));
      await env.PURCHASES.put(
        `owned:${order.user_id}:${order.kit_id}:PREMIUM`,
        JSON.stringify({ user_id: order.user_id, kit_id: order.kit_id, tier: "PREMIUM", purchased: true })
      );

      return response({ success: true, status: "paid", button: "DOWNLOAD" });
    }

    return response({ error: "Endpoint not found" }, 404);
  }
};
