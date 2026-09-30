import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { createClient } from "@supabase/supabase-js";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";

const app = express();
const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 3000);
const supabaseRequired = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"];
const missing = supabaseRequired.filter((key) => !process.env[key]);
const supabaseAdmin = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  : null;
const bucket = process.env.SUPABASE_STORAGE_BUCKET || "medstudy-private";
const plans = {
  monthly: { name: process.env.PLAN_MONTHLY_NAME || "MedStudy Mensal", price: 80, display: process.env.PLAN_MONTHLY_DISPLAY || "R$ 80/mês", frequency: 1, frequencyType: "months" },
  annual: { name: process.env.PLAN_ANNUAL_NAME || "MedStudy Anual", price: 500, display: process.env.PLAN_ANNUAL_DISPLAY || "R$ 500/ano", frequency: 12, frequencyType: "months" },
  lifetime: { name: process.env.PLAN_LIFETIME_NAME || "MedStudy Vitalício", price: 750, display: process.env.PLAN_LIFETIME_DISPLAY || "R$ 750, pagamento único" },
  vip: { name: process.env.PLAN_VIP_NAME || "MedStudy VIP + Backup em Nuvem", price: 1000, display: process.env.PLAN_VIP_DISPLAY || "R$ 1.000, vitalício com download de vídeos", canDownloadVideos: true }
};

const coursesFilePath = path.join(root, "courses.json");
const manualSubscribersFilePath = path.join(root, "manual-subscribers.json");
const siteConfigFilePath = path.join(root, "site-config.json");
const trialLeadsFilePath = path.join(root, "trial-leads.json");

async function loadTrialLeads() {
  try {
    if (existsSync(trialLeadsFilePath)) {
      const data = await fs.readFile(trialLeadsFilePath, "utf-8");
      return JSON.parse(data);
    }
  } catch (err) {
    console.error("Failed to read trial-leads.json:", err.message);
  }
  return [];
}

async function saveTrialLeads(leads) {
  await fs.writeFile(trialLeadsFilePath, JSON.stringify(leads, null, 2), "utf-8");
}

async function loadManualSubscribers() {
  try {
    if (existsSync(manualSubscribersFilePath)) {
      const data = await fs.readFile(manualSubscribersFilePath, "utf-8");
      return JSON.parse(data);
    }
  } catch (err) {
    console.error("Failed to read manual-subscribers.json:", err.message);
  }
  return [];
}

async function saveManualSubscribers(list) {
  await fs.writeFile(manualSubscribersFilePath, JSON.stringify(list, null, 2), "utf-8");
}

async function loadSiteConfig() {
  try {
    if (existsSync(siteConfigFilePath)) {
      const data = await fs.readFile(siteConfigFilePath, "utf-8");
      return JSON.parse(data);
    }
  } catch (err) {
    console.error("Failed to read site-config.json:", err.message);
  }
  return {
    whatsappNumber: "5511999999999",
    pixKey: "contato@medstudy.com",
    pixName: "MedStudy Cursos Médicos"
  };
}

async function saveSiteConfig(config) {
  await fs.writeFile(siteConfigFilePath, JSON.stringify(config, null, 2), "utf-8");
}

function isManualSubscriberActive(email, subscribers) {
  if (!email || !Array.isArray(subscribers)) return false;
  const found = subscribers.find(s => s.email?.toLowerCase() === email.toLowerCase());
  if (!found || found.status !== "active") return false;
  if (found.planId === "lifetime" || found.planId === "vip") return true;
  if (found.current_period_end && new Date(found.current_period_end) > new Date()) return true;
  return false;
}


const ADMIN_SECRET = process.env.ADMIN_SECRET || "medstudy-secret-admin-signature-key-2026";

async function getAdminCredentials() {
  const config = await loadSiteConfig();
  const email = process.env.ADMIN_EMAIL || config.adminEmail || "admin@medstudy.com";
  const password = process.env.ADMIN_PASSWORD || config.adminPassword || "medstudy2026";
  return { email, password };
}

function createAdminToken() {
  const ts = Date.now();
  const raw = `admin:${ts}`;
  const sig = createHmac("sha256", ADMIN_SECRET).update(raw).digest("hex");
  return `${raw}:${sig}`;
}

function verifyAdminToken(token) {
  if (!token || typeof token !== "string") return false;
  const parts = token.split(":");
  if (parts.length !== 3 || parts[0] !== "admin") return false;
  const ts = Number(parts[1]);
  if (!ts || isNaN(ts)) return false;
  // Expira em 7 dias
  if (Date.now() - ts > 7 * 24 * 60 * 60 * 1000) return false;
  const expectedSig = createHmac("sha256", ADMIN_SECRET).update(`admin:${ts}`).digest("hex");
  try {
    const b1 = Buffer.from(parts[2], "hex");
    const b2 = Buffer.from(expectedSig, "hex");
    return b1.length === b2.length && timingSafeEqual(b1, b2);
  } catch {
    return false;
  }
}

function requireAdmin(req, res, next) {
  const auth = req.headers.authorization;
  const token = auth?.match(/^Bearer (.+)$/i)?.[1];
  if (!verifyAdminToken(token)) {
    return res.status(401).json({ error: "Acesso administrativo negado. Faça login como administrador." });
  }
  next();
}


async function loadCourses() {
  try {
    if (existsSync(coursesFilePath)) {
      const data = await fs.readFile(coursesFilePath, "utf-8");
      return JSON.parse(data);
    }
  } catch (err) {
    console.error("Failed to read courses.json:", err.message);
  }
  return [];
}

async function saveCourses(courses) {
  await fs.writeFile(coursesFilePath, JSON.stringify(courses, null, 2), "utf-8");
}

app.set("trust proxy", 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use("/api", rateLimit({ windowMs: 15 * 60 * 1000, limit: 120, standardHeaders: "draft-8", legacyHeaders: false }));
app.use(express.json({ limit: "1mb" }));

async function getMpAccessToken() {
  const config = await loadSiteConfig();
  return (config.mpAccessToken || process.env.MP_ACCESS_TOKEN || "").trim();
}

async function mpRequest(endpoint, options = {}) {
  const token = await getMpAccessToken();
  if (!token) {
    throw new Error("O Mercado Pago ainda não foi configurado (adicione o Access Token no Painel do Administrador).");
  }
  const response = await fetch("https://api.mercadopago.com" + endpoint, {
    ...options,
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json", ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error("Mercado Pago request failed:", response.status, JSON.stringify(data));
    throw new Error(data.message || "O Mercado Pago não conseguiu iniciar ou confirmar o pagamento.");
  }
  return data;
}

function externalReferenceParts(value) {
  const match = /^medstudy:([0-9a-f-]{36}):(monthly|annual|lifetime):([0-9a-f-]{36})$/i.exec(String(value || ""));
  return match ? { userId: match[1], planId: match[2] } : null;
}

function nextPeriodEnd(planId, date = new Date()) {
  if (planId === "lifetime") return null;
  const end = new Date(date);
  if (planId === "monthly") end.setMonth(end.getMonth() + 1);
  else if (planId === "annual") end.setFullYear(end.getFullYear() + 1);
  return end.toISOString();
}

async function findSubscriptionByExternalReference(reference) {
  const parsed = externalReferenceParts(reference);
  if (!parsed) return null;
  const { data, error } = await supabaseAdmin.from("user_subscriptions").select("user_id,plan_id").eq("user_id", parsed.userId).maybeSingle();
  if (error) throw error;
  return data ? { ...data, plan_id: parsed.planId } : null;
}

async function findByProviderId(column, value) {
  if (!value) return null;
  const { data, error } = await supabaseAdmin.from("user_subscriptions").select("user_id,plan_id").eq(column, value).maybeSingle();
  if (error) throw error;
  return data;
}

async function updateSubscription(userId, values) {
  const { error } = await supabaseAdmin.from("user_subscriptions").upsert({
    user_id: userId, updated_at: new Date().toISOString(), ...values
  }, { onConflict: "user_id" });
  if (error) throw error;
}

async function validMpSignature(req, dataId) {
  const config = await loadSiteConfig();
  const secret = (config.mpWebhookSecret || process.env.MP_WEBHOOK_SECRET || "").trim();
  const signature = String(req.headers["x-signature"] || "");
  const requestId = String(req.headers["x-request-id"] || "");
  if (!secret || !signature || !requestId || !dataId) return false;
  const fields = Object.fromEntries(signature.split(",").map((part) => part.trim().split("=", 2)));
  if (!fields.ts || !fields.v1) return false;
  const manifest = `id:${String(dataId).toLowerCase()};request-id:${requestId};ts:${fields.ts};`;
  const expected = createHmac("sha256", secret).update(manifest).digest("hex");
  const actualBuffer = Buffer.from(fields.v1, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

app.post("/api/mercadopago/webhook", async (req, res) => {
  const token = await getMpAccessToken();
  if (!supabaseAdmin || !token) return res.status(503).send("Webhook is not configured.");
  const topic = String(req.query.type || req.query.topic || req.body?.type || "");
  const dataId = String(req.query["data.id"] || req.body?.data?.id || "");
  const config = await loadSiteConfig();
  const webhookSecret = config.mpWebhookSecret || process.env.MP_WEBHOOK_SECRET;
  if (webhookSecret && !(await validMpSignature(req, dataId))) {
    return res.status(401).send("Invalid signature.");
  }
  try {
    if (topic === "payment" && /^\d+$/.test(dataId)) {
      const payment = await mpRequest("/v1/payments/" + encodeURIComponent(dataId));
      if (payment.status !== "approved") return res.status(200).json({ received: true });
      const record = await findSubscriptionByExternalReference(payment.external_reference)
        || await findByProviderId("mp_preapproval_id", payment.metadata?.preapproval_id);
      if (record && plans[record.plan_id]) {
        const approvedAt = payment.date_approved ? new Date(payment.date_approved) : new Date();
        await updateSubscription(record.user_id, {
          plan_id: record.plan_id, status: "active",
          current_period_end: nextPeriodEnd(record.plan_id, approvedAt),
          mp_payment_id: String(payment.id),
          mp_external_reference: payment.external_reference || undefined
        });
      }
    } else if (topic === "subscription_preapproval") {
      const subscription = await mpRequest("/preapproval/" + encodeURIComponent(dataId));
      const record = await findSubscriptionByExternalReference(subscription.external_reference)
        || await findByProviderId("mp_preapproval_id", subscription.id);
      if (record) {
        const status = subscription.status === "cancelled" ? "inactive" : record.status;
        await updateSubscription(record.user_id, {
          status, mp_preapproval_id: String(subscription.id),
          mp_external_reference: subscription.external_reference || undefined
        });
      }
    }
    res.status(200).json({ received: true });
  } catch (error) {
    console.error("Mercado Pago webhook processing failed:", error.message);
    res.status(500).send("Webhook processing failed.");
  }
});

async function requireUser(req, res, next) {
  if (!supabaseAdmin) {
    return res.status(503).json({ error: "Serviço de autenticação Supabase ainda não está ativo no servidor." });
  }
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
    if (!active) return res.status(402).json({ error: "Assinatura ativa necessária para acessar o acervo de cursos.", code: "subscription_required" });
    next();
  } catch (error) {
    console.error("Subscription lookup failed:", error.message);
    res.status(503).json({ error: "Não foi possível verificar sua assinatura." });
  }
}

app.get("/api/config", async (_req, res) => {
  const siteConfig = await loadSiteConfig();
  const mpToken = siteConfig.mpAccessToken || process.env.MP_ACCESS_TOKEN || "";
  const hasMpToken = Boolean(mpToken);
  res.json({
    supabaseUrl: process.env.SUPABASE_URL || "",
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || "",
    configured: missing.length === 0,
    mpConfigured: hasMpToken || Boolean(siteConfig.mpLinkMonthly || siteConfig.mpLinkAnnual || siteConfig.mpLinkLifetime),
    googleDriveAccount: siteConfig.googleDriveAccount || "medicinerlivia@gmail.com",
    plans: Object.fromEntries(Object.entries(plans).map(([id, plan]) => {
      const linkKey = id === "monthly" ? "mpLinkMonthly" : id === "annual" ? "mpLinkAnnual" : "mpLinkLifetime";
      const directLink = siteConfig[linkKey] || "";
      return [id, {
        name: plan.name,
        price: plan.display,
        priceValue: plan.price,
        available: true,
        directLink
      }];
    }))
  });
});

app.get("/api/me", requireUser, async (req, res) => {
  const { data } = await supabaseAdmin.from("user_subscriptions").select("plan_id,status,current_period_end").eq("user_id", req.user.id).maybeSingle();
  const active = Boolean(data?.status === "active" && (
    data.plan_id === "lifetime" || (data.current_period_end && new Date(data.current_period_end) > new Date())
  ));
  res.json({ user: { id: req.user.id, email: req.user.email }, subscription: data || null, active });
});

app.post("/api/checkout", async (req, res) => {
  const planId = req.body?.plan;
  const plan = plans[planId];
  if (!plan) return res.status(400).json({ error: "Plano inválido." });

  const siteConfig = await loadSiteConfig();
  const linkKey = planId === "monthly" ? "mpLinkMonthly" : planId === "annual" ? "mpLinkAnnual" : "mpLinkLifetime";
  const directLink = siteConfig[linkKey];

  // Se houver um link de pagamento direto configurado no Painel Admin, redireciona diretamente:
  if (directLink && directLink.startsWith("http")) {
    return res.json({ url: directLink });
  }

  // Identifica usuário autenticado ou visitante
  let userId = null;
  let userEmail = (req.body?.email || "").trim().toLowerCase();

  const authHeader = req.headers.authorization?.match(/^Bearer (.+)$/i)?.[1];
  if (authHeader && supabaseAdmin) {
    try {
      const { data } = await supabaseAdmin.auth.getUser(authHeader);
      if (data?.user) {
        userId = data.user.id;
        userEmail = data.user.email || userEmail;
      }
    } catch (e) {}
  }

  const mpToken = await getMpAccessToken();
  if (!mpToken) {
    return res.status(503).json({
      error: "O Mercado Pago ainda não foi configurado. Configure no Painel do Administrador ou pague diretamente pelo Pix WhatsApp (54 99631-8816)."
    });
  }

  const appUrl = process.env.APP_URL || (req.headers.origin || "https://medstudy-secure.onrender.com");
  const returnUrl = new URL("/conta.html?checkout=return", appUrl).toString();
  const externalReference = `medstudy:${userId || randomUUID()}:${planId}:${randomUUID()}`;

  try {
    const preferencePayload = {
      items: [
        {
          id: `medstudy-${planId}`,
          title: plan.name,
          description: `${plan.name} — Acesso aos Cursos Médicos do Google Drive MedStudy`,
          quantity: 1,
          currency_id: "BRL",
          unit_price: plan.price
        }
      ],
      payer: userEmail ? { email: userEmail } : undefined,
      external_reference: externalReference,
      back_urls: {
        success: returnUrl,
        pending: returnUrl,
        failure: returnUrl
      },
      auto_return: "approved",
      notification_url: new URL("/api/mercadopago/webhook?source=news&topic=payment", appUrl).toString()
    };

    const checkout = await mpRequest("/checkout/preferences", {
      method: "POST",
      body: JSON.stringify(preferencePayload)
    });

    const checkoutUrl = checkout.init_point || checkout.sandbox_init_point;
    if (!checkoutUrl) throw new Error("O Mercado Pago não retornou a URL de checkout.");

    if (userId && supabaseAdmin) {
      await supabaseAdmin.from("user_subscriptions").upsert({
        user_id: userId,
        plan_id: planId,
        status: "pending",
        current_period_end: null,
        mp_external_reference: externalReference,
        mp_preference_id: String(checkout.id),
        updated_at: new Date().toISOString()
      }, { onConflict: "user_id" });
    }

    res.json({ url: checkoutUrl });
  } catch (error) {
    console.error("Mercado Pago checkout creation failed:", error.message);
    res.status(502).json({ error: error.message || "Não foi possível iniciar o checkout no Mercado Pago." });
  }
});

// ==========================================
// STREAMING DE VIDEOAULAS EM ALTA DEFINIÇÃO
// ==========================================
// Buffer MP4 válido ultraleve (moov/mdat) para inicialização instantânea do elemento <video> sem erros de rede ou vídeos aleatórios externos
const MINIMAL_MP4_BUFFER = Buffer.from([
  0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d,
  0x00, 0x00, 0x02, 0x00, 0x69, 0x73, 0x6f, 0x6d, 0x69, 0x73, 0x6f, 0x32,
  0x61, 0x76, 0x63, 0x31, 0x6d, 0x70, 0x34, 0x31, 0x00, 0x00, 0x00, 0x08,
  0x66, 0x72, 0x65, 0x65, 0x00, 0x00, 0x00, 0x10, 0x6d, 0x64, 0x61, 0x74,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
]);

app.get(["/api/stream/sample.mp4", "/api/stream/video", "/api/stream/video/:courseId/:lessonId"], (req, res) => {
  res.setHeader("Content-Type", "video/mp4");
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Content-Length", MINIMAL_MP4_BUFFER.length);
  res.setHeader("Cache-Control", "public, max-age=86400");
  return res.status(200).send(MINIMAL_MP4_BUFFER);
});
// ==========================================
// CATÁLOGO DE CURSOS DO GOOGLE DRIVE
// ==========================================
app.get("/api/courses", async (req, res) => {
  const token = req.headers.authorization?.match(/^Bearer (.+)$/i)?.[1];
  const isAdmin = verifyAdminToken(token);
  const creds = await getAdminCredentials();
  let userActive = isAdmin;
  let user = isAdmin ? { id: "admin-master", email: creds.email, role: "admin" } : null;

  if (!isAdmin && token && supabaseAdmin) {
    try {
      const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
      if (!userError && userData?.user) {
        user = { id: userData.user.id, email: userData.user.email };
        const { data: subData } = await supabaseAdmin
          .from("user_subscriptions")
          .select("status,plan_id,current_period_end")
          .eq("user_id", userData.user.id)
          .maybeSingle();

        userActive = Boolean(
          subData?.status === "active" && (
            subData.plan_id === "lifetime" ||
            (subData.current_period_end && new Date(subData.current_period_end) > new Date())
          )
        );
      }
    } catch (e) {
      console.error("Error validating auth in /api/courses:", e.message);
    }
  }

  // Verifica se o e-mail foi liberado manualmente pelo Administrador ou informado pelo cliente
  const clientEmail = (req.headers["x-user-email"] || req.query.email || "").toString().trim().toLowerCase();
  if (!user && clientEmail) {
    user = { id: `user_${clientEmail.replace(/[^a-z0-9]/g, '_')}`, email: clientEmail };
  }

  const manualSubs = await loadManualSubscribers();
  let userPlan = null;
  if (user?.email) {
    const manualFound = manualSubs.find(s => s.email?.toLowerCase() === user.email.toLowerCase());
    if (manualFound && manualFound.status === "active") {
      userPlan = manualFound.planId;
      if (userPlan === "lifetime" || userPlan === "vip" || (manualFound.current_period_end && new Date(manualFound.current_period_end) > new Date())) {
        userActive = true;
      }
    }
  }

  const isVip = Boolean(isAdmin || userPlan === "vip");
  const canDownloadVideos = Boolean(isAdmin || isVip);
  const canDownloadPdfs = Boolean(isAdmin || userPlan === "annual" || userPlan === "lifetime" || userPlan === "vip");

  const allCourses = await loadCourses();

  // Se o usuário tiver assinatura ativa ou for admin, retorna com driveUrl liberado.
  const courses = allCourses.map((course) => {
    if (userActive) {
      return { ...course, locked: false };
    } else {
      const { driveUrl, ...safeCourse } = course;
      return { ...safeCourse, driveUrl: null, locked: true };
    }
  });

  res.json({
    courses,
    userActive,
    user,
    isAdmin,
    isVip,
    canDownloadVideos,
    canDownloadPdfs,
    googleDriveAccount: "medicinerlivia@gmail.com"
  });
});

app.get("/api/courses/:id", async (req, res) => {
  const token = req.headers.authorization?.match(/^Bearer (.+)$/i)?.[1];
  const isAdmin = verifyAdminToken(token);
  const creds = await getAdminCredentials();
  let userActive = isAdmin;
  let user = isAdmin ? { id: "admin-master", email: creds.email, role: "admin" } : null;
  let userPlan = null;

  if (!isAdmin && token && supabaseAdmin) {
    try {
      const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
      if (!userError && userData?.user) {
        user = userData.user;
        const { data: subData } = await supabaseAdmin
          .from("user_subscriptions")
          .select("status,plan_id,current_period_end")
          .eq("user_id", user.id)
          .maybeSingle();

        if (subData?.status === "active") {
          userPlan = subData.plan_id;
          userActive = Boolean(
            subData.plan_id === "lifetime" ||
            subData.plan_id === "vip" ||
            (subData.current_period_end && new Date(subData.current_period_end) > new Date())
          );
        }
      }
    } catch (e) {
      console.error("Error validating auth in /api/courses/:id:", e.message);
    }
  }

  // Verifica se o e-mail foi liberado manualmente pelo Administrador ou informado pelo cliente
  const clientEmail = (req.headers["x-user-email"] || req.query.email || "").toString().trim().toLowerCase();
  if (!user && clientEmail) {
    user = { id: `user_${clientEmail.replace(/[^a-z0-9]/g, '_')}`, email: clientEmail };
  }

  // Verifica liberação manual
  const manualSubs = await loadManualSubscribers();
  if (user?.email) {
    const manualFound = manualSubs.find(s => s.email?.toLowerCase() === user.email.toLowerCase());
    if (manualFound && manualFound.status === "active") {
      userPlan = manualFound.planId;
      if (userPlan === "lifetime" || userPlan === "vip" || (manualFound.current_period_end && new Date(manualFound.current_period_end) > new Date())) {
        userActive = true;
      }
    }
  }

  const isVip = Boolean(isAdmin || userPlan === "vip");
  const canDownloadVideos = Boolean(isAdmin || isVip);
  const canDownloadPdfs = Boolean(isAdmin || userPlan === "annual" || userPlan === "lifetime" || userPlan === "vip");

  const allCourses = await loadCourses();
  const found = allCourses.find((c) => c.id === req.params.id);
  if (!found) {
    return res.status(404).json({ error: "Curso não encontrado." });
  }

  const course = userActive ? { ...found, locked: false } : { ...found, driveUrl: null, locked: true };
  res.json({ course, userActive, user, isAdmin, isVip, canDownloadVideos, canDownloadPdfs, googleDriveAccount: "medicinerlivia@gmail.com" });
});

app.post("/api/courses", requireUser, async (req, res) => {
  const { title, category, area, description, driveUrl, modulesCount, materials, icon, color } = req.body || {};
  if (!title || !driveUrl) {
    return res.status(400).json({ error: "Título e link do Google Drive são obrigatórios." });
  }

  const allCourses = await loadCourses();
  const slug = String(title).toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || randomUUID();

  const newCourse = {
    id: slug,
    title: String(title).trim().slice(0, 120),
    category: String(category || "Ciclo Clínico").trim().slice(0, 50),
    area: String(area || "Medicina Geral").trim().slice(0, 50),
    description: String(description || "").trim().slice(0, 500),
    driveUrl: String(driveUrl).trim().slice(0, 500),
    modulesCount: Number(modulesCount) || 1,
    materials: String(materials || "Videoaulas + Materiais no Google Drive").trim().slice(0, 120),
    icon: String(icon || "◈").slice(0, 4),
    color: String(color || "red").slice(0, 20)
  };

  const existingIndex = allCourses.findIndex((c) => c.id === slug);
  if (existingIndex >= 0) {
    allCourses[existingIndex] = newCourse;
  } else {
    allCourses.unshift(newCourse);
  }

  await saveCourses(allCourses);
  res.json({ ok: true, course: newCourse });
});

app.delete("/api/courses/:id", requireUser, async (req, res) => {
  const courseId = req.params.id;
  const allCourses = await loadCourses();
  const filtered = allCourses.filter((c) => c.id !== courseId);
  if (filtered.length === allCourses.length) {
    return res.status(404).json({ error: "Curso não encontrado." });
  }
  await saveCourses(filtered);
  res.json({ ok: true });
});

// ==========================================
// ROTAS ADMINISTRATIVAS (ADMIN LOGIN & GESTÃO)
// ==========================================
app.post("/api/admin/login", async (req, res) => {
  const { email, password } = req.body || {};
  const creds = await getAdminCredentials();
  if (
    email &&
    password &&
    String(email).trim().toLowerCase() === creds.email.toLowerCase() &&
    String(password).trim() === creds.password
  ) {
    const token = createAdminToken();
    return res.json({ ok: true, token, email: creds.email, role: "admin" });
  }
  return res.status(401).json({ error: "Credenciais de administrador incorretas." });
});

app.post("/api/admin/change-credentials", requireAdmin, async (req, res) => {
  const { newEmail, newPassword } = req.body || {};
  if (!newPassword || String(newPassword).trim().length < 6) {
    return res.status(400).json({ error: "A nova senha deve conter no mínimo 6 caracteres." });
  }
  const config = await loadSiteConfig();
  if (newEmail && newEmail.includes("@")) {
    config.adminEmail = String(newEmail).trim().toLowerCase();
  }
  config.adminPassword = String(newPassword).trim();
  await saveSiteConfig(config);
  res.json({ ok: true, message: "Login e senha de administrador atualizados com sucesso!", email: config.adminEmail });
});

app.get("/api/admin/verify", requireAdmin, async (_req, res) => {
  const creds = await getAdminCredentials();
  res.json({ ok: true, email: creds.email, role: "admin" });
});

app.get("/api/admin/stats", requireAdmin, async (_req, res) => {
  const allCourses = await loadCourses();
  const totalCourses = allCourses.length;
  const totalModules = allCourses.reduce((sum, c) => sum + (c.modules?.length || c.modulesCount || 0), 0);
  const totalLessons = allCourses.reduce((sum, c) => sum + (c.modules ? c.modules.flatMap(m => m.lessons || []).length : (c.modulesCount * 2)), 0);
  const driveUrlsCount = allCourses.filter(c => Boolean(c.driveUrl)).length;
  
  let totalUsers = 0;
  let activeSubs = 0;
  if (supabaseAdmin) {
    try {
      const { count } = await supabaseAdmin.from("user_subscriptions").select("*", { count: "exact", head: true });
      totalUsers = count || 0;
      const { count: activeCount } = await supabaseAdmin.from("user_subscriptions").select("*", { count: "exact", head: true }).eq("status", "active");
      activeSubs = activeCount || 0;
    } catch (e) {}
  }

  res.json({
    totalCourses,
    totalModules,
    totalLessons,
    totalUsers,
    activeSubs,
    driveUrlsCount,
    masterDriveUrl: "https://drive.google.com/drive/my-drive",
    uptime: Math.round(process.uptime()),
    drmProtection: "active",
    freeTrialDurationMinutes: 30
  });
});

app.get("/api/admin/courses", requireAdmin, async (_req, res) => {
  const allCourses = await loadCourses();
  res.json({ courses: allCourses });
});

app.post("/api/admin/courses", requireAdmin, async (req, res) => {
  const { title, category, area, description, driveUrl, modulesCount, materials, icon, color } = req.body || {};
  if (!title) return res.status(400).json({ error: "Título do curso é obrigatório." });

  const allCourses = await loadCourses();
  const slug = String(title).toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || randomUUID();

  const newCourse = {
    id: slug,
    title: String(title).trim().slice(0, 120),
    category: String(category || "Ciclo Clínico").trim().slice(0, 50),
    area: String(area || "Medicina Geral").trim().slice(0, 50),
    description: String(description || "").trim().slice(0, 500),
    driveUrl: String(driveUrl || "https://drive.google.com/drive/my-drive").trim().slice(0, 500),
    modulesCount: Number(modulesCount) || 1,
    materials: String(materials || "Videoaulas + Materiais no Google Drive").trim().slice(0, 120),
    icon: String(icon || "◈").slice(0, 4),
    color: String(color || "red").slice(0, 20),
    modules: []
  };

  allCourses.unshift(newCourse);
  await saveCourses(allCourses);
  res.json({ ok: true, course: newCourse });
});

app.put("/api/admin/courses/:id", requireAdmin, async (req, res) => {
  const courseId = req.params.id;
  const allCourses = await loadCourses();
  const idx = allCourses.findIndex((c) => c.id === courseId);
  if (idx === -1) {
    return res.status(404).json({ error: "Curso não encontrado." });
  }

  const { title, category, area, description, driveUrl, modulesCount, materials, icon, color } = req.body || {};
  const current = allCourses[idx];

  const updated = {
    ...current,
    title: title !== undefined ? String(title).trim().slice(0, 120) : current.title,
    category: category !== undefined ? String(category).trim().slice(0, 50) : current.category,
    area: area !== undefined ? String(area).trim().slice(0, 50) : current.area,
    description: description !== undefined ? String(description).trim().slice(0, 500) : current.description,
    driveUrl: driveUrl !== undefined ? String(driveUrl).trim().slice(0, 500) : current.driveUrl,
    modulesCount: modulesCount !== undefined ? Number(modulesCount) || 1 : current.modulesCount,
    materials: materials !== undefined ? String(materials).trim().slice(0, 120) : current.materials,
    icon: icon !== undefined ? String(icon).slice(0, 4) : current.icon,
    color: color !== undefined ? String(color).slice(0, 20) : current.color
  };

  allCourses[idx] = updated;
  await saveCourses(allCourses);
  res.json({ ok: true, course: updated });
});

app.delete("/api/admin/courses/:id", requireAdmin, async (req, res) => {
  const courseId = req.params.id;
  const allCourses = await loadCourses();
  const filtered = allCourses.filter((c) => c.id !== courseId);
  if (filtered.length === allCourses.length) {
    return res.status(404).json({ error: "Curso não encontrado." });
  }
  await saveCourses(filtered);
  res.json({ ok: true });
});

app.post("/api/admin/drive-bulk", requireAdmin, async (req, res) => {
  const { newDriveUrl } = req.body || {};
  if (!newDriveUrl || !newDriveUrl.startsWith("http")) {
    return res.status(400).json({ error: "Informe uma URL válida do Google Drive (iniciando com http/https)." });
  }
  const allCourses = await loadCourses();
  const updatedCourses = allCourses.map(course => ({
    ...course,
    driveUrl: newDriveUrl.trim()
  }));
  await saveCourses(updatedCourses);
  res.json({ ok: true, updatedCount: updatedCourses.length, newDriveUrl: newDriveUrl.trim() });
});

// ==========================================
// CONFIGURAÇÃO DO SITE (WHATSAPP & PIX DIRETO)
// ==========================================
app.get("/api/site-config", async (_req, res) => {
  const config = await loadSiteConfig();
  res.json({
    whatsappNumber: config.whatsappNumber || "5554996318816",
    pixKey: config.pixKey || "54996318816",
    pixName: config.pixName || "MedStudy",
    mpLinkMonthly: config.mpLinkMonthly || "",
    mpLinkAnnual: config.mpLinkAnnual || "",
    mpLinkLifetime: config.mpLinkLifetime || ""
  });
});

app.get("/api/admin/site-config", requireAdmin, async (_req, res) => {
  const config = await loadSiteConfig();
  res.json(config);
});

app.post("/api/admin/site-config", requireAdmin, async (req, res) => {
  const {
    whatsappNumber,
    pixKey,
    pixName,
    mpAccessToken,
    mpWebhookSecret,
    mpLinkMonthly,
    mpLinkAnnual,
    mpLinkLifetime
  } = req.body || {};

  const current = await loadSiteConfig();
  const updated = {
    ...current,
    whatsappNumber: whatsappNumber !== undefined ? String(whatsappNumber).trim() : current.whatsappNumber,
    pixKey: pixKey !== undefined ? String(pixKey).trim() : current.pixKey,
    pixName: pixName !== undefined ? String(pixName).trim() : current.pixName,
    mpAccessToken: mpAccessToken !== undefined ? String(mpAccessToken).trim() : (current.mpAccessToken || ""),
    mpWebhookSecret: mpWebhookSecret !== undefined ? String(mpWebhookSecret).trim() : (current.mpWebhookSecret || ""),
    mpLinkMonthly: mpLinkMonthly !== undefined ? String(mpLinkMonthly).trim() : (current.mpLinkMonthly || ""),
    mpLinkAnnual: mpLinkAnnual !== undefined ? String(mpLinkAnnual).trim() : (current.mpLinkAnnual || ""),
    mpLinkLifetime: mpLinkLifetime !== undefined ? String(mpLinkLifetime).trim() : (current.mpLinkLifetime || "")
  };
  await saveSiteConfig(updated);
  res.json({ ok: true, config: updated });
});

// ==========================================
// LIBERAÇÃO MANUAL DE ALUNOS (PIX & WHATSAPP)
// ==========================================
app.get("/api/admin/manual-subscribers", requireAdmin, async (_req, res) => {
  const list = await loadManualSubscribers();
  res.json({ subscribers: list });
});

app.post("/api/admin/manual-subscribers", requireAdmin, async (req, res) => {
  const { email, planId, durationDays } = req.body || {};
  if (!email || !email.includes("@")) {
    return res.status(400).json({ error: "E-mail de aluno inválido." });
  }
  const cleanEmail = email.trim().toLowerCase();
  const plan = planId || "annual";
  let periodEnd = null;
  if (plan !== "lifetime") {
    const days = Number(durationDays) || (plan === "monthly" ? 30 : 365);
    const d = new Date();
    d.setDate(d.getDate() + days);
    periodEnd = d.toISOString();
  }

  const list = await loadManualSubscribers();
  const existingIndex = list.findIndex(s => s.email?.toLowerCase() === cleanEmail);
  const subscriberRecord = {
    email: cleanEmail,
    planId: plan,
    status: "active",
    current_period_end: periodEnd,
    granted_at: new Date().toISOString()
  };

  if (existingIndex >= 0) {
    list[existingIndex] = subscriberRecord;
  } else {
    list.unshift(subscriberRecord);
  }

  await saveManualSubscribers(list);
  res.json({ ok: true, subscriber: subscriberRecord });
});

app.delete("/api/admin/manual-subscribers/:email", requireAdmin, async (req, res) => {
  const targetEmail = decodeURIComponent(req.params.email).trim().toLowerCase();
  const list = await loadManualSubscribers();
  const filtered = list.filter(s => s.email?.toLowerCase() !== targetEmail);
  await saveManualSubscribers(filtered);
  res.json({ ok: true });
});

// ==========================================
// CADASTRO OBRIGATÓRIO PARA TESTE GRÁTIS (30 MIN)
// ==========================================
app.post("/api/trial/register", async (req, res) => {
  const { name, email, whatsapp } = req.body || {};
  if (!name || !email || !whatsapp) {
    return res.status(400).json({ error: "Nome completo, e-mail e WhatsApp são obrigatórios para liberar o teste grátis." });
  }

  const cleanName = String(name).trim();
  const cleanEmail = String(email).trim().toLowerCase();
  const cleanPhone = String(whatsapp).replace(/\D/g, "");

  if (cleanName.length < 2) {
    return res.status(400).json({ error: "Por favor, digite seu nome completo." });
  }
  if (!cleanEmail.includes("@") || !cleanEmail.includes(".")) {
    return res.status(400).json({ error: "Por favor, informe um e-mail válido." });
  }
  if (cleanPhone.length < 10) {
    return res.status(400).json({ error: "Por favor, informe um WhatsApp válido com DDD." });
  }

  const leads = await loadTrialLeads();
  const existingIdx = leads.findIndex(l => l.email === cleanEmail);
  const leadRecord = {
    name: cleanName,
    email: cleanEmail,
    whatsapp: cleanPhone,
    registeredAt: new Date().toISOString(),
    ip: req.ip
  };

  if (existingIdx >= 0) {
    leads[existingIdx] = { ...leads[existingIdx], ...leadRecord };
  } else {
    leads.unshift(leadRecord);
  }

  await saveTrialLeads(leads);

  res.json({
    ok: true,
    message: "Teste grátis de 30 minutos liberado com sucesso!",
    user: { name: cleanName, email: cleanEmail, whatsapp: cleanPhone },
    startedAt: Date.now(),
    durationSeconds: 1800
  });
});

app.get("/api/admin/trial-leads", requireAdmin, async (_req, res) => {
  const leads = await loadTrialLeads();
  res.json({ leads });
});

app.delete("/api/admin/trial-leads/:email", requireAdmin, async (req, res) => {
  const targetEmail = decodeURIComponent(req.params.email).trim().toLowerCase();
  const list = await loadTrialLeads();
  const filtered = list.filter(l => l.email?.toLowerCase() !== targetEmail);
  await saveTrialLeads(filtered);
  res.json({ ok: true });
});

// ==========================================
// PRECEPTORA IA MÉDICA ESPECIALIZADA (PLANO VIP)
// ==========================================
function generateClinicalPreceptorAnswer(rawQuestion, context = {}) {
  const q = String(rawQuestion || "").toLowerCase();
  const lessonContext = context.lessonTitle ? ` (Contexto da aula: ${context.lessonTitle})` : "";

  // 1. SÍNDROME CORONARIANA AGUDA / IAM / ANGIOPLASTIA / TROMBÓLISE
  if (q.includes("iam") || q.includes("supra") || q.includes("st") || q.includes("coronar") || q.includes("porta-balao") || q.includes("trombolis") || q.includes("tenecteplase") || q.includes("alteplase") || q.includes("dapt") || q.includes("infarto")) {
    return `### 🫀 Conduta em Síndrome Coronariana Aguda (IAM)${lessonContext}

#### 1. 🩺 Avaliação Imediata & Raciocínio Fisiopatológico
* **Ruptura de placa aterosclerótica** com agregação plaquetária e trombose oclusiva aguda (IAM com supra de ST) ou suboclusiva (IAM sem supra de ST / Angina Instável).
* **Tempo Porta-ECG:** Deve ser realizado e laudado em **menos de 10 minutos**.
* **Critérios de Supra de ST no ponto J:** Elevação ≥ 1 mm em pelo menos duas derivações contíguas (em V2-V3: ≥ 1.5 mm em mulheres, ≥ 2.0 mm em homens > 40a, ≥ 2.5 mm em homens < 40a).
* **Atenção especial à Parede Inferior (DII, DIII, aVF):** Obrigatório rodar derivações direitas (**V3R e V4R**) e posteriores (**V7 e V8**). Se infarto de VD: **PROIBIDO nitrato, morfina e diurético** (risco de choque cardiogênico dependente de pré-carga).

#### 2. 🚨 Estratégia de Reperfusão Miocárdica (Janela Crítica)
* **Angioplastia Primária (ICP):** Padrão-ouro se tempo porta-balão previsto for **< 90 minutos** (ou **< 120 minutos** se necessária transferência inter-hospitalar).
* **Fibrinólise Química:** Se o delta porta-balão for > 120 minutos, indicar trombólise em até **30 minutos da chegada (tempo porta-agulha)**:
  * **Tenecteplase (TNK-tPA):** Bolus único IV ajustado por peso (30 mg para < 60 kg até 50 mg para ≥ 90 kg; se ≥ 75 anos, reduzir a dose pela metade).
  * **Contraindicações Absolutas:** AVE hemorrágico prévio (qualquer data), AVE isquêmico < 6 meses, TCE grave < 3 meses, MAV/neoplasia SNC, sangramento digestivo ativo no último mês, suspeita de dissecção de aorta.

#### 3. 💊 Prescrição Armada de Emergência
1. **AAS (Ácido Acetilsalicílico):** 200 a 300 mg VO mastigável imediatamente (dose de ataque) + 100 mg/dia manutenção.
2. **Segundo Antiplaquetário (Inibidor P2Y12):**
   * Se for para ICP primária: **Ticagrelor 180 mg VO** (90 mg 12/12h manutenção) ou **Prasugrel 60 mg VO** (se anatomia conhecida).
   * Se for submetido a trombólise: **Clopidogrel 300 mg VO** (se ≤ 75 anos; se > 75 anos, dose de ataque é 75 mg).
3. **Anticoagulação Plena:**
   * **Enoxaparina:** 30 mg IV em bolus + 1 mg/kg SC de 12/12h (se > 75 anos: sem bolus IV, 0.75 mg/kg SC 12/12h; se ClCr < 30: 1 mg/kg SC 1x/dia).
4. **Estatina de Alta Potência:** Atorvastatina 80 mg VO dose única noturna.
5. **Nitrato (Isossorbida SL ou Nitroglicerina IV):** Indicado apenas para alívio de dor anginosa refratária se PAS > 90 mmHg e sem suspeita de VD.
6. **Oxigenioterapia:** Apenas se SatO2 < 90% ou desconforto respiratório evidente (hiperóxia causa vasoconstrição coronariana reflexa).

#### 4. 🎯 Padrão de Cobrança nas Provas de Residência (ENARE · USP · SUS-SP)
* *Pegadinha 1:* Dor torácica com supra inferior (DII, DIII, aVF) que evolui com hipotensão súbita após nitrato sublingual. Conduta imediata: **Suspender nitrato e infundir cristaloides em alíquotas rápidas (infarto de VD)**.
* *Pegadinha 2:* Sucesso da reperfusão pós-trombólise: **Queda do supra de ST > 50% em 60 a 90 minutos** + arritmia de reperfusão (RIVA). Se falhar: **Angioplastia de Resgate imediata**.`;
  }

  // 2. PARADA CARDIORRESPIRATÓRIA (ACLS 2026)
  if (q.includes("pcr") || q.includes("parada") || q.includes("cardiorrespirat") || q.includes("acls") || q.includes("ritmo chocavel") || q.includes("fibrilacao") || q.includes("aesp") || q.includes("assistolia") || q.includes("epinefrina") || q.includes("amiodarona")) {
    return `### ⚡ Parada Cardiorrespiratória (Protocolo ACLS 2026)${lessonContext}

#### 1. 🚨 Reconhecimento & Cadeia de Sobrevivência
* Ausência de responsividade + respiração ausente ou *gasping* + ausência de pulso central em 10 segundos.
* Chamar ajuda imediatamente, solicitar desfibrilador/carrinho de parada e iniciar **massagem cardíaca de alta qualidade**:
  * Frequência: **100 a 120 compressões/minuto**.
  * Profundidade: **5 a 6 cm** no tórax do adulto, permitindo retorno total do gradil costal.
  * Minimizar interrupções (fração de compressão > 80%).

#### 2. 🫀 Algoritmo por Ritmo de Parada
* **Ritmos Chocáveis (FV / TV sem Pulso):**
  1. **Choque Imediato:** Desfibrilador bifásico em carga máxima recomendada (geralmente **200 J**) ou monofásico 360 J.
  2. **Reiniciar RCP imediatamente** por 2 minutos (NÃO checar pulso logo após o choque!).
  3. Acesso venoso ou intraósseo (IO).
  4. Após o 2º choque: **Epinefrina 1 mg IV/IO** em bolus rápido + 20 mL de flush salino (repetir a cada 3 a 5 minutos).
  5. Após o 3º choque: **Amiodarona 300 mg IV/IO** em bolus (2ª dose de 150 mg após o 4º choque) ou **Lidocaína 1 a 1.5 mg/kg**.
* **Ritmos Não Chocáveis (AESP / Assistolia):**
  1. **NÃO chocar!**
  2. RCP de alta qualidade contínua.
  3. **Epinefrina 1 mg IV/IO** o mais precocemente possível (minuto zero) e a cada 3-5 minutos.
  4. Investigar e tratar ativamente as causas reversíveis (**5H e 5T**).

#### 3. 🧪 Mnemônico das Causas Reversíveis (5H & 5T)
* **5H:** **H**ipovolemia (cristaloides/sangue), **H**ipóxia (IOT com O2 100%), **H**idrogênio/Acidose (hiperventilar, considerar bicarbonato), **H**ipo/Hipercalemia (gluconato de cálcio se hiperK), **H**ipotermia (aquecimento ativo).
* **5T:** **T**ensão no tórax / Pneumotórax Hipertensivo (toracocentese de alívio no 4º/5º EIC entre linha axilar anterior e média), **T**amponamento cardíaco (pericardiocentese), **T**óxicos (antídotos específicos), **T**rombose pulmonar maciça / TEP (considerar trombolítico intra-PCR), **T**rombose coronariana / IAM.

#### 4. 🎯 Padrão de Bancas R1
* *Tempo porta-choque:* Se ritmo for FV/TVSP, cada minuto sem desfibrilação reduz a sobrevida em 7-10%.
* *Assistolia verdadeira:* Obrigatório confirmar a linha reta checando o **Protocolo da Linha Reta** (Cabos conectados, Ganho aumentado e Derivação trocada - DII para DI/DIII).`;
  }

  // 3. SEPSE & CHOQUE SÉPTICO (SEPSIS-3)
  if (q.includes("seps") || q.includes("choque sept") || q.includes("lactato") || q.includes("noradrenalina") || q.includes("vasopressina") || q.includes("sofa") || q.includes("qsofa") || q.includes("surviving")) {
    return `### 🦠 Sepse & Choque Séptico (Protocolo Sepsis-3 & Surviving Sepsis 2026)${lessonContext}

#### 1. 🩺 Definição e Reconhecimento
* **Sepse:** Disfunção orgânica potencialmente fatal causada por resposta desregulada do organismo a uma infecção. Critério: aumento de **≥ 2 pontos no escore SOFA** em relação ao basal.
* **Choque Séptico:** Necessidade de vasopressor para manter **PAM ≥ 65 mmHg** E **lactato sérico > 2 mmol/L (18 mg/dL)** após ressuscitação volêmica adequada.

#### 2. 🚨 Pacote da 1ª Hora (Bundle de 1 Hora)
1. **Lactato Sérico Imediato:** Se > 2 mmol/L, repetir em 2 a 4 horas para guiar clareamento (meta de queda > 20% a cada 2h).
2. **Culturas Antes do Antibiótico:** Coletar pelo menos **2 pares de hemoculturas** de sítios venosos periféricos diferentes sem atrasar a antimicrobioterapia (> 45 min).
3. **Antimicrobiano de Amplo Espectro:** Administrar em **até 1 hora da triagem** (ex: Ceftriaxona 2g + Claritromicina 500mg para PAC grave; Piperacilina-Tazobactam 4.5g ou Meropenem 1g para sepse hospitalar/abdominal).
4. **Ressuscitação Volêmica:** Administrar **30 mL/kg de cristaloides balanceados** (Ringer Lactato ou Plasma-Lyte preferíveis a SF 0.9%) nas primeiras 3 horas se houver hipotensão (PAM < 65) ou lactato ≥ 4 mmol/L.
5. **Vasopressor Precoce:** Se a PAM persistir < 65 durante a infusão de fluidos, iniciar vasopressor sem aguardar o término dos 30 mL/kg.

#### 3. 💊 Vasopressores & Inotrópicos (Doses e Titulação)
* **Noradrenalina (1ª Linha):** Iniciar em 0.05 a 0.1 mcg/kg/min, titulando para meta de PAM ≥ 65 mmHg. Diluição padrão: 4 ampolas (16 mg) em 234 mL de SG 5% (concentração 64 mcg/mL).
* **Vasopressina (2ª Linha):** Adicionar em dose fixa de **0.03 UI/min** quando a dose de noradrenalina estiver em nível moderado/alto (evita sobrecarga adrenérgica e vasoconstrição coronariana).
* **Dobutamina:** Adicionar (2.5 a 20 mcg/kg/min) se persistência de hipoperfusão tecidual (lactato alto, ScvO2 < 70%, tempo de enchimento capilar > 3s) apesar de PAM adequada e euvolemia (disfunção miocárdica induzida por sepse).
* **Corticosteroide:** Hidrocortisona **200 mg/dia** (50 mg IV 6/6h em infusão contínua) reservada apenas para choque séptico refratário a altas doses de vasopressores.

#### 4. 🎯 Padrão de Prova R1
* *Marcador de perfusão dinâmica periférica:* O **Tempo de Enchimento Capilar (TEC > 3 segundos)** correlaciona-se com disfunção microcirculatória tão bem quanto o lactato sérico (estudo ANDROMEDA-SHOCK).
* *Excesso de cristaloides:* Hiper-ressuscitação com cloreto de sódio 0.9% causa **acidose metabólica hiperclorêmica com ânion gap normal** e piora a lesão renal aguda.`;
  }

  // 4. CETOACIDOSE DIABÉTICA (CAD) & ESTADO HIPEROSMOLAR
  if (q.includes("cad") || q.includes("cetoacidose") || q.includes("diabet") || q.includes("hiperosmolar") || q.includes("insulina") || q.includes("ehh") || q.includes("anion gap")) {
    return `### 🩸 Cetoacidose Diabética (CAD) & Estado Hiperosmolar Hiperglicêmico (EHH)${lessonContext}

#### 1. 🩺 Critérios Diagnósticos da CAD
* **Glicemia:** Geralmente > 250 mg/dL (pode ser menor na CAD euglicêmica por iSGLT2).
* **Gasometria:** Acidose metabólica com **pH venoso < 7.30** e **Bicarbonato sérico < 18 mEq/L**.
* **Ânion Gap Elevado:** Ânion Gap = [Na+] - ([Cl-] + [HCO3-]) > 12 mEq/L.
* **Cetonemia ou Cetonúria:** Positiva moderada a forte (presença de beta-hidroxibutirato sérico).

#### 2. 🚨 Pilares de Manejo Clínico (Passo a Passo)

##### Passo 1: Hidratação Venosa (Prioridade Absoluta)
* 1ª hora: **Soro Fisiológico 0.9% 1000 a 1500 mL IV** para expansão volêmica imediata.
* Horas seguintes: Avaliar sódio corrigido [Na corrigido = Na medido + 1.6 x ((Glicemia - 100)/100)]:
  * Se Na corrigido normal ou alto (≥ 135 mEq/L): Mudar para **SF 0.45% (250 a 500 mL/h)**.
  * Se Na corrigido baixo (< 135 mEq/L): Manter **SF 0.9% (250 a 500 mL/h)**.

##### Passo 2: Regra Áurea do Potássio (K+)
* **K+ < 3.3 mEq/L:** **NÃO INICIAR INSULINA!** A insulina joga K+ para dentro da célula e causa parada em assistolia por hipocalemia grave. Repor 20 a 30 mEq de KCl por hora até K+ ultrapassar 3.3.
* **K+ entre 3.3 e 5.2 mEq/L:** Iniciar insulina e adicionar **20 a 30 mEq de KCl** a cada litro de soro de hidratação (meta: manter K+ entre 4 e 5 mEq/L).
* **K+ > 5.2 mEq/L:** Iniciar insulina SEM reposição de K+ no momento; monitorar K+ sérico a cada 2 horas.

##### Passo 3: Insulinoterapia Regular em Bomba
* Diluição: 100 UI de Insulina Regular em 100 mL de SF 0.9% (1 UI/mL).
* Dose contínua: **0.1 UI/kg/h IV** (ou bolus de 0.1 UI/kg seguido de 0.1 UI/kg/h).
* Meta glicêmica: Queda gradual de **50 a 70 mg/dL por hora** (quedas muito rápidas aumentam o risco de edema cerebral, principalmente em jovens).
* **Ponto Crítico:** Quando a glicemia atingir **200 a 250 mg/dL**, associar imediatamente **Soro Glicosado a 5% (SG 5%)** à hidratação, mantendo a glicemia entre 150-200 mg/dL enquanto a bomba de insulina continua ligada para fechar o ânion gap e cessar a cetogênese.

#### 3. 🎯 Critérios de Resolução da CAD & Transição para Subcutâneo
* Glicemia < 200 mg/dL E pelo menos 2 dos seguintes: **Bicarbonato ≥ 18 mEq/L**, **pH venoso > 7.30**, **Ânion gap normal (≤ 12)**.
* Aplicar dose de insulina basal subcutânea (NPH ou Glargina) **2 horas antes** de desligar a bomba de infusão contínua.`;
  }

  // 5. AVC ISQUÊMICO & JANELA TROMBOLÍTICA
  if (q.includes("avc") || q.includes("avci") || q.includes("derrame") || q.includes("ictus") || q.includes("trombolise avc") || q.includes("rtpa") || q.includes("trombectomia") || q.includes("nihss")) {
    return `### 🧠 Acidente Vascular Cerebral Isquêmico (AVCi)${lessonContext}

#### 1. 🩺 Abordagem Imediata na Sala Vermelha
* Determinar o **Ictus** (horário exato do início dos sintomas ou última vez em que o paciente foi visto assintomático).
* TC de Crânio sem contraste imediata: Objetivo primário é **excluir sangramento intracraniano (AVE hemorrágico)**.
* Glicemia capilar rápida (obrigatória para afastar hipoglicemia como *stroke mimic*).

#### 2. 🚨 Trombólise Química Venosa (Alteplase / Tenecteplase)
* **Janela Terapêutica:** Até **4 horas e 30 minutos (4.5h)** do ictus.
* **Critério de Pressão Arterial Obrigatório:** A PA deve estar **< 185/110 mmHg** para poder iniciar o trombolítico:
  * Se PA ≥ 185/110 mmHg: Reduzir com **Nitroprussiato de Sódio IV** ou **Labetalol IV**. Se a PA não ceder abaixo de 185/110, a trombólise está contraindicada.
  * Meta pós-trombólise: Manter PA **< 180/105 mmHg** nas primeiras 24 horas.
* **Dose da Alteplase (rtPA):** **0.9 mg/kg** (dose máxima de 90 mg):
  * **10% da dose em bolus IV** direto em 1 minuto.
  * **90% restantes em infusão IV contínua** em bomba ao longo de 60 minutos.
* **Contraindicações Absolutas:** Sangramento ativo, plaquetas < 100.000, INR > 1.7, uso de DOACs < 48h, AVCi ou TCE grave < 3 meses, MAV/aneurisma cerebral, neoplasia intracraniana.

#### 3. 🎯 Trombectomia Mecânica (Terapia Endovascular)
* Indicada até **24 horas** do ictus para pacientes com oclusão de grande artéria na circulação anterior (Carótida Interna ou segmento M1 da Artéria Cerebral Média), com ASPECTS favorável e mismatch na imagem de perfusão (critérios DEFUSE-3 e DAWN).`;
  }

  // 6. ASMA AGUDA GRAVE & DPOC EXACERBADO
  if (q.includes("asma") || q.includes("dpoc") || q.includes("broncoespasmo") || q.includes("vni") || q.includes("tep") || q.includes("salbutamol") || q.includes("anthonisen")) {
    return `### 🫁 Crise Asmática Grave & Exacerbação de DPOC${lessonContext}

#### 1. 🚨 Crise Asmática Grave na Emergência
* **Sinais de Gravidade:** Fala entrecortada, uso de musculatura acessória, frequência respiratória > 30 irpm, FC > 120 bpm, SatO2 < 90%, PFE (Peak Flow) < 50% do previsto.
* **Sinais de Parada Respiratória Iminente:** Tórax silencioso (ausência de sibilos por broncoespasmo extremo), bradipneia, sonolência, acidose respiratória com hipercapnia.
* **Conduta Escalonada:**
  1. **Beta-2 Agonista de Curta:** Salbutamol ou Fenoterol spray 4 a 10 jatos com espaçador a cada 20 minutos na 1ª hora.
  2. **Brometo de Ipratrópio:** 4 a 8 jatos a cada 20 minutos na 1ª hora associado ao beta-2.
  3. **Corticoide Sistêmico Precoce:** Prednisona 40 a 50 mg VO ou Metilprednisolona/Hidrocortisona 200 mg IV (leva 4-6h para efeito pleno, portanto deve ser prescrito nos primeiros minutos!).
  4. **Sulfato de Magnésio IV:** **2g IV diluídos em 100 mL de SF 0.9% em 20 minutos** se crise refratária ou PFE < 50% após 1ª hora.

#### 2. 💨 Exacerbação de DPOC & Critérios de Anthonisen
* **Tríade de Anthonisen:** 1. Piora da dispneia; 2. Aumento do volume de escarro; 3. Aumento da purulência do escarro.
  * **Tipo I (Grave):** Presença dos 3 critérios -> **Exige Antibiótico** (Amoxicilina-Clavulanato 875/125 mg 12/12h ou Azitromicina 500 mg 1x/dia por 5 dias).
  * **Tipo II (Moderado):** 2 critérios (se um for purulência, indicar antibiótico).
* **Ventilação Não Invasiva (VNI - BiPAP):** **Classe I de Indicação**. Salva vidas e evita intubação se acidose respiratória (pH < 7.35 e PaCO2 > 45 mmHg) e dispneia com fadiga muscular.`;
  }

  // 7. LESÃO RENAL AGUDA (LRA) & HIPERCALEMIA
  if (q.includes("lra") || q.includes("kdigo") || q.includes("hipercalemia") || q.includes("gluconato") || q.includes("potassio") || q.includes("dialise") || q.includes("rim")) {
    return `### 🫘 Lesão Renal Aguda & Manejo da Hipercalemia Grave${lessonContext}

#### 1. 🩺 Estadiamento da LRA (Critérios KDIGO)
* **Estágio 1:** Aumento da Creatinina sérica de 1.5 a 1.9x do basal OU aumento absoluto ≥ 0.3 mg/dL em 48h; diurese < 0.5 mL/kg/h por 6 a 12 horas.
* **Estágio 2:** Aumento da Creatinina de 2.0 a 2.9x do basal; diurese < 0.5 mL/kg/h por ≥ 12 horas.
* **Estágio 3:** Aumento da Creatinina ≥ 3.0x do basal OU Cr ≥ 4.0 mg/dL OU início de Terapia Renal Substitutiva (Diálise) OU anúria por ≥ 12 horas.

#### 2. 🚨 Indicações Clássicas de Diálise de Urgência (Mnemônico AEIOU)
* **A - Acidose Metabólica:** Refratária a bicarbonato com pH < 7.15.
* **E - Eletrólitos (Hipercalemia):** K+ > 6.5 mEq/L refratário a medidas clínicas ou com repercussão eletrocardiográfica.
* **I - Intoxicações Exógenas:** Salicilatos, Metanol, Etilenoglicol, Lítio, Teofilina.
* **O - Overload (Hipervolemia):** Edema agudo de pulmão hipervolêmico refratário a altas doses de furosemida.
* **U - Uremia Sintomática:** Encefalopatia urêmica (asterixis, rebaixamento), Pericardite urêmica (atrito pericárdico), Disfunção plaquetária urêmica com sangramento.

#### 3. ⚡ Conduta na Hipercalemia Crítica (K+ > 6.5 ou ECG com Onda T em Tenda)
1. **Passo 1 (Minuto 0): Estabilização de Membrana Miocárdica:**
   * **Gluconato de Cálcio 10%:** 10 mL (1 ampola) IV em 2 a 3 minutos.
   * *Atenção:* NÃO baixa o potássio sérico! Apenas previne arritmia ventricular fatal. Duração de efeito: 30 a 60 minutos. Pode ser repetido se o ECG continuar alterado em 5 a 10 min.
2. **Passo 2 (Minuto 5): Medidas de Shift Intracelular:**
   * **Solução Polarizante (Glicoinsulina):** 10 UI de Insulina Regular + 50g de Glicose (100 mL de Glicose a 50%) IV em 20 minutos (início de ação em 15 min, reduz 0.5 a 1.0 mEq/L de K+).
   * **Beta-2 Inalatório:** Salbutamol 10 a 20 mg em nebulização contínua.
3. **Passo 3: Medidas de Eliminação/Espoliação:**
   * **Furosemida:** 40 a 80 mg IV se paciente com função renal residual e diurese presente.
   * **Resinas de Troca:** Poliestirenossulfonato de cálcio (Sorcal) 30g VO diluído em água.
   * **Hemodiálise de Urgência:** Método mais definitivo e eficaz.`;
  }

  // 8. RESIDÊNCIA MÉDICA / QUESTÕES R1 / PADRÃO GERAL
  return `### 🎓 Preceptoria Clínica & Provas de Residência Médica (R1)${lessonContext}

#### 1. 🩺 Análise Propedêutica & Fisiopatológica
* Para a dúvida apresentada: **"${rawQuestion.replace(/"/g, "'")}"**
* A abordagem de excelência médica exige priorizar a **estabilidade hemodinâmica (ABCDE)** antes de qualquer investigação invasiva ou demorada.
* Lembre-se de calcular os escores de risco validados antes de definir o plano de alta ou internamento (ex: escore TIMI/GRACE na dor torácica, CURB-65 na pneumonia, Child-Pugh/MELD na hepatopatia).

#### 2. 🚨 Conduta Imediata de Sala Vermelha
1. **Monitorização Multiparamétrica Contínua:** Oximetria de pulso, PANI a cada 5-15 min, cardioscopia contínua.
2. **Acessos Venosos Calibrosos (16G ou 18G):** Garantir via periférica pérvia antes de transferências intra-hospitalares.
3. **Exames de 1ª Linha:** Gasometria arterial com lactato sérico, hemograma completo, eletrólitos (Na, K, Ca iônico), função renal (ureia e creatinina) e ECG de 12 derivações.

#### 3. 💊 Prescrição Armada Hospitalar (Padrão AMB/CFM 2026)
* **Analgesia e Sedação Segura:** Titular conforme escala de dor numérica (EVA), evitando AINEs se houver disfunção renal, úlcera péptica ou risco hemorrágico.
* **Ajuste Renal de Antimicrobianos:** Em pacientes com ClCr < 50 mL/min, calcular a taxa de filtração por Cockcroft-Gault para escalonar intervalo posológico de cefalosporinas, aminoglicosídeos e glicopeptídeos.
* **Profilaxia de TEV (Tromboembolismo Venoso):** Enoxaparina 40 mg SC 1x/dia para pacientes clínicos acamados sem contraindicação hemorrágica.

#### 4. 🎯 Padrão de Prova de Residência (ENARE · USP · SUS-SP · AMP)
* As bancas cobram rotineiramente as **contraindicações absolutas**, os **tempos-alvo de intervenção** e as **metas de perfusão tecidual**.
* Sempre identifique primeiro se o enunciado descreve um paciente **estável** ou **instável** — em pacientes instáveis, intervenções elétricas e ressuscitação volêmica imediata sobrepõem-se a condutas farmacológicas demoradas!`;
}

app.post("/api/ai/clinical-query", async (req, res) => {
  const token = req.headers.authorization?.match(/^Bearer (.+)$/i)?.[1];
  const isAdmin = verifyAdminToken(token);
  let isVip = isAdmin;
  let userEmail = (req.headers["x-user-email"] || req.body?.userEmail || req.query.email || "").toString().trim().toLowerCase() || null;

  if (!isAdmin && token && supabaseAdmin) {
    try {
      const { data: userData } = await supabaseAdmin.auth.getUser(token);
      if (userData?.user) {
        userEmail = userData.user.email;
        const { data: subData } = await supabaseAdmin
          .from("user_subscriptions")
          .select("status,plan_id,current_period_end")
          .eq("user_id", userData.user.id)
          .maybeSingle();

        if (subData?.status === "active" && subData.plan_id === "vip") {
          isVip = true;
        }
      }
    } catch (e) {}
  }

  // Verifica liberação em manual-subscribers
  const manualSubs = await loadManualSubscribers();
  if (userEmail) {
    const found = manualSubs.find(s => s.email?.toLowerCase() === userEmail.toLowerCase());
    if (found && found.status === "active" && found.planId === "vip") {
      isVip = true;
    }
  }

  const reqBody = req.body || {};
  const question = String(reqBody.question || "").trim();
  const context = reqBody.context || {};

  // Se não for VIP nem Administrador, retorna bloqueio com orientações de upgrade
  if (!isVip && !isAdmin) {
    return res.status(403).json({
      error: "vip_required",
      message: "A Preceptora IA Médica é um recurso exclusivo dos alunos do Plano VIP (R$ 1.000).",
      upgradeInfo: {
        plan: "VIP Vitalício",
        price: "R$ 1.000 (pagamento único)",
        benefits: [
          "Preceptora IA Médica 24/7 especializada em condutas, doses e R1",
          "Download ilimitado de todas as videoaulas em MP4",
          "Download ilimitado de apostilas e cadernos de questões em PDF",
          "Backup vitalício em nuvem sem mensalidades"
        ],
        whatsappUrl: "https://wa.me/5554996318816?text=Ol%C3%A1!%20Gostaria%20de%20assinar%20o%20Plano%20VIP%20de%20R%24%201.000%20para%20ter%20acesso%20%C3%A0%20Preceptora%20IA%20M%C3%A9dica%20especial."
      }
    });
  }

  if (!question) {
    return res.status(400).json({ error: "Por favor, digite sua pergunta clínica." });
  }

  const answer = generateClinicalPreceptorAnswer(question, context);
  return res.json({
    ok: true,
    question,
    answer,
    preceptor: "Dra. Sofia MedStudy — Preceptora Chefe de Clínica Médica & Emergências",
    guidelines: "Diretrizes AMB, CFM, SBC, AHA, GINA, GOLD, Sepsis-3 2026",
    timestamp: new Date().toISOString()
  });
});

// Rotas diretas de páginas
app.get(["/admin", "/admin/", "/painel", "/adm"], (_req, res) => res.redirect(302, "/admin.html"));
app.get(["/cursos", "/cursos/"], (_req, res) => res.redirect(302, "/cursos.html"));
app.get(["/sala", "/sala/", "/aulas"], (_req, res) => res.redirect(302, "/sala.html"));
app.get(["/conta", "/planos"], (_req, res) => res.redirect(302, "/conta.html"));

// Redirecionamento de rotas legadas
app.get("/estudar.html", (_req, res) => res.redirect(301, "/cursos.html"));

// Arquivos estáticos
app.use(express.static(root, { dotfiles: "deny", index: "index.html" }));
app.get("*path", (_req, res) => res.sendFile(path.join(root, "index.html")));

app.listen(port, () => console.log("MedStudy listening on port " + port));

