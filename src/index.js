export default {
  async fetch(request, env) {
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: cors });
    }

    const url = new URL(request.url);

    if (url.pathname === "/") {
      return Response.json({
        status: "online",
        service: "MPDK2 Purchase API"
      }, { headers: cors });
    }

    return Response.json(
      { error: "Endpoint not found" },
      { status: 404, headers: cors }
    );
  }
};
