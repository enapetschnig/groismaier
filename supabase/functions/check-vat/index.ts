import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { vatNumber } = await req.json();
    if (!vatNumber || vatNumber.length < 4) {
      return new Response(JSON.stringify({ valid: false, error: "UID-Nummer zu kurz" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Extract country code and number
    const countryCode = vatNumber.substring(0, 2).toUpperCase();
    const number = vatNumber.substring(2).replace(/\s/g, "");

    // Call EU VIES API
    const viesUrl = "https://ec.europa.eu/taxation_customs/vies/rest-api/check-vat-number";
    const response = await fetch(viesUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        countryCode,
        vatNumber: number,
      }),
    });

    if (!response.ok) {
      // Fallback: basic format validation
      const isValidFormat = /^AT[U]\d{8}$/.test(vatNumber.replace(/\s/g, "")) ||
                           /^DE\d{9}$/.test(vatNumber.replace(/\s/g, "")) ||
                           /^[A-Z]{2}[A-Z0-9]{2,12}$/.test(vatNumber.replace(/\s/g, ""));
      return new Response(JSON.stringify({
        valid: isValidFormat,
        name: null,
        address: null,
        error: isValidFormat ? "VIES nicht erreichbar — Format OK" : "Ungültiges Format",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();

    return new Response(JSON.stringify({
      valid: data.valid === true,
      name: data.name || null,
      address: data.address || null,
      countryCode: data.countryCode,
      vatNumber: data.vatNumber,
      requestDate: data.requestDate,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ valid: false, error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
