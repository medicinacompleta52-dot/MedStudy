import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { createClient } from "@supabase/supabase-js";
import { randomUUID, timingSafeEqual } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = express();
const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 3000);
const supabaseRequired = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"];
const missing = supabaseRequired.filter((key) => !process.env[key]);
const supabaseAdmin = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  : null;
const bucket = process.env.SUPABASE_STORAGE_BUCKET || "medstudy-private";
const asaasSandbox = process.env.ASAAS_ENV === "sandbox";
const asaasBaseUrl = asaasSandbox ? "https://api-sandbox.asaas.com/v3" : "https://api.asaas.com/v3";
const plans = {
  monthly: { name: process.env.PLAN_MONTHLY_NAME || "MedStudy Mensal", price: 80, display: process.env.PLAN_MONTHLY_DISPLAY || "R$ 80/mês", cycle: "MONTHLY" },
  annual: { name: process.env.PLAN_ANNUAL_NAME || "MedStudy Anual", price: 500, display: process.env.PLAN_ANNUAL_DISPLAY || "R$ 500/ano", cycle: "YEARLY" },
  lifetime: { name: process.env.PLAN_LIFETIME_NAME || "MedStudy Vitalício", price: 750, display: process.env.PLAN_LIFETIME_DISPLAY || "R$ 750, pagamento único", cycle: null }
};

app.set("trust proxy", 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use("/api", rateLimit({ windowMs: 15 * 60 * 1000, limit: 120, standardHeaders: "draft-8", legacyHeaders: false }));
app.use(express.json({ limit: "1mb" }));

function configured(res) {
  const absent = [...missing, ...(!process.env.ASAAS_API_KEY ? ["ASAAS_API_KEY"] : [])];
  if (absent.length) {
    res.status(503).json({ error: "O serviço ainda precisa ser configurado no Render.", missing: absent });
    return false;
  }
  return true;
}

async function asaasRequest(endpoint, options = {}) {
  const response = await fetch(asaasBaseUrl + endpoint, {
    ...options,
    headers: { access_token: process.env.ASAAS_API_KEY, "Content-Type": "application/json", ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error("Asaas request failed:", response.status, JSON.stringify(data.errors || data));
    const error = new Error("O Asaas não conseguiu iniciar o pagamento. Confira a configuração da conta.");
    error.status = response.status;
    throw error;
  }
  return data;
}

function externalReferenceParts(value) {
  const match = /^medstudy:([0-9a-f-]{36}):(monthly|annual|lifetime):([0-9a-f-]{36})$/i.exec(String(value || ""));
  return match ? { userId: match[1], planId: match[2] } : null;
}
function nextPeriodEnd(planId, date = new Date()) {
  const end = new Date(date);
  if (planId === "monthly") end.setMonth(end.getMonth() + 1);
  else if (planId === "annual") end.setFullYear(end.getFullYear() + 1);
  else return null;
  return end.toISOString();
}
async function findSubscriptionByExternalReference(reference) {
  const parsed = externalReferenceParts(reference);
  if (!parsed) return null;
  const { data, error } = await supabaseAdmin.from("user_subscriptions").select("user_id,plan_id").eq("user_id", parsed.userId).maybeSingle();
  if (error) throw error;
  return data ? { ...data, plan_id: parsed.planId } : null;
}
async function updateSubscription(userId, values) {
  const { error } = await supabaseAdmin.from("user_subscriptions").upsert({
    user_id: userId,
    updated_at: new Date().toISOString(),
    ...values
  }, { onConflict: "user_id" });
  if (error) throw error;
}
async function findByProviderId(column, value) {
  if (!value) return null;
  const { data, error } = await supabaseAdmin.from("user_subscriptions").select("user_id,plan_id").eq(column, value).maybeSingle();
  if (error) throw error;
  return data;
}

app.post("/api/asaas/webhook", async (req, res) => {
  const expected = process.env.ASAAS_WEBHOOK_TOKEN || "";
  const supplied = req.headers["asaas-access-token"] || "";
  if (!expected) return res.status(503).send("Webhook is not configured.");
  const left = Buffer.from(String(supplied));
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return res.status(401).send("Invalid webhook token.");
  if (!supabaseAdmin) return res.status(503).send("Database is not configured.");

  const { id: eventId, event, checkout, payment, subscription } = req.body || {};
  try {
    if (event === "CHECKOUT_PAID" && checkout?.id) {
      const { data: pending, error } = await supabaseAdmin.from("user_subscriptions")
        .select("user_id,plan_id").eq("asaas_checkout_id", checkout.id).maybeSingle();
      if (error) throw error;
      const fallback = await findSubscriptionByExternalReference(checkout.externalReference);
      const record = pending || fallback;
      if (record) {
        const planId = plans[record.plan_id] ? record.plan_id : "monthly";
        const paidAt = checkout.paymentDate ? new Date(checkout.paymentDate) : new Date();
        await updateSubscription(record.user_id, {
          plan_id: planId,
          status: "active",
          current_period_end: nextPeriodEnd(planId, paidAt),
          asaas_checkout_id: checkout.id,
          asaas_customer_id: checkout.customer || null,
          asaas_external_reference: checkout.externalReference || null
        });
      }
    } else if (event === "SUBSCRIPTION_CREATED" && subscription?.id) {
      const record = await findSubscriptionByExternalReference(subscription.externalReference)
        || await findByProviderId("asaas_customer_id", subscription.customer);
      if (record) await updateSubscription(record.user_id, {
        plan_id: record.plan_id,
        status: "active",
        asaas_subscription_id: subscription.id,
        asaas_customer_id: subscription.customer || null,
        asaas_external_reference: subscription.externalReference || null
      });
    } else if (payment) {
      const record = await findByProviderId("asaas_subscription_id", payment.subscription)
        || await findSubscriptionByExternalReference(payment.externalReference);
      if (record && ["PAYMENT_CONFIRMED", "PAYMENT_RECEIVED"].includes(event)) {
        const planId = plans[record.plan_id] ? record.plan_id : "monthly";
        const paidAt = payment.confirmedDate || payment.paymentDate ? new Date(payment.confirmedDate || payment.paymentDate) : new Date();
        await updateSubscription(record.user_id, {
          plan_id: planId,
          status: "active",
          current_period_end: nextPeriodEnd(planId, paidAt),
          asaas_subscription_id: payment.subscription || undefined,
          asaas_payment_id: payment.id || undefined,
          asaas_external_reference: payment.externalReference || undefined
        });
      } else if (record && ["PAYMENT_OVERDUE", "PAYMENT_REFUNDED", "PAYMENT_DELETED", "PAYMENT_CHARGEBACK_REQUESTED"].includes(event)) {
        await updateSubscription(record.user_id, {
          status: event === "PAYMENT_OVERDUE" ? "past_due" : "inactive",
          asaas_payment_id: payment.id || undefined
        });
      }
    }
    res.status(200).json({ received: true, eventId });
  } catch (error) {
    console.error("Asaas webhook processing failed:", error.message);
    res.status(500).send("Webhook processing failed.");
  }
});

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
    const { data, error } = await supabaseAdmin.from("user_subscriptions").select("status,plan_id,current_period_end").eq("user_id", req.user.id).maybeSingle();
    if (error) throw error;
    const active = data?.status === "active" && (
      data.plan_id === "lifetime" ||
      (data.current_period_end && new Date(data.current_period_end) > new Date())
    );
    if (!active) return res.status(402).json({ error: "Assinatura ativa necessária para acessar o acervo.", code: "subscription_required" });
    next();
  } catch (error) {
    console.error("Subscription lookup failed:", error.message);
    res.status(503).json({ error: "Não foi possível verificar sua assinatura." });
  }
}

app.get("/api/config", (_req, res) => res.json({
  supabaseUrl: process.env.SUPABASE_URL || "",
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY || "",
  configured: missing.length === 0 && Boolean(process.env.ASAAS_API_KEY),
  plans: Object.fromEntries(Object.entries(plans).map(([id, plan]) => [id, {
    name: plan.name,
    price: plan.display,
    available: Boolean(process.env.ASAAS_API_KEY && process.env.APP_URL)
  }]))
}));
app.get("/api/me", requireUser, async (req, res) => {
  const { data } = await supabaseAdmin.from("user_subscriptions").select("plan_id,status,current_period_end").eq("user_id", req.user.id).maybeSingle();
  const active = Boolean(data?.status === "active" && (
    data.plan_id === "lifetime" ||
    (data.current_period_end && new Date(data.current_period_end) > new Date())
  ));
  res.json({ user: { id: req.user.id, email: req.user.email }, subscription: data || null, active });
});
app.post("/api/checkout", requireUser, async (req, res) => {
  const planId = req.body?.plan;
  const plan = plans[planId];
  if (!plan) return res.status(400).json({ error: "Plano inválido." });
  if (!process.env.ASAAS_API_KEY || !process.env.APP_URL) return res.status(503).json({ error: "Asaas ainda não foi configurado no Render." });
  try {
    const externalReference = `medstudy:${req.user.id}:${planId}:${randomUUID()}`;
    const callback = {
      successUrl: new URL("/conta.html?checkout=success", process.env.APP_URL).toString(),
      cancelUrl: new URL("/conta.html?checkout=cancel", process.env.APP_URL).toString(),
      expiredUrl: new URL("/conta.html?checkout=expired", process.env.APP_URL).toString()
    };
    const payload = {
      billingTypes: plan.cycle ? ["CREDIT_CARD"] : ["PIX", "CREDIT_CARD"],
      chargeTypes: plan.cycle ? ["RECURRENT"] : ["DETACHED"],
      minutesToExpire: 60,
      externalReference,
      callback,
      items: [{ name: plan.name, description: plan.display, quantity: 1, value: plan.price }]
    };
    if (plan.cycle) {
      const due = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().replace("T", " ").slice(0, 19);
      payload.subscription = { cycle: plan.cycle, nextDueDate: due };
    }
    const checkout = await asaasRequest("/checkouts", { method: "POST", body: JSON.stringify(payload) });
    const checkoutUrl = checkout.link || `https://${asaasSandbox ? "sandbox." : ""}asaas.com/checkoutSession/show?id=${encodeURIComponent(checkout.id)}`;
    const { error } = await supabaseAdmin.from("user_subscriptions").upsert({
      user_id: req.user.id,
      plan_id: planId,
      status: "pending",
      current_period_end: null,
      asaas_checkout_id: checkout.id,
      asaas_external_reference: externalReference,
      updated_at: new Date().toISOString()
    }, { onConflict: "user_id" });
    if (error) throw error;
    res.json({ url: checkoutUrl });
  } catch (error) {
    console.error("Asaas checkout creation failed:", error.message);
    res.status(502).json({ error: error.message || "Não foi possível iniciar o checkout." });
  }
});
app.post("/api/files/upload-ticket", requireUser, requireActiveSubscription, async (req, res) => {
  const name = String(req.body?.name || "").normalize("NFKC").replace(/[^\p{L}\p{N}._() -]/gu, "_").trim().slice(0, 160);
  const contentType = String(req.body?.contentType || "").slice(0, 120);
  if (!name || name === "." || name === "..") return res.status(400).json({ error: "Nome de arquivo inválido." });
  if (!(contentType === "application/pdf" || contentType.startsWith("video/") || contentType.startsWith("audio/") || contentType === "application/zip")) return res.status(415).json({ error: "Envie videoaulas, áudio, PDF ou arquivo ZIP." });
  try {
    const key = req.user.id + "/" + randomUUID() + "-" + name;
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
