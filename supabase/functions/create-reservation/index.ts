import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Headers":
    "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
  "Vary": "Origin",
};

function jsonResponse(
  body: Record<string, unknown>,
  status: number,
  origin: string,
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Access-Control-Allow-Origin": origin,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function getClientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]
    ?.trim();
  return request.headers.get("cf-connecting-ip")?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    forwarded ||
    "";
}

function isValidDate(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value;
}

async function hashClientIp(ip: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(ip),
  );
  return Array.from(
    new Uint8Array(signature),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}

type WhatsAppNotificationStatus = "accepted" | "not_configured" | "failed";

function formatBookingDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

async function notifyOwnerOnWhatsApp(details: {
  guestName: string;
  guestPhone: string;
  checkin: string;
  checkout: string;
  guests: number;
  total: number;
}): Promise<WhatsAppNotificationStatus> {
  const accessToken = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
  const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
  const ownerPhone = Deno.env.get("WHATSAPP_OWNER_PHONE");
  const templateName = Deno.env.get("WHATSAPP_TEMPLATE_NAME");
  const apiVersion = Deno.env.get("WHATSAPP_GRAPH_API_VERSION");
  const configuration = [
    accessToken,
    phoneNumberId,
    ownerPhone,
    templateName,
    apiVersion,
  ];

  if (configuration.every((value) => !value)) return "not_configured";
  if (
    !accessToken || !phoneNumberId || !ownerPhone || !templateName ||
    !apiVersion ||
    !/^\d{8,20}$/.test(phoneNumberId) ||
    !/^\d{8,15}$/.test(ownerPhone) ||
    !/^[a-z0-9_]{1,512}$/.test(templateName) ||
    !/^v\d+\.\d+$/.test(apiVersion)
  ) {
    console.error(
      "WhatsApp notification configuration is incomplete or invalid.",
    );
    return "failed";
  }

  try {
    const response = await fetch(
      `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: ownerPhone,
          type: "template",
          template: {
            name: templateName,
            language: { code: "pt_BR" },
            components: [{
              type: "body",
              parameters: [
                { type: "text", text: details.guestName },
                { type: "text", text: details.guestPhone },
                { type: "text", text: formatBookingDate(details.checkin) },
                { type: "text", text: formatBookingDate(details.checkout) },
                { type: "text", text: String(details.guests) },
                {
                  type: "text",
                  text: new Intl.NumberFormat("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                  }).format(details.total),
                },
              ],
            }],
          },
        }),
        signal: AbortSignal.timeout(8000),
      },
    );

    if (!response.ok) {
      let apiErrorCode: string | number | undefined;
      try {
        const body: unknown = await response.json();
        if (
          body && typeof body === "object" && "error" in body &&
          body.error && typeof body.error === "object" &&
          "code" in body.error &&
          (typeof body.error.code === "string" ||
            typeof body.error.code === "number")
        ) {
          apiErrorCode = body.error.code;
        }
      } catch {
        // The HTTP status is sufficient to report the delivery failure.
      }
      console.error("WhatsApp rejected the reservation notification.", {
        status: response.status,
        apiErrorCode,
      });
      return "failed";
    }

    return "accepted";
  } catch (error) {
    console.error("WhatsApp reservation notification request failed.", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return "failed";
  }
}

Deno.serve(async (request) => {
  const allowedOrigin = Deno.env.get("ALLOWED_ORIGIN")?.replace(/\/+$/, "");
  const origin = request.headers.get("origin") ?? "";
  if (!allowedOrigin || origin !== allowedOrigin) {
    return new Response("Forbidden", {
      status: 403,
      headers: { "Cache-Control": "no-store" },
    });
  }
  if (request.method === "OPTIONS") {
    return new Response("ok", {
      headers: { ...corsHeaders, "Access-Control-Allow-Origin": origin },
    });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405, origin);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const turnstileSecret = Deno.env.get("TURNSTILE_SECRET_KEY");
  const rateLimitHashSecret = Deno.env.get("RATE_LIMIT_HASH_SECRET");
  if (
    !supabaseUrl || !serviceRoleKey || !anonKey || !turnstileSecret ||
    !rateLimitHashSecret || rateLimitHashSecret.length < 32
  ) {
    console.error(
      "Required create-reservation function secrets are missing or invalid.",
    );
    return jsonResponse({ error: "service_not_configured" }, 503, origin);
  }
  if (request.headers.get("apikey") !== anonKey) {
    return jsonResponse({ error: "invalid_client" }, 401, origin);
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 16_384) {
    return jsonResponse({ error: "request_too_large" }, 413, origin);
  }

  let payload: Record<string, unknown>;
  try {
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > 16_384) {
      return jsonResponse({ error: "request_too_large" }, 413, origin);
    }
    const body: unknown = JSON.parse(rawBody);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return jsonResponse({ error: "invalid_request" }, 400, origin);
    }
    payload = body as Record<string, unknown>;
  } catch {
    return jsonResponse({ error: "invalid_request" }, 400, origin);
  }

  const guestName = typeof payload.guest_name === "string"
    ? payload.guest_name.trim()
    : "";
  const guestEmail = typeof payload.guest_email === "string"
    ? payload.guest_email.trim()
    : "";
  const guestPhone = typeof payload.guest_phone === "string"
    ? payload.guest_phone.trim()
    : "";
  const checkin = typeof payload.checkin === "string" ? payload.checkin : "";
  const checkout = typeof payload.checkout === "string" ? payload.checkout : "";
  const guests = payload.guests;
  const turnstileToken = typeof payload.turnstile_token === "string"
    ? payload.turnstile_token
    : "";
  const honeypot = typeof payload.website === "string" ? payload.website : "";

  if (
    honeypot || payload.privacy_consent !== true ||
    guestName.length < 2 || guestName.length > 80 ||
    guestEmail.length > 120 ||
    !/^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)+$/i.test(
      guestEmail,
    ) ||
    guestPhone.length < 10 || guestPhone.length > 24 ||
    guestPhone.replace(/\D/g, "").length < 10 ||
    guestPhone.replace(/\D/g, "").length > 15 ||
    !/^\d{4}-\d{2}-\d{2}$/.test(checkin) || !isValidDate(checkin) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(checkout) || !isValidDate(checkout) ||
    typeof guests !== "number" || !Number.isInteger(guests) || guests < 1 ||
    guests > 4 ||
    !turnstileToken || turnstileToken.length > 2048
  ) {
    return jsonResponse({ error: "invalid_request" }, 400, origin);
  }

  const clientIp = getClientIp(request);
  if (!clientIp || clientIp.length > 128) {
    return jsonResponse({ error: "client_ip_unavailable" }, 400, origin);
  }

  let turnstileResult: {
    success?: boolean;
    action?: string;
    hostname?: string;
    "error-codes"?: string[];
  };
  try {
    const verification = new URLSearchParams({
      secret: turnstileSecret,
      response: turnstileToken,
      remoteip: clientIp,
    });
    const verificationResponse = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: verification,
        signal: AbortSignal.timeout(5000),
      },
    );
    if (!verificationResponse.ok) {
      throw new Error("Turnstile verification service returned an error.");
    }
    turnstileResult = await verificationResponse.json();
  } catch (error) {
    console.error("Turnstile verification request failed:", error);
    return jsonResponse({ error: "protection_unavailable" }, 503, origin);
  }

  const expectedHostname = new URL(allowedOrigin).hostname;
  if (
    !turnstileResult.success || turnstileResult.action !== "booking" ||
    turnstileResult.hostname !== expectedHostname
  ) {
    return jsonResponse({ error: "challenge_failed" }, 403, origin);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const ipHash = await hashClientIp(clientIp, rateLimitHashSecret);
    const { data: allowed, error: rateLimitError } = await supabase.rpc(
      "consume_reservation_rate_limit",
      { p_ip_hash: ipHash },
    );
    if (rateLimitError) throw rateLimitError;
    if (!allowed) {
      return jsonResponse({ error: "rate_limited" }, 429, origin);
    }

    const { data, error } = await supabase.rpc("create_reservation", {
      p_guest_name: guestName,
      p_guest_email: guestEmail,
      p_guest_phone: guestPhone,
      p_checkin: checkin,
      p_checkout: checkout,
      p_guests: guests,
      p_privacy_consent: true,
    });
    if (error) {
      if (
        error.code === "23P01" ||
        error.message.includes("stay_dates_unavailable")
      ) {
        return jsonResponse({ error: "stay_dates_unavailable" }, 409, origin);
      }
      if (error.message.includes("booking_prices_not_configured")) {
        return jsonResponse(
          { error: "booking_prices_not_configured" },
          503,
          origin,
        );
      }
      if (error.message.includes("invalid_")) {
        return jsonResponse({ error: error.message }, 400, origin);
      }
      throw error;
    }

    const reservation = Array.isArray(data) ? data[0] : data;
    const notificationStatus = await notifyOwnerOnWhatsApp({
      guestName,
      guestPhone,
      checkin,
      checkout,
      guests,
      total: Number(reservation.total),
    });

    return jsonResponse(
      {
        reservation,
        whatsapp_notification: notificationStatus,
      },
      200,
      origin,
    );
  } catch (error) {
    console.error("create-reservation request failed:", error);
    return jsonResponse(
      { error: "reservation_service_unavailable" },
      503,
      origin,
    );
  }
});
