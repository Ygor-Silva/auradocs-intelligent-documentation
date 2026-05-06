// AuraDocs synthesis edge function
// Streams synthesized markdown via SSE, then on finish performs a fast second
// pass to generate a concise title. Final SSE event:  data: {"title":"..."}
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

const TITLE_SYSTEM = `You are a title generator for technical documentation.
Given a Markdown document, return ONLY a concise, impactful title (max 6 words). No quotes, no period, no preamble. Match the document's language.`;

const AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

// Simple in-memory sliding-window rate limit (per isolate).
// 10 requests / 60s per caller (user id when available, else IP).
const RL_WINDOW_MS = 60_000;
const RL_MAX = 10;
const rlMap = new Map<string, number[]>();
function rateLimit(key: string): { ok: boolean; retryAfter: number } {
  const now = Date.now();
  const arr = (rlMap.get(key) ?? []).filter((t) => now - t < RL_WINDOW_MS);
  if (arr.length >= RL_MAX) {
    return { ok: false, retryAfter: Math.ceil((RL_WINDOW_MS - (now - arr[0])) / 1000) };
  }
  arr.push(now);
  rlMap.set(key, arr);
  // Opportunistic GC
  if (rlMap.size > 5000) {
    for (const [k, v] of rlMap) if (v.every((t) => now - t > RL_WINDOW_MS)) rlMap.delete(k);
  }
  return { ok: true, retryAfter: 0 };
}
function callerKey(req: Request): string {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (token.split(".").length === 3) {
    try {
      const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
      if (payload.sub) return `u:${payload.sub}`;
    } catch { /* ignore */ }
  }
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim()
    || req.headers.get("cf-connecting-ip") || "anon";
  return `ip:${ip}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const rl = rateLimit(callerKey(req));
    if (!rl.ok) {
      return new Response(JSON.stringify({ error: `Rate limit. Tente novamente em ${rl.retryAfter}s.` }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": String(rl.retryAfter) },
      });
    }
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
    const chosenModel = model || "google/gemini-3-flash-preview";

    const aiResp = await fetch(AI_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: chosenModel,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMessage },
        ],
        stream: true,
      }),
    });

    if (!aiResp.ok) {
      if (aiResp.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de requisições atingido. Aguarde alguns instantes." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResp.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos esgotados. Adicione créditos ao workspace Lovable." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errText = await aiResp.text();
      console.error("AI gateway error:", aiResp.status, errText);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!aiResp.body) {
      return new Response(JSON.stringify({ error: "Empty response from AI gateway" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Tee the upstream stream: forward to client AND accumulate to feed title pass.
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const stream = new ReadableStream({
      async start(controller) {
        const reader = aiResp.body!.getReader();
        let buf = "";
        let acc = "";
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            controller.enqueue(value);
            buf += decoder.decode(value, { stream: true });
            let idx: number;
            while ((idx = buf.indexOf("\n")) !== -1) {
              const line = buf.slice(0, idx).trim();
              buf = buf.slice(idx + 1);
              if (!line.startsWith("data: ")) continue;
              const payload = line.slice(6).trim();
              if (payload === "[DONE]") continue;
              try {
                const parsed = JSON.parse(payload);
                const delta = parsed.choices?.[0]?.delta?.content;
                if (delta) acc += delta;
              } catch { /* partial chunk */ }
            }
          }

          // Second ultra-fast pass: generate a title from the accumulated content.
          let title = "";
          try {
            const titleResp = await fetch(AI_URL, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${LOVABLE_API_KEY}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model: "google/gemini-2.5-flash-lite",
                messages: [
                  { role: "system", content: TITLE_SYSTEM },
                  { role: "user", content: acc.slice(0, 4000) },
                ],
                stream: false,
              }),
            });
            if (titleResp.ok) {
              const j = await titleResp.json();
              title = (j.choices?.[0]?.message?.content ?? "").trim()
                .replace(/^["'`]+|["'`]+$/g, "")
                .replace(/\.$/, "")
                .slice(0, 80);
            }
          } catch (e) {
            console.warn("title pass failed", e);
          }

          // Emit a final aura-meta event so the client can pick up the title.
          const meta = `event: aura-meta\ndata: ${JSON.stringify({ title })}\n\n`;
          controller.enqueue(encoder.encode(meta));
        } catch (e) {
          console.error("stream error", e);
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
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
