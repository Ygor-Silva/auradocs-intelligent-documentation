// AuraDocs synthesis edge function
// Receives raw input (logs, JSON, code, schema) + intent and returns structured markdown
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `You are Aura, the synthesis engine of AuraDocs — an Active Documental Intelligence platform.

Your job: convert raw, chaotic technical input (logs, JSON, code, SQL schemas, error traces, ticket histories, RPA execution data) into clean, structured technical documentation in Markdown.

Rules:
- Always respond in the same language as the user's raw input (default: Portuguese-BR if ambiguous).
- Output ONLY valid Markdown. No preamble, no "Here is your doc". Start directly with a # heading.
- Structure: # Title → short summary paragraph → ## sections with details → tables/code blocks/Mermaid diagrams when useful.
- For SQL schemas: produce a Data Dictionary with a table per entity.
- For error logs / tickets: produce a Troubleshooting article (Symptom → Cause → Resolution → Prevention).
- For RPA execution data: produce an Execution Log with step breakdown and a Mermaid sequence/flow diagram.
- For logical descriptions ("if X then Y"): include a Mermaid flowchart (\`\`\`mermaid blocks).
- Keep prose dense and technical. No fluff.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { rawInput, intent, model } = await req.json();

    if (!rawInput || typeof rawInput !== "string") {
      return new Response(JSON.stringify({ error: "rawInput is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userMessage = `Intent: ${intent || "auto-detect"}\n\nRaw input:\n\`\`\`\n${rawInput.slice(0, 50000)}\n\`\`\``;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: model || "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMessage },
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de requisições atingido. Aguarde alguns instantes." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos esgotados. Adicione créditos ao workspace Lovable." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("aura-synthesize error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
