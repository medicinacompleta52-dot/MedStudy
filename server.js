import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = express();
const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 3000);
const supabaseRequired = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"];
const missing = supabaseRequired.filter((key) => !process.env[key]);
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;
const supabaseAdmin = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  : null;
const bucket = process.env.SUPABASE_STORAGE_BUCKET || "medstudy-private";
const plans = {
  monthly: { name: process.env.PLAN_MONTHLY_NAME || "MedStudy Mensal", price: process.env.PLAN_MONTHLY_DISPLAY || "Preço configurado no checkout", priceId: process.env.STRIPE_PRICE_MONTHLY },
  annual: { name: process.env.PLAN_ANNUAL_NAME || "MedStudy Anual", price: process.env.PLAN_ANNUAL_DISPLAY || "Preço configurado no checkout", priceId: process.env.STRIPE_PRICE_ANNUAL }
};

app.set("trust proxy", 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use("/api", rateLimit({ windowMs: 15 * 60 * 1000, limit: 120, standardHeaders: "draft-8", legacyHeaders: false }));
app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET) return res.status(503).send("Payments are not configured.");
  let event;
  try { event = stripe.webhooks.constructEvent(req.body, req.headers["stripe-signature"], process.env.STRIPE_WEBHOOK_SECRET); }
  catch { return res.status(400).send("Invalid webhook signature."); }
  try {
    if (["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"].includes(event.type)) {
      const sub = event.data.object;
      const userId = sub.metadata?.user_id;
      if (userId) await upsertSubscription({ user_id: userId, stripe_customer_id: String(sub.customer), stripe_subscription_id: sub.id, stripe_price_id: sub.items.data[0]?.price.id || null, status: sub.status, current_period_end: new Date((sub.current_period_end || sub.items.data[0]?.current_period_end || 0) * 1000).toISOString() });
    }
    res.json({ received: true });
  } catch (error) {
    console.error("Stripe webhook processing failed:", error.message);
    res.status(500).send("Webhook processing failed.");
  }
});
app.use(express.json({ limit: "1mb" }));

function configured(res) {
  if (missing.length) { res.status(503).json({ error: "O serviço ainda precisa ser configurado no Render.", missing }); return false; }
  return true;
}
async function requireUser(req, res, next) {
  if (!configured(res)) return;
  const token = req.headers.authorization?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) return res.status(401).json({ error: "Entre na sua conta para continuar." });
  try {
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data.user) return res.status(401).json({ error: "Sessão inválida. Entre novamente." });
    req.user = data.user;
    next();
  } catch { res.status(401).json({ error: "Não foi possível validar sua sessão." }); }
}
async function requireActiveSubscription(req, res, next) {
  try {
    const { data, error } = await supabaseAdmin.from("user_subscriptions").select("status,current_period_end").eq("user_id", req.user.id).maybeSingle();
    if (error) throw error;
    if (!data || !["active", "trialing"].includes(data.status) || new Date(data.current_period_end) <= new Date()) {
      return res.status(402).json({ error: "Assinatura ativa necessária para acessar o acervo.", code: "subscription_required" });
    }
    next();
  } catch (error) {
    console.error("Subscription lookup failed:", error.message);
    res.status(503).json({ error: "Não foi possível verificar sua assinatura." });
  }
}
async function upsertSubscription(row) {
  const { error } = await supabaseAdmin.from("user_subscriptions").upsert(row, { onConflict: "user_id" });
  if (error) throw error;
}

app.get("/api/config", (_req, res) => res.json({
  supabaseUrl: process.env.SUPABASE_URL || "",
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY || "",
  configured: missing.length === 0,
  plans: Object.fromEntries(Object.entries(plans).map(([id, plan]) => [id, { name: plan.name, price: plan.price, available: Boolean(plan.priceId) }]))
}));
app.get("/api/me", requireUser, async (req, res) => {
  const { data } = await supabaseAdmin.from("user_subscriptions").select("status,current_period_end").eq("user_id", req.user.id).maybeSingle();
  const active = Boolean(data && ["active", "trialing"].includes(data.status) && new Date(data.current_period_end) > new Date());
  res.json({ user: { id: req.user.id, email: req.user.email }, subscription: data || null, active });
});
app.post("/api/checkout", requireUser, async (req, res) => {
  const plan = plans[req.body?.plan];
  if (!stripe || !plan?.priceId || !process.env.APP_URL) return res.status(503).json({ error: "Este plano ainda não foi configurado para pagamento." });
  try {
    const existing = await supabaseAdmin.from("user_subscriptions").select("stripe_customer_id,status").eq("user_id", req.user.id).maybeSingle();
    const session = await stripe.checkout.sessions.create({
      mode: "subscription", line_items: [{ price: plan.priceId, quantity: 1 }],
      customer: existing.data?.stripe_customer_id || undefined,
      customer_email: existing.data?.stripe_customer_id ? undefined : req.user.email,
      client_reference_id: req.user.id,
      subscription_data: { metadata: { user_id: req.user.id } },
      success_url: new URL("/conta.html?checkout=success", process.env.APP_URL).toString(),
      cancel_url: new URL("/conta.html?checkout=cancel", process.env.APP_URL).toString()
    });
    res.json({ url: session.url });
  } catch (error) {
    console.error("Checkout creation failed:", error.message);
    res.status(500).json({ error: "Não foi possível iniciar o checkout." });
  }
});
app.post("/api/files/upload-ticket", requireUser, requireActiveSubscription, async (req, res) => {
  const name = String(req.body?.name || "").normalize("NFKC").replace(/[^\p{L}\p{N}._() -]/gu, "_").trim().slice(0, 160);
  const contentType = String(req.body?.contentType || "").slice(0, 120);
  if (!name || name === "." || name === "..") return res.status(400).json({ error: "Nome de arquivo inválido." });
  if (!(contentType === "application/pdf" || contentType.startsWith("video/") || contentType.startsWith("audio/") || contentType === "application/zip")) return res.status(415).json({ error: "Envie videoaulas, áudio, PDF ou arquivo ZIP." });
  try {
    const key = req.user.id + "/" + crypto.randomUUID() + "-" + name;
    const { data, error } = await supabaseAdmin.storage.from(bucket).createSignedUploadUrl(key, { upsert: false });
    if (error) throw error;
    res.json({ key, signedUrl: data.signedUrl, token: data.token, contentType });
  } catch (error) {
    console.error("Upload ticket failed:", error.message);
    res.status(500).json({ error: "Não foi possível preparar o envio." });
  }
});
app.get("/api/files", requireUser, requireActiveSubscription, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin.storage.from(bucket).list(req.user.id, { limit: 1000, sortBy: { column: "name", order: "asc" } });
    if (error) throw error;
    res.json({ files: (data || []).filter((item) => item.name).map((item) => ({ name: item.name, key: req.user.id + "/" + item.name, size: item.metadata?.size || null, updatedAt: item.updated_at || null })) });
  } catch (error) {
    console.error("File listing failed:", error.message);
    res.status(500).json({ error: "Não foi possível listar os arquivos." });
  }
});
app.post("/api/files/download-link", requireUser, requireActiveSubscription, async (req, res) => {
  const key = String(req.body?.key || "");
  if (!key.startsWith(req.user.id + "/") || key.includes("..")) return res.status(403).json({ error: "Arquivo fora da sua biblioteca." });
  try {
    const { data, error } = await supabaseAdmin.storage.from(bucket).createSignedUrl(key, 120);
    if (error) throw error;
    res.json({ url: data.signedUrl });
  } catch (error) {
    console.error("Signed download failed:", error.message);
    res.status(404).json({ error: "Não foi possível abrir este arquivo." });
  }
});
app.delete("/api/files", requireUser, requireActiveSubscription, async (req, res) => {
  const key = String(req.body?.key || "");
  if (!key.startsWith(req.user.id + "/") || key.includes("..")) return res.status(403).json({ error: "Arquivo fora da sua biblioteca." });
  const { error } = await supabaseAdmin.storage.from(bucket).remove([key]);
  if (error) return res.status(500).json({ error: "Não foi possível remover o arquivo." });
  res.json({ ok: true });
});
app.use(express.static(root, { dotfiles: "deny", index: "index.html" }));
app.get("*path", (_req, res) => res.sendFile(path.join(root, "index.html")));
app.listen(port, () => console.log("MedStudy listening on " + port));
